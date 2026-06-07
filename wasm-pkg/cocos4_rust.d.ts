/* tslint:disable */
/* eslint-disable */

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
 * Round 48 — health check. Returns the version stamp the AGI-miniGame
 * game layer uses to confirm the WASM module loaded the right build.
 */
export function wasm_module_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
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
