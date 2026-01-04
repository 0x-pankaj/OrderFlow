import Redis from "ioredis";
import { prisma } from "./lib/prisma";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_STREAM_KEY = "onchain_order";
const REDIS_CONSUMER_GROUP = "database_group";
const REDIS_CONSUMER_NAME = "db_manager";

const redis = new Redis(REDIS_URL);

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
    maker: string;
    makingAmountFilled: string;
    takingAmountFilled: string;
    remainingMakingAmount: string;
    remainingTakingAmount: string;
    isFilled: boolean;
    filledAt: string;
}

interface OrderCancelledEvent {
    orderKey: string;
    maker: string;
    cancelledBy: { maker?: object; backend?: object };
    cancelledAt: string;
}

interface RedisMessage {
    type: "OrderCreated" | "OrderFilled" | "OrderCancelled";
    data: OrderCreatedEvent | OrderFilledEvent | OrderCancelledEvent;
}

async function ensureConsumerGroup() {
    try {
        await redis.xgroup(
            "CREATE",
            REDIS_STREAM_KEY,
            REDIS_CONSUMER_GROUP,
            "0",
            "MKSTREAM"
        );
        console.log(`Created consumer group: ${REDIS_CONSUMER_GROUP}`);
    } catch (error: any) {
        if (error.message.includes("BUSYGROUP")) {
            console.log(`Consumer group ${REDIS_CONSUMER_GROUP} already exists`);
        } else {
            throw error;
        }
    }
}

async function handleOrderCreated(event: OrderCreatedEvent) {
    console.log("Processing OrderCreated:", event.orderKey);

    await prisma.order.upsert({
        where: { orderKey: event.orderKey },
        update: {},
        create: {
            orderKey: event.orderKey,
            maker: event.maker,
            inputMint: event.inputMint,
            outputMint: event.outputMint,
            makingAmount: BigInt(event.makingAmount),
            takingAmount: BigInt(event.takingAmount),
            oriMakingAmount: BigInt(event.makingAmount),
            oriTakingAmount: BigInt(event.takingAmount),
            expiredAt: new Date(parseInt(event.expiredAt) * 1000),
            createdAt: new Date(parseInt(event.createdAt) * 1000),
            uniqueId: BigInt(event.uniqueId),
            status: "OPEN",
        },
    });

    console.log(`Order ${event.orderKey} saved to database`);
}

async function handleOrderFilled(event: OrderFilledEvent) {
    console.log("Processing OrderFilled:", event.orderKey);

    const status = event.isFilled ? "FILLED" : "PARTIALLY_FILLED";

    await prisma.order.update({
        where: { orderKey: event.orderKey },
        data: {
            makingAmount: BigInt(event.remainingMakingAmount),
            takingAmount: BigInt(event.remainingTakingAmount),
            status: status,
        },
    });

    console.log(`Order ${event.orderKey} updated to ${status}`);
}

async function handleOrderCancelled(event: OrderCancelledEvent) {
    console.log("Processing OrderCancelled:", event.orderKey);

    await prisma.order.update({
        where: { orderKey: event.orderKey },
        data: {
            status: "CANCELLED",
        },
    });

    console.log(`Order ${event.orderKey} cancelled`);
}

async function processMessage(message: RedisMessage) {
    switch (message.type) {
        case "OrderCreated":
            await handleOrderCreated(message.data as OrderCreatedEvent);
            break;
        case "OrderFilled":
            await handleOrderFilled(message.data as OrderFilledEvent);
            break;
        case "OrderCancelled":
            await handleOrderCancelled(message.data as OrderCancelledEvent);
            break;
        default:
            console.log("Unknown event type:", message.type);
    }
}

async function consumeStream() {
    console.log("Starting DB Manager - consuming from Redis stream...");

    await ensureConsumerGroup();

    while (true) {
        try {
            const results = await redis.xreadgroup(
                "GROUP",
                REDIS_CONSUMER_GROUP,
                REDIS_CONSUMER_NAME,
                "COUNT",
                10,
                "BLOCK",
                5000,
                "STREAMS",
                REDIS_STREAM_KEY,
                ">"
            );

            if (!results) continue;

            for (const [_stream, messages] of results) {
                for (const [messageId, fields] of messages as [
                    string,
                    string[]
                ][]) {
                    try {
                        const eventData = fields[1]; // fields = ["event", "...json..."]
                        const message: RedisMessage = JSON.parse(eventData);

                        await processMessage(message);

                        // Acknowledge the message
                        await redis.xack(REDIS_STREAM_KEY, REDIS_CONSUMER_GROUP, messageId);
                    } catch (error) {
                        console.error("Error processing message:", messageId, error);
                    }
                }
            }
        } catch (error) {
            console.error("Error reading from stream:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

consumeStream().catch(console.error);
