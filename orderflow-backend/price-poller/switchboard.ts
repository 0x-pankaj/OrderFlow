import * as sb from "@switchboard-xyz/on-demand";

// Initialize Surge (two authentication modes supported)
// Option 1: Keypair/connection (default, on-chain subscription)
const surge = new sb.Surge({ connection, keypair, verbose: false });

// Option 2: API key
// const surge = new sb.Surge({ apiKey: process.env.SURGE_API_KEY!, verbose: false });

// Discover available feeds
const feeds = await surge.getSurgeFeeds();
console.log(`${feeds.length} feeds available`);

// Stream real-time prices
await surge.connectAndSubscribe([
  { symbol: 'BTC/USD' },
  { symbol: 'SOL/USD' }
]);

// Handle price updates
surge.on('signedPriceUpdate', async (response: sb.SurgeUpdate) => {
  const metrics = response.getLatencyMetrics();
  if (metrics.isHeartbeat) return;

  const prices = response.getFormattedPrices();
  metrics.perFeedMetrics.forEach((feed) => {
    console.log(`${feed.symbol}: ${prices[feed.feed_hash]}`);
  });

  // Convert to on-chain Oracle Quote when needed
  if (shouldExecuteTrade(response)) {
    const crankIxs = response.toQuoteIx(queue.pubkey, keypair.publicKey);
    await executeTrade(crankIxs);
  }
});