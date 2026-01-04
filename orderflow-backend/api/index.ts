import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // GET /orders?maker=<pubkey>
    if (url.pathname === "/orders" && req.method === "GET") {
      const maker = url.searchParams.get("maker");

      if (!maker) {
        return new Response(JSON.stringify({ error: "maker param required" }), {
          status: 400,
          headers,
        });
      }

      try {
        const orders = await prisma.order.findMany({
          where: { maker },
          orderBy: { createdAt: "desc" },
        });

        // Convert BigInt to string for JSON serialization
        const serialized = orders.map((o) => ({
          ...o,
          makingAmount: o.makingAmount.toString(),
          takingAmount: o.takingAmount.toString(),
          oriMakingAmount: o.oriMakingAmount.toString(),
          oriTakingAmount: o.oriTakingAmount.toString(),
          uniqueId: o.uniqueId.toString(),
        }));

        return new Response(JSON.stringify(serialized), { headers });
      } catch (error) {
        console.error("Error fetching orders:", error);
        return new Response(JSON.stringify({ error: "Database error" }), {
          status: 500,
          headers,
        });
      }
    }

    // GET /orders/:orderKey
    if (url.pathname.startsWith("/orders/") && req.method === "GET") {
      const orderKey = url.pathname.split("/")[2];

      try {
        const order = await prisma.order.findUnique({
          where: { orderKey },
        });

        if (!order) {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers,
          });
        }

        const serialized = {
          ...order,
          makingAmount: order.makingAmount.toString(),
          takingAmount: order.takingAmount.toString(),
          oriMakingAmount: order.oriMakingAmount.toString(),
          oriTakingAmount: order.oriTakingAmount.toString(),
          uniqueId: order.uniqueId.toString(),
        };

        return new Response(JSON.stringify(serialized), { headers });
      } catch (error) {
        console.error("Error fetching order:", error);
        return new Response(JSON.stringify({ error: "Database error" }), {
          status: 500,
          headers,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`API server running on http://localhost:${server.port}`);
