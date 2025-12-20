import { HermesClient } from "@pythnetwork/hermes-client";

const connection = new HermesClient("https://hermes.pyth.network", {});
const priceIds = [
  // You can find the ids of prices at https://docs.pyth.network/price-feeds/price-feeds
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD price id
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id
];

const eventSource = await connection.getPriceUpdatesStream(priceIds);

// Streaming price updates
// const eventSource = await connection.getStreamingPriceUpdates(priceIds);
eventSource.onmessage = (event) => {
  console.log("Received price update:", event.data);
};
eventSource.onerror = (error) => {
  console.error("Error receiving updates:", error);
  eventSource.close();
};

// // await sleep(5000);
// // // To stop listening to the updates, you can call eventSource.close();
// // console.log("Closing event source.");
// // eventSource.close();

