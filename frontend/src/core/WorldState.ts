import { Wallet, Inventory } from './Economy';

export class PlayerProfile {
    accountId: string;
    level: number = 1;
    experience: number = 0;
    private achievements: string[] = [];

    // 统一角色的基础属性 (所有玩法通用)
    attributes = {
        hp: 100,
        attack: 10,
        defense: 5,
        speed: 10
    };

    constructor(accountId: string) {
        this.accountId = accountId;
    }

    addExperience(amount: number): number {
        this.experience += amount;
        const expPerLevel = 100 * this.level;
        while (this.experience >= expPerLevel) {
            this.experience -= expPerLevel;
            this.level += 1;
            // 升级时属性自动反哺
            this.attributes.hp += 10;
            this.attributes.attack += 2;
            this.attributes.defense += 1;
        }
        return this.level;
    }

    addAchievement(achievementId: string): void {
        if (!this.achievements.includes(achievementId)) {
            this.achievements.push(achievementId);
        }
    }

    getAchievements(): string[] {
        return [...this.achievements];
    }
}

export class PlayerProgression {
    dimensionsVisited: string[] = [];
    dimensionsCompleted: string[] = [];
    modulePlayCount: Record<string, number> = {}; // 各个玩法的游玩次数

    // 统一成长天赋树
    talents: string[] = [];

    recordDimensionVisit(dimensionId: string): void {
        if (!this.dimensionsVisited.includes(dimensionId)) {
            this.dimensionsVisited.push(dimensionId);
        }
    }

    recordDimensionComplete(dimensionId: string): void {
        if (!this.dimensionsCompleted.includes(dimensionId)) {
            this.dimensionsCompleted.push(dimensionId);
        }
    }

    recordModulePlay(moduleId: string): void {
        this.modulePlayCount[moduleId] = (this.modulePlayCount[moduleId] ?? 0) + 1;
    }
}

export interface PlayerStats {
    totalScore: number;
    totalPlayTime: number;
    dimensionsVisited: number;
    dimensionsCompleted: number;
    modulePlayCounts: Record<string, number>;
}

export interface WorldEvent {
    id: string;
    name: string;
    description: string;
    startTime: number;
    endTime: number;
    active: boolean;
}

export class SharedWorld {
    worldEvents: WorldEvent[] = [];
    
    // 主城场景标识
    public readonly MAIN_HUB = "InfiniteDimensionalCity";

    addEvent(event: WorldEvent): void {
        this.worldEvents.push(event);
    }

    getActiveEvents(now: number): WorldEvent[] {
        return this.worldEvents.filter(e => e.active && now >= e.startTime && now <= e.endTime);
    }
}

export interface GameplayRecord {
    dimensionId: string;
    modules: string[];
    score: number;
    timestamp: number;
    duration: number;
}

export class UnifiedWorldState {
    player: PlayerProfile;
    progression: PlayerProgression;
    wallet: Wallet; // 统一经济: 通用货币与专属代币互通
    inventory: Inventory;
    activeGameplay: GameplayRecord | null = null;
    gameplayHistory: GameplayRecord[] = [];
    sharedWorld: SharedWorld;
    
    // 玩家当前所在的位置，默认在主城
    currentLocation: string;

    constructor(accountId: string) {
        this.player = new PlayerProfile(accountId);
        this.progression = new PlayerProgression();
        this.wallet = new Wallet();
        this.inventory = new Inventory();
        this.sharedWorld = new SharedWorld();
        this.currentLocation = this.sharedWorld.MAIN_HUB;
    }

    enterDimension(dimensionId: string) {
        this.currentLocation = dimensionId;
    }

    returnToHub() {
        this.currentLocation = this.sharedWorld.MAIN_HUB;
    }

    setActiveGameplay(record: GameplayRecord): void {
        this.activeGameplay = record;
    }

    clearActiveGameplay(): void {
        this.activeGameplay = null;
    }

    recordGameplay(record: GameplayRecord): void {
        this.gameplayHistory.push(record);
        if (this.gameplayHistory.length > 500) {
            this.gameplayHistory.shift();
        }
    }

    getPlayerStats(): PlayerStats {
        let totalScore = 0;
        let totalPlayTime = 0;
        for (const record of this.gameplayHistory) {
            totalScore += record.score;
            totalPlayTime += record.duration;
        }
        return {
            totalScore,
            totalPlayTime,
            dimensionsVisited: this.progression.dimensionsVisited.length,
            dimensionsCompleted: this.progression.dimensionsCompleted.length,
            modulePlayCounts: { ...this.progression.modulePlayCount },
        };
    }
}
