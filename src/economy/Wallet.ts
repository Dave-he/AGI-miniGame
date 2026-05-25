export type CurrencyType = 'gold' | 'gem' | 'energy' | 'token' | string;

export class Wallet {
    private currencies: Map<CurrencyType, number> = new Map();
    private currencyCaps: Map<CurrencyType, number> = new Map();
    private transactionLog: TransactionEntry[] = [];
    private maxLogSize: number = 1000;

    constructor() {
        this.currencies.set('gold', 0);
        this.currencies.set('gem', 0);
        this.currencies.set('energy', 100);
        this.currencies.set('token', 0);

        this.currencyCaps.set('gold', Number.MAX_SAFE_INTEGER);
        this.currencyCaps.set('gem', Number.MAX_SAFE_INTEGER);
        this.currencyCaps.set('energy', 200);
        this.currencyCaps.set('token', Number.MAX_SAFE_INTEGER);
    }

    getBalance(currency: CurrencyType): number {
        return this.currencies.get(currency) || 0;
    }

    addCurrency(currency: CurrencyType, amount: number): number {
        const current = this.getBalance(currency);
        const cap = this.currencyCaps.get(currency) || Number.MAX_SAFE_INTEGER;
        const newAmount = Math.min(current + amount, cap);
        this.currencies.set(currency, newAmount);
        this.logTransaction(currency, amount, true);
        return newAmount;
    }

    spendCurrency(currency: CurrencyType, amount: number): boolean {
        const current = this.getBalance(currency);
        if (current >= amount) {
            this.currencies.set(currency, current - amount);
            this.logTransaction(currency, amount, false);
            return true;
        }
        return false;
    }

    canAfford(currency: CurrencyType, amount: number): boolean {
        return this.getBalance(currency) >= amount;
    }

    setCap(currency: CurrencyType, cap: number): void {
        this.currencyCaps.set(currency, cap);
    }

    getAllBalances(): Record<string, number> {
        const result: Record<string, number> = {};
        this.currencies.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    getTransactionLog(): TransactionEntry[] {
        return [...this.transactionLog];
    }

    private logTransaction(currency: CurrencyType, amount: number, isGain: boolean): void {
        if (this.transactionLog.length >= this.maxLogSize) {
            this.transactionLog.shift();
        }
        this.transactionLog.push({
            currency,
            amount,
            isGain,
            timestamp: Date.now(),
        });
    }
}

export interface TransactionEntry {
    currency: CurrencyType;
    amount: number;
    isGain: boolean;
    timestamp: number;
}

export interface Transaction {
    id: string;
    entries: TransactionEntry[];
    description: string;
}
