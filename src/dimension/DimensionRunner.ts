export type DimensionState = 'uninitialized' | 'loading' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';

export interface DimensionObjective {
    id: string;
    description: string;
    target: number;
    current: number;
    isOptional: boolean;
    isCompleted: boolean;
}

export interface DimensionConfig {
    id: string;
    name: string;
    description: string;
    atomIds: string[];
    difficulty: number;
    timeLimitSecs: number | null;
    rules: DimensionRule[];
    rewards: DimensionReward[];
    objectives: DimensionObjectiveConfig[];
}

export interface DimensionRule {
    ruleId: string;
    name: string;
    description: string;
    isActive: boolean;
    params: Record<string, any>;
}

export interface DimensionReward {
    itemId: string;
    quantity: number;
}

export interface DimensionObjectiveConfig {
    id: string;
    description: string;
    target: number;
    isOptional: boolean;
}

export interface DimensionProgress {
    state: DimensionState;
    elapsedTime: number;
    score: number;
    totalObjectives: number;
    completedObjectives: number;
    mandatoryProgress: number;
    timeRemaining: number | null;
}

export interface DimensionEvent {
    timestamp: number;
    eventType: string;
    data: Record<string, any>;
}

export class DimensionRunner {
    public config: DimensionConfig | null = null;
    public state: DimensionState = 'uninitialized';
    public elapsedTime: number = 0;
    public score: number = 0;
    public completedObjectives: string[] = [];
    public eventLog: DimensionEvent[] = [];

    private objectives: DimensionObjective[] = [];

    start(config: DimensionConfig): boolean {
        this.config = config;
        this.state = 'loading';

        this.objectives = config.objectives.map(o => ({
            id: o.id,
            description: o.description,
            target: o.target,
            current: 0,
            isOptional: o.isOptional,
            isCompleted: false,
        }));

        this.state = 'ready';
        this.elapsedTime = 0;
        this.score = 0;
        this.completedObjectives = [];
        this.eventLog = [];

        this.state = 'running';
        this.logEvent('dimension_start', {});
        return true;
    }

    update(dt: number): void {
        if (this.state !== 'running') {
            return;
        }

        this.elapsedTime += dt;

        if (this.config?.timeLimitSecs && this.elapsedTime >= this.config.timeLimitSecs) {
            this.complete();
            return;
        }

        if (this.checkAllMandatoryObjectives()) {
            this.complete();
        }
    }

    pause(): void {
        if (this.state === 'running') {
            this.state = 'paused';
            this.logEvent('dimension_pause', {});
        }
    }

    resume(): void {
        if (this.state === 'paused') {
            this.state = 'running';
            this.logEvent('dimension_resume', {});
        }
    }

    complete(): void {
        this.state = 'completed';
        this.logEvent('dimension_complete', { score: this.score });
    }

    fail(): void {
        this.state = 'failed';
        this.logEvent('dimension_failed', {});
    }

    addScore(amount: number): void {
        this.score += amount;
    }

    progressObjective(objectiveId: string, amount: number): boolean {
        const objective = this.objectives.find(o => o.id === objectiveId);
        if (!objective) return false;

        objective.current = Math.min(objective.current + amount, objective.target);
        if (objective.current >= objective.target && !objective.isCompleted) {
            objective.isCompleted = true;
            this.completedObjectives.push(objectiveId);
            return true;
        }
        return false;
    }

    broadcastEvent(eventType: string, data: Record<string, any>): void {
        this.logEvent(eventType, data);
    }

    private checkAllMandatoryObjectives(): boolean {
        return this.objectives
            .filter(o => !o.isOptional)
            .every(o => o.isCompleted);
    }

    private logEvent(eventType: string, data: Record<string, any>): void {
        this.eventLog.push({
            timestamp: this.elapsedTime,
            eventType,
            data,
        });
    }

    getProgress(): DimensionProgress {
        const totalObjectives = this.objectives.length;
        const completedObjectives = this.completedObjectives.length;
        const mandatoryTotal = this.objectives.filter(o => !o.isOptional).length;
        const mandatoryDone = this.objectives.filter(o => !o.isOptional && o.isCompleted).length;

        return {
            state: this.state,
            elapsedTime: this.elapsedTime,
            score: this.score,
            totalObjectives,
            completedObjectives,
            mandatoryProgress: mandatoryTotal > 0 ? mandatoryDone / mandatoryTotal : 1.0,
            timeRemaining: this.config?.timeLimitSecs 
                ? this.config.timeLimitSecs - this.elapsedTime 
                : null,
        };
    }

    isRunning(): boolean {
        return this.state === 'running';
    }

    isCompleted(): boolean {
        return this.state === 'completed';
    }

    isFailed(): boolean {
        return this.state === 'failed';
    }

    getElapsedTime(): number {
        return this.elapsedTime;
    }

    getScore(): number {
        return this.score;
    }
}
