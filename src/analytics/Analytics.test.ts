/**
 * Analytics tests.
 */

import { Analytics } from '../analytics/Analytics';

describe('Analytics', () => {
    test('counter starts at 0', () => {
        const a = new Analytics();
        expect(a.count('session.start')).toBe(0);
    });

    test('track() bumps the matching counter', () => {
        const a = new Analytics();
        a.track('dimension.entered');
        a.track('dimension.entered');
        a.track('dimension.failed');
        expect(a.count('dimension.entered')).toBe(2);
        expect(a.count('dimension.failed')).toBe(1);
    });

    test('track() with payload keeps small values only', () => {
        const a = new Analytics();
        a.track('item.used', {
            itemId: 'potion',
            quantity: 1,
            huge: Array(100).fill('x'),
            nested: { a: 1, b: 2 },
            ok: true,
        });
        const snap = a.snapshot();
        const ev = snap.recent[0];
        expect(ev.data).toBeDefined();
        expect(ev.data!.itemId).toBe('potion');
        expect(ev.data!.quantity).toBe(1);
        // Nested objects and arrays are dropped
        expect(ev.data!.huge).toBeUndefined();
        expect(ev.data!.nested).toBeUndefined();
    });

    test('recent ring is bounded', () => {
        const a = new Analytics();
        for (let i = 0; i < 100; i++) a.track('session.start');
        expect(a.snapshot().recent.length).toBe(50);
    });

    test('onEvent listener receives every tracked event', () => {
        const a = new Analytics();
        const seen: string[] = [];
        a.onEvent(e => seen.push(e.kind));
        a.track('epoch.collapsed');
        a.track('npc.talked');
        expect(seen).toEqual(['epoch.collapsed', 'npc.talked']);
    });

    test('toJSON is parseable and includes all counters', () => {
        const a = new Analytics();
        a.track('dsl.applied');
        a.track('save.persisted');
        const json = a.toJSON();
        const obj = JSON.parse(json);
        expect(obj.counters['dsl.applied']).toBe(1);
        expect(obj.counters['save.persisted']).toBe(1);
        expect(typeof obj.uptimeSecs).toBe('number');
    });

    test('reset() clears counters and recent', () => {
        const a = new Analytics();
        a.track('item.dropped');
        expect(a.count('item.dropped')).toBe(1);
        a.reset();
        expect(a.count('item.dropped')).toBe(0);
        expect(a.snapshot().recent.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Round 68 — `bench` method, the in-browser wall-clock WASM
// latency helper. The round-67 jest bench (SceneGenWasm.bench.test.ts)
// measured the TS-side bridge overhead (~5μs for themeToScene);
// this one measures the *combined* TS-bridge + Rust-trap time
// in a real browser via `performance.now()`. The payload shape
// `{ name, ms }` is canonical — `name` is a stable string used
// to group latencies by call site, `ms` is rounded to 3 decimals
// (~1μs precision) so the 50-event ring buffer stays compact.
// ---------------------------------------------------------------------------

describe('Analytics — round 68 bench method', () => {
    test('bench_emits_wasm_latency_event_with_name_and_ms', () => {
        const a = new Analytics();
        const result = a.bench('themeToScene', () => 42);
        expect(result).toBe(42);
        const ev = a.snapshot().recent[0];
        expect(ev.kind).toBe('wasm.latency');
        expect(ev.data).toBeDefined();
        expect(ev.data!.name).toBe('themeToScene');
        expect(typeof ev.data!.ms).toBe('number');
        // ms is rounded to 3 decimals, so it's a non-negative
        // finite number. A no-op function should be in the
        // sub-millisecond range (typically < 0.1ms) but we
        // don't pin the upper bound — a busy CI box can
        // spike to 1-2ms for a single `performance.now()`
        // call.
        expect(ev.data!.ms).toBeGreaterThanOrEqual(0);
        expect(ev.data!.ms).toBeLessThan(100);
    });

    test('bench_returns_fns_result_unchanged', () => {
        // The wrapper is transparent — return values pass
        // through. The 3 production call sites rely on this
        // (the `WithFallback` outcome object).
        const a = new Analytics();
        const obj = { blueprint: { biomeId: 'cyberpunk' }, source: 'wasm' as const };
        const result = a.bench('themeToScene', () => obj);
        expect(result).toBe(obj);
        expect(result.blueprint.biomeId).toBe('cyberpunk');
        expect(result.source).toBe('wasm');
    });

    test('bench_bumps_wasm_latency_counter', () => {
        const a = new Analytics();
        a.bench('themeToScene', () => 1);
        a.bench('mood4thSentenceFor', () => 'x');
        a.bench('themeToScene', () => 2);
        expect(a.count('wasm.latency')).toBe(3);
        // Per-name breakdown isn't a separate counter
        // (would multiply ring buffer pressure), but the
        // per-event data field carries the name. Verify
        // both names are recorded.
        const names = a.snapshot().recent.map(e => e.data?.name);
        expect(names).toEqual(['themeToScene', 'mood4thSentenceFor', 'themeToScene']);
    });

    test('bench_measures_real_wall_clock_delta', () => {
        // Synthetic 2ms sleep to confirm the bench captures
        // non-zero elapsed time. The actual measurement uses
        // `performance.now()` (monotonic, sub-ms precision),
        // so a 2ms busy-wait should round to ~2.0ms.
        const a = new Analytics();
        const t0 = Date.now();
        a.bench('themeToScene', () => {
            const target = t0 + 2;
            while (Date.now() < target) { /* spin ~2ms */ }
        });
        const ev = a.snapshot().recent[0];
        // Allow generous slack — CI / busy boxes can add
        // 10-20ms of scheduler latency on a busy-wait. We
        // only assert it's > 0 and < 100ms.
        expect(ev.data!.ms).toBeGreaterThan(0);
        expect(ev.data!.ms).toBeLessThan(100);
    });
});
