import { HermesClient } from "@pythnetwork/hermes-client";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PRICE_STREAM_KEY = "price_updates";

const redis = new Redis(REDIS_URL);

// Supported tokens and their Pyth price feed IDs
const PRICE_FEEDS: Record<string, { mint: string; symbol: string }> = {
  // SOL/USD
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d": {
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
  },
  // USDC/USD (always ~1, but good to have)
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
  },
};

const priceIds = Object.keys(PRICE_FEEDS);

async function ensureStream() {
  try {
    await redis.xgroup("CREATE", PRICE_STREAM_KEY, "engine_group", "$", "MKSTREAM");
    console.log("Created price stream and consumer group");
  } catch (error: any) {
    if (error.message.includes("BUSYGROUP")) {
      console.log("Price stream already exists");
    }
  }
}

async function startPricePoller() {
  console.log("🚀 Starting Price Poller...");
  console.log("   Tracking", priceIds.length, "price feeds");

  await ensureStream();

  const connection = new HermesClient("https://hermes.pyth.network", {});

  console.log("   Connecting to Pyth Hermes...");

  const eventSource = await connection.getPriceUpdatesStream(priceIds, {
    encoding: "hex",
    parsed: true,
  });

  eventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.parsed && Array.isArray(data.parsed)) {
        for (const priceData of data.parsed) {
          const feedId = "0x" + priceData.id;
          const feedInfo = PRICE_FEEDS[feedId];

          if (!feedInfo) continue;

          // Calculate the actual price from Pyth format
          const price = parseFloat(priceData.price.price) * Math.pow(10, priceData.price.expo);

          console.log(`💰 ${feedInfo.symbol}: $${price.toFixed(4)}`);

          // Push to Redis stream
          await redis.xadd(
            PRICE_STREAM_KEY,
            "*",
            "price",
            JSON.stringify({
              mint: feedInfo.mint,
              symbol: feedInfo.symbol,
              price: price,
              timestamp: Date.now(),
            })
          );
        }
      }
    } catch (error) {
      console.error("Error processing price update:", error);
    }
  };

  eventSource.onerror = (error) => {
    console.error("Pyth connection error:", error);
    eventSource.close();
    // Will be restarted by the reconnect loop
    throw new Error("Pyth connection lost");
  };

  console.log("   ✅ Connected and streaming prices\n");

  // Keep alive
  await new Promise(() => { });
}

async function runWithReconnect() {
  while (true) {
    try {
      await startPricePoller();
    } catch (error) {
      console.error("Price poller error:", error);
      console.log("Reconnecting in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

runWithReconnect();
