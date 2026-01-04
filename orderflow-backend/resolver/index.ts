import {
    Connection,
    Keypair,
    VersionedTransaction,
} from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import Redis from "ioredis";
import bs58 from "bs58";
import { getQuote, getSwapTransaction } from "./jupiter";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const MATCHED_STREAM_KEY = "matched_orders";
const RESOLVER_CONSUMER_GROUP = "resolver_group";
const RESOLVER_CONSUMER_NAME = "resolver_1";

// Backend authority keypair (load from env in production!)
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
}

function getBackendKeypair(): Keypair {
    if (!BACKEND_PRIVATE_KEY) {
        console.warn("  BACKEND_PRIVATE_KEY not set, using random keypair for testing");
        return Keypair.generate();
    }

    try {
        // Try base58 format first
        const decoded = bs58.decode(BACKEND_PRIVATE_KEY);
        return Keypair.fromSecretKey(decoded);
    } catch {
        // Try JSON array format
        const parsed = JSON.parse(BACKEND_PRIVATE_KEY);
        return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
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

async function resolveOrder(order: MatchedOrder, backendKeypair: Keypair) {
    console.log(`\n Resolving order: ${order.orderKey.slice(0, 8)}...`);
    console.log(`   Input: ${order.inputMint.slice(0, 8)}... (${order.makingAmount})`);
    console.log(`   Output: ${order.outputMint.slice(0, 8)}... (${order.takingAmount})`);

    try {
        // Step 1: Get Jupiter quote
        console.log(" Getting Jupiter quote...");
        const quote = await getQuote(
            order.inputMint,
            order.outputMint,
            order.makingAmount,
            100 // 1% slippage for limit orders
        );

        console.log(`   Quote: ${quote.inAmount} -> ${quote.outAmount}`);
        console.log(`   Price impact: ${quote.priceImpactPct}%`);

        // Verify the output meets minimum requirements
        const minOutput = BigInt(order.takingAmount);
        const actualOutput = BigInt(quote.outAmount);

        if (actualOutput < minOutput) {
            console.log(`    Quote output (${actualOutput}) < required (${minOutput})`);
            console.log(`   Skipping - price moved unfavorably`);
            return false;
        }

        // Step 2: Get swap transaction
        // NOTE: In production, the transaction would call your program's fill_order
        // For MVP, we're showing the Jupiter integration pattern
        console.log("    Building swap transaction...");
        const swapResult = await getSwapTransaction(quote, order.maker);

        // Step 3: Sign and send transaction
        console.log("     Signing transaction...");
        const transaction = VersionedTransaction.deserialize(
            Buffer.from(swapResult.swapTransaction, "base64")
        );

        transaction.sign([backendKeypair]);

        console.log("    Sending transaction...");
        const signature = await connection.sendTransaction(transaction, {
            skipPreflight: true,
            maxRetries: 3,
        });

        console.log(`    Confirming: ${signature.slice(0, 20)}...`);

        const confirmation = await connection.confirmTransaction(
            {
                signature,
                lastValidBlockHeight: swapResult.lastValidBlockHeight,
                blockhash: transaction.message.recentBlockhash,
            },
            "confirmed"
        );

        if (confirmation.value.err) {
            console.log(`    Transaction failed:`, confirmation.value.err);
            return false;
        }

        console.log(`   Order resolved! TX: ${signature}`);
        return true;
    } catch (error) {
        console.error(`    Resolution failed:`, error);
        return false;
    }
}

async function consumeMatchedOrders() {
    const backendKeypair = getBackendKeypair();
    console.log("   Backend authority:", backendKeypair.publicKey.toBase58());

    while (true) {
        try {
            const results = await redis.xreadgroup(
                "GROUP",
                RESOLVER_CONSUMER_GROUP,
                RESOLVER_CONSUMER_NAME,
                "COUNT",
                1, // Process one at a time for safety
                "BLOCK",
                5000,
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

                        const success = await resolveOrder(order, backendKeypair);

                        if (success) {
                            await redis.xack(MATCHED_STREAM_KEY, RESOLVER_CONSUMER_GROUP, messageId);
                        } else {
                            // On failure, could implement retry logic or dead letter queue
                            console.log(`   🔄 Will retry order ${order.orderKey.slice(0, 8)}...`);
                        }
                    } catch (error) {
                        console.error("Error processing matched order:", error);
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
    console.log(" Starting Order Resolver...");
    console.log("   RPC:", RPC_URL);
    console.log("   Matched Stream:", MATCHED_STREAM_KEY);

    await ensureConsumerGroup();

    console.log("\n🎧 Listening for matched orders...\n");

    await consumeMatchedOrders();
}

main().catch(console.error);
