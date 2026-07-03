/* tslint:disable */
/* eslint-disable */

/**
 * Round 51 — mood-aware generation config for the next dimension.
 *
 * `args_json` shape:
 * `{ player_level, recent_loss_count, mood{friendly,fear,trust},
 *   hint{min_atoms,max_atoms,reward_multiplier,
 *        base_difficulty_range_lo,base_difficulty_range_hi}, seed }`
 *
 * Returns `GenerationConfigJson` on success, `{"error":"..."}` on
 * failure. Never panics.
 */
export function build_generation_config_with_mood_json(args_json: string): string;

/**
 * Round 51 — FNV-1a-keyed 4th-sentence pick from the branch's pool.
 *
 * `args_json` shape: `{ branch: <u8>, blueprint_id: "<string>" }`.
 *
 * Returns `{sentence, branch, blueprint_id}` on success,
 * `{"error":"..."}` on failure (branch >= 3 / NEUTRAL has no pool).
 * Never panics.
 *
 * TS side note: the WASM path picks via `fnv1a(blueprint_id)`, while
 * the TS fallback uses `djb2(blueprint_id + '|' + branch)`. Both
 * produce valid pool entries; the difference is a known follow-up
 * (round 52 candidate: unify hash).
 */
export function mood_4th_sentence_for_json(args_json: string): string;

/**
 * Round 51 — mood → 3-color hex palette (FEAR / FRIENDLY / HOSTILE / NEUTRAL).
 *
 * `mood_json` shape: `{ friendly, fear, trust }`.
 *
 * Returns `PaletteJson` (`{colors: ["#X", "#Y", "#Z"]}`) on success,
 * `{"error":"..."}` on failure. Never panics.
 */
export function mood_palette_json(mood_json: string): string;

/**
 * Round 48 — canonical entry point for the AGI-miniGame TS layer.
 *
 * `theme_json` must be a JSON object with the shape
 * `{ visual_style, music_mood, difficulty, seed }`. The return is
 * either a `SceneBlueprintJson` JSON object on success or
 * `{ "error": "..." }` on failure (parse / unknown enum / serialize).
 * This shim never panics — failures are always surfaced as JSON.
 */
export function theme_to_scene_json(theme_json: string): string;

/**
 * Round 51 — health check. Bumped from `0.1.0-round48` to
 * `0.2.0-round51` to reflect the three new exports. The TS-side
 * `loadSceneGenWasm` checks the major version `0.2.0-round` prefix.
 */
export function wasm_module_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_generation_config_with_mood_json: (a: number, b: number) => [number, number];
    readonly mood_4th_sentence_for_json: (a: number, b: number) => [number, number];
    readonly mood_palette_json: (a: number, b: number) => [number, number];
    readonly theme_to_scene_json: (a: number, b: number) => [number, number];
    readonly wasm_module_version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
