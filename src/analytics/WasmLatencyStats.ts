/**
 * Round 69 — WasmLatencyStats. Per-fn latency aggregator that
 * subscribes to the round-68 `wasm.latency` Analytics event
 * stream and computes a (count, median, p95, max) breakdown per
 * call site. Pushed into the HUD on every event so the
 * persistent-memories block (round-51 `<details>`) gains a
 * `⚡` row showing the in-browser wall-clock numbers the
 * round-67 jest bench could not measure.
 *
 * Design notes:
 *   - Bounded per-fn ring buffer (default 200 samples) so a
 *     long session doesn't unbounded-grow the Map. Older
 *     samples shift out as new ones arrive.
 *   - `summary()` sorts a copy of the buffer (the original
 *     stays in insertion order, so a future "recent" view
 *     could read it without re-sorting). At 200 samples × 3
 *     fns the sort cost is ~5μs per call, negligible.
 *   - Median for even-length arrays is the average of the
 *     two middle values (matches the numpy default; the
 *     round-67 bench doesn't compute medians, so no
 *     cross-bench consistency constraint).
 *   - p95 uses `Math.floor(n * 0.95)` clamped to the last
 *     index. For n < 20, this is the same as max. Future
 *     round-70+ could switch to nearest-rank (P95 of 19
 *     samples = 18th) for stricter p95 semantics.
 *   - The class is decoupled from Analytics's full event
 *     stream — it only cares about `kind === 'wasm.latency'`
 *     events. Other events (dimension.entered, dm.dimension,
 *     etc.) pass through unfiltered.
 *
 * Test strategy: unit tests in `WasmLatencyStats.test.ts`
 * verify the per-fn breakdown, the ring-buffer bound, the
 * summary() shape, and the analytics.onEvent subscription
 * (via a stub Analytics object — no jest spy-on-Analytics
 * needed, the class only needs the onEvent + track methods).
 */

import type { Analytics } from './Analytics';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-fn WASM latency breakdown. */
export interface WasmLatencyFnStat {
    /** Number of samples in the ring buffer for this fn. */
    count: number;
    /** Median latency in ms (rounded to 3 decimals). */
    medianMs: number;
    /** 95th percentile latency in ms (rounded to 3 decimals). */
    p95Ms: number;
    /** Max latency in ms (rounded to 3 decimals). */
    maxMs: number;
}

/** Summary pushed to subscribers on every event. */
export interface WasmLatencySummary {
    /** Per-fn stats keyed by bench name (e.g. 'themeToScene'). */
    perFn: Record<string, WasmLatencyFnStat>;
    /** Total number of wasm.latency events observed since attach/reset. */
    totalSamples: number;
}

// ---------------------------------------------------------------------------
// Default bound — 200 samples per fn ≈ 4 sessions of 50 calls each.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SAMPLES_PER_FN = 200;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WasmLatencyStats {
    private samples: Map<string, number[]> = new Map();
    private maxPerFn: number;
    private totalSamples: number = 0;
    private listeners: Array<(s: WasmLatencySummary) => void> = [];
    private unsubAnalytics: (() => void) | null = null;

    constructor(maxPerFn: number = DEFAULT_MAX_SAMPLES_PER_FN) {
        this.maxPerFn = maxPerFn;
    }

    /**
     * Subscribe to the Analytics bus. Idempotent — a second
     * `attach()` is a no-op so the App constructor + any
     * future re-init path can't double-subscribe.
     */
    attach(analytics: Analytics): void {
        if (this.unsubAnalytics) return;
        this.unsubAnalytics = analytics.onEvent((e) => {
            if (e.kind !== 'wasm.latency') return;
            const name = e.data?.name;
            const ms = e.data?.ms;
            if (typeof name !== 'string' || typeof ms !== 'number') return;
            this.add(name, ms);
        });
    }

    /** Detach from the Analytics bus. Safe to call when not attached. */
    detach(): void {
        if (this.unsubAnalytics) { this.unsubAnalytics(); this.unsubAnalytics = null; }
    }

    /**
     * Add a sample. Bumps the per-fn ring buffer (FIFO shift
     * when full), increments the total counter, and notifies
     * listeners synchronously. Callers (typically the analytics
     * subscriber) should NOT throttle — the bounded ring
     * buffer is the throttle.
     */
    add(name: string, ms: number): void {
        let buf = this.samples.get(name);
        if (!buf) { buf = []; this.samples.set(name, buf); }
        buf.push(ms);
        if (buf.length > this.maxPerFn) buf.shift();
        this.totalSamples++;
        for (const l of this.listeners) l(this.summary());
    }

    /**
     * Compute the per-fn (count, median, p95, max) breakdown
     * across all currently-buffered samples. Fns with zero
     * samples are omitted from `perFn` so consumers can use
     * `Object.keys(s.perFn)` to enumerate active fns.
     */
    summary(): WasmLatencySummary {
        const perFn: Record<string, WasmLatencyFnStat> = {};
        for (const [name, buf] of this.samples) {
            if (buf.length === 0) continue;
            const sorted = [...buf].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];
            const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
            const max = sorted[sorted.length - 1];
            perFn[name] = {
                count: buf.length,
                medianMs: +median.toFixed(3),
                p95Ms: +sorted[p95Idx].toFixed(3),
                maxMs: +max.toFixed(3),
            };
        }
        return { perFn, totalSamples: this.totalSamples };
    }

    /**
     * Subscribe to summary updates. The callback fires
     * synchronously on every `add()` call. Returns an
     * unsubscribe function (matches the `Analytics.onEvent`
     * contract).
     */
    onSummary(fn: (s: WasmLatencySummary) => void): () => void {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    /**
     * Clear all samples and notify listeners. Useful for a
     * future "reset stats" UI button — the round-69 wiring
     * doesn't surface one because the aggregator is meant
     * to accumulate over the full session.
     */
    reset(): void {
        this.samples.clear();
        this.totalSamples = 0;
        for (const l of this.listeners) l(this.summary());
    }

    /** Total events observed since attach/reset (matches summary().totalSamples). */
    getTotalSamples(): number { return this.totalSamples; }

    /** Names of fns currently in the ring buffer. */
    getFnNames(): string[] { return [...this.samples.keys()]; }
}
