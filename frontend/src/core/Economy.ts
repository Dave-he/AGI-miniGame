export const CurrencyType = {
    Gold: 'gold',
    Gem: 'gem',
    Energy: 'energy',
    Token: 'token',
} as const;
export type CurrencyType = typeof CurrencyType[keyof typeof CurrencyType];

export class Currency {
    private amounts = new Map<CurrencyType, number>();
    private caps = new Map<CurrencyType, number>();

    constructor() {
        this.amounts.set(CurrencyType.Gold, 0);
        this.amounts.set(CurrencyType.Gem, 0);
        this.amounts.set(CurrencyType.Energy, 100);
        this.caps.set(CurrencyType.Gold, Number.MAX_SAFE_INTEGER);
        this.caps.set(CurrencyType.Gem, Number.MAX_SAFE_INTEGER);
        this.caps.set(CurrencyType.Energy, 200);
    }

    get(type: CurrencyType): number {
        return this.amounts.get(type) ?? 0;
    }

    add(type: CurrencyType, amount: number): number {
        const current = this.get(type);
        const cap = this.caps.get(type) ?? Number.MAX_SAFE_INTEGER;
        const newAmount = Math.min(current + amount, cap);
        this.amounts.set(type, newAmount);
        return newAmount;
    }

    spend(type: CurrencyType, amount: number): boolean {
        const current = this.get(type);
        if (current >= amount) {
            this.amounts.set(type, current - amount);
            return true;
        }
        return false;
    }

    canAfford(type: CurrencyType, amount: number): boolean {
        return this.get(type) >= amount;
    }

    setCap(type: CurrencyType, cap: number): void {
        this.caps.set(type, cap);
    }
}

export interface TransactionEntry {
    currencyType: CurrencyType;
    amount: number;
    isGain: boolean;
}

export class Transaction {
    readonly id: string;
    readonly entries: TransactionEntry[] = [];
    readonly description: string;
    timestamp: number = 0;

    constructor(id: string, description: string) {
        this.id = id;
        this.description = description;
    }

    gain(currencyType: CurrencyType, amount: number): Transaction {
        this.entries.push({ currencyType, amount, isGain: true });
        return this;
    }

    cost(currencyType: CurrencyType, amount: number): Transaction {
        this.entries.push({ currencyType, amount, isGain: false });
        return this;
    }

    withTimestamp(ts: number): Transaction {
        this.timestamp = ts;
        return this;
    }
}

export class Wallet {
    readonly currency: Currency;
    private transactionLog: Transaction[] = [];
    private maxLogSize: number = 1000;

    constructor() {
        this.currency = new Currency();
    }

    execute(transaction: Transaction): boolean {
        for (const entry of transaction.entries) {
            if (!entry.isGain && !this.currency.canAfford(entry.currencyType, entry.amount)) {
                return false;
            }
        }
        for (const entry of transaction.entries) {
            if (entry.isGain) {
                this.currency.add(entry.currencyType, entry.amount);
            } else {
                this.currency.spend(entry.currencyType, entry.amount);
            }
        }
        if (this.transactionLog.length >= this.maxLogSize) {
            this.transactionLog.shift();
        }
        this.transactionLog.push(transaction);
        return true;
    }

    canExecute(transaction: Transaction): boolean {
        for (const entry of transaction.entries) {
            if (!entry.isGain && !this.currency.canAfford(entry.currencyType, entry.amount)) {
                return false;
            }
        }
        return true;
    }

    getBalance(type: CurrencyType): number {
        return this.currency.get(type);
    }
}

export interface InventoryItem {
    itemId: string;
    name: string;
    quantity: number;
    maxStack: number;
    metadata: Record<string, any>;
}

export class Inventory {
    private items = new Map<string, InventoryItem>();
    readonly capacity: number;

    constructor(capacity: number = 100) {
        this.capacity = capacity;
    }

    addItem(itemId: string, name: string, quantity: number, maxStack: number = 99): number {
        const existing = this.items.get(itemId);
        if (existing) {
            const added = Math.min(quantity, existing.maxStack - existing.quantity);
            existing.quantity += added;
            return added;
        }
        if (this.items.size < this.capacity) {
            this.items.set(itemId, { itemId, name, quantity, maxStack, metadata: {} });
            return quantity;
        }
        return 0;
    }

    removeItem(itemId: string, amount: number): number {
        const item = this.items.get(itemId);
        if (!item) return 0;
        const removed = Math.min(amount, item.quantity);
        item.quantity -= removed;
        if (item.quantity <= 0) {
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

    get count(): number { return this.items.size; }
    get isFull(): boolean { return this.items.size >= this.capacity; }

    getAllItems(): InventoryItem[] {
        return Array.from(this.items.values());
    }
}
