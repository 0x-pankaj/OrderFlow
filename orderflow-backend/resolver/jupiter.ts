// Jupiter API integration using swap-instructions endpoint
// This returns raw instructions that we can combine with our fill_order instruction

import {
    TransactionInstruction,
    PublicKey,
    AddressLookupTableAccount,
    Connection,
} from "@solana/web3.js";

const JUPITER_API_URL = "https://lite-api.jup.ag/swap/v1";

export interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: any[];
}

interface InstructionAccount {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}

interface RawInstruction {
    programId: string;
    accounts: InstructionAccount[];
    data: string;
}

export interface SwapInstructionsResponse {
    tokenLedgerInstruction?: RawInstruction;
    computeBudgetInstructions: RawInstruction[];
    setupInstructions: RawInstruction[];
    swapInstruction: RawInstruction;
    cleanupInstruction?: RawInstruction;
    addressLookupTableAddresses: string[];
    error?: string;
}

export async function getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50
): Promise<QuoteResponse> {
    const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount,
        slippageBps: slippageBps.toString(),
        restrictIntermediateTokens: "true",
    });

    const response = await fetch(`${JUPITER_API_URL}/quote?${params}`);

    if (!response.ok) {
        throw new Error(`Jupiter quote failed: ${response.statusText}`);
    }

    return response.json();
}

export async function getSwapInstructions(
    quote: QuoteResponse,
    userPublicKey: string
): Promise<SwapInstructionsResponse> {
    const response = await fetch(`${JUPITER_API_URL}/swap-instructions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                    maxLamports: 1000000,
                    global: false,
                    priorityLevel: "veryHigh",
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jupiter swap-instructions failed: ${error}`);
    }

    const data: SwapInstructionsResponse = await response.json();

    if (data.error) {
        throw new Error(`Jupiter swap-instructions error: ${data.error}`);
    }

    return data;
}

// Helper: Deserialize a Jupiter instruction to TransactionInstruction
export function deserializeInstruction(instruction: RawInstruction): TransactionInstruction {
    return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
    });
}

// Helper: Get Address Lookup Table accounts
export async function getAddressLookupTableAccounts(
    connection: Connection,
    keys: string[]
): Promise<AddressLookupTableAccount[]> {
    if (keys.length === 0) return [];

    const accountInfos = await connection.getMultipleAccountsInfo(
        keys.map((key) => new PublicKey(key))
    );

    return accountInfos.reduce((acc, accountInfo, index) => {
        if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
                key: new PublicKey(keys[index]),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
        }
        return acc;
    }, new Array<AddressLookupTableAccount>());
}

// Extract just the swap instruction data (for passing to fill_order)
export function getSwapInstructionData(swapInstructions: SwapInstructionsResponse): Buffer {
    return Buffer.from(swapInstructions.swapInstruction.data, "base64");
}

// Get all Jupiter accounts needed for the swap (for remaining_accounts)
export function getJupiterAccounts(swapInstructions: SwapInstructionsResponse): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[] {
    return swapInstructions.swapInstruction.accounts.map((acc) => ({
        pubkey: new PublicKey(acc.pubkey),
        isSigner: false, // We'll sign with PDA
        isWritable: acc.isWritable,
    }));
}
