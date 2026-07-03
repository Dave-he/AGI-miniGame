/**
 * DimensionClock — time-based progression for a single dimension.
 *
 * Replaces the DimensionRunner stub's notion of "elapsed time" with a
 * proper countdown clock. The clock is the player-facing timer shown
 * in the HUD; when it hits zero the dimension is considered failed
 * (with partial rewards).
 *
 * Optional onTick callback fires every second so the UI can refresh.
 */

export type ClockOutcome = 'running' | 'completed' | 'failed' | 'cancelled';

export interface DimensionClockConfig {
    /** Total time in seconds (usually blueprint.timeLimitSecs or 90). */
    totalSecs: number;
    /** How often to fire onTick (ms). Default 1000. */
    tickMs?: number;
}

export interface ClockTickEvent {
    remainingSecs: number;
    elapsedSecs: number;
    outcome: ClockOutcome;
    /** 0..1 progress through the time limit. */
    progress: number;
}

export class DimensionClock {
    private cfg: Required<DimensionClockConfig>;
    private startedAt: number = 0;
    private elapsedBeforePause: number = 0;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private listeners: Array<(e: ClockTickEvent) => void> = [];
    private outcome: ClockOutcome = 'running';
    private _isPaused: boolean = false;

    constructor(cfg: DimensionClockConfig) {
        this.cfg = { tickMs: 1000, ...cfg };
    }

    on(listener: (e: ClockTickEvent) => void): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    start(): void {
        if (this.outcome !== 'running') return;
        this.startedAt = Date.now();
        this.intervalId = setInterval(() => this.tick(), this.cfg.tickMs);
        this.emit();
    }

    pause(): void {
        if (this._isPaused || this.outcome !== 'running') return;
        this._isPaused = true;
        this.elapsedBeforePause += (Date.now() - this.startedAt) / 1000;
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.emit();
    }

    resume(): void {
        if (!this._isPaused || this.outcome !== 'running') return;
        this._isPaused = false;
        this.startedAt = Date.now();
        this.intervalId = setInterval(() => this.tick(), this.cfg.tickMs);
    }

    cancel(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.outcome = 'cancelled';
        this.emit();
    }

    complete(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.outcome = 'completed';
        this.emit();
    }

    getOutcome(): ClockOutcome { return this.outcome; }
    isPaused(): boolean { return this._isPaused; }

    elapsedSecs(): number {
        // Until start() is called, no time has elapsed.
        if (this.startedAt === 0) return this.elapsedBeforePause;
        if (this.outcome === 'running' && !this._isPaused) {
            return this.elapsedBeforePause + (Date.now() - this.startedAt) / 1000;
        }
        return this.elapsedBeforePause;
    }

    remainingSecs(): number {
        return Math.max(0, this.cfg.totalSecs - this.elapsedSecs());
    }

    progress(): number {
        return Math.min(1, this.elapsedSecs() / this.cfg.totalSecs);
    }

    private tick(): void {
        if (this.outcome !== 'running') return;
        if (this.remainingSecs() <= 0) {
            this.outcome = 'failed';
            if (this.intervalId !== null) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        }
        this.emit();
    }

    private emit(): void {
        const ev: ClockTickEvent = {
            remainingSecs: Math.ceil(this.remainingSecs()),
            elapsedSecs: this.elapsedSecs(),
            outcome: this.outcome,
            progress: this.progress(),
        };
        for (const l of this.listeners) l(ev);
    }
}
