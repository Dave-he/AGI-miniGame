/**
 * EndlessMode — automatic progression through dimensions.
 *
 * When the player enables endless mode, completing a dimension
 * immediately enters the next one (with the AI's BalanceTuner
 * adjusting difficulty per the player's history). The mode also
 * supports a step-cap (default 50) and a pause/resume hook.
 *
 * The class is engine-agnostic and talks to the host via two
 * callbacks: `enterNext` (run a new dimension) and `shouldContinue`
 * (early-exit predicate based on the player's wish).
 */

export interface EndlessConfig {
    /** How many dimensions to chain before auto-pausing. 0 = infinite. */
    maxSteps: number;
    /** Minimum seconds between two consecutive dimensions. */
    minIntervalSecs: number;
}

export interface EndlessHooks {
    enterNext: () => Promise<void> | void;
    getDifficulty: () => number;
}

export class EndlessMode {
    private cfg: EndlessConfig;
    private hooks: EndlessHooks;
    private enabled: boolean = false;
    private stepCount: number = 0;
    private lastRunAt: number = 0;
    private paused: boolean = false;

    constructor(hooks: EndlessHooks, cfg: Partial<EndlessConfig> = {}) {
        this.hooks = hooks;
        this.cfg = { maxSteps: 50, minIntervalSecs: 1, ...cfg };
    }

    isEnabled(): boolean { return this.enabled; }
    isPaused(): boolean { return this.paused; }
    getStepCount(): number { return this.stepCount; }

    enable(): void {
        this.enabled = true;
        this.paused = false;
        this.stepCount = 0;
    }
    disable(): void {
        this.enabled = false;
        this.paused = false;
    }
    pause(): void { if (this.enabled) this.paused = true; }
    resume(): void { if (this.enabled) this.paused = false; }

    /** Called when a dimension is completed. Returns true if we advanced. */
    async onComplete(): Promise<boolean> {
        if (!this.enabled || this.paused) return false;
        if (this.cfg.maxSteps > 0 && this.stepCount >= this.cfg.maxSteps) return false;
        // Throttle: don't chain faster than minIntervalSecs.
        const now = Date.now();
        if (this.lastRunAt > 0 && (now - this.lastRunAt) < this.cfg.minIntervalSecs * 1000) {
            return false;
        }
        this.stepCount += 1;
        this.lastRunAt = now;
        await this.hooks.enterNext();
        return true;
    }

    /** What the next difficulty will be (without entering). */
    projectNextDifficulty(): number {
        // Mirror the BalanceTuner curve: 0.3 base + 0.05 per level,
        // but each step nudges the target up by a small amount.
        const base = 0.3 + this.hooks.getDifficulty() * 0.05;
        return Math.min(1.0, base + this.stepCount * 0.02);
    }
}
