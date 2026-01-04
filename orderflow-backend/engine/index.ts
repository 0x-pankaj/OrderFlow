import Redis from "ioredis";
import { OrderBook } from "./orderbook";
import { type Order } from "./orderbook";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ORDER_STREAM_KEY = "onchain_order";
const PRICE_STREAM_KEY = "price_updates";
const MATCHED_STREAM_KEY = "matched_orders";
const ENGINE_CONSUMER_GROUP = "engine_group";
const ENGINE_CONSUMER_NAME = "engine_1";

const redis = new Redis(REDIS_URL);
const orderbook = new OrderBook();

// Supported token pairs for MVP
// Map: inputMint -> { outputMint, priceId }
const SUPPORTED_PAIRS: Record<string, { outputMint: string; symbol: string }> = {
    // SOL -> USDC
    "So11111111111111111111111111111111111111112": {
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "SOL",
    },
    // USDC -> SOL (reverse)
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
        outputMint: "So11111111111111111111111111111111111111112",
        symbol: "USDC",
    },
};

// Current prices cache: priceId -> price
const prices: Map<string, number> = new Map();

interface OrderCreatedEvent {
    orderKey: string;
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    expiredAt: string;
    createdAt: string;
    uniqueId: string;
}

interface OrderFilledEvent {
    orderKey: string;
    isFilled: boolean;
}

interface OrderCancelledEvent {
    orderKey: string;
}

interface PriceUpdate {
    mint: string;
    price: number;
    timestamp: number;
}

interface RedisOrderMessage {
    type: "OrderCreated" | "OrderFilled" | "OrderCancelled";
    data: OrderCreatedEvent | OrderFilledEvent | OrderCancelledEvent;
}

async function ensureConsumerGroups() {
    const streams = [
        { key: ORDER_STREAM_KEY, group: ENGINE_CONSUMER_GROUP },
        { key: PRICE_STREAM_KEY, group: ENGINE_CONSUMER_GROUP },
    ];

    for (const { key, group } of streams) {
        try {
            await redis.xgroup("CREATE", key, group, "0", "MKSTREAM");
            console.log(`Created consumer group ${group} for stream ${key}`);
        } catch (error: any) {
            if (error.message.includes("BUSYGROUP")) {
                console.log(`Consumer group ${group} already exists for ${key}`);
            } else {
                console.error(`Failed to create consumer group:`, error);
            }
        }
    }
}

function handleOrderCreated(event: OrderCreatedEvent) {
    const order: Order = {
        orderKey: event.orderKey,
        maker: event.maker,
        inputMint: event.inputMint,
        outputMint: event.outputMint,
        makingAmount: BigInt(event.makingAmount),
        takingAmount: BigInt(event.takingAmount),
        expiredAt: parseInt(event.expiredAt),
        createdAt: parseInt(event.createdAt),
        uniqueId: BigInt(event.uniqueId),
    };

    orderbook.addOrder(order);
}

function handleOrderFilled(event: OrderFilledEvent) {
    if (event.isFilled) {
        orderbook.removeOrder(event.orderKey);
    }
    // For partial fills, we'd need to update the amounts
    // For MVP, we'll just handle full fills
}

function handleOrderCancelled(event: OrderCancelledEvent) {
    orderbook.removeOrder(event.orderKey);
}

async function processOrderMessage(message: RedisOrderMessage) {
    switch (message.type) {
        case "OrderCreated":
            handleOrderCreated(message.data as OrderCreatedEvent);
            break;
        case "OrderFilled":
            handleOrderFilled(message.data as OrderFilledEvent);
            break;
        case "OrderCancelled":
            handleOrderCancelled(message.data as OrderCancelledEvent);
            break;
    }
}

async function checkForMatches(inputMint: string, currentPrice: number) {
    const pairInfo = SUPPORTED_PAIRS[inputMint];
    if (!pairInfo) return;

    const matchingOrders = orderbook.getMatchingOrders(
        inputMint,
        pairInfo.outputMint,
        currentPrice
    );

    if (matchingOrders.length > 0) {
        console.log(`\n Found ${matchingOrders.length} matching orders!`);

        for (const order of matchingOrders) {
            console.log(`   Pushing order ${order.orderKey.slice(0, 8)}... to resolver`);

            // Push to matched orders stream for resolver
            await redis.xadd(
                MATCHED_STREAM_KEY,
                "*",
                "order",
                JSON.stringify({
                    orderKey: order.orderKey,
                    maker: order.maker,
                    inputMint: order.inputMint,
                    outputMint: order.outputMint,
                    makingAmount: order.makingAmount.toString(),
                    takingAmount: order.takingAmount.toString(),
                    currentPrice: currentPrice,
                })
            );

            // Remove from orderbook (will be re-added if fill fails)
            orderbook.removeOrder(order.orderKey);
        }
    }
}

async function handlePriceUpdate(update: PriceUpdate) {
    prices.set(update.mint, update.price);
    console.log(` Price update: ${update.mint.slice(0, 8)}... = $${update.price}`);

    // Check for matching orders
    await checkForMatches(update.mint, update.price);
}

async function consumeOrderStream() {
    while (true) {
        try {
            const results = await redis.xreadgroup(
                "GROUP",
                ENGINE_CONSUMER_GROUP,
                ENGINE_CONSUMER_NAME,
                "COUNT",
                10,
                "BLOCK",
                1000,
                "STREAMS",
                ORDER_STREAM_KEY,
                ">"
            );

            if (!results) continue;

            for (const [_stream, messages] of results) {
                for (const [messageId, fields] of messages as [string, string[]][]) {
                    try {
                        const eventData = fields[1];
                        const message: RedisOrderMessage = JSON.parse(eventData);
                        await processOrderMessage(message);
                        await redis.xack(ORDER_STREAM_KEY, ENGINE_CONSUMER_GROUP, messageId);
                    } catch (error) {
                        console.error("Error processing order message:", error);
                    }
                }
            }
        } catch (error) {
            console.error("Error reading order stream:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

async function consumePriceStream() {
    while (true) {
        try {
            const results = await redis.xreadgroup(
                "GROUP",
                ENGINE_CONSUMER_GROUP,
                ENGINE_CONSUMER_NAME,
                "COUNT",
                10,
                "BLOCK",
                1000,
                "STREAMS",
                PRICE_STREAM_KEY,
                ">"
            );

            if (!results) continue;

            for (const [_stream, messages] of results) {
                for (const [messageId, fields] of messages as [string, string[]][]) {
                    try {
                        const priceData = fields[1];
                        const update: PriceUpdate = JSON.parse(priceData);
                        await handlePriceUpdate(update);
                        await redis.xack(PRICE_STREAM_KEY, ENGINE_CONSUMER_GROUP, messageId);
                    } catch (error) {
                        console.error("Error processing price message:", error);
                    }
                }
            }
        } catch (error) {
            console.error("Error reading price stream:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

async function logStats() {
    while (true) {
        await new Promise((resolve) => setTimeout(resolve, 30000));
        const stats = orderbook.getStats();
        console.log(
            `\n📊 Engine Stats: ${stats.orderCount} orders across ${stats.tokenCount} tokens`
        );
    }
}

async function main() {
    console.log(" Starting Order Matching Engine...");
    console.log("   Order Stream:", ORDER_STREAM_KEY);
    console.log("   Price Stream:", PRICE_STREAM_KEY);
    console.log("   Match Stream:", MATCHED_STREAM_KEY);

    await ensureConsumerGroups();

    await Promise.all([consumeOrderStream(), consumePriceStream(), logStats()]);
}

main().catch(console.error);
