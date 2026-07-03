/**
 * Round 69 — WasmLatencyStats unit tests.
 *
 * The aggregator is a pure in-process data structure: a
 * bounded per-fn ring buffer + a per-call (count, median,
 * p95, max) summary. Tests cover the data flow that the
 * App constructor wires up: attach → analytics.onEvent →
 * add() → summary() → onSummary listener. We use a stub
 * Analytics (just `onEvent` + `track`) so the test stays
 * isolated from the full Analytics class — no jest.spyOn
 * on a singleton, no global state leaks.
 */

import { WasmLatencyStats } from './WasmLatencyStats';
import type { WasmLatencySummary } from './WasmLatencyStats';
import type { Analytics, AnalyticsEvent } from './Analytics';

// ---------------------------------------------------------------------------
// Stub Analytics — exposes the onEvent + track surface the
// aggregator actually uses. Records all emitted events so
// tests can assert on the bus.
// ---------------------------------------------------------------------------

function makeStubAnalytics(): Analytics & { _emitted: AnalyticsEvent[] } {
    const listeners: Array<(e: AnalyticsEvent) => void> = [];
    const emitted: AnalyticsEvent[] = [];
    return {
        _emitted: emitted,
        onEvent(fn) {
            listeners.push(fn);
            return () => {
                const i = listeners.indexOf(fn);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        track(kind, data) {
            emitted.push({ kind, ts: Date.now(), data });
            for (const l of listeners) l({ kind, ts: Date.now(), data });
        },
    } as unknown as Analytics & { _emitted: AnalyticsEvent[] };
}

describe('WasmLatencyStats — round 69 aggregator', () => {
    test('summary_starts_empty', () => {
        const stats = new WasmLatencyStats();
        const s = stats.summary();
        expect(s.perFn).toEqual({});
        expect(s.totalSamples).toBe(0);
    });

    test('add_increments_count_and_totalSamples', () => {
        const stats = new WasmLatencyStats();
        stats.add('themeToScene', 1.5);
        stats.add('themeToScene', 2.0);
        const s = stats.summary();
        expect(s.perFn.themeToScene.count).toBe(2);
        expect(s.totalSamples).toBe(2);
    });

    test('summary_computes_median_p95_max_correctly', () => {
        // 20 samples: median should be the average of the
        // 10th and 11th sorted values, p95 = 95% of 20 = 19th
        // (0-indexed: 18), max = 20th (0-indexed: 19).
        const stats = new WasmLatencyStats();
        for (let i = 1; i <= 20; i++) stats.add('themeToScene', i);
        const s = stats.summary();
        const fn = s.perFn.themeToScene;
        expect(fn.count).toBe(20);
        // Median of 1..20 = (10 + 11) / 2 = 10.5
        expect(fn.medianMs).toBe(10.5);
        // p95 with floor(20 * 0.95) = 19 → index 19 → value 20
        // (same as max for n=20 with this p95 strategy)
        expect(fn.p95Ms).toBe(20);
        // Max = 20
        expect(fn.maxMs).toBe(20);
    });

    test('summary_aggregates_per_fn_independently', () => {
        // 5 samples for themeToScene (values 1..5) +
        // 3 samples for mood4thSentenceFor (values 10..12).
        // The two fns should not contaminate each other.
        const stats = new WasmLatencyStats();
        for (let i = 1; i <= 5; i++) stats.add('themeToScene', i);
        for (let i = 10; i <= 12; i++) stats.add('mood4thSentenceFor', i);
        const s = stats.summary();
        expect(Object.keys(s.perFn).sort()).toEqual(['mood4thSentenceFor', 'themeToScene']);
        expect(s.perFn.themeToScene.medianMs).toBe(3);
        expect(s.perFn.themeToScene.maxMs).toBe(5);
        expect(s.perFn.mood4thSentenceFor.medianMs).toBe(11);
        expect(s.perFn.mood4thSentenceFor.maxMs).toBe(12);
        expect(s.totalSamples).toBe(8);
    });

    test('ring_buffer_is_bounded', () => {
        // Default bound is 200. Adding 250 samples should
        // leave only the most recent 200 in the buffer,
        // with the count still reporting 200 (not 250).
        const stats = new WasmLatencyStats();
        for (let i = 0; i < 250; i++) stats.add('themeToScene', i);
        const s = stats.summary();
        expect(s.perFn.themeToScene.count).toBe(200);
        // totalSamples keeps the lifetime count (useful for
        // a "total calls since session start" UI).
        expect(s.totalSamples).toBe(250);
        // The earliest 50 samples (values 0-49) shifted out;
        // the buffer now contains values 50-249. Max should
        // be 249.
        expect(s.perFn.themeToScene.maxMs).toBe(249);
    });

    test('custom_max_per_fn_is_respected', () => {
        // Constructor accepts a custom bound. With maxPerFn=3,
        // the 4th add should shift out the 1st.
        const stats = new WasmLatencyStats(3);
        stats.add('fn', 1);
        stats.add('fn', 2);
        stats.add('fn', 3);
        stats.add('fn', 4);
        const s = stats.summary();
        expect(s.perFn.fn.count).toBe(3);
        expect(s.perFn.fn.maxMs).toBe(4);
        expect(s.perFn.fn.medianMs).toBe(3);
    });

    test('attach_subscribes_to_analytics_bus_and_filters_wasm_latency', () => {
        // The aggregator should only react to `wasm.latency`
        // events. Other event kinds (dimension.entered,
        // dm.dimension, etc.) pass through unfiltered.
        const analytics = makeStubAnalytics();
        const stats = new WasmLatencyStats();
        stats.attach(analytics);
        // Fire a non-wasm event — should be ignored.
        analytics.track('dimension.entered', { dimId: 'dim_1' });
        // Fire a wasm.latency event with a bad payload
        // (missing name) — should be ignored.
        analytics.track('wasm.latency', { ms: 5 });
        // Fire two real wasm.latency events.
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 1.5 });
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 2.5 });
        const s = stats.summary();
        expect(s.perFn.themeToScene.count).toBe(2);
        expect(s.perFn.themeToScene.medianMs).toBe(2);
        expect(s.perFn.themeToScene.maxMs).toBe(2.5);
        expect(s.totalSamples).toBe(2);
    });

    test('attach_is_idempotent', () => {
        // Double-attach should NOT double-subscribe. Otherwise
        // the App constructor + any future re-init path would
        // fire the listener twice per event, inflating counts.
        const analytics = makeStubAnalytics();
        const stats = new WasmLatencyStats();
        stats.attach(analytics);
        stats.attach(analytics);
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 1 });
        const s = stats.summary();
        expect(s.perFn.themeToScene.count).toBe(1);
    });

    test('detach_unsubscribes_from_analytics_bus', () => {
        const analytics = makeStubAnalytics();
        const stats = new WasmLatencyStats();
        stats.attach(analytics);
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 1 });
        stats.detach();
        // After detach, new events should NOT be added.
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 2 });
        const s = stats.summary();
        expect(s.perFn.themeToScene.count).toBe(1);
        expect(s.perFn.themeToScene.maxMs).toBe(1);
    });

    test('onSummary_listener_fires_on_every_add', () => {
        // The App constructor wires
        // `wasmLatencyStats.onSummary(s => hud.setWasmLatencyStats(s))`,
        // so the HUD gets a fresh state on every WASM call.
        // The listener should fire synchronously on every add
        // (not deferred via setTimeout) so the UI is always
        // in sync with the bus.
        const stats = new WasmLatencyStats();
        const calls: number[] = [];
        stats.onSummary((s) => calls.push(s.totalSamples));
        stats.add('a', 1);
        stats.add('a', 2);
        stats.add('b', 3);
        expect(calls).toEqual([1, 2, 3]);
    });

    test('reset_clears_all_samples_and_notifies_listeners', () => {
        const stats = new WasmLatencyStats();
        stats.add('a', 1);
        stats.add('b', 2);
        const calls: WasmLatencySummary[] = [];
        stats.onSummary((s) => calls.push(s));
        stats.reset();
        const s = stats.summary();
        expect(s.perFn).toEqual({});
        expect(s.totalSamples).toBe(0);
        // The reset should have fired a summary update.
        expect(calls.length).toBe(1);
        expect(calls[0].totalSamples).toBe(0);
    });

    test('getTotalSamples_and_getFnNames_match_summary', () => {
        // Convenience getters used by the App-level "stats
        // panel" (round 70+). They should match the
        // summary() output.
        const stats = new WasmLatencyStats();
        stats.add('a', 1);
        stats.add('b', 2);
        stats.add('b', 3);
        expect(stats.getTotalSamples()).toBe(3);
        expect(stats.getFnNames().sort()).toEqual(['a', 'b']);
    });
});
