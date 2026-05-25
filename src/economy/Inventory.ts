export interface InventoryItem {
    itemId: string;
    name: string;
    quantity: number;
    maxStack: number;
    metadata?: Record<string, any>;
}

export class Inventory {
    private items: Map<string, InventoryItem> = new Map();
    private capacity: number;

    constructor(capacity: number = 100) {
        this.capacity = capacity;
    }

    addItem(item: InventoryItem): number {
        const existing = this.items.get(item.itemId);
        if (existing) {
            return this.stackItem(existing, item.quantity);
        } else {
            if (this.items.size >= this.capacity) {
                return 0;
            }
            const newItem = { ...item };
            this.items.set(item.itemId, newItem);
            return item.quantity;
        }
    }

    removeItem(itemId: string, amount: number): number {
        const item = this.items.get(itemId);
        if (!item) return 0;

        const removed = Math.min(amount, item.quantity);
        item.quantity -= removed;

        if (item.quantity === 0) {
            this.items.delete(itemId);
        }

        return removed;
    }

    hasItem(itemId: string, minQuantity: number = 1): boolean {
        const item = this.items.get(itemId);
        return item !== undefined && item.quantity >= minQuantity;
    }

    getItem(itemId: string): InventoryItem | undefined {
        return this.items.get(itemId);
    }

    getQuantity(itemId: string): number {
        return this.items.get(itemId)?.quantity ?? 0;
    }

    count(): number {
        return this.items.size;
    }

    isFull(): boolean {
        return this.items.size >= this.capacity;
    }

    getAllItems(): InventoryItem[] {
        return Array.from(this.items.values());
    }

    private stackItem(item: InventoryItem, amount: number): number {
        const added = Math.min(amount, item.maxStack - item.quantity);
        item.quantity += added;
        return added;
    }
}

export interface Reward {
    itemId: string;
    quantity: number;
}
