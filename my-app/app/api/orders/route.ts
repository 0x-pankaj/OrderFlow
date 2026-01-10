import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get("wallet");
        const status = searchParams.get("status");

        if (!wallet) {
            return NextResponse.json(
                { error: "wallet parameter is required" },
                { status: 400 }
            );
        }

        const where: any = { maker: wallet };

        if (status) {
            where.status = status;
        }

        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
        });

        // Convert BigInt to string for JSON serialization
        const serializedOrders = orders.map((order) => ({
            ...order,
            makingAmount: order.makingAmount.toString(),
            takingAmount: order.takingAmount.toString(),
            oriMakingAmount: order.oriMakingAmount.toString(),
            oriTakingAmount: order.oriTakingAmount.toString(),
            uniqueId: order.uniqueId.toString(),
        }));

        return NextResponse.json({ orders: serializedOrders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        return NextResponse.json(
            { error: "Failed to fetch orders" },
            { status: 500 }
        );
    }
}

