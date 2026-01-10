"use client";

import { type FC, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { idl } from "../idl";

interface CancelOrderProps {
    orderKey: string;
    maker: string;
    inputMint: string;
    uniqueId: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
}

export const useCancelOrder = () => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const [loading, setLoading] = useState(false);

    const cancelOrder = useCallback(
        async ({
            orderKey,
            maker,
            inputMint,
            uniqueId,
            onSuccess,
            onError,
        }: CancelOrderProps) => {
            if (!wallet.publicKey || !wallet.signTransaction) {
                onError?.("Please connect your wallet");
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

                const makerPubkey = new PublicKey(maker);
                const inputMintPubkey = new PublicKey(inputMint);
                const uniqueIdBN = new BN(uniqueId);

                // Derive order PDA
                const [orderPDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("order"),
                        makerPubkey.toBuffer(),
                        uniqueIdBN.toArrayLike(Buffer, "le", 8),
                    ],
                    program.programId
                );

                // Derive token accounts
                const inputMintReserve = getAssociatedTokenAddressSync(
                    inputMintPubkey,
                    orderPDA,
                    true
                );
                const makerInputAccount = getAssociatedTokenAddressSync(
                    inputMintPubkey,
                    makerPubkey
                );

                const tx = await program.methods
                    .cancelOrder()
                    .accounts({
                        signer: wallet.publicKey,
                        maker: makerPubkey,
                        order: orderPDA,
                        inputMintReserve: inputMintReserve,
                        makerInputAccount: makerInputAccount,
                        inputMint: inputMintPubkey,
                        inputTokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .rpc();

                console.log("Order cancelled:", tx);
                onSuccess?.();
            } catch (err: any) {
                console.error("Cancel failed:", err);
                onError?.(err.message || "Failed to cancel order");
            } finally {
                setLoading(false);
            }
        },
        [connection, wallet]
    );

    return { cancelOrder, loading };
};

// Button component for easy use
export const CancelOrderButton: FC<
    CancelOrderProps & { className?: string }
> = ({ orderKey, maker, inputMint, uniqueId, onSuccess, onError, className }) => {
    const { cancelOrder, loading } = useCancelOrder();

    return (
        <button
            onClick={() =>
                cancelOrder({ orderKey, maker, inputMint, uniqueId, onSuccess, onError })
            }
            disabled={loading}
            className={
                className ||
                "px-3 py-1 text-xs bg-red-900/50 text-red-400 rounded hover:bg-red-900 disabled:opacity-50"
            }
        >
            {loading ? "..." : "Cancel"}
        </button>
    );
};

