import { Wallet, Inventory } from './Economy';
import type { GameplayType } from './GameplayType';

export class PlayerProfile {
    accountId: string;
    level: number = 1;
    experience: number = 0;
    private achievements: string[] = [];

    constructor(accountId: string) {
        this.accountId = accountId;
    }

    addExperience(amount: number): number {
        this.experience += amount;
        const expPerLevel = 100 * this.level;
        while (this.experience >= expPerLevel) {
            this.experience -= expPerLevel;
            this.level += 1;
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
    atomPlayCount: Record<string, number> = {};

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

    recordAtomPlay(atomId: string): void {
        this.atomPlayCount[atomId] = (this.atomPlayCount[atomId] ?? 0) + 1;
    }
}

export interface PlayerStats {
    totalScore: number;
    totalPlayTime: number;
    dimensionsVisited: number;
    dimensionsCompleted: number;
    atomPlayCounts: Record<string, number>;
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

    addEvent(event: WorldEvent): void {
        this.worldEvents.push(event);
    }

    getActiveEvents(now: number): WorldEvent[] {
        return this.worldEvents.filter(e => e.active && now >= e.startTime && now <= e.endTime);
    }
}

export interface GameplayRecord {
    dimensionId: string;
    gameplayType: GameplayType;
    score: number;
    timestamp: number;
    duration: number;
}

export class UnifiedWorldState {
    player: PlayerProfile;
    progression: PlayerProgression;
    wallet: Wallet;
    inventory: Inventory;
    activeGameplay: GameplayRecord | null = null;
    gameplayHistory: GameplayRecord[] = [];
    sharedWorld: SharedWorld;

    constructor(accountId: string) {
        this.player = new PlayerProfile(accountId);
        this.progression = new PlayerProgression();
        this.wallet = new Wallet();
        this.inventory = new Inventory();
        this.sharedWorld = new SharedWorld();
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
            atomPlayCounts: { ...this.progression.atomPlayCount },
        };
    }
}
