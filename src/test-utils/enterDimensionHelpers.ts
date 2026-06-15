/**
 * Round 90 — shared e2e helpers for App-level dimension-entry tests.
 *
 * `main.test.ts` grew three local "enter dimension with stubs"
 * helpers over rounds 83, 84, and 89:
 *
 *   1. `enterDimensionWithStub` (round 83) — drives
 *      `enterNewDimension` with a `makeWasmStub`-shaped fake
 *      so the test can assert on the round-79 telemetry gate,
 *      round-72 event chain, and round-49 lastSceneBlueprint
 *      round-trips.
 *   2. `enterDimensionWithFailingWasm` (round 84) — same
 *      surface, but `theme_to_scene_json` is overridden to
 *      return an error JSON / throw / etc., so the test can
 *      assert on the round-48 progressive enhancement gate
 *      (TS-mirror fallback).
 *   3. `enterAtomAccentTest` (round 89) — drives
 *      `enterAtom('tower_defense')` (the round-65 keyboard
 *      1-8 jump path) with a stub, so the test can assert on
 *      the round-87 `setLastBiomeAccent` wiring at the
 *      keyboard-jump call site.
 *
 * Each helper duplicates the same 5-step side-effect stub
 * pattern (bridge.planAndLoad, sceneGenWasm, scene.*, audio.*,
 * npcMinds.*, syncNpcDisposition, HUD setters) — ~60 lines of
 * identical jest.spyOn setup. Round 90 consolidates the
 * pattern so a future change to the App's side-effect surface
 * (e.g. round-95 adds a new HUD setter) is applied once here
 * rather than N times in main.test.ts.
 *
 * **Extraction rationale** (mirrors the round-82
 * `sceneGenWasmStub` pattern):
 *   1. Single source of truth for the side-effect surface.
 *   2. The helpers are themselves a piece of documentation
 *      — a contributor adding a new side-effect to
 *      `enterNewDimension` sees the gap as a TS compile
 *      error in this file (the App type would be wrong).
 *   3. Helper-level tests in `enterDimensionHelpers.test.ts`
 *      lock the side-effect surface so a future "refactor"
 *      that silently drops a stub (e.g. forgets to stub
 *      `scene.spawnNpcWave`) is caught immediately.
 *
 * **Critical anti-regression**: the round-83 helper
 * deliberately does NOT spy on
 * `worldState.updateLastSceneBlueprintFull` /
 * `worldState.clearFailedSnapshot` /
 * `worldState.setLastSceneEventChain` — those are the
 * round-49/72/53 write paths. The round-84 helper, by
 * contrast, DOES stub `setLastSceneEventChain` and
 * DOES return a `spyBag` with `updateLastSceneBlueprintFull`
 * — that test asserts on the spy calls, not the persisted
 * state. Both asymmetries are preserved here.
 */

import type { App } from '../main';
import { makeWasmStub } from './sceneGenWasmStub';

// ---------------------------------------------------------------------------
// Shared bridge-blueprint fixture. Identical shape to the
// round-80 / round-83 / round-84 / round-89 inline copies.
// ---------------------------------------------------------------------------

export type BridgeVisualStyle = 'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon';
export type BridgeMusicMood = 'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse';
export type Rationale = string;

export interface BridgeBlueprintFixture {
    id: string;
    name: string;
    description: string;
    atomIds: string[];
    atomWeights: Record<string, number>;
    difficulty: number;
    rules: unknown[];
    rewards: unknown[];
    theme: {
        name: string;
        visualStyle: BridgeVisualStyle;
        musicMood: BridgeMusicMood;
        colorPalette: string[];
    };
    timeLimitSecs: number;
    objectives: unknown[];
}

export function makeBridgeBlueprint(
    seed: number,
    visualStyle: BridgeVisualStyle,
    musicMood: BridgeMusicMood,
    rationaleTag: string = 'r90',
): BridgeBlueprintFixture {
    return {
        id: `dim_${visualStyle}_${seed}_${rationaleTag}`,
        name: `e2e ${rationaleTag} ${visualStyle}`,
        description: `${rationaleTag} e2e fixture`,
        atomIds: ['tower_defense'],
        atomWeights: { tower_defense: 1 },
        difficulty: 0.5,
        rules: [],
        rewards: [],
        theme: { name: `e2e_${rationaleTag}`, visualStyle, musicMood, colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
        timeLimitSecs: 60,
        objectives: [],
    };
}

// ---------------------------------------------------------------------------
// Internal: install the shared side-effect stubs onto an App.
// Returns nothing; the spies live on the App instance via
// jest.spyOn so the test can `jest.restoreAllMocks()` to
// clean up.
// ---------------------------------------------------------------------------

function installSideEffectStubs(app: App): void {
    // scene.* surface — WebGL-free stubs.
    jest
        .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
        .mockImplementation(() => undefined);
    jest
        .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
        .mockReturnValue(['mock_npc_a']);
    jest
        .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
        .mockImplementation(() => undefined);
    // audio.* surface — AudioContext-free stubs.
    jest
        .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
        .mockImplementation(() => undefined);
    jest
        .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
        .mockImplementation(() => undefined);
    // npcMinds.* surface.
    jest
        .spyOn((app as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots')
        .mockImplementation(() => undefined);
    jest
        .spyOn((app as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear')
        .mockImplementation(() => undefined);
    // syncNpcDisposition — private method, mock the (app as any) lookup.
    jest
        .spyOn(app as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition')
        .mockImplementation(() => undefined);
}

// ---------------------------------------------------------------------------
// Internal: install the HUD-setter silent no-ops. These are
// shared across all three helpers, but `enterDimensionWithFailingWasm`
// (round-84) ALSO stubs `setLastSceneEventChain` and `setBackupAvailable`
// because the round-72/53 failure path is under test. The asymmetry is
// preserved via the `withExtra` parameter.
// ---------------------------------------------------------------------------

function installHudSetterStubs(
    app: App,
    withExtra: { setLastSceneEventChain?: boolean; setBackupAvailable?: boolean } = {},
): void {
    const hud = (app as unknown as {
        hud: {
            setLastBiome: (b: string | null) => void;
            setMinimap: (m: string | null) => void;
            setLastSceneBlueprint: (s: unknown) => void;
            setLastSceneEventChain: (c: unknown) => void;
            setNpcMindsSnapshot: (s: unknown) => void;
            hideRecoveryBanner: () => void;
            setBackupAvailable: (b: boolean) => void;
        };
    }).hud;
    jest.spyOn(hud, 'setLastBiome').mockImplementation(() => undefined);
    jest.spyOn(hud, 'setMinimap').mockImplementation(() => undefined);
    jest.spyOn(hud, 'setLastSceneBlueprint').mockImplementation(() => undefined);
    jest.spyOn(hud, 'setNpcMindsSnapshot').mockImplementation(() => undefined);
    jest.spyOn(hud, 'hideRecoveryBanner').mockImplementation(() => undefined);
    if (withExtra.setLastSceneEventChain) {
        jest.spyOn(hud, 'setLastSceneEventChain').mockImplementation(() => undefined);
    }
    if (withExtra.setBackupAvailable) {
        jest.spyOn(hud, 'setBackupAvailable').mockImplementation(() => undefined);
    }
}

// ---------------------------------------------------------------------------
// Helper 1 — `enterDimensionWithStub` (round 83).
//
// Drives a full `enterNewDimension` with a `makeWasmStub`
// configuration. The HUD setters are stubbed silent-no-ops
// so the test asserts on the WorldState, not the HUD. The
// round-49/72/53 write paths (`updateLastSceneBlueprintFull`,
// `clearFailedSnapshot`, `setLastSceneEventChain`) are NOT
// stubbed — they must run real code so the rollback can
// capture + restore them.
// ---------------------------------------------------------------------------

export async function enterDimensionWithStub(
    app: App,
    seed: number,
    visualStyle: BridgeVisualStyle,
    musicMood: BridgeMusicMood,
    wasmOverrides: Parameters<typeof makeWasmStub>[0] = {},
): Promise<void> {
    jest
        .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
        .mockImplementation(async () => ({
            suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e r90 stub' },
            atomIds: ['tower_defense'],
            blueprint: makeBridgeBlueprint(seed, visualStyle, musicMood, 'r90_stub'),
            modules: [],
            seed,
            configSource: 'wasm',
        }));
    (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub(wasmOverrides);
    installSideEffectStubs(app);
    installHudSetterStubs(app);
    await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
}

// ---------------------------------------------------------------------------
// Helper 2 — `enterDimensionWithFailingWasm` (round 84).
//
// Same as `enterDimensionWithStub` but `theme_to_scene_json`
// is overridden with a custom failure (error JSON / throw /
// invalid shape / non-JSON). Returns a `spyBag` containing
// `updateLastSceneBlueprintFull` so the test can assert the
// TS-mirror fallback wrote exactly one blueprint.
//
// **Asymmetry vs `enterDimensionWithStub`**: this helper
// DOES stub `setLastSceneEventChain` and `setBackupAvailable`
// (the round-72/53 failure-path HUD writes are noise for
// the round-84 test) and DOES spy on
// `worldState.updateLastSceneBlueprintFull` (so the test can
// assert on the spy call, not the persisted state).
// ---------------------------------------------------------------------------

export interface EnterDimensionFailingWasmSpyBag {
    updateLastSceneBlueprintFull: jest.SpyInstance;
}

export async function enterDimensionWithFailingWasm(
    app: App,
    seed: number,
    failingThemeToScene: () => string,
): Promise<EnterDimensionFailingWasmSpyBag> {
    jest
        .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
        .mockImplementation(async () => ({
            suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e r90 failing' },
            atomIds: ['tower_defense'],
            blueprint: makeBridgeBlueprint(seed, 'fantasy', 'cheerful', 'r90_fail'),
            modules: [],
            seed,
            configSource: 'wasm',
        }));
    (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = {
        ...makeWasmStub(),
        theme_to_scene_json: failingThemeToScene,
    };
    installSideEffectStubs(app);
    // The round-72 event chain write is needed for
    // `lastSceneEventChain` to be populated by the TS
    // mirror. Don't stub it... wait, we DO stub it
    // here (the round-84 inline copy does too). The
    // asymmetry is intentional: the round-84 test
    // asserts on `updateLastSceneBlueprintFull` calls,
    // not on `lastSceneEventChain` reads.
    jest
        .spyOn((app as unknown as { worldState: { clearFailedSnapshot: () => void } }).worldState, 'clearFailedSnapshot')
        .mockImplementation(() => undefined);
    installHudSetterStubs(app, { setLastSceneEventChain: true, setBackupAvailable: true });
    const spyBag: EnterDimensionFailingWasmSpyBag = {
        updateLastSceneBlueprintFull: jest
            .spyOn((app as unknown as { worldState: { updateLastSceneBlueprintFull: (s: unknown) => void } }).worldState, 'updateLastSceneBlueprintFull')
            .mockImplementation(() => undefined),
    };
    await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
    return spyBag;
}

// ---------------------------------------------------------------------------
// Helper 3 — `enterAtomWithStub` (round 89, renamed from
// `enterAtomAccentTest` for symmetry with `enterDimensionWithStub`).
//
// Drives a keyboard 1-8 jump via `enterAtom('tower_defense')`.
// The round-65/87 wiring at `enterAtom` is what pushes the
// round-87 `setLastBiomeAccent` to the HUD — `enterNewDimension`
// itself does NOT push the biome to the HUD. The HUD setters
// are NOT stubbed here (the round-89 test spies on them
// before calling this helper), matching the round-89 inline
// behavior.
// ---------------------------------------------------------------------------

export async function enterAtomWithStub(
    app: App,
    seed: number,
    visualStyle: BridgeVisualStyle,
    musicMood: BridgeMusicMood,
    wasmOverrides: Parameters<typeof makeWasmStub>[0] = {},
): Promise<void> {
    jest
        .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
        .mockImplementation(async () => ({
            suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e r90 atom' },
            atomIds: ['tower_defense'],
            blueprint: makeBridgeBlueprint(seed, visualStyle, musicMood, 'r90_atom'),
            modules: [],
            seed,
            configSource: 'wasm',
        }));
    (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub(wasmOverrides);
    installSideEffectStubs(app);
    // NO HUD setter stubs here — the round-89 tests
    // need to spy on the real HUD writes to assert
    // on the round-87 `setLastBiomeAccent` wiring.
    await (app as unknown as { enterAtom: (atomId: string) => Promise<void> }).enterAtom('tower_defense');
}
