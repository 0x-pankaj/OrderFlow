import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type Params = Promise<{ status: string }>;

export async function GET(
    request: NextRequest,
    { params }: { params: Params }
) {
    try {
        const { status } = await params;

        let whereClause: any;

        if (status === "open") {
            whereClause = { status: "OPEN" };
        } else if (status === "closed") {
            whereClause = {
                status: { in: ["FILLED", "CANCELLED"] },
            };
        } else {
            return NextResponse.json(
                { error: "Invalid status. Use 'open' or 'closed'" },
                { status: 400 }
            );
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            take: 100, // Limit for performance
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

