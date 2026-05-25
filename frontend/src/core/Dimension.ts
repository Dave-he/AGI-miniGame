import { Atom, AtomRegistry, AtomRunner } from './Atom';
import type { AtomContext } from './Atom';
import type { DimensionBlueprint, Objective } from './AiEngine';
import type { GameplayType } from './GameplayType';
import type { UnifiedWorldState, GameplayRecord } from './WorldState';

export const DimensionState = {
    Created: 'created',
    Loading: 'loading',
    Ready: 'ready',
    Running: 'running',
    Paused: 'paused',
    Completed: 'completed',
    Failed: 'failed',
} as const;
export type DimensionState = typeof DimensionState[keyof typeof DimensionState];

export class DimensionObjective {
    id: string;
    description: string;
    targetValue: number;
    currentValue: number = 0;
    completed: boolean = false;

    constructor(id: string, description: string, targetValue: number) {
        this.id = id;
        this.description = description;
        this.targetValue = targetValue;
    }

    updateProgress(amount: number): void {
        this.currentValue = Math.min(this.currentValue + amount, this.targetValue);
        if (this.currentValue >= this.targetValue) {
            this.completed = true;
        }
    }
}

export class DimensionConfig {
    id: string;
    name: string;
    description: string;
    gameplayType: GameplayType;
    atomId: string;
    difficulty: number;
    config: Record<string, any>;

    constructor(blueprint: DimensionBlueprint) {
        this.id = blueprint.id;
        this.name = blueprint.name;
        this.description = blueprint.description;
        this.gameplayType = blueprint.gameplayType;
        this.atomId = blueprint.atomId;
        this.difficulty = blueprint.difficulty;
        this.config = blueprint.config;
    }
}

export class Dimension {
    readonly config: DimensionConfig;
    private objectives: DimensionObjective[] = [];
    private state: DimensionState = DimensionState.Created;
    private atom: Atom | null = null;
    private atomRunner: AtomRunner | null = null;
    private elapsedTime: number = 0;
    private events: { name: string; data: Record<string, any>; timestamp: number }[] = [];

    constructor(config: DimensionConfig) {
        this.config = config;
    }

    load(registry: AtomRegistry): boolean {
        this.state = DimensionState.Loading;
        const atom = registry.create(this.config.atomId);
        if (!atom) {
            this.state = DimensionState.Failed;
            return false;
        }
        this.atom = atom;
        this.atomRunner = new AtomRunner(atom);
        const ctx: AtomContext = {
            worldState: null,
            deltaTime: 0,
            sharedData: { ...this.config.config },
        };
        this.atomRunner.init(ctx);
        this.state = DimensionState.Ready;
        return true;
    }

    start(worldState: UnifiedWorldState): boolean {
        if (this.state !== DimensionState.Ready || !this.atomRunner) return false;
        const ctx: AtomContext = {
            worldState,
            deltaTime: 0,
            sharedData: { ...this.config.config },
        };
        this.atomRunner.enter(ctx);
        this.state = DimensionState.Running;
        return true;
    }

    update(deltaTime: number, worldState: UnifiedWorldState): void {
        if (this.state !== DimensionState.Running || !this.atomRunner) return;
        this.elapsedTime += deltaTime;
        const ctx: AtomContext = {
            worldState,
            deltaTime,
            sharedData: {},
        };
        this.atomRunner.update(ctx);
    }

    pause(): void {
        if (this.state !== DimensionState.Running || !this.atomRunner) return;
        const ctx: AtomContext = { worldState: null, deltaTime: 0, sharedData: {} };
        this.atomRunner.pause(ctx);
        this.state = DimensionState.Paused;
    }

    resume(): void {
        if (this.state !== DimensionState.Paused || !this.atomRunner) return;
        const ctx: AtomContext = { worldState: null, deltaTime: 0, sharedData: {} };
        this.atomRunner.resume(ctx);
        this.state = DimensionState.Running;
    }

    complete(worldState: UnifiedWorldState): GameplayRecord {
        this.state = DimensionState.Completed;
        const score = this.atomRunner?.getScore() ?? 0;
        const record: GameplayRecord = {
            dimensionId: this.config.id,
            gameplayType: this.config.gameplayType,
            score,
            timestamp: Date.now(),
            duration: this.elapsedTime,
        };
        worldState.recordGameplay(record);
        worldState.progression.recordDimensionComplete(this.config.id);
        return record;
    }

    addScore(amount: number): void {
        if (this.atom) {
            (this.atom as any)._score = ((this.atom as any)._score ?? 0) + amount;
        }
    }

    progressObjective(objectiveId: string, amount: number): void {
        const obj = this.objectives.find(o => o.id === objectiveId);
        if (obj) {
            obj.updateProgress(amount);
        }
    }

    broadcastEvent(name: string, data: Record<string, any>): void {
        this.events.push({ name, data, timestamp: Date.now() });
    }

    getProgress(): number {
        if (this.objectives.length === 0) return 0;
        const completed = this.objectives.filter(o => o.completed).length;
        return completed / this.objectives.length;
    }

    getState(): DimensionState { return this.state; }
    getScore(): number { return this.atomRunner?.getScore() ?? 0; }
    getElapsedTime(): number { return this.elapsedTime; }
    getObjectives(): DimensionObjective[] { return [...this.objectives]; }

    setObjectives(objectives: Objective[]): void {
        this.objectives = objectives.map(o => new DimensionObjective(o.id, o.description, o.targetValue));
    }
}

export class DimensionRunner {
    private dimension: Dimension | null = null;
    private running: boolean = false;

    startDimension(config: DimensionConfig, registry: AtomRegistry, worldState: UnifiedWorldState): boolean {
        this.dimension = new Dimension(config);
        if (!this.dimension.load(registry)) return false;
        if (!this.dimension.start(worldState)) return false;
        this.running = true;
        return true;
    }

    update(deltaTime: number, worldState: UnifiedWorldState): void {
        if (this.running && this.dimension) {
            this.dimension.update(deltaTime, worldState);
        }
    }

    pause(): void {
        if (this.dimension) {
            this.dimension.pause();
        }
    }

    resume(): void {
        if (this.dimension) {
            this.dimension.resume();
        }
    }

    getProgress(): number {
        return this.dimension?.getProgress() ?? 0;
    }

    isRunning(): boolean {
        return this.running;
    }

    getDimension(): Dimension | null {
        return this.dimension;
    }
}
