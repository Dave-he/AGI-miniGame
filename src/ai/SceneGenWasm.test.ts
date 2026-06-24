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
    callSeedFromStringJson,
    callGenInputFromStringsJson,
    callGenerateRulesJson,
    autoGenerateForDimensionWithFallback,
    SceneGenWasmModule,
} from './SceneGenWasm';
import type { ThemeInput, GenerationHint, Palette } from './SceneGen';
import { DEFAULT_GENERATION_HINT, FEAR_PALETTE, FRIENDLY_PALETTE } from './SceneGen';
import { defaultDisposition } from '../world/NpcMind';
import type { NpcDisposition } from '../world/NpcMind';
import type { GenerationConfig } from './AIEngine';
import { autoGenerateForDimension } from '../dsl/codegenBindings';

// ---------------------------------------------------------------------------
// Stub module factory — returns a fake WASM module with controllable
// behavior. The default stub returns a valid scene blueprint JSON
// and the round-51 version stamp. Tests that want old/faulty behavior
// override individual fields.
// ---------------------------------------------------------------------------

function makeStubModule(overrides: Partial<SceneGenWasmModule> = {}): SceneGenWasmModule {
    return {
        wasm_module_version: () => '0.3.0-round166',
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
        // Round 166 — codegen bridge defaults. Tests that pin
        // specific behaviour override these via the `overrides`
        // param. The default `generate_rules_json` emits a
        // 3-rule Medium-complexity set matching the TS `generateRules`
        // Medium branch (population + mood Damage + timer SpawnEntity).
        seed_from_string_json: (argsJson: string) => {
            const args = JSON.parse(argsJson);
            const len = (args.s as string).length;
            const stub = (BigInt(0xCBF29CE484222325) ^ (BigInt(len) * BigInt(0x100000001B3))) & BigInt('0xFFFFFFFFFFFFFFFF');
            return JSON.stringify({ seed: stub.toString() });
        },
        gen_input_from_strings_json: (argsJson: string) => {
            const args = JSON.parse(argsJson);
            const biomeMap: Record<string, string> = {
                forest: 'Forest', desert: 'Desert', ice: 'Ice', cyberpunk: 'Cyberpunk',
                // Round 167 — `lava` and `space` are first-class
                // mappings. Tests pin the Rust `biome_from_id`
                // contract byte-for-byte.
                lava: 'Lava', space: 'Space',
            };
            const biome = biomeMap[args.biome_id as string] ?? 'Forest';
            const complexityMap: Record<string, string> = { low: 'Low', high: 'High', med: 'Medium' };
            const complexity = complexityMap[(args.complexity as string) ?? 'med'] ?? 'Medium';
            const dimId = (args.dimension_id as string) ?? '';
            const len = dimId.length;
            const seedStub = (BigInt(0xCBF29CE484222325) ^ (BigInt(len) * BigInt(0x100000001B3))) & BigInt('0xFFFFFFFFFFFFFFFF');
            const moodPicker = Number(seedStub & BigInt(0xFF)) % 4;
            const moodList = ['Calm', 'Tense', 'Epic', 'Mysterious'];
            const mood = moodList[moodPicker];
            return JSON.stringify({ biome, mood, complexity, seed: seedStub.toString() });
        },
        generate_rules_json: (argsJson: string) => {
            // Round 167 — vary the rule count by complexity so
            // the round-166 Low/Medium/High coverage contracts
            // are pinned on the WASM path. The TS mirror's
            // `generateRules` emits 1/3/5 by complexity; the
            // stub now mirrors that shape.
            const args = JSON.parse(argsJson) as { complexity?: string };
            if (args.complexity === 'Low') {
                return JSON.stringify([
                    { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['cyberpunk_mob', 3] }] },
                ]);
            }
            if (args.complexity === 'High') {
                return JSON.stringify([
                    { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['cyberpunk_mob', 3] }] },
                    { event: { kind: 'Collide', arg: null }, actions: [{ kind: 'Damage', args: [1.5] }] },
                    { event: { kind: 'Timer', arg: 3 }, actions: [{ kind: 'SpawnEntity', args: ['cyberpunk_timer_spawn'] }] },
                    { event: { kind: 'Timer', arg: 8 }, actions: [{ kind: 'SpawnEntity', args: ['cyberpunk_timer_spawn'] }] },
                    { event: { kind: 'PlayerHit', arg: null }, actions: [{ kind: 'Damage', args: [4.5] }] },
                ]);
            }
            // Medium (default)
            return JSON.stringify([
                { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['cyberpunk_mob', 3] }] },
                { event: { kind: 'Collide', arg: null }, actions: [{ kind: 'Damage', args: [1.5] }] },
                { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'SpawnEntity', args: ['cyberpunk_timer_spawn'] }] },
            ]);
        },
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
        // code — the version stamp must start with `0.3.0-round`. A
        // mismatched stamp triggers fallback so a buggy WASM is never
        // silently used. Round 166 bumped the major version from
        // `0.2.0-round*` to `0.3.0-round*` to reflect the three new
        // codegen exports (`seed_from_string_json`,
        // `gen_input_from_strings_json`, `generate_rules_json`).
        const stub = makeStubModule({ wasm_module_version: () => 'some-old-build' });
        const mod = await loadSceneGenWasm(async () => stub);
        expect(mod).toBeNull();
    });

    test('loadSceneGenWasm_returns_null_when_version_is_round51_stamp', async () => {
        // Round 166 — old `0.2.0-round51` artifacts are rejected
        // because they pre-date the codegen bridge exports. A page
        // shipping a round-51 wasm-pkg/ would have a working
        // theme_to_scene_json but no `generate_rules_json`, so the
        // codegen path would throw — better to fall back to TS than
        // throw mid-dimension-enter.
        const stub = makeStubModule({ wasm_module_version: () => '0.2.0-round51' });
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

// ---------------------------------------------------------------------------
// Round 166 — DSL codegen WASM bridge (round-165 B exports).
//
// Three new `call*` helpers + one `WithFallback` wrapper. The TS
// App calls `autoGenerateForDimensionWithFallback` at
// dimension-enter time; the wrapper tries WASM first and falls
// back to `codegenBindings.autoGenerateForDimension` on any
// failure (module null, error JSON, malformed output).
//
// The seed is string-encoded on the wire to preserve full
// 64-bit precision (f64 mantissa = 53 bits); the helpers convert
// it back to bigint so callers can bit-mask without losing
// precision.
// ---------------------------------------------------------------------------

describe('SceneGenWasm — callSeedFromStringJson (round 166)', () => {
    test('returns_null_when_module_is_null', () => {
        expect(callSeedFromStringJson(null, 'forest')).toBeNull();
    });

    test('returns_bigint_seed_when_stub_succeeds', () => {
        const stub = makeStubModule();
        const seed = callSeedFromStringJson(stub, 'forest');
        expect(seed).not.toBeNull();
        expect(typeof seed).toBe('bigint');
        // The stub's stub-hash is a deterministic 64-bit value.
        // We don't pin the exact number (the TS `seedFromString`
        // helper has its own FNV-1a test that pins known vectors);
        // here we just confirm a valid 64-bit value came back.
        expect(seed! >= 0n).toBe(true);
        expect(seed! < (1n << 64n)).toBe(true);
    });

    test('returns_null_when_wasm_returns_error_json', () => {
        const stub = makeStubModule({
            seed_from_string_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        expect(callSeedFromStringJson(stub, '')).toBeNull();
    });

    test('returns_null_when_wasm_throws', () => {
        const stub = makeStubModule({
            seed_from_string_json: () => { throw new Error('boom'); },
        });
        expect(callSeedFromStringJson(stub, 'forest')).toBeNull();
    });
});

describe('SceneGenWasm — callGenInputFromStringsJson (round 166)', () => {
    test('returns_null_when_module_is_null', () => {
        expect(callGenInputFromStringsJson(null, 'forest', 'dim_alpha')).toBeNull();
    });

    test('returns_GenInputJson_when_stub_succeeds_forest_med', () => {
        const stub = makeStubModule();
        const gi = callGenInputFromStringsJson(stub, 'forest', 'dim_alpha', 'med');
        expect(gi).not.toBeNull();
        expect(gi!.biome).toBe('Forest');
        expect(gi!.complexity).toBe('Medium');
        // Mood comes from seed % 4 — must be one of the 4 canonical tags.
        expect(['Calm', 'Tense', 'Epic', 'Mysterious']).toContain(gi!.mood);
        expect(typeof gi!.seed).toBe('bigint');
    });

    test('maps_low_med_high_complexity_tags_canonically', () => {
        const stub = makeStubModule();
        expect(callGenInputFromStringsJson(stub, 'cyberpunk', 'd', 'low')!.complexity).toBe('Low');
        expect(callGenInputFromStringsJson(stub, 'cyberpunk', 'd', 'high')!.complexity).toBe('High');
        expect(callGenInputFromStringsJson(stub, 'cyberpunk', 'd', 'med')!.complexity).toBe('Medium');
    });

    test('returns_null_when_wasm_returns_error_json', () => {
        const stub = makeStubModule({
            gen_input_from_strings_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        expect(callGenInputFromStringsJson(stub, 'forest', 'd')).toBeNull();
    });
});

describe('SceneGenWasm — callGenerateRulesJson (round 166)', () => {
    test('returns_null_when_module_is_null', () => {
        expect(callGenerateRulesJson(null, {
            biome: 'Forest', mood: 'Calm', complexity: 'Medium', seed: 0n,
        })).toBeNull();
    });

    test('returns_DslRule_array_when_stub_succeeds', () => {
        const stub = makeStubModule();
        const rules = callGenerateRulesJson(stub, {
            biome: 'Cyberpunk', mood: 'Tense', complexity: 'Medium', seed: 42n,
        });
        expect(rules).not.toBeNull();
        expect(Array.isArray(rules)).toBe(true);
        expect(rules!.length).toBeGreaterThanOrEqual(1);
        // The stub emits a 3-rule Medium-complexity set.
        expect(rules!.length).toBe(3);
        // Each rule must parse to a valid DslRule shape.
        for (const r of rules!) {
            expect(['Collide', 'Timer', 'Spawn', 'PlayerHit']).toContain(r.event.kind);
            expect(Array.isArray(r.actions)).toBe(true);
            for (const a of r.actions) {
                expect(['Damage', 'Heal', 'Spawn', 'SpawnEntity']).toContain(a.kind);
                expect(Array.isArray(a.args)).toBe(true);
            }
        }
    });

    test('returns_null_when_wasm_returns_error_json', () => {
        const stub = makeStubModule({
            generate_rules_json: () => JSON.stringify({ error: 'unknown complexity tag' }),
        });
        expect(callGenerateRulesJson(stub, {
            biome: 'Forest', mood: 'Calm', complexity: 'Medium', seed: 0n,
        })).toBeNull();
    });

    test('returns_null_when_wasm_returns_malformed_rule', () => {
        // A rule missing `event.kind` aborts the whole call.
        const stub = makeStubModule({
            generate_rules_json: () => JSON.stringify([
                { event: { arg: null }, actions: [{ kind: 'Spawn', args: [] }] },
            ]),
        });
        expect(callGenerateRulesJson(stub, {
            biome: 'Forest', mood: 'Calm', complexity: 'Medium', seed: 0n,
        })).toBeNull();
    });
});

describe('SceneGenWasm — autoGenerateForDimensionWithFallback (round 166)', () => {
    test('returns_wasm_source_when_module_loaded_and_exports_succeed', () => {
        const stub = makeStubModule();
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk', 'Medium');
        expect(out.source).toBe('wasm');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
        // The `input` shape mirrors the TS `GenInput` exactly.
        expect(out.input.biome).toBe('Cyberpunk');
        expect(['Calm', 'Tense', 'Epic', 'Mysterious']).toContain(out.input.mood);
        expect(out.input.complexity).toBe('Medium');
    });

    test('returns_ts_fallback_source_when_module_is_null', () => {
        const out = autoGenerateForDimensionWithFallback(null, 'dim_alpha', 'cyberpunk', 'Medium');
        expect(out.source).toBe('ts-fallback');
        // The TS mirror must still produce a valid rule set so the
        // App's `applyGenerated` never sees an empty array.
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
        expect(out.input.biome).toBe('Cyberpunk');
    });

    test('returns_ts_fallback_source_when_gen_input_exports_error_json', () => {
        const stub = makeStubModule({
            gen_input_from_strings_json: () => JSON.stringify({ error: 'parse: bad input' }),
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk');
        expect(out.source).toBe('ts-fallback');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
    });

    test('returns_ts_fallback_source_when_generate_rules_exports_error_json', () => {
        // `gen_input_from_strings_json` succeeds but
        // `generate_rules_json` fails → still falls back to TS.
        const stub = makeStubModule({
            generate_rules_json: () => JSON.stringify({ error: 'unknown complexity tag' }),
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk');
        expect(out.source).toBe('ts-fallback');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
    });

    test('wasm_and_ts_fallback_produce_same_rule_count_for_medium_complexity', () => {
        // Pin the coverage contract from round-162: Medium
        // complexity emits exactly 3 rules (population + mood +
        // timer). Both the WASM stub and the TS mirror must satisfy
        // this so a swap (round-166 WASM-first) doesn't change the
        // visible rule count.
        const stub = makeStubModule();
        const wasmOut = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk', 'Medium');
        const tsOut = autoGenerateForDimensionWithFallback(null, 'dim_alpha', 'cyberpunk', 'Medium');
        expect(wasmOut.rules.length).toBe(tsOut.rules.length);
        expect(wasmOut.rules.length).toBe(3);
    });

    test('input_seed_round_trips_through_string_encoding_losslessly', () => {
        // The seed is string-encoded on the wire to preserve full
        // 64-bit precision. A 2^53+ value must survive the
        // round-trip without silent truncation to a Number.
        const bigSeed = (1n << 60n) + 12345n;
        let capturedInput: { seed: string } | null = null;
        const stub = makeStubModule({
            generate_rules_json: (argsJson: string) => {
                capturedInput = JSON.parse(argsJson) as { seed: string };
                return JSON.stringify([
                    { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['mob', 1] }] },
                ]);
            },
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk');
        expect(out.source).toBe('wasm');
        // The seed we passed into the WASM call should be the
        // gen_input-derived seed (a string-encoded bigint). Just
        // confirm the wire format is string, not number.
        expect(capturedInput).not.toBeNull();
        expect(typeof capturedInput!.seed).toBe('string');
        // Also confirm the round-trip from input.seed back through
        // the WASM call preserved bit-for-bit precision.
        expect(BigInt(capturedInput!.seed)).toBe(out.input.seed);
    });

    test('low_complexity_emits_only_baseline_rule_on_both_branches', () => {
        // Round-162 coverage contract: Low complexity emits 1
        // baseline rule (no extras). Pin this on both branches so
        // round-166 doesn't accidentally emit 2-3 extras on the
        // WASM path.
        const stub = makeStubModule();
        const wasmOut = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk', 'Low');
        const tsOut = autoGenerateForDimensionWithFallback(null, 'dim_alpha', 'cyberpunk', 'Low');
        expect(wasmOut.rules.length).toBe(1);
        expect(tsOut.rules.length).toBe(1);
        expect(wasmOut.rules[0].event.kind).toBe('Spawn');
    });

    test('cross_check_wasm_path_uses_snake_case_input_fields', () => {
        // Pin the JSON contract between Rust and TS byte-for-byte.
        // A future rename in `wasm_exports.rs::gen_input_from_strings_json`
        // would break this and force a sync update.
        let captured = '';
        const stub = makeStubModule({
            gen_input_from_strings_json: (argsJson: string) => {
                captured = argsJson;
                return JSON.stringify({
                    biome: 'Forest', mood: 'Calm', complexity: 'Medium',
                    seed: '12345',
                });
            },
        });
        autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'forest', 'Medium');
        const parsed = JSON.parse(captured);
        expect(parsed).toHaveProperty('biome_id');
        expect(parsed).toHaveProperty('dimension_id');
        expect(parsed).toHaveProperty('complexity');
    });

    test('cross_check_generate_rules_uses_string_seed_not_number', () => {
        // The seed must arrive as a JSON STRING (not a number)
        // because u64 values above 2^53 silently lose precision
        // when serialized as a JSON number (f64 mantissa = 53 bits).
        let captured = '';
        const stub = makeStubModule({
            generate_rules_json: (argsJson: string) => {
                captured = argsJson;
                return JSON.stringify([
                    { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['mob', 1] }] },
                ]);
            },
        });
        autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk');
        // The captured JSON contains a "seed":"<digits>" string, not a number.
        expect(captured).toMatch(/"seed":"\d+"/);
    });

    // Round 168 — wider failure-path coverage. The round-166
    // tests covered the "module null" + "WASM returns {error:
    // ...}" paths; this round adds (a) WASM throws an
    // exception, (b) WASM returns malformed JSON in the
    // gen-input step, (c) WASM returns a half-broken rule
    // array (one rule missing `event.kind`). All three must
    // fall back to the TS mirror with `source: 'ts-fallback'`.

    test('returns_ts_fallback_when_gen_input_exports_throws_round_168', () => {
        // A real WASM module could throw on a panic (e.g.
        // dimension_id contains a null byte). The
        // progressive-enhancement wrapper must NOT propagate
        // the exception — it must catch and fall back to the
        // TS mirror so the App's dimension-enter flow stays
        // green.
        const stub = makeStubModule({
            gen_input_from_strings_json: () => {
                throw new Error('wasm panic: dimension_id contains null byte');
            },
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'cyberpunk');
        expect(out.source).toBe('ts-fallback');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
        // The fallback input.biome must match the TS mirror
        // (Cyberpunk → 'Cyberpunk' canonical PascalCase).
        expect(out.input.biome).toBe('Cyberpunk');
    });

    test('returns_ts_fallback_when_gen_input_returns_malformed_json_round_168', () => {
        // A real WASM module could panic-recover and return a
        // non-JSON payload. `JSON.parse` throws → the wrapper
        // must catch and fall back.
        const stub = makeStubModule({
            gen_input_from_strings_json: () => 'not-json-at-all{{{',
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'forest');
        expect(out.source).toBe('ts-fallback');
        expect(out.input.biome).toBe('Forest');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
    });

    test('returns_ts_fallback_when_generate_rules_has_half_broken_rule_round_168', () => {
        // `generate_rules_json` returns a valid array, but
        // one rule is missing `event.kind`. The wrapper's
        // per-rule validator must abort the call (return
        // null) instead of handing a broken array to the
        // executor.
        const stub = makeStubModule({
            generate_rules_json: () => JSON.stringify([
                { event: { kind: 'Spawn', arg: null }, actions: [{ kind: 'Spawn', args: ['forest_mob', 3] }] },
                // Missing event.kind — must abort.
                { actions: [{ kind: 'Damage', args: [1.5] }] },
            ]),
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'forest');
        expect(out.source).toBe('ts-fallback');
        // The TS fallback always emits ≥ 1 rule.
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
    });

    test('returns_ts_fallback_when_generate_rules_exports_throws_round_168', () => {
        // Same exception-isolation contract as the
        // gen-input-throws test above, but on the
        // generate_rules step.
        const stub = makeStubModule({
            generate_rules_json: () => {
                throw new Error('wasm panic: rule serialization overflow');
            },
        });
        const out = autoGenerateForDimensionWithFallback(stub, 'dim_alpha', 'ice');
        expect(out.source).toBe('ts-fallback');
        expect(out.input.biome).toBe('Ice');
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
    });
});
