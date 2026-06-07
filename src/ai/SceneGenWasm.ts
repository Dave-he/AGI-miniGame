/**
 * Round 48 → 51 — WASM bridge for `themeToScene`,
 * `buildGenerationConfigWithMood`, `moodPalette`, and
 * `mood4thSentenceFor`.
 *
 * The canonical implementation lives in cocos4-rust:
 *   `src/agi_minigame/wasm_exports.rs::{theme_to_scene_json,
 *    build_generation_config_with_mood_json, mood_palette_json,
 *    mood_4th_sentence_for_json}`
 *
 * This module loads the compiled `wasm-pkg/cocos4_rust.js` ES module
 * (produced by `cocos4-rust/scripts/build-wasm.sh`), calls the WASM
 * function via a JSON bridge, and parses the result back into a
 * canonical shape that matches the existing TS mirror.
 *
 * On any failure (module missing, load error, wasm threw, error JSON
 * returned), the wrapper returns `null` and the caller is expected
 * to fall back to the TS mirror. This keeps WASM as a *progressive
 * enhancement* rather than a hard dependency — pages where the .wasm
 * fails to fetch still play.
 *
 * Round 51 notes:
 *   - The 4th-sentence WASM helper uses `fnv1a` to pick from the
 *     branch pool; the TS fallback uses `djb2`. Both produce valid
 *     pool entries, so the player never sees an empty slot. The
 *     divergence is a known round-52 follow-up (unify hash).
 *   - The version stamp `wasm_module_version()` is bumped from
 *     `0.1.0-round48` to `0.2.0-round51`; the `loadSceneGenWasm`
 *     guard matches the new major version.
 *
 * Test strategy: `loadSceneGenWasm` accepts an optional `loader`
 * parameter so jest tests can inject a stub module without going
 * through dynamic-import + jsdom WebAssembly machinery. Real
 * browser smoke is done via `npm run dev` (manual, PRD round 48
 * acceptance #11 + round 51 acceptance #9).
 */

import type { SceneBlueprint, ThemeInput, Palette, GenerationHint } from './SceneGen';
import { themeToScene as themeToSceneTs } from './SceneGen';
import { buildGenerationConfigWithMood as buildGenerationConfigWithMoodTs } from './SceneGen';
import { moodPalette as moodPaletteTs } from './SceneGen';
import type { NpcDisposition } from '../world/NpcMind';
import type { GenerationConfig } from './AIEngine';

// ---------------------------------------------------------------------------
// Public surface — what the AIBridge / AIEngine / NarrationEngine consume.
// ---------------------------------------------------------------------------

/** Subset of `wasm-pkg/cocos4_rust.js` the AGI-miniGame layer cares about. */
export interface SceneGenWasmModule {
    theme_to_scene_json(themeJson: string): string;
    wasm_module_version(): string;
    // Round 51 — three additional exports
    build_generation_config_with_mood_json(argsJson: string): string;
    mood_palette_json(moodJson: string): string;
    mood_4th_sentence_for_json(argsJson: string): string;
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
        if (typeof v !== 'string' || !v.startsWith('0.2.0-round')) {
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

// ---------------------------------------------------------------------------
// Round 51 — pure helpers for the three new exports. Each mirrors
// `callThemeToScene`: stringify args, call the WASM fn, parse the
// JSON, translate snake_case → camelCase, return null on any failure.
// ---------------------------------------------------------------------------

/**
 * Round 51 — invoke the WASM `build_generation_config_with_mood_json`
 * via the JSON bridge. Returns a `GenerationConfig` (matching the
 * `AIEngine.ts` shape) on success, `null` on any failure.
 */
export function callBuildGenerationConfigWithMood(
    mod: SceneGenWasmModule | null,
    playerLevel: number,
    recentLossCount: number,
    mood: NpcDisposition,
    hint: GenerationHint,
    seed: number,
): GenerationConfig | null {
    if (!mod) return null;
    try {
        const argsJson = JSON.stringify({
            player_level: playerLevel,
            recent_loss_count: recentLossCount,
            mood: { friendly: mood.friendly, fear: mood.fear, trust: mood.trust },
            hint: {
                min_atoms: hint.minAtoms,
                max_atoms: hint.maxAtoms,
                reward_multiplier: hint.rewardMultiplier,
                base_difficulty_range_lo: hint.baseDifficultyRange[0],
                base_difficulty_range_hi: hint.baseDifficultyRange[1],
            },
            seed,
        });
        const outJson = mod.build_generation_config_with_mood_json(argsJson);
        const parsed = JSON.parse(outJson);
        if (parsed && typeof parsed.error === 'string') {
            return null;
        }
        if (!parsed || typeof parsed.difficulty_range_lo !== 'number') {
            return null;
        }
        // The TS `GenerationConfig` interface is a subset of the Rust
        // struct (no `allow_composite` or `seed` fields). The WASM
        // output still includes them on the wire, but the TS side
        // drops them — `seed` is owned by the WorldState layer
        // (round 50) and `allowComposite` is a generator hint that
        // isn't read by the TS `GameplayCombinerAI`.
        return {
            minAtoms: parsed.min_atoms,
            maxAtoms: parsed.max_atoms,
            difficultyRange: [parsed.difficulty_range_lo, parsed.difficulty_range_hi],
            playerLevel: parsed.player_level,
            preferredTypes: Array.isArray(parsed.preferred_types) ? parsed.preferred_types : [],
            excludedTypes: Array.isArray(parsed.excluded_types) ? parsed.excluded_types : [],
            rewardMultiplier: parsed.reward_multiplier,
        };
    } catch {
        return null;
    }
}

/**
 * Round 51 — invoke the WASM `mood_palette_json` via the JSON bridge.
 * Returns a 3-hex-string `Palette` on success, `null` on any failure.
 */
export function callMoodPalette(
    mod: SceneGenWasmModule | null,
    mood: NpcDisposition,
): Palette | null {
    if (!mod) return null;
    try {
        const moodJson = JSON.stringify({
            friendly: mood.friendly,
            fear: mood.fear,
            trust: mood.trust,
        });
        const outJson = mod.mood_palette_json(moodJson);
        const parsed = JSON.parse(outJson);
        if (parsed && typeof parsed.error === 'string') {
            return null;
        }
        if (!parsed || !Array.isArray(parsed.colors) || parsed.colors.length !== 3) {
            return null;
        }
        return parsed.colors as Palette;
    } catch {
        return null;
    }
}

/**
 * Round 51 — invoke the WASM `mood_4th_sentence_for_json` via the
 * JSON bridge. Returns the picked 4th-sentence string on success,
 * `null` on any failure.
 *
 * Note: the WASM path picks via `fnv1a(blueprint_id)`, while the TS
 * fallback uses `djb2(blueprint_id + '|' + branch)`. Both produce
 * valid pool entries, so the player never sees an empty slot. The
 * divergence is a known round-52 follow-up.
 *
 * `branch` accepts any `u8` value (0..=255); values >= 3 fall through
 * to the NEUTRAL branch which has no 4th-sentence pool, so the
 * bridge returns `null` in that case. The TS-side type is
 * `number` for that reason.
 */
export function callMood4thSentenceFor(
    mod: SceneGenWasmModule | null,
    branch: number,
    blueprintId: string,
): string | null {
    if (!mod) return null;
    try {
        const argsJson = JSON.stringify({ branch, blueprint_id: blueprintId });
        const outJson = mod.mood_4th_sentence_for_json(argsJson);
        const parsed = JSON.parse(outJson);
        if (parsed && typeof parsed.error === 'string') {
            return null;
        }
        if (!parsed || typeof parsed.sentence !== 'string') {
            return null;
        }
        return parsed.sentence;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Round 51 — TS-side fallback helpers. These wrap the existing
// SceneGen.ts / NarrationEngine.ts mirrors with the same shape the
// WASM helpers return, so the WithFallback wrappers below are
// 1-to-1 symmetric.
// ---------------------------------------------------------------------------

/** TS-side fallback for `buildGenerationConfigWithMood`. */
export function buildGenerationConfigWithMoodFallback(
    playerLevel: number,
    recentLossCount: number,
    mood: NpcDisposition,
    hint: GenerationHint,
    seed: number,
): GenerationConfig {
    return buildGenerationConfigWithMoodTs(playerLevel, recentLossCount, mood, hint, seed);
}

/** TS-side fallback for `moodPalette`. */
export function moodPaletteFallback(mood: NpcDisposition): Palette {
    return moodPaletteTs(mood);
}

// ---------------------------------------------------------------------------
// Round 51 — three new `WithFallback` one-call wrappers, mirroring
// the round-48 `themeToSceneWithFallback` shape. The caller gets a
// `{ ..., source: 'wasm' | 'ts-fallback' }` outcome so the HUD can
// log which branch ran.
//
// The 4th-sentence variant is left out of these wrappers because
// the TS-side `djb2`-based pick lives inside `NarrationEngine.narrate`
// and is not exposed as a stand-alone helper yet (round-52 follow-up:
// extract `mood4thSentenceFor(branch, id)` from NarrationEngine for
// symmetry). For now the WASM path is wired directly inside
// NarrationEngine via `callMood4thSentenceFor`.
// ---------------------------------------------------------------------------

/** Outcome of a `buildGenerationConfigWithMoodWithFallback` call. */
export interface BuildGenerationConfigWithMoodOutcome {
    config: GenerationConfig;
    source: 'wasm' | 'ts-fallback';
}

/** Outcome of a `moodPaletteWithFallback` call. */
export interface MoodPaletteOutcome {
    palette: Palette;
    source: 'wasm' | 'ts-fallback';
}

/**
 * Round 51 — try WASM first; on null result, fall back to the TS
 * mirror. Always returns a `GenerationConfig`.
 */
export function buildGenerationConfigWithMoodWithFallback(
    mod: SceneGenWasmModule | null,
    playerLevel: number,
    recentLossCount: number,
    mood: NpcDisposition,
    hint: GenerationHint,
    seed: number,
): BuildGenerationConfigWithMoodOutcome {
    const wasmResult = callBuildGenerationConfigWithMood(
        mod, playerLevel, recentLossCount, mood, hint, seed,
    );
    if (wasmResult !== null) {
        return { config: wasmResult, source: 'wasm' };
    }
    return {
        config: buildGenerationConfigWithMoodFallback(
            playerLevel, recentLossCount, mood, hint, seed,
        ),
        source: 'ts-fallback',
    };
}

/**
 * Round 51 — try WASM first; on null result, fall back to the TS
 * mirror. Always returns a `Palette`.
 */
export function moodPaletteWithFallback(
    mod: SceneGenWasmModule | null,
    mood: NpcDisposition,
): MoodPaletteOutcome {
    const wasmResult = callMoodPalette(mod, mood);
    if (wasmResult !== null) {
        return { palette: wasmResult, source: 'wasm' };
    }
    return { palette: moodPaletteFallback(mood), source: 'ts-fallback' };
}
