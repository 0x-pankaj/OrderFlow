"use client";

import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { OrderForm } from "@/app/components/OrderForm";
import { OrderList } from "@/app/components/OrderList";

type Tab = "place" | "orders";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("place");

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex flex-col items-center pt-12 pb-8 gap-4 border-b border-zinc-800">
        <h1 className="text-3xl font-bold tracking-tight">OrderFlow</h1>
        <p className="text-zinc-500 text-sm">Limit Orders on Solana</p>
        <WalletMultiButton />
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("place")}
            className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${activeTab === "place"
              ? "bg-white text-black"
              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
          >
            Place Order
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${activeTab === "orders"
              ? "bg-white text-black"
              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
          >
            My Orders
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "place" ? <OrderForm /> : <OrderList />}
      </main>

      <footer className="text-center py-8 text-zinc-600 text-xs border-t border-zinc-800">
        Built on Solana • Powered by Jupiter
      </footer>
    </div>
  );
}

