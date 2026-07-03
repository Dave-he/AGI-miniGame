/**
 * SessionReplay — bounded event log + deterministic replay.
 *
 * Captures the last N events from the Analytics bus into a fixed-size
 * buffer. A "replay" emits the events back to a subscriber at a
 * given speed so the player can review what happened in the
 * session.
 *
 * The class is engine-agnostic: it talks to Analytics through the
 * standard `onEvent()` subscription.
 */

import type { Analytics, AnalyticsEvent } from '../analytics/Analytics';

export type ReplayState = 'idle' | 'playing' | 'paused' | 'done';

export interface ReplayOptions {
    /** Replay speed multiplier. 1 = real time, 4 = 4x, 0 = instant. */
    speed: number;
    /** Optional start index (defaults to 0 = oldest). */
    startIndex?: number;
}

export class SessionReplay {
    private analytics: Analytics;
    private buffer: AnalyticsEvent[] = [];
    private maxBuffer: number;
    private state: ReplayState = 'idle';
    private position: number = 0;
    private listeners: Array<(e: AnalyticsEvent) => void> = [];
    private rafHandle: number | null = null;
    private lastEmitAt: number = 0;
    private unsubAnalytics: (() => void) | null = null;
    private speed: number = 4;

    constructor(analytics: Analytics, maxBuffer: number = 200) {
        this.analytics = analytics;
        this.maxBuffer = maxBuffer;
    }

    /** Start recording events. Idempotent. */
    startRecording(): void {
        if (this.unsubAnalytics) return;
        this.unsubAnalytics = this.analytics.onEvent(e => this.record(e));
    }

    stopRecording(): void {
        if (this.unsubAnalytics) { this.unsubAnalytics(); this.unsubAnalytics = null; }
    }

    private record(e: AnalyticsEvent): void {
        this.buffer.push(e);
        if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    }

    /** Number of events captured. */
    getBufferSize(): number { return this.buffer.length; }

    /** Snapshot of the captured events. */
    getBuffer(): AnalyticsEvent[] { return [...this.buffer]; }

    /** Reset the buffer. */
    clearBuffer(): void { this.buffer = []; }

    /** Subscribe to replay events. */
    onReplayEvent(fn: (e: AnalyticsEvent) => void): () => void {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    getState(): ReplayState { return this.state; }
    getPosition(): number { return this.position; }

    /** Start (or restart) a replay from index 0 at the given speed. */
    play(opts: ReplayOptions = { speed: 4 }): void {
        if (this.state === 'playing') return;
        this.state = 'playing';
        this.position = opts.startIndex ?? 0;
        this.speed = Math.max(0, opts.speed);
        this.lastEmitAt = performance.now();
        this.tick();
        this.analytics.track('replay.started', { events: this.buffer.length - this.position, speed: this.speed });
    }

    pause(): void {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        if (this.rafHandle !== null) { cancelAnimationFrame(this.rafHandle); this.rafHandle = null; }
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.lastEmitAt = performance.now();
        this.tick();
    }

    stop(): void {
        if (this.rafHandle !== null) { cancelAnimationFrame(this.rafHandle); this.rafHandle = null; }
        if (this.state !== 'idle') this.analytics.track('replay.stopped', { position: this.position });
        this.state = 'idle';
    }

    private tick = (): void => {
        if (this.state !== 'playing') return;
        if (this.position >= this.buffer.length) {
            this.state = 'done';
            return;
        }
        const now = performance.now();
        // speed = 0 → emit all remaining instantly
        if (this.speed === 0) {
            while (this.position < this.buffer.length) {
                const ev = this.buffer[this.position++];
                for (const l of this.listeners) l(ev);
            }
            this.state = 'done';
            return;
        }
        // Each event represents ~1s of real time; speed=N emits every (1000/N) ms
        const intervalMs = 1000 / this.speed;
        if (now - this.lastEmitAt >= intervalMs) {
            const ev = this.buffer[this.position++];
            for (const l of this.listeners) l(ev);
            this.lastEmitAt = now;
        }
        if (this.position >= this.buffer.length) {
            this.state = 'done';
            return;
        }
        this.rafHandle = requestAnimationFrame(this.tick);
    };
}
