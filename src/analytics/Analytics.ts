/**
 * Analytics — tiny zero-dependency event/session tracker.
 *
 * Tracks lifetime counters and a bounded ring of recent events.
 * The exported `toJSON()` makes it trivial to render a "your stats"
 * panel or to pipe data into a real analytics backend later.
 */

export type AnalyticsEventKind =
    | 'session.start' | 'session.end'
    | 'dimension.entered' | 'dimension.completed' | 'dimension.failed'
    | 'dsl.applied' | 'dsl.rejected'
    | 'epoch.collapsed' | 'epoch.relic.kept'
    | 'npc.talked'
    | 'item.used' | 'item.dropped'
    | 'tutorial.step' | 'tutorial.completed'
    | 'save.persisted' | 'save.loaded';

export interface AnalyticsEvent {
    kind: AnalyticsEventKind;
    ts: number;
    /** Free-form payload (kept small; capped at ~256 bytes). */
    data?: Record<string, any>;
}

export interface AnalyticsSnapshot {
    sessionStartedAt: number;
    uptimeSecs: number;
    counters: Record<string, number>;
    recent: AnalyticsEvent[];
}

const MAX_RECENT = 50;

export class Analytics {
    private sessionStartedAt: number = Date.now();
    private counters: Map<string, number> = new Map();
    private recent: AnalyticsEvent[] = [];
    private listeners: Array<(e: AnalyticsEvent) => void> = [];

    /** Record a single event. Bumps the matching counter. */
    track(kind: AnalyticsEventKind, data?: Record<string, any>): void {
        this.counters.set(kind, (this.counters.get(kind) ?? 0) + 1);
        const ev: AnalyticsEvent = { kind, ts: Date.now(), data: this.truncate(data) };
        this.recent.push(ev);
        if (this.recent.length > MAX_RECENT) this.recent.shift();
        for (const l of this.listeners) l(ev);
    }

    /** Subscribe to live events. */
    onEvent(fn: (e: AnalyticsEvent) => void): () => void {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    /** Get a counter, defaulting to 0. */
    count(kind: AnalyticsEventKind): number {
        return this.counters.get(kind) ?? 0;
    }

    /** Snapshot for export or display. */
    snapshot(): AnalyticsSnapshot {
        return {
            sessionStartedAt: this.sessionStartedAt,
            uptimeSecs: (Date.now() - this.sessionStartedAt) / 1000,
            counters: Object.fromEntries(this.counters),
            recent: [...this.recent],
        };
    }

    /** Export as a stable JSON shape. */
    toJSON(): string {
        return JSON.stringify(this.snapshot());
    }

    /** Reset all counters and recent events. */
    reset(): void {
        this.counters.clear();
        this.recent = [];
        this.sessionStartedAt = Date.now();
    }

    private truncate(d?: Record<string, any>): Record<string, any> | undefined {
        if (!d) return undefined;
        const out: Record<string, any> = {};
        let n = 0;
        for (const k of Object.keys(d)) {
            if (n >= 8) break;
            const v = d[k];
            if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
                out[k] = v;
                n += 1;
            }
        }
        return Object.keys(out).length ? out : undefined;
    }
}
