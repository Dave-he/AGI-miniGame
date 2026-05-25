import { WorldState } from './world/WorldState';
import { AIEngine, GenerationConfig } from './ai/AIEngine';
import { DimensionRunner, DimensionConfig, DimensionBlueprint } from './dimension/DimensionRunner';
import { GameplayManager, Match3Module, TowerModule, CardModule, ParkourModule, PuzzleModule } from './gameplay/GameplayManager';

export class GameManager {
    private worldState: WorldState;
    private aiEngine: AIEngine;
    private dimensionRunner: DimensionRunner;
    private gameplayManager: GameplayManager;
    private currentDimension: DimensionBlueprint | null = null;
    private isPaused: boolean = false;

    constructor(accountId: string) {
        this.worldState = new WorldState(accountId);
        this.aiEngine = new AIEngine(Date.now());
        this.dimensionRunner = new DimensionRunner();
        this.gameplayManager = new GameplayManager();

        this.registerGameplayModules();
    }

    private registerGameplayModules(): void {
        this.gameplayManager.registerModule('match3', () => new Match3Module());
        this.gameplayManager.registerModule('tower_defense', () => new TowerModule());
        this.gameplayManager.registerModule('card', () => new CardModule());
        this.gameplayManager.registerModule('parkour', () => new ParkourModule());
        this.gameplayManager.registerModule('puzzle', () => new PuzzleModule());
    }

    async enterNewDimension(): Promise<void> {
        const config: GenerationConfig = {
            minAtoms: 2,
            maxAtoms: 4,
            difficultyRange: [0.3, 0.8],
            playerLevel: this.worldState.player.level,
            preferredTypes: [],
            excludedTypes: [],
            rewardMultiplier: 1.0,
        };

        this.currentDimension = this.aiEngine.generateDimension(config);

        console.log(`Entering dimension: ${this.currentDimension.name}`);
        console.log(`Gameplay modules: ${this.currentDimension.atomIds.join(', ')}`);

        this.worldState.setActiveDimension(
            this.currentDimension.id,
            this.currentDimension.atomIds
        );

        await this.gameplayManager.loadGameplay(this.currentDimension.atomIds);

        const dimConfig: DimensionConfig = {
            id: this.currentDimension.id,
            name: this.currentDimension.name,
            description: this.currentDimension.description,
            atomIds: this.currentDimension.atomIds,
            difficulty: this.currentDimension.difficulty,
            timeLimitSecs: this.currentDimension.timeLimitSecs,
            rules: this.currentDimension.rules.map(r => ({
                ruleId: r.ruleId,
                name: r.name,
                description: r.description,
                isActive: true,
                params: r.params,
            })),
            rewards: this.currentDimension.rewards.map(r => ({
                itemId: r.itemId,
                quantity: r.baseQuantity,
            })),
            objectives: this.currentDimension.objectives.map(o => ({
                id: o.id,
                description: o.description,
                target: o.targetValue,
                isOptional: o.isOptional,
            })),
        };

        this.dimensionRunner.start(dimConfig);
    }

    update(dt: number): void {
        if (this.isPaused) return;

        this.dimensionRunner.update(dt);
        this.gameplayManager.update(dt);

        if (this.dimensionRunner.isCompleted()) {
            this.completeDimension();
        }
    }

    pause(): void {
        this.isPaused = true;
        this.dimensionRunner.pause();
        this.gameplayManager.pause();
    }

    resume(): void {
        this.isPaused = false;
        this.dimensionRunner.resume();
        this.gameplayManager.resume();
    }

    private completeDimension(): void {
        if (!this.currentDimension) return;

        const score = this.gameplayManager.getTotalScore();
        const rewards = this.currentDimension.rewards.map(r => ({
            itemId: r.itemId,
            quantity: r.baseQuantity,
        }));

        this.worldState.recordDimensionComplete(
            this.currentDimension.id,
            score,
            rewards
        );

        this.aiEngine.recordSession({
            dimensionId: this.currentDimension.id,
            difficulty: this.currentDimension.difficulty,
            playerLevel: this.worldState.player.level,
            score,
            durationSecs: this.dimensionRunner.getElapsedTime(),
            completed: true,
        });

        console.log(`Dimension complete! Score: ${score}`);
        this.currentDimension = null;
    }

    getWorldState(): WorldState {
        return this.worldState;
    }

    getAIEngine(): AIEngine {
        return this.aiEngine;
    }

    getDimensionRunner(): DimensionRunner {
        return this.dimensionRunner;
    }

    getGameplayManager(): GameplayManager {
        return this.gameplayManager;
    }

    getCurrentDimension(): DimensionBlueprint | null {
        return this.currentDimension;
    }
}

export { WorldState } from './world/WorldState';
export { AIEngine, GenerationConfig, DimensionBlueprint } from './ai/AIEngine';
export { DimensionRunner, DimensionConfig, DimensionState } from './dimension/DimensionRunner';
export { GameplayManager, GameplayModule } from './gameplay/GameplayManager';
export { PlayerProfile } from './player/PlayerProfile';
export { Wallet, Inventory } from './economy';
