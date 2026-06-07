/**
 * Round 48 — SceneGenWasm tests.
 *
 * The WASM module is loaded via an injectable loader so jest doesn't
 * need a real WebAssembly runtime. The tests cover the JSON bridge
 * + the fallback behavior the AIBridge depends on.
 */

import { loadSceneGenWasm, callThemeToScene, themeToSceneWithFallback, SceneGenWasmModule } from './SceneGenWasm';
import type { ThemeInput } from './SceneGen';

// ---------------------------------------------------------------------------
// Stub module factory — returns a fake WASM module with controllable
// behavior. The default stub returns a valid scene blueprint JSON.
// ---------------------------------------------------------------------------

function makeStubModule(overrides: Partial<SceneGenWasmModule> = {}): SceneGenWasmModule {
    return {
        wasm_module_version: () => '0.1.0-round48',
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
        ...overrides,
    };
}

const sampleTheme: ThemeInput = {
    visualStyle: 'cyberpunk',
    musicMood: 'pulse',
    difficulty: 0.5,
    seed: 1,
};

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
        // code — the version stamp must start with `0.1.0-round`. A
        // mismatched stamp triggers fallback so a buggy WASM is never
        // silently used.
        const stub = makeStubModule({ wasm_module_version: () => 'some-old-build' });
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
