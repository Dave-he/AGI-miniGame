import { PlayerProfile, PlayerProgression } from '../player/PlayerProfile';
import { Wallet, CurrencyType } from '../economy/Wallet';
import { Inventory, InventoryItem, Reward } from '../economy/Inventory';

export interface DimensionInfo {
    dimensionId: string;
    gameplayTypes: string[];
    sessionStart: number;
    score: number;
}

export interface DimensionRecord {
    dimensionId: string;
    gameplayTypes: string[];
    startTime: number;
    endTime: number;
    score: number;
    rewardsEarned: Reward[];
}

export interface WorldEvent {
    eventId: string;
    name: string;
    description: string;
    startTime: number;
    endTime: number;
    isActive: boolean;
    modifiers: Record<string, any>;
}

export interface Announcement {
    id: string;
    title: string;
    content: string;
    timestamp: number;
}

export interface SeasonInfo {
    seasonId: string;
    name: string;
    startDate: number;
    endDate: number;
    theme: string;
    bonusMultiplier: number;
}

export interface PlayerStats {
    level: number;
    experience: number;
    gold: number;
    gem: number;
    energy: number;
    dimensionCount: number;
}

export class WorldState {
    public player: PlayerProfile;
    public progression: PlayerProgression;
    public wallet: Wallet;
    public inventory: Inventory;
    public activeDimension: DimensionInfo | null = null;
    public dimensionHistory: DimensionRecord[] = [];
    public worldEvents: WorldEvent[] = [];
    public announcements: Announcement[] = [];
    public seasonInfo: SeasonInfo | null = null;
    public globalData: Map<string, any> = new Map();

    constructor(accountId: string, displayName?: string) {
        this.player = new PlayerProfile(accountId, displayName);
        this.progression = new PlayerProgression();
        this.wallet = new Wallet();
        this.inventory = new Inventory(100);
    }

    setActiveDimension(dimensionId: string, gameplayTypes: string[]): void {
        this.activeDimension = {
            dimensionId,
            gameplayTypes,
            sessionStart: Date.now(),
            score: 0,
        };
        this.progression.recordDimensionVisit(dimensionId);
    }

    clearActiveDimension(): DimensionInfo | null {
        const dim = this.activeDimension;
        this.activeDimension = null;
        return dim;
    }

    recordDimensionComplete(dimensionId: string, score: number, rewards: Reward[]): void {
        this.progression.recordDimensionComplete(score);

        for (const reward of rewards) {
            if (reward.itemId === 'gold') {
                this.wallet.addCurrency('gold', reward.quantity);
            } else if (reward.itemId === 'gem') {
                this.wallet.addCurrency('gem', reward.quantity);
            } else {
                const item: InventoryItem = {
                    itemId: reward.itemId,
                    name: reward.itemId,
                    quantity: reward.quantity,
                    maxStack: 99,
                };
                this.inventory.addItem(item);
            }
        }

        this.player.addExperience(Math.floor(score / 10));

        this.dimensionHistory.push({
            dimensionId,
            gameplayTypes: this.activeDimension?.gameplayTypes || [],
            startTime: this.activeDimension?.sessionStart || Date.now(),
            endTime: Date.now(),
            score,
            rewardsEarned: rewards,
        });

        this.activeDimension = null;
    }

    addGold(amount: number): void {
        this.wallet.addCurrency('gold', amount);
    }

    addGem(amount: number): void {
        this.wallet.addCurrency('gem', amount);
    }

    spendGold(amount: number): boolean {
        return this.wallet.spendCurrency('gold', amount);
    }

    spendGem(amount: number): boolean {
        return this.wallet.spendCurrency('gem', amount);
    }

    getGold(): number {
        return this.wallet.getBalance('gold');
    }

    getGem(): number {
        return this.wallet.getBalance('gem');
    }

    getEnergy(): number {
        return this.wallet.getBalance('energy');
    }

    spendEnergy(amount: number): boolean {
        return this.wallet.spendCurrency('energy', amount);
    }

    addInventoryItem(itemId: string, name: string, quantity: number): boolean {
        const item: InventoryItem = {
            itemId,
            name,
            quantity,
            maxStack: 99,
        };
        return this.inventory.addItem(item) > 0;
    }

    hasItem(itemId: string, minQuantity: number = 1): boolean {
        return this.inventory.hasItem(itemId, minQuantity);
    }

    getInventory(): Inventory {
        return this.inventory;
    }

    addWorldEvent(event: WorldEvent): void {
        this.worldEvents.push(event);
    }

    getActiveEvents(): WorldEvent[] {
        return this.worldEvents.filter(e => e.isActive);
    }

    removeEvent(eventId: string): void {
        this.worldEvents = this.worldEvents.filter(e => e.eventId !== eventId);
    }

    addAnnouncement(announcement: Announcement): void {
        this.announcements.push(announcement);
    }

    setGlobal(key: string, value: any): void {
        this.globalData.set(key, value);
    }

    getGlobal<T>(key: string): T | undefined {
        return this.globalData.get(key) as T | undefined;
    }

    getPlayerStats(): PlayerStats {
        return {
            level: this.player.level,
            experience: this.player.experience,
            gold: this.getGold(),
            gem: this.getGem(),
            energy: this.getEnergy(),
            dimensionCount: this.dimensionHistory.length,
        };
    }

    saveToJSON(): string {
        return JSON.stringify({
            player: this.player.toJSON(),
            progression: this.progression,
            wallet: this.wallet.getAllBalances(),
            inventory: this.inventory.getAllItems(),
            dimensionHistory: this.dimensionHistory,
        });
    }

    loadFromJSON(json: string): boolean {
        try {
            const data = JSON.parse(json);
            
            this.player = Object.assign(new PlayerProfile(data.player.accountId), data.player);
            this.progression = Object.assign(new PlayerProgression(), data.progression);
            
            const balances = data.wallet || {};
            this.wallet = new Wallet();
            for (const [currency, amount] of Object.entries(balances)) {
                this.wallet.addCurrency(currency, amount as number);
            }
            
            this.inventory = new Inventory(100);
            if (data.inventory) {
                for (const item of data.inventory) {
                    this.inventory.addItem(item);
                }
            }
            
            this.dimensionHistory = data.dimensionHistory || [];
            
            return true;
        } catch (e) {
            console.error('Failed to load WorldState from JSON:', e);
            return false;
        }
    }

    saveToStorage(key: string = 'agi_world_state'): void {
        try {
            localStorage.setItem(key, this.saveToJSON());
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }

    loadFromStorage(key: string = 'agi_world_state'): boolean {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                return this.loadFromJSON(data);
            }
            return false;
        } catch (e) {
            console.warn('Failed to load from localStorage:', e);
            return false;
        }
    }
}
