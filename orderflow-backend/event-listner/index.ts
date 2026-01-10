import { Program } from "@coral-xyz/anchor";
import { idl } from "./idl";
import { Connection, PublicKey } from "@solana/web3.js";
import Redis from "ioredis";

const RPC_API = process.env.RPC_URL || "https://api.devnet.solana.com";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_STREAM_KEY = "onchain_order";
const REDIS_CONSUMER_GROUP_ENGINE = "engine_group";
const REDIS_CONSUMER_GROUP_DATABASE = "database_group";

const connection = new Connection(RPC_API, "confirmed");
const program = new Program(idl as any, { connection });

const redis = new Redis(REDIS_URL);

async function ensureConsumerGroups() {
    const groups = [REDIS_CONSUMER_GROUP_ENGINE, REDIS_CONSUMER_GROUP_DATABASE];

    for (const group of groups) {
        try {
            await redis.xgroup("CREATE", REDIS_STREAM_KEY, group, "$", "MKSTREAM");
            console.log(`Created consumer group: ${group}`);
        } catch (error: any) {
            if (error.message.includes("BUSYGROUP")) {
                console.log(`Consumer group ${group} already exists`);
            } else {
                console.error(`Failed to create consumer group ${group}:`, error);
            }
        }
    }
}

// Helper to convert PublicKey and BN to serializable format
function serializeEventData(event: any): any {
    const serialized: any = {};

    for (const [key, value] of Object.entries(event)) {
        if (value instanceof PublicKey) {
            serialized[key] = value.toBase58();
        } else if (typeof value === "bigint") {
            serialized[key] = value.toString();
        } else if (value && typeof value === "object" && "toNumber" in value) {
            // BN type
            serialized[key] = value.toString();
        } else if (value && typeof value === "object") {
            serialized[key] = serializeEventData(value);
        } else {
            serialized[key] = value;
        }
    }

    return serialized;
}

function formatRedisMessage(eventType: string, eventData: any) {
    return {
        type: eventType,
        data: serializeEventData(eventData),
    };
}

async function startEventListener() {
    console.log("Starting event listener...");
    console.log("Program ID:", program.programId.toBase58());
    console.log("RPC:", RPC_API);

    await ensureConsumerGroups();

    // Listen for OrderCreated events
    program.addEventListener("OrderCreated", async (event) => {
        console.log(" OrderCreated event received");
        console.log("  Order Key:", (event as any).orderKey?.toBase58?.() ?? event);

        const payload = formatRedisMessage("OrderCreated", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
        console.log("   Pushed to Redis stream");
    });

    // Listen for OrderFilled events
    program.addEventListener("OrderFilled", async (event) => {
        console.log(" OrderFilled event received");
        console.log("  Order Key:", (event as any).orderKey?.toBase58?.() ?? event);

        const payload = formatRedisMessage("OrderFilled", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
        console.log("  Pushed to Redis stream");
    });

    // Listen for OrderCancelled events
    program.addEventListener("OrderCancelled", async (event) => {
        console.log(" OrderCancelled event received");
        console.log("  Order Key:", (event as any).orderKey?.toBase58?.() ?? event);

        const payload = formatRedisMessage("OrderCancelled", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
        console.log("   Pushed to Redis stream");
    });

    console.log("\ Event listener active. Waiting for on-chain events...\n");
}

async function runWithReconnect() {
    while (true) {
        try {
            await startEventListener();
            await new Promise(() => { });
        } catch (error) {
            console.error("Event listener error:", error);
            console.log("Reconnecting in 5 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

runWithReconnect();
