"use client";

import { type FC, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { idl } from "../idl";

const SUPPORTED_TOKENS = [
    { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
];

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export const OrderForm: FC = () => {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [inputToken, setInputToken] = useState(SUPPORTED_TOKENS[0]);
    const [outputToken, setOutputToken] = useState(SUPPORTED_TOKENS[1]);
    const [makingAmount, setMakingAmount] = useState("");
    const [takingAmount, setTakingAmount] = useState("");
    const [expiryHours, setExpiryHours] = useState("24");
    const [loading, setLoading] = useState(false);
    const [txSignature, setTxSignature] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setTxSignature(null);

        if (!wallet.publicKey || !wallet.signTransaction) {
            setError("Please connect your wallet");
            return;
        }

        if (!makingAmount || !takingAmount) {
            setError("Please enter amounts");
            return;
        }

        setLoading(true);

        try {
            const provider = new AnchorProvider(
                connection,
                wallet as any,
                AnchorProvider.defaultOptions()
            );
            const program = new Program(idl as any, provider);

            const inputMint = new PublicKey(inputToken.mint);
            const outputMint = new PublicKey(outputToken.mint);
            const maker = wallet.publicKey;

            const uniqueId = new BN(Date.now());
            const makingAmountBN = new BN(parseFloat(makingAmount) * Math.pow(10, inputToken.decimals));
            const takingAmountBN = new BN(parseFloat(takingAmount) * Math.pow(10, outputToken.decimals));
            const expiredAt = new BN(Math.floor(Date.now() / 1000) + parseInt(expiryHours) * 3600);

            const [orderPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("order"), maker.toBuffer(), uniqueId.toArrayLike(Buffer, "le", 8)],
                program.programId
            );

            const reserveATA = getAssociatedTokenAddressSync(inputMint, orderPDA, true);
            const makerInputATA = getAssociatedTokenAddressSync(inputMint, maker);

            const tx = await program.methods
                .initializeOrder(uniqueId, makingAmountBN, takingAmountBN, expiredAt)
                .accounts({
                    maker,
                    payer: maker,
                    order: orderPDA,
                    inputMintReserve: reserveATA,
                    makerInputMintAccount: makerInputATA,
                    inputMint,
                    outputMint,
                    inputTokenProgram: TOKEN_PROGRAM_ID,
                    outputTokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .rpc();

            setTxSignature(tx);
            setMakingAmount("");
            setTakingAmount("");
        } catch (err: any) {
            setError(err.message || "Failed to create order");
        } finally {
            setLoading(false);
        }
    };

    const swapTokens = () => {
        setInputToken(outputToken);
        setOutputToken(inputToken);
    };

    return (
        <div className="border border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-medium mb-6">Place Order</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-zinc-500 text-xs mb-1">You Pay</label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            placeholder="0.00"
                            value={makingAmount}
                            onChange={(e) => setMakingAmount(e.target.value)}
                            step="any"
                            min="0"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                        />
                        <select
                            value={inputToken.symbol}
                            onChange={(e) => {
                                const token = SUPPORTED_TOKENS.find((t) => t.symbol === e.target.value);
                                if (token) setInputToken(token);
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white text-sm"
                        >
                            {SUPPORTED_TOKENS.map((t) => (
                                <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <button type="button" onClick={swapTokens} className="mx-auto block text-zinc-500 hover:text-white text-lg">
                    ↕
                </button>

                <div>
                    <label className="block text-zinc-500 text-xs mb-1">You Receive</label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            placeholder="0.00"
                            value={takingAmount}
                            onChange={(e) => setTakingAmount(e.target.value)}
                            step="any"
                            min="0"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                        />
                        <select
                            value={outputToken.symbol}
                            onChange={(e) => {
                                const token = SUPPORTED_TOKENS.find((t) => t.symbol === e.target.value);
                                if (token) setOutputToken(token);
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white text-sm"
                        >
                            {SUPPORTED_TOKENS.map((t) => (
                                <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-zinc-500 text-xs mb-1">Expiry (hours)</label>
                    <input
                        type="number"
                        value={expiryHours}
                        onChange={(e) => setExpiryHours(e.target.value)}
                        min="1"
                        max="720"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                    />
                </div>

                {makingAmount && takingAmount && (
                    <div className="text-zinc-500 text-xs text-center">
                        Rate: 1 {inputToken.symbol} = {(parseFloat(takingAmount) / parseFloat(makingAmount)).toFixed(6)} {outputToken.symbol}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || !wallet.publicKey}
                    className="w-full py-2 rounded bg-white text-black font-medium text-sm hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Creating..." : "Create Order"}
                </button>
            </form>

            {error && <div className="mt-4 p-2 border border-red-900 rounded text-red-400 text-xs">{error}</div>}

            {txSignature && (
                <div className="mt-4 p-2 border border-green-900 rounded text-green-400 text-xs">
                    Order created.{" "}
                    <a href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`} target="_blank" className="underline">
                        View TX
                    </a>
                </div>
            )}
        </div>
    );
};
