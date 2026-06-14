/**
 * Round 82 — shared test-utils for the WASM scene-gen bridge.
 *
 * `main.test.ts` (round 80) grew a 4-function `makeWasmStub()`
 * factory inline to drive e2e tests for the bridge →
 * `themeToScene` → WorldState + HUD flow. The factory is
 * ~60 lines of code and gets reused for every future test
 * that needs a `SceneGenWasmModule`-shaped fake (the
 * `enterNewDimension` happy path, the `loadGame` rehydrate
 * path, the rollback-resync path, etc.). Copy-pasting it
 * into every describe block would be a maintenance burden:
 * a future change to the WASM output shape (e.g. round-90
 * adds a new field to `theme_to_scene_json`) would have to
 * be applied in N places, and the e2e tests would silently
 * disagree on what the stub returns.
 *
 * **Extraction rationale** (mirrors the round-75/76
 * "WIP 清理模板复用" pattern):
 *   1. Single source of truth for the stub shape. A test
 *      that needs "WASM succeeded" + "WASM failed" can
 *      `import { makeWasmStub }` and tweak the override.
 *   2. The stub is itself a piece of documentation — the
 *      override type lists every field `theme_to_scene_json`
 *      can return, so a contributor adding a new field
 *      to the real WASM export sees the gap as a TS compile
 *      error.
 *   3. Helper-level tests in `sceneGenWasmStub.test.ts`
 *      (this file's companion) lock the stub shape byte-
 *      identically, so a refactor that "accidentally" changes
 *      the stub output (e.g. shuffles the default event
 *      chain) is caught immediately.
 *
 * **Why a stand-alone module** (not a jest mock):
 *   - The stub returns deterministic JSON the App persists
 *     and the HUD reads back. A pure function (not
 *     `jest.fn()`) makes the output visible in stack traces
 *     and is easier to extend (e.g. accept a custom event
 *     chain without re-mocking).
 *   - The stub is independent of the production
 *     `SceneGenWasm.ts` code, so it can be edited freely
 *     to model new e2e scenarios without touching the
 *     real WASM wrapper.
 *
 * **Version stamp**: the stub returns
 * `0.2.0-round80-e2e` for `wasm_module_version()` so
 * `loadSceneGenWasm`'s version guard accepts it (the guard
 * checks for `0.2.0-round*`). Bumping the major version on
 * the real WASM module would require updating this stamp
 * too — the helper-level test pins it.
 *
 * **Test strategy**:
 *   - `sceneGenWasmStub.test.ts` (this file's companion)
 *     locks the default values, the override semantics, the
 *     version stamp, and the snake_case / camelCase shape.
 *   - `main.test.ts` (round 80) imports the helper and
 *     drives the 5 e2e tests in its
 *     `App — round 80 e2e: bridge → themeToScene → WorldState
 *     + HUD` describe block.
 */

import type { SceneGenWasmModule } from '../ai/SceneGenWasm';

// ---------------------------------------------------------------------------
// Override type — what the test can tweak per call site. Mirrors the
// subset of `SceneBlueprint` fields `theme_to_scene_json` actually
// returns (plus a few extras used by the round-80 fixtures).
// ---------------------------------------------------------------------------

/**
 * Optional overrides for the round-80 stub. Every field corresponds
 * to a snake_case key the WASM `theme_to_scene_json` returns. The
 * default values match the round-80 e2e fixtures (the "happy path"
 * that drives the App's WASM branch).
 */
export interface SceneGenWasmStubOverrides {
    wfcTileWeights?: [number, number, number, number, number, number, number, number];
    biomeId?: string;
    baseNpcDensity?: number;
    npcDensity?: number;
    npcCount?: number;
    eventChain?: Array<{ kind: string; delaySecs: number; payload: string }>;
    musicBpm?: number;
    npcArchetypeHints?: string[];
}

// ---------------------------------------------------------------------------
// The factory. Returns a `SceneGenWasmModule`-shaped object with all
// 4 functions stubbed. The default `theme_to_scene_json` output is
// byte-identical to the round-80 inline stub.
// ---------------------------------------------------------------------------

/**
 * Build a stand-alone `SceneGenWasmModule` stub for jest tests. The
 * stub returns deterministic JSON the App can persist + the HUD can
 * read back, with overridable scalars (so a single test can model
 * "npcCount=7, bpm=140" without rewriting the whole fixture).
 *
 * **Version stamp**: the stub returns `0.2.0-round80-e2e` so
 * `loadSceneGenWasm`'s `0.2.0-round*` guard accepts it. Bump the
 * real WASM version → bump this stamp → the helper-level test fails.
 *
 * **Snake_case shape**: the stub emits `theme_to_scene_json` in the
 * exact snake_case shape the real WASM module produces
 * (`wfc_tile_weights`, `biome_id`, `event_chain` with `delay_secs`,
 * etc.). `callThemeToScene` translates it to camelCase, so the App
 * side sees the same shape it would in production.
 */
export function makeWasmStub(overrides: SceneGenWasmStubOverrides = {}): SceneGenWasmModule {
    return {
        theme_to_scene_json: (themeJson: string) => {
            const theme = JSON.parse(themeJson);
            return JSON.stringify({
                wfc_tile_weights: overrides.wfcTileWeights ?? [5, 4, 2, 2, 1, 0, 2, 1],
                biome_id: overrides.biomeId ?? 'verdant-ruins',
                base_npc_density: overrides.baseNpcDensity ?? 0.4,
                npc_density: overrides.npcDensity ?? 0.4,
                npc_count: overrides.npcCount ?? 6,
                event_chain: overrides.eventChain ?? [
                    { kind: 'spawn_wave', delay_secs: 5, payload: 'wasm_spawn_wave_0' },
                    { kind: 'echo_lore', delay_secs: 13, payload: 'wasm_echo_lore_1' },
                    { kind: 'treasure_drop', delay_secs: 21, payload: 'wasm_treasure_drop_2' },
                ],
                music_bpm: overrides.musicBpm ?? 110,
                npc_archetype_hints: overrides.npcArchetypeHints ?? ['mage', 'beast'],
                _echo: { visual_style: theme.visual_style, seed: theme.seed },
            });
        },
        wasm_module_version: () => '0.2.0-round80-e2e',
        build_generation_config_with_mood_json: (argsJson: string) => {
            const args = JSON.parse(argsJson);
            return JSON.stringify({
                min_atoms: 1,
                max_atoms: 2,
                difficulty_range_lo: 0.3,
                difficulty_range_hi: 0.8,
                player_level: args.player_level,
                preferred_types: ['tower_defense'],
                excluded_types: [],
                reward_multiplier: 1.0,
            });
        },
        mood_palette_json: (moodJson: string) => {
            const mood = JSON.parse(moodJson);
            // Emit a deterministic 3-color palette derived from the
            // mood. The hue mix is intentionally silly (friendly → R,
            // fear → G, trust → B) — the App only checks the array
            // length, not the actual colors.
            const r = Math.floor(mood.friendly * 255);
            const g = Math.floor(mood.fear * 255);
            const b = Math.floor(mood.trust * 255);
            return JSON.stringify({
                colors: [
                    `#${r.toString(16).padStart(2, '0')}0000`,
                    `#00${g.toString(16).padStart(2, '0')}00`,
                    `#0000${b.toString(16).padStart(2, '0')}`,
                ],
            });
        },
        mood_4th_sentence_for_json: (_argsJson: string) => JSON.stringify({ sentence: 'wasm-4th' }),
    };
}
