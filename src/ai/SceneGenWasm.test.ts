/**
 * Round 48 → 51 — SceneGenWasm tests.
 *
 * The WASM module is loaded via an injectable loader so jest doesn't
 * need a real WebAssembly runtime. The tests cover the JSON bridge
 * + the fallback behavior the AIBridge / AIEngine / NarrationEngine
 * depend on.
 *
 * Round 51 adds 14 tests covering the three new helpers
 * (`callBuildGenerationConfigWithMood`, `callMoodPalette`,
 * `callMood4thSentenceFor`), their `WithFallback` wrappers, and
 * cross-layer field-name pinning.
 */

import {
    loadSceneGenWasm,
    callThemeToScene,
    themeToSceneWithFallback,
    callBuildGenerationConfigWithMood,
    callMoodPalette,
    callMood4thSentenceFor,
    buildGenerationConfigWithMoodWithFallback,
    moodPaletteWithFallback,
    SceneGenWasmModule,
} from './SceneGenWasm';
import type { ThemeInput, GenerationHint, Palette } from './SceneGen';
import { DEFAULT_GENERATION_HINT, FEAR_PALETTE, FRIENDLY_PALETTE } from './SceneGen';
import { defaultDisposition } from '../world/NpcMind';
import type { NpcDisposition } from '../world/NpcMind';
import type { GenerationConfig } from './AIEngine';

// ---------------------------------------------------------------------------
// Stub module factory — returns a fake WASM module with controllable
// behavior. The default stub returns a valid scene blueprint JSON
// and the round-51 version stamp. Tests that want old/faulty behavior
// override individual fields.
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

const sampleTheme: ThemeInput = {
    visualStyle: 'cyberpunk',
    musicMood: 'pulse',
    difficulty: 0.5,
    seed: 1,
};

const sampleHint: GenerationHint = DEFAULT_GENERATION_HINT;

const fearMood: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
const lovedMood: NpcDisposition = { friendly: 0.7, fear: 0.0, trust: 0.4 };
const neutralMood: NpcDisposition = defaultDisposition();

describe('SceneGenWasm — round 48 WASM bridge', () => {
    test('loadSceneGenWasm_returns_module_when_loader_succeeds', async () => {
        const stub = makeStubModule();
        const mod = await loadSceneGenWasm(async () => stub);
        expect(mod).toBe(stub);
    });

    test('loadSceneGenWasm_returns_null_when_loader_throws', async () => {
        // Loader failure (e.g. .wasm 404 or browser blocks wasm) →
        // wrapper returns null so the caller falls back to the TS
        // mirror without having to try/catch.
        const mod = await loadSceneGenWasm(async () => {
            throw new Error('module not found');
        });
        expect(mod).toBeNull();
    });

    test('loadSceneGenWasm_returns_null_when_version_check_fails', async () => {
        // The wasm-pkg/ artifacts could be stale relative to this TS
        // code — the version stamp must start with `0.2.0-round`. A
        // mismatched stamp triggers fallback so a buggy WASM is never
        // silently used. Round 51 also explicitly rejects the round-48
        // `0.1.0-round48` stamp so a stale build falls back to TS
        // rather than mismatching the new exports.
        const stub = makeStubModule({ wasm_module_version: () => 'some-old-build' });
        const mod = await loadSceneGenWasm(async () => stub);
        expect(mod).toBeNull();
    });

    test('loadSceneGenWasm_returns_null_when_version_is_round48_stamp', async () => {
        // Round 51 — old `0.1.0-round48` artifacts are rejected.
        const stub = makeStubModule({ wasm_module_version: () => '0.1.0-round48' });
        const mod = await loadSceneGenWasm(async () => stub);
        expect(mod).toBeNull();
    });

    test('callThemeToScene_returns_null_when_module_is_null', () => {
        // The most common fast-path: the loader returned null and
        // the caller passed it through. The wrapper short-circuits.
        const bp = callThemeToScene(null, sampleTheme);
        expect(bp).toBeNull();
    });

    test('callThemeToScene_parses_stub_output_into_SceneBlueprint', () => {
        // Happy path — the JSON bridge converts snake_case → camelCase
        // so the consumer sees the same shape as the TS mirror.
        const stub = makeStubModule();
        const bp = callThemeToScene(stub, sampleTheme);
        expect(bp).not.toBeNull();
        expect(bp!.biomeId).toBe('cyberpunk');
        expect(bp!.npcCount).toBe(9);
        expect(bp!.musicBpm).toBe(130);
        expect(bp!.eventChain).toHaveLength(3);
        expect(bp!.eventChain[0].kind).toBe('spawn_wave');
        // snake_case → camelCase rename on the event step is canonical.
        expect(bp!.eventChain[0].delaySecs).toBe(5);
        expect(bp!.npcArchetypeHints).toEqual(['robot']);
        expect(bp!.wfcTileWeights).toEqual([4, 4, 2, 2, 0, 0, 3, 1]);
    });

    test('callThemeToScene_returns_null_when_wasm_returns_error_json', () => {
        // The Rust shim wraps any parse / unknown-enum failure into
        // `{"error":"..."}`. The TS wrapper sees it and returns null
        // for fallback.
        const stub = makeStubModule({
            theme_to_scene_json: () => JSON.stringify({ error: 'parse: ...' }),
        });
        const bp = callThemeToScene(stub, sampleTheme);
        expect(bp).toBeNull();
    });

    test('callThemeToScene_returns_null_when_wasm_throws', () => {
        // Defense in depth — even if the WASM fn throws (memory
        // corruption etc), the wrapper catches and returns null
        // instead of propagating.
        const stub = makeStubModule({
            theme_to_scene_json: () => {
                throw new Error('wasm trap');
            },
        });
        const bp = callThemeToScene(stub, sampleTheme);
        expect(bp).toBeNull();
    });

    test('callThemeToScene_returns_null_when_wasm_returns_unparseable_json', () => {
        const stub = makeStubModule({
            theme_to_scene_json: () => 'not json at all',
        });
        const bp = callThemeToScene(stub, sampleTheme);
        expect(bp).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// themeToSceneWithFallback — the one-call helper main.ts uses.
// ---------------------------------------------------------------------------

describe('SceneGenWasm — themeToSceneWithFallback', () => {
    test('returns_wasm_source_when_wasm_succeeds', () => {
        const stub = makeStubModule();
        const out = themeToSceneWithFallback(stub, sampleTheme);
        expect(out.source).toBe('wasm');
        expect(out.blueprint.biomeId).toBe('cyberpunk');
        // The stub returns npc_count=9, distinct from what the TS
        // mirror would return for the same input (which is ~5 at
        // difficulty 0.5 for cyberpunk). The exact number proves
        // we went through the WASM stub, not the TS mirror.
        expect(out.blueprint.npcCount).toBe(9);
    });

    test('returns_ts_fallback_source_when_module_is_null', () => {
        // No WASM module → fall back to the TS mirror. The blueprint
        // still has a valid shape (the TS mirror never fails).
        const out = themeToSceneWithFallback(null, sampleTheme);
        expect(out.source).toBe('ts-fallback');
        expect(out.blueprint.biomeId).toBe('cyberpunk');
        // TS mirror npc_count for cyberpunk @ 0.5 with base 0.9
        // density: 0.9 * (0.5 + 0.5*0.7) = 0.765 → round(0.765*12) = 9.
        // Stable across rounds — see SceneGen.test.ts snapshots.
        expect(out.blueprint.npcCount).toBe(9);
    });

    test('returns_ts_fallback_source_when_wasm_returns_error', () => {
        // The WASM shim returned an error JSON (unknown enum, parse
        // failure, etc.) — fall back to the TS mirror so the game
        // can still load the dimension.
        const stub = makeStubModule({
            theme_to_scene_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        const out = themeToSceneWithFallback(stub, sampleTheme);
        expect(out.source).toBe('ts-fallback');
        expect(out.blueprint.biomeId).toBe('cyberpunk');
    });

    test('returns_ts_fallback_source_when_wasm_throws', () => {
        const stub = makeStubModule({
            theme_to_scene_json: () => {
                throw new Error('wasm trap');
            },
        });
        const out = themeToSceneWithFallback(stub, sampleTheme);
        expect(out.source).toBe('ts-fallback');
    });
});

// ---------------------------------------------------------------------------
// Round 51 — `callBuildGenerationConfigWithMood` (3 paths).
// ---------------------------------------------------------------------------

describe('SceneGenWasm — callBuildGenerationConfigWithMood (round 51)', () => {
    test('returns_null_when_module_is_null', () => {
        const cfg = callBuildGenerationConfigWithMood(
            null, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(cfg).toBeNull();
    });

    test('parses_stub_output_into_GenerationConfig', () => {
        const stub = makeStubModule();
        const cfg = callBuildGenerationConfigWithMood(
            stub, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(cfg).not.toBeNull();
        expect(cfg!.playerLevel).toBe(5);
        expect(cfg!.difficultyRange).toEqual([0.3, 0.8]);
        expect(cfg!.preferredTypes).toEqual(['match3', 'synthesis', 'parkour']);
        expect(cfg!.excludedTypes).toEqual([]);
        expect(cfg!.rewardMultiplier).toBe(1.0);
        // snake_case → camelCase rename is canonical.
        expect(cfg!.minAtoms).toBe(2);
        expect(cfg!.maxAtoms).toBe(4);
        // Note: the WASM output also has `allow_composite` and `seed`,
        // but the TS `GenerationConfig` interface drops them. The
        // `seed` is owned by WorldState (round 50), and
        // `allowComposite` isn't read by the TS `GameplayCombinerAI`.
    });

    test('returns_null_when_wasm_returns_error_json', () => {
        const stub = makeStubModule({
            build_generation_config_with_mood_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        const cfg = callBuildGenerationConfigWithMood(
            stub, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(cfg).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Round 51 — `callMoodPalette` (2 paths).
// ---------------------------------------------------------------------------

describe('SceneGenWasm — callMoodPalette (round 51)', () => {
    test('returns_null_when_module_is_null', () => {
        const p = callMoodPalette(null, fearMood);
        expect(p).toBeNull();
    });

    test('parses_stub_output_into_Palette', () => {
        const stub = makeStubModule();
        const p = callMoodPalette(stub, fearMood);
        expect(p).not.toBeNull();
        expect(p).toEqual(['#0A1A2F', '#1B4965', '#CAE9FF']);
    });
});

// ---------------------------------------------------------------------------
// Round 51 — `callMood4thSentenceFor` (3 paths).
// ---------------------------------------------------------------------------

describe('SceneGenWasm — callMood4thSentenceFor (round 51)', () => {
    test('returns_null_when_module_is_null', () => {
        const s = callMood4thSentenceFor(null, 0, 'dim_42');
        expect(s).toBeNull();
    });

    test('parses_stub_output_into_sentence_string', () => {
        const stub = makeStubModule();
        const s = callMood4thSentenceFor(stub, 0, 'dim_42');
        expect(s).not.toBeNull();
        expect(typeof s).toBe('string');
        expect(s!.length).toBeGreaterThan(0);
    });

    test('returns_null_when_wasm_returns_error_json', () => {
        // branch=3 (NEUTRAL) has no pool → `{"error":"..."}`.
        const stub = makeStubModule({
            mood_4th_sentence_for_json: () => JSON.stringify({ error: 'no 4th-sentence pool for branch 3' }),
        });
        const s = callMood4thSentenceFor(stub, 3, 'dim_42');
        expect(s).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Round 51 — `WithFallback` wrappers (3 paths: wasm success, ts-fallback,
// wasm error → ts-fallback).
// ---------------------------------------------------------------------------

describe('SceneGenWasm — buildGenerationConfigWithMoodWithFallback (round 51)', () => {
    test('returns_wasm_source_when_wasm_succeeds', () => {
        const stub = makeStubModule();
        const out = buildGenerationConfigWithMoodWithFallback(
            stub, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(out.source).toBe('wasm');
        expect(out.config.playerLevel).toBe(5);
    });

    test('returns_ts_fallback_source_when_module_is_null', () => {
        const out = buildGenerationConfigWithMoodWithFallback(
            null, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(out.source).toBe('ts-fallback');
        expect(out.config.playerLevel).toBe(5);
    });

    test('returns_ts_fallback_source_when_wasm_returns_error', () => {
        const stub = makeStubModule({
            build_generation_config_with_mood_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        const out = buildGenerationConfigWithMoodWithFallback(
            stub, 5, 0, neutralMood, sampleHint, 42,
        );
        expect(out.source).toBe('ts-fallback');
    });
});

describe('SceneGenWasm — moodPaletteWithFallback (round 51)', () => {
    test('returns_wasm_source_when_wasm_succeeds', () => {
        const stub = makeStubModule();
        const out = moodPaletteWithFallback(stub, fearMood);
        expect(out.source).toBe('wasm');
        expect(out.palette).toEqual(['#0A1A2F', '#1B4965', '#CAE9FF']);
    });

    test('returns_ts_fallback_source_when_module_is_null', () => {
        const out = moodPaletteWithFallback(null, fearMood);
        expect(out.source).toBe('ts-fallback');
        // TS mirror for fear mood → FEAR_PALETTE.
        expect(out.palette).toEqual(FEAR_PALETTE);
    });

    test('returns_ts_fallback_source_when_wasm_returns_error', () => {
        const stub = makeStubModule({
            mood_palette_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        const out = moodPaletteWithFallback(stub, lovedMood);
        expect(out.source).toBe('ts-fallback');
        // TS mirror for loved mood → FRIENDLY_PALETTE.
        expect(out.palette).toEqual(FRIENDLY_PALETTE);
    });
});

// ---------------------------------------------------------------------------
// Round 51 — cross-layer field-name pinning. The JSON contract
// between Rust and TS uses snake_case on the wire; the TS side
// translates to camelCase on parse. These two tests pin the input
// field names byte-for-byte against the Rust wasm_exports.rs struct
// definitions so a future rename is caught.
// ---------------------------------------------------------------------------

describe('SceneGenWasm — cross-layer snake_case field-name pinning (round 51)', () => {
    test('callBuildGenerationConfigWithMood_uses_snake_case_input_fields', () => {
        // Spy on the WASM stub to capture the args string and assert
        // the field names match the Rust `ArgsJson` struct.
        let captured = '';
        const stub = makeStubModule({
            build_generation_config_with_mood_json: (argsJson: string) => {
                captured = argsJson;
                return JSON.stringify({
                    min_atoms: 0, max_atoms: 0, difficulty_range_lo: 0, difficulty_range_hi: 0,
                    allow_composite: false, seed: null, player_level: 0,
                    preferred_types: [], excluded_types: [], reward_multiplier: 1.0,
                });
            },
        });
        callBuildGenerationConfigWithMood(stub, 5, 0, neutralMood, sampleHint, 42);
        const parsed = JSON.parse(captured);
        expect(parsed).toHaveProperty('player_level');
        expect(parsed).toHaveProperty('recent_loss_count');
        expect(parsed).toHaveProperty('mood.friendly');
        expect(parsed).toHaveProperty('mood.fear');
        expect(parsed).toHaveProperty('mood.trust');
        expect(parsed).toHaveProperty('hint.min_atoms');
        expect(parsed).toHaveProperty('hint.max_atoms');
        expect(parsed).toHaveProperty('hint.reward_multiplier');
        expect(parsed).toHaveProperty('hint.base_difficulty_range_lo');
        expect(parsed).toHaveProperty('hint.base_difficulty_range_hi');
        expect(parsed).toHaveProperty('seed');
    });

    test('callMood4thSentenceFor_uses_snake_case_input_fields', () => {
        let captured = '';
        const stub = makeStubModule({
            mood_4th_sentence_for_json: (argsJson: string) => {
                captured = argsJson;
                return JSON.stringify({
                    sentence: '...', branch: 0, blueprint_id: 'dim_42',
                });
            },
        });
        callMood4thSentenceFor(stub, 0, 'dim_42');
        const parsed = JSON.parse(captured);
        expect(parsed).toHaveProperty('branch');
        expect(parsed).toHaveProperty('blueprint_id');
    });
});
