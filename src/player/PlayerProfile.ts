export class PlayerProfile {
    public accountId: string;
    public displayName: string;
    public avatar: string = '';
    public level: number = 1;
    public experience: number = 0;
    public title: string = '';
    public achievements: string[] = [];
    public stats: Map<string, number> = new Map();
    public preferences: Map<string, string> = new Map();

    constructor(accountId: string, displayName?: string) {
        this.accountId = accountId;
        this.displayName = displayName || accountId;
    }

    addExperience(amount: number): number {
        this.experience += amount;
        let levelsGained = 0;
        
        while (this.experience >= this.expToNextLevel()) {
            this.experience -= this.expToNextLevel();
            this.level += 1;
            levelsGained += 1;
        }
        
        return levelsGained;
    }

    private expToNextLevel(): number {
        return 100 * Math.pow(this.level, 2) / 10 + 100;
    }

    addAchievement(achievement: string): boolean {
        if (this.achievements.includes(achievement)) {
            return false;
        }
        this.achievements.push(achievement);
        return true;
    }

    hasAchievement(achievement: string): boolean {
        return this.achievements.includes(achievement);
    }

    setStat(key: string, value: number): void {
        this.stats.set(key, value);
    }

    getStat(key: string): number {
        return this.stats.get(key) || 0;
    }

    setPreference(key: string, value: string): void {
        this.preferences.set(key, value);
    }

    getPreference(key: string): string {
        return this.preferences.get(key) || '';
    }

    toJSON(): string {
        return JSON.stringify({
            accountId: this.accountId,
            displayName: this.displayName,
            level: this.level,
            experience: this.experience,
            achievements: this.achievements,
        });
    }
}

export class PlayerProgression {
    public dimensionsVisited: number = 0;
    public dimensionsCompleted: number = 0;
    public totalScore: number = 0;
    public highestScore: number = 0;
    public totalPlaytimeSecs: number = 0;
    public atomMastery: Map<string, AtomMastery> = new Map();
    public unlockedAtoms: string[] = [];
    public unlockedDimensions: string[] = [];

    recordDimensionVisit(dimensionId: string): void {
        this.dimensionsVisited += 1;
        if (!this.unlockedDimensions.includes(dimensionId)) {
            this.unlockedDimensions.push(dimensionId);
        }
    }

    recordDimensionComplete(score: number): void {
        this.dimensionsCompleted += 1;
        this.totalScore += score;
        if (score > this.highestScore) {
            this.highestScore = score;
        }
    }

    recordAtomPlay(atomId: string, score: number): void {
        if (!this.unlockedAtoms.includes(atomId)) {
            this.unlockedAtoms.push(atomId);
        }
        
        let mastery = this.atomMastery.get(atomId);
        if (!mastery) {
            mastery = new AtomMastery(atomId);
            this.atomMastery.set(atomId, mastery);
        }
        
        mastery.playCount += 1;
        mastery.experience += score;
        if (score > mastery.bestScore) {
            mastery.bestScore = score;
        }
        mastery.level = Math.floor(mastery.experience / 1000);
    }

    getAtomMastery(atomId: string): AtomMastery | undefined {
        return this.atomMastery.get(atomId);
    }

    isAtomUnlocked(atomId: string): boolean {
        return this.unlockedAtoms.includes(atomId);
    }
}

export class AtomMastery {
    public atomId: string;
    public level: number = 0;
    public experience: number = 0;
    public bestScore: number = 0;
    public playCount: number = 0;

    constructor(atomId: string) {
        this.atomId = atomId;
    }
}
