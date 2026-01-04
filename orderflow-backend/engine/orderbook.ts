// In-memory orderbook indexed by input token mint
// Structure: inputMint -> Map<orderKey, Order>

export interface Order {
    orderKey: string;
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: bigint;
    takingAmount: bigint;
    expiredAt: number; // Unix timestamp
    createdAt: number;
    uniqueId: bigint;
}

export class OrderBook {
    // inputMint -> Map<orderKey, Order>
    private orders: Map<string, Map<string, Order>> = new Map();

    // For quick lookup by orderKey
    private orderIndex: Map<string, string> = new Map(); // orderKey -> inputMint

    addOrder(order: Order): void {
        const { inputMint, orderKey } = order;

        if (!this.orders.has(inputMint)) {
            this.orders.set(inputMint, new Map());
        }

        this.orders.get(inputMint)!.set(orderKey, order);
        this.orderIndex.set(orderKey, inputMint);

        console.log(
            `📗 Added order ${orderKey.slice(0, 8)}... for ${inputMint.slice(0, 8)}...`
        );
        console.log(`   Total orders for this token: ${this.orders.get(inputMint)!.size}`);
    }

    removeOrder(orderKey: string): void {
        const inputMint = this.orderIndex.get(orderKey);
        if (!inputMint) return;

        this.orders.get(inputMint)?.delete(orderKey);
        this.orderIndex.delete(orderKey);

        console.log(` Removed order ${orderKey.slice(0, 8)}...`);
    }

    getOrdersByToken(inputMint: string): Order[] {
        const tokenOrders = this.orders.get(inputMint);
        if (!tokenOrders) return [];
        return Array.from(tokenOrders.values());
    }

    getOrder(orderKey: string): Order | undefined {
        const inputMint = this.orderIndex.get(orderKey);
        if (!inputMint) return undefined;
        return this.orders.get(inputMint)?.get(orderKey);
    }

    // Get all orders that match a price condition
    // For limit orders: user wants to sell inputMint at a certain rate
    // Rate = takingAmount / makingAmount (how much output per input)
    // Order matches if current market rate >= user's desired rate
    getMatchingOrders(inputMint: string, outputMint: string, currentPrice: number): Order[] {
        const tokenOrders = this.orders.get(inputMint);
        if (!tokenOrders) return [];

        const now = Math.floor(Date.now() / 1000);
        const matchingOrders: Order[] = [];

        for (const order of tokenOrders.values()) {
            // Skip if wrong output token
            if (order.outputMint !== outputMint) continue;

            // Skip expired orders
            if (order.expiredAt <= now) continue;

            // Calculate user's desired rate: takingAmount / makingAmount
            // This is how much outputMint they want per inputMint
            const desiredRate = Number(order.takingAmount) / Number(order.makingAmount);

            // If current price (output per input) >= desired rate, order can be filled
            if (currentPrice >= desiredRate) {
                matchingOrders.push(order);
            }
        }

        return matchingOrders;
    }

    getTotalOrderCount(): number {
        let count = 0;
        for (const tokenOrders of this.orders.values()) {
            count += tokenOrders.size;
        }
        return count;
    }

    getStats(): { tokenCount: number; orderCount: number } {
        return {
            tokenCount: this.orders.size,
            orderCount: this.getTotalOrderCount(),
        };
    }
}
