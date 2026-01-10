import {
    Connection,
    Keypair,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import Redis from "ioredis";
import bs58 from "bs58";
import {
    getQuote,
    getSwapInstructions,
    getAddressLookupTableAccounts,
    getSwapInstructionData,
    getJupiterAccounts,
    deserializeInstruction,
} from "./jupiter";

import { idl } from "./idl";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const MATCHED_STREAM_KEY = "matched_orders";
const ORDER_STREAM_KEY = "onchain_order"; // To re-add failed orders
const RESOLVER_CONSUMER_GROUP = "resolver_group";
const RESOLVER_CONSUMER_NAME = "resolver_1";

// Program constants
const PROGRAM_ID = new PublicKey("ApiiyCyQ6AN4jE8NHNEbcdfY3MoFrZvwebukxyWWBJ6N");
const JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

const connection = new Connection(RPC_URL, "confirmed");
const redis = new Redis(REDIS_URL);

interface MatchedOrder {
    orderKey: string;
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    currentPrice: number;
    uniqueId: string;
    expiredAt: number;
}

function getBackendKeypair(): Keypair {
    if (!BACKEND_PRIVATE_KEY) {
        console.warn("BACKEND_PRIVATE_KEY not set, using random keypair for testing");
        return Keypair.generate();
    }

    try {
        const decoded = bs58.decode(BACKEND_PRIVATE_KEY);
        return Keypair.fromSecretKey(decoded);
    } catch {
        const parsed = JSON.parse(BACKEND_PRIVATE_KEY);
        return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
}

function getProgram(backendKeypair: Keypair): Program {
    const wallet = {
        publicKey: backendKeypair.publicKey,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
    };
    const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
    });
    return new Program(idl as Idl, provider);
}

// Derive the order PDA
function getOrderPDA(maker: PublicKey, uniqueId: bigint): [PublicKey, number] {
    const uniqueIdBuffer = Buffer.alloc(8);
    uniqueIdBuffer.writeBigUInt64LE(uniqueId);

    return PublicKey.findProgramAddressSync(
        [Buffer.from("order"), maker.toBuffer(), uniqueIdBuffer],
        PROGRAM_ID
    );
}

async function ensureConsumerGroup() {
    try {
        await redis.xgroup(
            "CREATE",
            MATCHED_STREAM_KEY,
            RESOLVER_CONSUMER_GROUP,
            "0",
            "MKSTREAM"
        );
        console.log(`Created consumer group: ${RESOLVER_CONSUMER_GROUP}`);
    } catch (error: any) {
        if (error.message.includes("BUSYGROUP")) {
            console.log(`Consumer group ${RESOLVER_CONSUMER_GROUP} already exists`);
        } else {
            throw error;
        }
    }
}

// Check if order is expired
function isOrderExpired(expiredAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return expiredAt <= now;
}

// Re-add order to engine stream for retry
async function reAddToEngine(order: MatchedOrder) {
    console.log(`Re-adding order ${order.orderKey.slice(0, 8)}... to engine`);

    await redis.xadd(
        ORDER_STREAM_KEY,
        "*",
        "event",
        JSON.stringify({
            type: "OrderCreated",
            data: {
                orderKey: order.orderKey,
                maker: order.maker,
                inputMint: order.inputMint,
                outputMint: order.outputMint,
                makingAmount: order.makingAmount,
                takingAmount: order.takingAmount,
                expiredAt: order.expiredAt.toString(),
                createdAt: Math.floor(Date.now() / 1000).toString(),
                uniqueId: order.uniqueId,
            },
        })
    );
}

// Cancel expired order on-chain
async function cancelExpiredOrder(
    order: MatchedOrder,
    backendKeypair: Keypair,
    program: Program
): Promise<boolean> {
    console.log(`Cancelling expired order ${order.orderKey.slice(0, 8)}...`);

    try {
        const maker = new PublicKey(order.maker);
        const uniqueId = BigInt(order.uniqueId);
        const [orderPDA] = getOrderPDA(maker, uniqueId);
        const inputMint = new PublicKey(order.inputMint);

        // Get the input token program (assuming SPL Token for now)
        const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

        // Derive input_mint_reserve ATA
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const inputMintReserve = getAssociatedTokenAddressSync(inputMint, orderPDA, true);
        const makerInputAccount = getAssociatedTokenAddressSync(inputMint, maker);

        const tx = await program.methods
            .cancelOrder()
            .accounts({
                signer: backendKeypair.publicKey,
                maker: maker,
                order: orderPDA,
                inputMintReserve: inputMintReserve,
                makerInputAccount: makerInputAccount,
                inputMint: inputMint,
                inputTokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([backendKeypair])
            .rpc();

        console.log(`Order cancelled! TX: ${tx}`);
        return true;
    } catch (error) {
        console.error(`Failed to cancel order:`, error);
        return false;
    }
}

// Fill order using Jupiter swap
async function fillOrder(
    order: MatchedOrder,
    backendKeypair: Keypair,
    program: Program
): Promise<boolean> {
    console.log(`\nFilling order: ${order.orderKey.slice(0, 8)}...`);
    console.log(`  Input: ${order.inputMint.slice(0, 8)}... (${order.makingAmount})`);
    console.log(`  Output: ${order.outputMint.slice(0, 8)}... (${order.takingAmount})`);

    try {
        // Step 1: Get Jupiter quote
        console.log("  Getting Jupiter quote...");
        const quote = await getQuote(
            order.inputMint,
            order.outputMint,
            order.makingAmount,
            100 // 1% slippage
        );

        console.log(`  Quote: ${quote.inAmount} -> ${quote.outAmount}`);
        console.log(`  Price impact: ${quote.priceImpactPct}%`);

        // Verify output meets minimum requirements
        const minOutput = BigInt(order.takingAmount);
        const actualOutput = BigInt(quote.outAmount);

        if (actualOutput < minOutput) {
            console.log(`  Quote output (${actualOutput}) < required (${minOutput})`);
            console.log(`  Price moved unfavorably, re-adding to engine`);
            return false;
        }

        // Step 2: Get swap instructions from Jupiter
        const maker = new PublicKey(order.maker);
        const uniqueId = BigInt(order.uniqueId);
        const [orderPDA] = getOrderPDA(maker, uniqueId);

        console.log("  Getting swap instructions...");
        const swapInstructions = await getSwapInstructions(
            quote,
            orderPDA.toBase58() // Order PDA is the authority for the swap
        );

        // Step 3: Get lookup table accounts
        const addressLookupTableAccounts = await getAddressLookupTableAccounts(
            connection,
            swapInstructions.addressLookupTableAddresses
        );

        // Step 4: Build the fill_order instruction
        const inputMint = new PublicKey(order.inputMint);
        const outputMint = new PublicKey(order.outputMint);
        const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const inputMintReserve = getAssociatedTokenAddressSync(inputMint, orderPDA, true);
        const makerOutputAccount = getAssociatedTokenAddressSync(outputMint, maker, false);

        // Get the swap instruction data to pass to fill_order
        const jupiterSwapData = getSwapInstructionData(swapInstructions);

        // Get Jupiter accounts for remaining_accounts
        const jupiterAccounts = getJupiterAccounts(swapInstructions);

        console.log("  Building fill_order instruction...");
        const fillOrderIx = await program.methods
            .fillOrder(jupiterSwapData, new BN(order.takingAmount))
            .accounts({
                backend: backendKeypair.publicKey,
                maker: maker,
                order: orderPDA,
                inputMintReserve: inputMintReserve,
                outputMint: outputMint,
                makerOutputAccount: makerOutputAccount,
                inputMint: inputMint,
                inputTokenProgram: TOKEN_PROGRAM_ID,
                outputTokenProgram: TOKEN_PROGRAM_ID,
                jupiterProgram: JUPITER_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: new PublicKey("11111111111111111111111111111111"),
            })
            .remainingAccounts(jupiterAccounts)
            .instruction();

        // Step 5: Build transaction with compute budget + setup + fill_order + cleanup
        const instructions: TransactionInstruction[] = [];

        // Add compute budget instructions
        if (swapInstructions.computeBudgetInstructions.length > 0) {
            instructions.push(
                ...swapInstructions.computeBudgetInstructions.map(deserializeInstruction)
            );
        }

        // Add setup instructions
        if (swapInstructions.setupInstructions.length > 0) {
            instructions.push(
                ...swapInstructions.setupInstructions.map(deserializeInstruction)
            );
        }

        // Add our fill_order instruction (which internally calls Jupiter swap)
        instructions.push(fillOrderIx);

        // Add cleanup instruction if present
        if (swapInstructions.cleanupInstruction) {
            instructions.push(deserializeInstruction(swapInstructions.cleanupInstruction));
        }

        // Step 6: Create versioned transaction
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const messageV0 = new TransactionMessage({
            payerKey: backendKeypair.publicKey,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message(addressLookupTableAccounts);

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([backendKeypair]);

        // Step 7: Simulate first
        console.log("  Simulating transaction...");
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
            console.error("  Simulation failed:", simulation.value.err);
            console.error("  Logs:", simulation.value.logs);
            return false;
        }

        // Step 8: Send transaction
        console.log("  Sending transaction...");
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            maxRetries: 3,
            skipPreflight: true,
        });

        console.log(`  Confirming: ${signature.slice(0, 20)}...`);

        const confirmation = await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            "confirmed"
        );

        if (confirmation.value.err) {
            console.error(`  Transaction failed:`, confirmation.value.err);
            return false;
        }

        console.log(`  Order filled! TX: ${signature}`);
        return true;
    } catch (error) {
        console.error(`  Fill failed:`, error);
        return false;
    }
}

async function resolveOrder(
    order: MatchedOrder,
    backendKeypair: Keypair,
    program: Program
): Promise<{ success: boolean; shouldRetry: boolean }> {
    // Check if order is expired
    if (isOrderExpired(order.expiredAt)) {
        console.log(`Order ${order.orderKey.slice(0, 8)}... is expired`);
        const cancelled = await cancelExpiredOrder(order, backendKeypair, program);
        return { success: cancelled, shouldRetry: false };
    }

    // Try to fill the order
    const filled = await fillOrder(order, backendKeypair, program);

    return {
        success: filled,
        shouldRetry: !filled, // Retry if fill failed
    };
}

async function consumeMatchedOrders() {
    const backendKeypair = getBackendKeypair();
    const program = getProgram(backendKeypair);

    console.log("Backend authority:", backendKeypair.publicKey.toBase58());

    while (true) {
        try {
            const results = await redis.xreadgroup(
                "GROUP",
                RESOLVER_CONSUMER_GROUP,
                RESOLVER_CONSUMER_NAME,
                "COUNT",
                1,
                "BLOCK",
                50,
                "STREAMS",
                MATCHED_STREAM_KEY,
                ">"
            );

            if (!results) continue;

            for (const [_stream, messages] of results) {
                for (const [messageId, fields] of messages as [string, string[]][]) {
                    try {
                        const orderData = fields[1];
                        const order: MatchedOrder = JSON.parse(orderData);

                        const { success, shouldRetry } = await resolveOrder(
                            order,
                            backendKeypair,
                            program
                        );

                        // Always ACK the message to prevent infinite retries
                        await redis.xack(MATCHED_STREAM_KEY, RESOLVER_CONSUMER_GROUP, messageId);

                        if (!success && shouldRetry) {
                            // Re-add to engine for another attempt
                            await reAddToEngine(order);
                        }
                    } catch (error) {
                        console.error("Error processing matched order:", error);
                        // ACK to prevent blocking, but log the error
                        await redis.xack(MATCHED_STREAM_KEY, RESOLVER_CONSUMER_GROUP, messageId);
                    }
                }
            }
        } catch (error) {
            console.error("Error reading matched stream:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

async function main() {
    console.log("Starting Order Resolver...");
    console.log("  RPC:", RPC_URL);
    console.log("  Matched Stream:", MATCHED_STREAM_KEY);

    await ensureConsumerGroup();

    console.log("Listening for matched orders...\n");

    await consumeMatchedOrders();
}

main().catch(console.error);
