
import { Program } from "@coral-xyz/anchor";
import { idl } from "./idl";
import {  Connection } from "@solana/web3.js";
import Redis from "ioredis";


const RPC_API = "https://api.devnet.solana.com";
const REDIS_URL = "redis://127.0.0.1:6379";
const REDIS_STREAM_KEY = "onchain_order";
const REDIS_CONSUMER_GROUP_ENGINE = "engine_group";
const REDIS_CONSUMER_GROUP_DATABASE = "database_group";
const REDIS_CONSUMER_NAME = "event_listner";

const connection = new Connection(RPC_API, "confirmed");
const program = new Program(idl, {connection});


const redis = new Redis(REDIS_URL);
const redisDuplicate = redis.duplicate();


async function ensureConsumerGroup() {
    try {
        await redis.xgroup("CREATE", REDIS_STREAM_KEY, REDIS_CONSUMER_GROUP_ENGINE, "$", "MKSTREAM");
        await redis.xgroup("CREATE", REDIS_STREAM_KEY, REDIS_CONSUMER_GROUP_DATABASE, "$", "MKSTREAM");
    } catch (error ) {
        if(error.message.includes("BUSYGROUP")){
            console.log("Consumer group already exists");
        }else {
            console.error("Failed to ensure consumer group", error);
        }
    }
}

function formateRedisMessage(eventType: string, eventData: any) {
    return {
        "type": eventType,
        "data": eventData
    };
}



async function startEventListner() {
    console.log("Starting event listner");

    await ensureConsumerGroup();

    await   program.addEventListener("OrderCreated", async(event) => {

        console.log("OrderCreated", event);

        const payload = formateRedisMessage("OrderCreated", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
    })

    await program.addEventListener("FillOrder", async(event) => {
        console.log("FillOrder", event);
        const payload = formateRedisMessage("FillOrder", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
    })

    await program.addEventListener("OrderCancelled", async(event) => {
        console.log("OrderCancelled", event);
        const payload = formateRedisMessage("OrderCancelled", event);
        await redis.xadd(REDIS_STREAM_KEY, "*", "event", JSON.stringify(payload));
    })

}


async function runWithReconnect() {
    while (true) {
        try {
            await startEventListner();
        } catch (error) {
            console.error(error);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

runWithReconnect();





