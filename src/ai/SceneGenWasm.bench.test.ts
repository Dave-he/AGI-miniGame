/**
 * Round 67 — WASM call-overhead benchmark.
 *
 * Scope: measure the TS-side cost of the round-48 / 51 WASM JSON
 * bridge, so we have an empirical baseline for the round-65
 * "fast portal" claim ("themeToScene runs in <5ms so the keyboard
 * shortcut path is still snappy") and so future refactors of
 * `SceneGenWasm.ts` (or the snake_case → camelCase rename) can
 * catch a regression.
 *
 * What this CAN measure in jest:
 *   - Pure TS mirror cost (lower bound — the bridge adds cost on top).
 *   - Stubbed-bridge cost (the WASM fn is a no-op that returns a
 *     fixed JSON; this measures JSON.stringify + FFI call +
 *     JSON.parse + camelCase rename, which is the "TS-side"
 *     overhead the bridge always pays regardless of WASM speed).
 *   - No-op stub call cost (lower bound on the FFI cost itself).
 *
 * What this CANNOT measure in jest:
 *   - The actual WASM trap / memory copy cost (we never load a
 *     real .wasm module — `loadSceneGenWasm`'s default loader is
 *     stubbed out). The round-48 PRD target of "5-15ms" was
 *     measured in-browser, not in jest.
 *   - V8 warm-up (we throw away the first run of each benchmark).
 *   - GC pressure (we run median-of-5 to smooth out single-GC
 *     spikes, but a full GC pass can still inject a tail latency
 *     the median doesn't catch).
 *
 * Assertions are loose on purpose. We want to catch a 10x
 * regression (someone adds an O(n²) regex to the rename step),
 * not a 1.2x regression. The point of this benchmark is the
 * RATIO between the three paths, not the absolute numbers.
 *
 * The 4th-sentence WASM helper (`callMood4thSentenceFor`) is
 * intentionally NOT benchmarked here — the round-51 follow-up to
 * extract its TS-side `djb2` mirror from `NarrationEngine` is
 * still pending, so there's no clean "TS mirror vs bridge"
 * comparison to make yet.
 *
 * `console.log` is intentional — jest prints these lines in the
 * test output, so the bench numbers are visible in CI logs
 * without needing a separate harness.
 */

import {
    callThemeToScene,
    callBuildGenerationConfigWithMood,
    callMoodPalette,
    themeToSceneWithFallback,
    buildGenerationConfigWithMoodWithFallback,
    moodPaletteWithFallback,
    SceneGenWasmModule,
} from './SceneGenWasm';
import {
    themeToScene as themeToSceneTs,
    buildGenerationConfigWithMood as buildGenerationConfigWithMoodTs,
    moodPalette as moodPaletteTs,
    DEFAULT_GENERATION_HINT,
} from './SceneGen';
import { defaultDisposition } from '../world/NpcMind';
import type { ThemeInput } from './SceneGen';

// ---------------------------------------------------------------------------
// Stub module factory — identical shape to SceneGenWasm.test.ts so the
// bridge paths run the same code as in production tests.
// ---------------------------------------------------------------------------

function makeStubModule(overrides: Partial<SceneGenWasmModule> = {}): SceneGenWasmModule {
    return {
        wasm_module_version: () => '0.2.0-round51',
        theme_to_scene_json: (_json: string) => JSON.stringify({
            wfc_tile_weights: [4, 4, 2, 2, 0, 0, 3, 1],
            biome_id: 'cyberpunk',
            base_npc_density: 0.9,
            npc_density: 0.765,
            npc_count: 9,
            event_chain: [
                { kind: 'spawn_wave', delay_secs: 5, payload: '0_0' },
                { kind: 'echo_lore', delay_secs: 13, payload: '0_1' },
                { kind: 'fog_pulse', delay_secs: 22, payload: '0_2' },
            ],
            music_bpm: 130,
            npc_archetype_hints: ['robot'],
        }),
        build_generation_config_with_mood_json: (_argsJson: string) => JSON.stringify({
            min_atoms: 2,
            max_atoms: 4,
            difficulty_range_lo: 0.3,
            difficulty_range_hi: 0.8,
            allow_composite: true,
            seed: 42,
            player_level: 5,
            preferred_types: ['match3', 'synthesis', 'parkour'],
            excluded_types: [],
            reward_multiplier: 1.0,
        }),
        mood_palette_json: (_moodJson: string) => JSON.stringify({
            colors: ['#0A1A2F', '#1B4965', '#CAE9FF'],
        }),
        mood_4th_sentence_for_json: (_argsJson: string) => JSON.stringify({
            sentence: '空气本身在退避，仿佛这里有过太多恐惧。',
            branch: 0,
            blueprint_id: 'dim_42',
        }),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Sample inputs — same shape used in the production test suite.
// ---------------------------------------------------------------------------

const sampleTheme: ThemeInput = {
    visualStyle: 'cyberpunk',
    musicMood: 'pulse',
    difficulty: 0.5,
    seed: 1,
};

const sampleHint = DEFAULT_GENERATION_HINT;
const sampleMood = defaultDisposition();

// ---------------------------------------------------------------------------
// Bench helper — runs `fn` `iters` times, returns total wall-clock ms
// and per-call microseconds. Uses `process.hrtime.bigint()` for
// nanosecond precision (Date.now() is only ms-resolution and would
// round sub-millisecond calls to zero).
// ---------------------------------------------------------------------------

interface BenchResult {
    label: string;
    iters: number;
    runs: number;
    medianMs: number;
    medianUsPerCall: number;
    minMs: number;
    maxMs: number;
}

function bench(label: string, fn: () => void, iters: number, runs: number): BenchResult {
    // Warm-up: one full pass to let V8 optimize the function body.
    // Without this, the first measured run is usually 2-5x slower
    // than subsequent runs (V8 tier-up latency).
    fn();
    const samples: number[] = [];
    for (let r = 0; r < runs; r++) {
        const start = process.hrtime.bigint();
        for (let i = 0; i < iters; i++) fn();
        const end = process.hrtime.bigint();
        samples.push(Number(end - start) / 1e6);
    }
    samples.sort((a, b) => a - b);
    const medianMs = samples[Math.floor(samples.length / 2)];
    const minMs = samples[0];
    const maxMs = samples[samples.length - 1];
    const medianUsPerCall = (medianMs * 1000) / iters;
    return { label, iters, runs, medianMs, medianUsPerCall, minMs, maxMs };
}

function logBench(r: BenchResult): void {
    // 3 decimals on the per-call μs number is enough to spot a
    // 10x regression (e.g. 12.345μs → 124.567μs).
    console.log(
        `[bench ${r.label}] iters=${r.iters} runs=${r.runs}`
        + ` median=${r.medianMs.toFixed(2)}ms`
        + ` min=${r.minMs.toFixed(2)}ms`
        + ` max=${r.maxMs.toFixed(2)}ms`
        + ` per-call=${r.medianUsPerCall.toFixed(3)}μs`,
    );
}

// ---------------------------------------------------------------------------
// Round 67 — the actual benchmark tests.
// ---------------------------------------------------------------------------

describe('SceneGenWasm — round 67 call-overhead benchmark', () => {
    // 1000 iters × 5 runs is a good middle ground: enough samples
    // to smooth out GC noise, fast enough that the whole suite
    // adds < 1s. Bump to 5000×10 if the numbers start wobbling.
    const ITERS = 1000;
    const RUNS = 5;

    describe('themeToScene', () => {
        test('ts_mirror_is_baseline', () => {
            // Lower bound — the bridge always adds cost on top of this.
            const r = bench('themeToScene · TS mirror', () => {
                themeToSceneTs(sampleTheme);
            }, ITERS, RUNS);
            logBench(r);
            // Sanity: the TS mirror should be < 200μs/call. If it
            // isn't, the SceneGen table is doing something weird
            // (e.g. a quadratic lookup that should be a Map).
            expect(r.medianUsPerCall).toBeLessThan(200);
        });

        test('wasm_bridge_via_callThemeToScene', () => {
            // Bridge cost with a no-op WASM stub. Measures the
            // JSON.stringify + stub FFI + JSON.parse + camelCase
            // rename path. The actual WASM cost (which we can't
            // measure in jest) would be ON TOP of this number.
            const stub = makeStubModule();
            const r = bench('themeToScene · WASM bridge (stub)', () => {
                callThemeToScene(stub, sampleTheme);
            }, ITERS, RUNS);
            logBench(r);
            // Bridge should be < 500μs/call. We have ~30μs JSON
            // + ~10μs parse + ~10μs FFI (stub) + ~10μs rename
            // = ~60μs typically. 500μs leaves 8x headroom.
            expect(r.medianUsPerCall).toBeLessThan(500);
        });

        test('wasm_bridge_via_themeToSceneWithFallback', () => {
            // Same as above but going through the WithFallback
            // wrapper (the path main.ts actually calls). The
            // extra branch (the `if (wasmResult !== null)`
            // check) is negligible, but we measure it anyway
            // so the production-call-path number is in the
            // CI logs.
            const stub = makeStubModule();
            const r = bench('themeToScene · WithFallback (stub)', () => {
                themeToSceneWithFallback(stub, sampleTheme);
            }, ITERS, RUNS);
            logBench(r);
            expect(r.medianUsPerCall).toBeLessThan(500);
        });

        test('ts_fallback_via_themeToSceneWithFallback', () => {
            // The null-module path — the bridge short-circuits
            // and the TS mirror runs. This is the "what a slow
            // device or a wasm-pkg/404 sees" path.
            const r = bench('themeToScene · WithFallback (null mod)', () => {
                themeToSceneWithFallback(null, sampleTheme);
            }, ITERS, RUNS);
            logBench(r);
            // The null short-circuit adds ~1μs of branch
            // overhead over the bare TS mirror. Same bound
            // (200μs) should hold.
            expect(r.medianUsPerCall).toBeLessThan(200);
        });
    });

    describe('buildGenerationConfigWithMood', () => {
        test('ts_mirror_is_baseline', () => {
            const r = bench('buildGenConfig · TS mirror', () => {
                buildGenerationConfigWithMoodTs(5, 0, sampleMood, sampleHint, 42);
            }, ITERS, RUNS);
            logBench(r);
            // Simpler than themeToScene (no event chain gen), so
            // the bound is tighter: < 100μs/call.
            expect(r.medianUsPerCall).toBeLessThan(100);
        });

        test('wasm_bridge_via_callBuildGenerationConfigWithMood', () => {
            // The args JSON for this function is bigger than
            // themeToScene's (mood + hint + ranges), so the
            // JSON.stringify cost is higher. The stub still
            // returns a fixed string, so we measure bridge
            // overhead, not WASM cost.
            const stub = makeStubModule();
            const r = bench('buildGenConfig · WASM bridge (stub)', () => {
                callBuildGenerationConfigWithMood(
                    stub, 5, 0, sampleMood, sampleHint, 42,
                );
            }, ITERS, RUNS);
            logBench(r);
            expect(r.medianUsPerCall).toBeLessThan(500);
        });

        test('wasm_bridge_via_buildGenerationConfigWithMoodWithFallback', () => {
            const stub = makeStubModule();
            const r = bench('buildGenConfig · WithFallback (stub)', () => {
                buildGenerationConfigWithMoodWithFallback(
                    stub, 5, 0, sampleMood, sampleHint, 42,
                );
            }, ITERS, RUNS);
            logBench(r);
            expect(r.medianUsPerCall).toBeLessThan(500);
        });
    });

    describe('moodPalette', () => {
        test('ts_mirror_is_baseline', () => {
            // The smallest function in the bridge — 4 branch
            // comparisons on a 3-tuple. Should be < 5μs/call.
            const r = bench('moodPalette · TS mirror', () => {
                moodPaletteTs(sampleMood);
            }, ITERS, RUNS);
            logBench(r);
            expect(r.medianUsPerCall).toBeLessThan(20);
        });

        test('wasm_bridge_via_callMoodPalette', () => {
            // Smallest JSON payload (3 floats → 3-color array),
            // but the bridge still pays JSON.stringify +
            // parse + rename. The rename is a no-op (the
            // output uses the canonical camelCase name
            // `colors` already). The cost is dominated by
            // the JSON round-trip.
            const stub = makeStubModule();
            const r = bench('moodPalette · WASM bridge (stub)', () => {
                callMoodPalette(stub, sampleMood);
            }, ITERS, RUNS);
            logBench(r);
            // Bridge should still be < 500μs/call.
            expect(r.medianUsPerCall).toBeLessThan(500);
        });

        test('ts_fallback_via_moodPaletteWithFallback', () => {
            const r = bench('moodPalette · WithFallback (null mod)', () => {
                moodPaletteWithFallback(null, sampleMood);
            }, ITERS, RUNS);
            logBench(r);
            expect(r.medianUsPerCall).toBeLessThan(20);
        });
    });

    // -----------------------------------------------------------------------
    // Aggregate assertion — the WASM bridge should never be more
    // than ~3x the TS mirror cost (the ratio we expect to see in
    // production: bridge = JSON round-trip + FFI ≈ 30-60μs, mirror
    // = pure math ≈ 5-50μs). A ratio of 10x+ would mean the bridge
    // is doing something wildly inefficient (e.g. compiling a
    // regex on every call, or running a validation pass on the
    // output twice).
    // -----------------------------------------------------------------------

    describe('aggregate', () => {
        test('wasm_bridge_to_ts_mirror_ratio_is_bounded', () => {
            const stub = makeStubModule();
            const tsR = bench('aggregate · themeToScene TS', () => {
                themeToSceneTs(sampleTheme);
            }, ITERS, RUNS);
            const wasmR = bench('aggregate · themeToScene WASM', () => {
                themeToSceneWithFallback(stub, sampleTheme);
            }, ITERS, RUNS);
            const ratio = wasmR.medianUsPerCall / Math.max(tsR.medianUsPerCall, 0.001);
            // The ratio is a dimensionless number; we expect it
            // to land between 0.5x (bridge cheaper than mirror
            // — possible if the mirror does something heavy the
            // bridge skips) and 10x (bridge has noticeable but
            // acceptable JSON overhead). 3x is a tighter
            // target for production code; 10x is the tripwire.
            // We log the actual ratio so a regression is
            // visible in the CI logs.
            console.log(
                `[bench aggregate] themeToScene WASM/TS ratio=${ratio.toFixed(2)}x`
                + ` (TS=${tsR.medianUsPerCall.toFixed(3)}μs,`
                + ` WASM=${wasmR.medianUsPerCall.toFixed(3)}μs)`,
            );
            expect(ratio).toBeGreaterThan(0.5);
            expect(ratio).toBeLessThan(10);
        });
    });
});
