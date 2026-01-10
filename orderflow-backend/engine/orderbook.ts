// In-memory orderbook indexed by input token mint and desired rate
// Structure: inputMint -> outputMint -> SortedMap<desiredRate, Order[]>
// This allows O(log n) matching by price instead of O(n) iteration

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
    desiredRate?: number; // Cached: takingAmount / makingAmount (calculated on add)
}

// Price level: all orders at the same desired rate
interface PriceLevel {
    rate: number;
    orders: Map<string, Order>; // orderKey -> Order
}

// Orders for a specific trading pair (inputMint -> outputMint)
class PairOrderBook {
    // Sorted array of price levels (ascending by rate)
    private priceLevels: PriceLevel[] = [];
    // Quick lookup: orderKey -> { rate, priceLevelIndex }
    private orderIndex: Map<string, number> = new Map(); // orderKey -> rate

    addOrder(order: Order): void {
        const rate = order.desiredRate!;

        // Find or create price level using binary search
        let levelIndex = this.findPriceLevelIndex(rate);

        if (levelIndex >= 0 && this.priceLevels[levelIndex].rate === rate) {
            // Price level exists, add to it
            this.priceLevels[levelIndex].orders.set(order.orderKey, order);
        } else {
            // Create new price level and insert in sorted position
            const insertIndex = levelIndex >= 0 ? levelIndex + 1 : ~levelIndex;
            const newLevel: PriceLevel = {
                rate: rate,
                orders: new Map([[order.orderKey, order]]),
            };
            this.priceLevels.splice(insertIndex, 0, newLevel);
        }

        this.orderIndex.set(order.orderKey, rate);
    }

    removeOrder(orderKey: string): boolean {
        const rate = this.orderIndex.get(orderKey);
        if (rate === undefined) return false;

        const levelIndex = this.findPriceLevelIndex(rate);
        if (levelIndex < 0 || this.priceLevels[levelIndex].rate !== rate) {
            return false;
        }

        const level = this.priceLevels[levelIndex];
        level.orders.delete(orderKey);

        // Remove empty price level
        if (level.orders.size === 0) {
            this.priceLevels.splice(levelIndex, 1);
        }

        this.orderIndex.delete(orderKey);
        return true;
    }

    getOrder(orderKey: string): Order | undefined {
        const rate = this.orderIndex.get(orderKey);
        if (rate === undefined) return undefined;

        const levelIndex = this.findPriceLevelIndex(rate);
        if (levelIndex < 0) return undefined;

        return this.priceLevels[levelIndex]?.orders.get(orderKey);
    }

    // Get all orders where desiredRate <= currentPrice
    // Since array is sorted ascending, we can find the cutoff and take all up to that point
    getMatchingOrders(currentPrice: number): Order[] {
        const now = Math.floor(Date.now() / 1000);
        const matchingOrders: Order[] = [];

        // Find the last price level that can be filled (rate <= currentPrice)
        // Binary search for the rightmost rate <= currentPrice
        let left = 0;
        let right = this.priceLevels.length - 1;
        let lastValidIndex = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.priceLevels[mid].rate <= currentPrice) {
                lastValidIndex = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // Collect all orders from levels 0 to lastValidIndex
        for (let i = 0; i <= lastValidIndex; i++) {
            for (const order of this.priceLevels[i].orders.values()) {
                // Filter out expired orders
                if (order.expiredAt > now) {
                    matchingOrders.push(order);
                }
            }
        }

        return matchingOrders;
    }

    getOrderCount(): number {
        return this.orderIndex.size;
    }

    getAllOrders(): Order[] {
        const orders: Order[] = [];
        for (const level of this.priceLevels) {
            orders.push(...level.orders.values());
        }
        return orders;
    }

    // Binary search to find price level index
    // Returns exact index if found, or negative (insertIndex + 1) if not found
    private findPriceLevelIndex(rate: number): number {
        let left = 0;
        let right = this.priceLevels.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midRate = this.priceLevels[mid].rate;

            if (midRate === rate) {
                return mid;
            } else if (midRate < rate) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // Return negative insert position
        return ~left;
    }
}

export class OrderBook {
    // inputMint -> outputMint -> PairOrderBook
    private pairs: Map<string, Map<string, PairOrderBook>> = new Map();

    // Quick lookup: orderKey -> { inputMint, outputMint }
    private orderIndex: Map<string, { inputMint: string; outputMint: string }> = new Map();

    addOrder(order: Order): void {
        const { inputMint, outputMint, orderKey } = order;

        // Calculate and cache the desired rate
        order.desiredRate = Number(order.takingAmount) / Number(order.makingAmount);

        // Ensure pair maps exist
        if (!this.pairs.has(inputMint)) {
            this.pairs.set(inputMint, new Map());
        }
        const outputMap = this.pairs.get(inputMint)!;

        if (!outputMap.has(outputMint)) {
            outputMap.set(outputMint, new PairOrderBook());
        }

        outputMap.get(outputMint)!.addOrder(order);
        this.orderIndex.set(orderKey, { inputMint, outputMint });

        console.log(
            `Added order ${orderKey.slice(0, 8)}... rate=${order.desiredRate.toFixed(4)} for ${inputMint.slice(0, 8)}... -> ${outputMint.slice(0, 8)}...`
        );
        console.log(`   Total orders for this pair: ${outputMap.get(outputMint)!.getOrderCount()}`);
    }

    removeOrder(orderKey: string): void {
        const location = this.orderIndex.get(orderKey);
        if (!location) return;

        const { inputMint, outputMint } = location;
        const pairBook = this.pairs.get(inputMint)?.get(outputMint);

        if (pairBook?.removeOrder(orderKey)) {
            this.orderIndex.delete(orderKey);
            console.log(`Removed order ${orderKey.slice(0, 8)}...`);
        }
    }

    getOrder(orderKey: string): Order | undefined {
        const location = this.orderIndex.get(orderKey);
        if (!location) return undefined;

        const { inputMint, outputMint } = location;
        return this.pairs.get(inputMint)?.get(outputMint)?.getOrder(orderKey);
    }

    getOrdersByToken(inputMint: string): Order[] {
        const outputMap = this.pairs.get(inputMint);
        if (!outputMap) return [];

        const orders: Order[] = [];
        for (const pairBook of outputMap.values()) {
            orders.push(...pairBook.getAllOrders());
        }
        return orders;
    }

    // Efficient matching: O(log n) to find cutoff, then O(k) for k matching orders
    getMatchingOrders(inputMint: string, outputMint: string, currentPrice: number): Order[] {
        const pairBook = this.pairs.get(inputMint)?.get(outputMint);
        if (!pairBook) return [];

        return pairBook.getMatchingOrders(currentPrice);
    }

    getTotalOrderCount(): number {
        return this.orderIndex.size;
    }

    getStats(): { tokenCount: number; orderCount: number; pairCount: number } {
        let pairCount = 0;
        for (const outputMap of this.pairs.values()) {
            pairCount += outputMap.size;
        }

        return {
            tokenCount: this.pairs.size,
            pairCount,
            orderCount: this.getTotalOrderCount(),
        };
    }
}
