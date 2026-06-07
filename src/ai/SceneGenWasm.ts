/**
 * Round 48 — WASM bridge for `themeToScene`.
 *
 * The canonical implementation lives in cocos4-rust:
 *   `src/agi_minigame/wasm_exports.rs::theme_to_scene_json`
 *
 * This module loads the compiled `wasm-pkg/cocos4_rust.js` ES module
 * (produced by `cocos4-rust/scripts/build-wasm.sh`), calls the WASM
 * function via a JSON bridge, and parses the result back into a
 * `SceneBlueprint` shape that matches the existing TS mirror.
 *
 * On any failure (module missing, load error, wasm threw, error JSON
 * returned), the wrapper returns `null` and the caller is expected
 * to fall back to the TS mirror (`SceneGen.ts::themeToScene`). This
 * keeps WASM as a *progressive enhancement* rather than a hard
 * dependency — pages where the .wasm fails to fetch still play.
 *
 * Test strategy: `loadSceneGenWasm` accepts an optional `loader`
 * parameter so jest tests can inject a stub module without going
 * through dynamic-import + jsdom WebAssembly machinery. Real
 * browser smoke is done via `npm run dev` (manual, PRD round 48
 * acceptance #11).
 */

import type { SceneBlueprint, ThemeInput } from './SceneGen';
import { themeToScene as themeToSceneTs } from './SceneGen';

// ---------------------------------------------------------------------------
// Public surface — what the AIBridge consumes.
// ---------------------------------------------------------------------------

/** Subset of `wasm-pkg/cocos4_rust.js` the AGI-miniGame layer cares about. */
export interface SceneGenWasmModule {
    theme_to_scene_json(themeJson: string): string;
    wasm_module_version(): string;
}

/** Loader function that returns the compiled WASM module (or throws). */
export type SceneGenWasmLoader = () => Promise<SceneGenWasmModule>;

// ---------------------------------------------------------------------------
// Default loader — dynamic-imports the wasm-pkg ES module and calls its
// default-export initializer. Lazy so that consumers that never load
// the WASM module don't pay the import cost.
// ---------------------------------------------------------------------------

const defaultLoader: SceneGenWasmLoader = async () => {
    // The `?init` query suffix tells Vite to instantiate the WASM
    // module on import. For jest / Node we fall back to a plain
    // dynamic import; the test path injects a stub loader so this
    // branch never runs under jest.
    // The relative path resolves from `dist/` at runtime (Vite copies
    // wasm-pkg/ as a static asset).
    const mod = await import('../../wasm-pkg/cocos4_rust.js');
    // The default export is the wasm-bindgen `__wbg_init` initializer.
    // Calling it returns the wasm exports table; the named exports
    // (theme_to_scene_json, wasm_module_version) are bound after init.
    if (typeof mod.default === 'function') {
        await mod.default();
    }
    return mod as SceneGenWasmModule;
};

// ---------------------------------------------------------------------------
// Loader — best-effort. Returns null on ANY failure so the caller can
// fall back to the TS mirror without try/catching themselves.
// ---------------------------------------------------------------------------

/**
 * Round 48 — load the cocos4-rust WASM bridge.
 *
 * Returns the loaded module on success, or `null` on any failure
 * (module missing, fetch error, init threw, version mismatch). The
 * `loader` parameter is for tests; production callers omit it.
 */
export async function loadSceneGenWasm(
    loader: SceneGenWasmLoader = defaultLoader,
): Promise<SceneGenWasmModule | null> {
    try {
        const mod = await loader();
        // Smoke check: the version string must be the round-48 stamp.
        // If it isn't, the wasm-pkg/ directory is stale relative to
        // this TS code and we'd rather fall back than mismatch.
        if (typeof mod.wasm_module_version !== 'function') {
            return null;
        }
        const v = mod.wasm_module_version();
        if (typeof v !== 'string' || !v.startsWith('0.1.0-round')) {
            return null;
        }
        return mod;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pure helper — serializes the ThemeInput → calls the WASM fn →
// parses the JSON. Returns null on any failure (so the caller can
// fall back without try/catching).
// ---------------------------------------------------------------------------

/**
 * Round 48 — invoke the WASM `theme_to_scene_json` via the JSON bridge.
 *
 * If `mod` is `null` (loader failed), returns `null` immediately —
 * the caller is expected to fall back to the TS mirror in that case.
 *
 * If the WASM returns an error JSON (`{"error":"..."}`) or the
 * shape is unexpected, also returns `null`.
 */
export function callThemeToScene(
    mod: SceneGenWasmModule | null,
    theme: ThemeInput,
): SceneBlueprint | null {
    if (!mod) return null;
    try {
        const themeJson = JSON.stringify({
            visual_style: theme.visualStyle,
            music_mood: theme.musicMood,
            difficulty: theme.difficulty,
            seed: theme.seed,
        });
        const outJson = mod.theme_to_scene_json(themeJson);
        const parsed = JSON.parse(outJson);
        // Error JSON path — the WASM shim wraps any parse / unknown-
        // enum / serialize failure into `{ error: "..." }`.
        if (parsed && typeof parsed.error === 'string') {
            return null;
        }
        // Successful blueprint JSON — translate snake_case → camelCase
        // so the TS consumers see the same shape as the in-process
        // `SceneGen.ts::themeToScene` returns.
        if (
            !parsed
            || !Array.isArray(parsed.wfc_tile_weights)
            || typeof parsed.biome_id !== 'string'
        ) {
            return null;
        }
        const bp: SceneBlueprint = {
            wfcTileWeights: parsed.wfc_tile_weights as SceneBlueprint['wfcTileWeights'],
            biomeId: parsed.biome_id as SceneBlueprint['biomeId'],
            baseNpcDensity: parsed.base_npc_density,
            npcDensity: parsed.npc_density,
            npcCount: parsed.npc_count,
            eventChain: Array.isArray(parsed.event_chain)
                ? parsed.event_chain.map((e: { kind: string; delay_secs: number; payload: string }) => ({
                    kind: e.kind,
                    delaySecs: e.delay_secs,
                    payload: e.payload,
                }))
                : [],
            musicBpm: parsed.music_bpm,
            npcArchetypeHints: Array.isArray(parsed.npc_archetype_hints)
                ? parsed.npc_archetype_hints as SceneBlueprint['npcArchetypeHints']
                : [],
        };
        return bp;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// One-call helper — the "WASM first, fall back to TS mirror" path that
// main.ts uses. Tracks which branch ran so the caller can log it.
// ---------------------------------------------------------------------------

/** Outcome of a `themeToSceneWithFallback` call — which branch produced the blueprint. */
export interface ThemeToSceneOutcome {
    blueprint: SceneBlueprint;
    source: 'wasm' | 'ts-fallback';
}

/**
 * Round 48 — try the WASM bridge first; on null result, fall back to
 * the TS mirror. Always returns a blueprint (the TS mirror never
 * fails for well-formed input). The `source` field lets callers log
 * which branch ran (`[scene] WASM 真出` vs `[scene] WASM 兜底→ TS 镜像`).
 */
export function themeToSceneWithFallback(
    mod: SceneGenWasmModule | null,
    theme: ThemeInput,
): ThemeToSceneOutcome {
    const wasmResult = callThemeToScene(mod, theme);
    if (wasmResult !== null) {
        return { blueprint: wasmResult, source: 'wasm' };
    }
    return { blueprint: themeToSceneTs(theme), source: 'ts-fallback' };
}
