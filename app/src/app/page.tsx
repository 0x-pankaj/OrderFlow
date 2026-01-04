"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { OrderForm } from "@/components/Orderform";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex flex-col items-center pt-12 pb-8 gap-4 border-b border-zinc-800">
        <h1 className="text-3xl font-bold tracking-tight">OrderFlow</h1>
        <p className="text-zinc-500 text-sm">Limit Orders on Solana</p>
        <WalletMultiButton />
      </header>

      <main className="max-w-md mx-auto px-4 py-12">
        <OrderForm />
      </main>

      <footer className="text-center py-8 text-zinc-600 text-xs border-t border-zinc-800">
        Built on Solana • Powered by Jupiter
      </footer>
    </div>
  );
}
