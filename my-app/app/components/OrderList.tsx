"use client";

import { type FC, useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CancelOrderButton } from "./CancelOrder";

// Token mapping for display
const TOKEN_MAP: Record<string, { symbol: string; decimals: number }> = {
    So11111111111111111111111111111111111111112: { symbol: "SOL", decimals: 9 },
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
};

interface Order {
    id: string;
    orderKey: string;
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    oriMakingAmount: string;
    oriTakingAmount: string;
    expiredAt: string;
    createdAt: string;
    status: "OPEN" | "FILLED" | "CANCELLED";
    uniqueId: string;
}

type FilterType = "open" | "closed";

const formatAmount = (amount: string, mint: string): string => {
    const token = TOKEN_MAP[mint];
    if (!token) return amount;
    const value = Number(amount) / Math.pow(10, token.decimals);
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token.symbol}`;
};

const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const StatusBadge: FC<{ status: Order["status"] }> = ({ status }) => {
    const colors = {
        OPEN: "bg-green-900/50 text-green-400",
        FILLED: "bg-blue-900/50 text-blue-400",
        CANCELLED: "bg-zinc-800 text-zinc-400",
    };

    return (
        <span className={`px-2 py-0.5 rounded text-xs ${colors[status]}`}>
            {status}
        </span>
    );
};

export const OrderList: FC = () => {
    const wallet = useWallet();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterType>("open");

    const fetchOrders = useCallback(async () => {
        if (!wallet.publicKey) {
            setOrders([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const status = filter === "open" ? "OPEN" : undefined;
            const url = status
                ? `/api/orders?wallet=${wallet.publicKey.toString()}&status=${status}`
                : `/api/orders?wallet=${wallet.publicKey.toString()}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch orders");
            }

            let filteredOrders = data.orders;
            if (filter === "closed") {
                filteredOrders = data.orders.filter(
                    (o: Order) => o.status === "FILLED" || o.status === "CANCELLED"
                );
            }

            setOrders(filteredOrders);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [wallet.publicKey, filter]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handleCancelSuccess = () => {
        fetchOrders();
    };

    if (!wallet.publicKey) {
        return (
            <div className="text-center text-zinc-500 py-8">
                Connect your wallet to view orders
            </div>
        );
    }

    return (
        <div className="border border-zinc-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium">My Orders</h2>
                <div className="flex gap-1">
                    <button
                        onClick={() => setFilter("open")}
                        className={`px-3 py-1 text-xs rounded ${filter === "open"
                            ? "bg-white text-black"
                            : "bg-zinc-900 text-zinc-400 hover:text-white"
                            }`}
                    >
                        Open
                    </button>
                    <button
                        onClick={() => setFilter("closed")}
                        className={`px-3 py-1 text-xs rounded ${filter === "closed"
                            ? "bg-white text-black"
                            : "bg-zinc-900 text-zinc-400 hover:text-white"
                            }`}
                    >
                        Closed
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-zinc-500 py-8">Loading...</div>
            ) : error ? (
                <div className="text-center text-red-400 py-8">{error}</div>
            ) : orders.length === 0 ? (
                <div className="text-center text-zinc-500 py-8">
                    No {filter} orders found
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map((order) => (
                        <div
                            key={order.id}
                            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <StatusBadge status={order.status} />
                                <span className="text-zinc-500 text-xs">
                                    {formatDate(order.createdAt)}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-sm mb-2">
                                <span className="text-white">
                                    {formatAmount(order.makingAmount, order.inputMint)}
                                </span>
                                <span className="text-zinc-500">→</span>
                                <span className="text-white">
                                    {formatAmount(order.takingAmount, order.outputMint)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-zinc-500">
                                <span>
                                    Expires: {formatDate(order.expiredAt)}
                                </span>
                                {order.status === "OPEN" && (
                                    <CancelOrderButton
                                        orderKey={order.orderKey}
                                        maker={order.maker}
                                        inputMint={order.inputMint}
                                        uniqueId={order.uniqueId}
                                        onSuccess={handleCancelSuccess}
                                        onError={(err) => setError(err)}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={fetchOrders}
                className="mt-4 w-full py-2 text-xs text-zinc-500 hover:text-white border border-zinc-800 rounded"
            >
                Refresh
            </button>
        </div>
    );
};

