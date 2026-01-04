// Jupiter API integration for swap quotes and transaction building

const JUPITER_API_URL = "https://quote-api.jup.ag/v6";

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

export interface SwapResponse {
    swapTransaction: string; // Base64 encoded transaction
    lastValidBlockHeight: number;
}

export async function getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50 // 0.5% default slippage
): Promise<QuoteResponse> {
    const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount,
        slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_API_URL}/quote?${params}`);

    if (!response.ok) {
        throw new Error(`Jupiter quote failed: ${response.statusText}`);
    }

    return response.json();
}

export async function getSwapTransaction(
    quote: QuoteResponse,
    userPublicKey: string
): Promise<SwapResponse> {
    const response = await fetch(`${JUPITER_API_URL}/swap`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jupiter swap failed: ${error}`);
    }

    return response.json();
}
