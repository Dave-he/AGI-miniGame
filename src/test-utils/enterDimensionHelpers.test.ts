/**
 * Round 90 — `enterDimensionHelpers` test-utils tests.
 *
 * Locks the surface of the three round-83/84/89 e2e helpers
 * (`enterDimensionWithStub`, `enterDimensionWithFailingWasm`,
 * `enterAtomWithStub`) plus the `makeBridgeBlueprint` factory
 * they share. Mirrors the round-82 `sceneGenWasmStub.test.ts`
 * pattern: each helper is a load-bearing piece of test
 * infrastructure that N describe blocks in `main.test.ts`
 * depend on. A bug in the helper (e.g. `enterDimensionWithStub`
 * accidentally stubs `setLastSceneEventChain` and short-
 * circuits the round-83 rollback rehydrate test) would
 * cascade into N confusing failures.
 *
 * **Why a stand-alone file** (not just the round-90 in-line
 * assertions in `main.test.ts`):
 *   1. The helpers' value proposition is the side-effect
 *      surface. Asserting that the surface stays correct in
 *      isolation catches regressions before the e2e tests
 *      run.
 *   2. The asymmetry between `enterDimensionWithStub` and
 *      `enterDimensionWithFailingWasm` (one stubs
 *      `setLastSceneEventChain`, the other doesn't) is
 *      load-bearing. The round-83 + round-84 tests rely on
 *      it; this file pins the asymmetry byte-identically.
 *   3. The `enterAtomWithStub` "no HUD stubs" rule is what
 *      makes the round-89 `setLastBiomeAccent` test
 *      observable. A future "let's also stub HUD setters
 *      for symmetry" refactor would silently break the
 *      round-89 wiring assertion.
 *
 * **Test strategy** (mirrors round-82):
 *   - Build a fresh `App` per test via the `makeApp` /
 *     `makeRefs` pattern from `main.test.ts`.
 *   - For each helper, assert: (a) the helper runs to
 *     completion, (b) the expected side-effect spies were
 *     installed, (c) the unexpected spies were NOT
 *     installed.
 *   - Don't repeat the App-level behavioral assertions
 *     (those live in `main.test.ts`). This file is
 *     about the *surface*, not the *semantics*.
 */

import { App } from '../main';
import { makeWasmStub } from './sceneGenWasmStub';
import {
    enterDimensionWithStub,
    enterDimensionWithFailingWasm,
    enterAtomWithStub,
    makeBridgeBlueprint,
} from './enterDimensionHelpers';

// ---------------------------------------------------------------------------
// Minimal App construction (mirrors the `makeApp`/`makeRefs` pair
// in `main.test.ts` lines 63-81). Kept local so this file is
// self-contained and a future change to `main.test.ts`'s
// `makeApp` doesn't silently drag this file along.
// ---------------------------------------------------------------------------

interface AppRefsLike {
    canvas: HTMLCanvasElement;
    hudRoot: HTMLElement;
    progressionRoot: HTMLElement;
    economyRoot: HTMLElement;
    epochRoot: HTMLElement;
}

function makeRefs(): AppRefsLike {
    const canvas = document.createElement('canvas');
    canvas.id = 'agi-canvas';
    const hudRoot = document.createElement('div');
    hudRoot.id = 'hud-root';
    const progressionRoot = document.createElement('div');
    progressionRoot.id = 'progression-root';
    const economyRoot = document.createElement('div');
    economyRoot.id = 'economy-root';
    const epochRoot = document.createElement('div');
    epochRoot.id = 'epoch-root';
    return { canvas, hudRoot, progressionRoot, economyRoot, epochRoot };
}

function makeApp(): App {
    return new App(makeRefs());
}

// ---------------------------------------------------------------------------
// `makeBridgeBlueprint` — the shared fixture. The defaults are what
// the round-80 / round-83 / round-84 / round-89 e2e tests all depend
// on. A typo in the default `id` template or a missing
// `theme.colorPalette` field would silently propagate to N tests.
// ---------------------------------------------------------------------------

describe('makeBridgeBlueprint — defaults (round 90)', () => {
    test('returns_bridge_blueprint_with_visualStyle_and_musicMood_in_theme', () => {
        const bp = makeBridgeBlueprint(42, 'cyberpunk', 'pulse');
        expect(bp.theme.visualStyle).toBe('cyberpunk');
        expect(bp.theme.musicMood).toBe('pulse');
        // The id template embeds visualStyle + seed + rationaleTag
        // — a regression here would break the round-80 seed
        // divergence assertions (different seeds → different
        // ids, no two tests collide).
        expect(bp.id).toBe('dim_cyberpunk_42_r90');
        expect(bp.name).toBe('e2e r90 cyberpunk');
    });

    test('rationaleTag_changes_id_and_name_so_test_scenarios_dont_collide', () => {
        const a = makeBridgeBlueprint(1, 'fantasy', 'epic', 'a');
        const b = makeBridgeBlueprint(1, 'fantasy', 'epic', 'b');
        // Same (seed, visualStyle, musicMood) but different
        // rationaleTag → different id, so two tests running in
        // the same jest worker can't accidentally share
        // blueprint state.
        expect(a.id).not.toBe(b.id);
        expect(a.name).not.toBe(b.name);
    });

    test('atomIds_includes_tower_defense_so_round65_keyboard_jump_works', () => {
        // The round-65 keyboard 1-8 jump path (`enterAtom`) and
        // the round-83 / round-89 stub paths all dispatch on
        // `atomIds.includes('tower_defense')`. A regression
        // that drops it would 404 the keyboard jump.
        const bp = makeBridgeBlueprint(7, 'desert', 'tense');
        expect(bp.atomIds).toContain('tower_defense');
    });

    test('colorPalette_is_three_hex_strings_for_round87_biome_accent_wiring', () => {
        // The round-87 `setLastBiomeAccent` wiring reads from
        // `getBiomeAtmosphere(biome).particleColor` (a 6-char
        // hex), not from the blueprint's colorPalette. But
        // the palette is what `getBiomeAtmosphere` falls back
        // to, so it must be a non-empty array of hex strings
        // (the e2e test reads at least the length to confirm
        // the blueprint isn't a stub of stubs).
        const bp = makeBridgeBlueprint(0, 'dungeon', 'melancholic');
        expect(bp.theme.colorPalette).toHaveLength(3);
        for (const c of bp.theme.colorPalette) {
            expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});

// ---------------------------------------------------------------------------
// `enterDimensionWithStub` (round 83) — drives `enterNewDimension`
// with a `makeWasmStub` configuration. Locks the "no
// `setLastSceneEventChain` stub" rule that the round-83 rollback
// rehydrate test depends on (the real `setLastSceneEventChain` write
// must run so the round-72 event chain persists + restores).
// ---------------------------------------------------------------------------

describe('enterDimensionWithStub — surface (round 90)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('calls_enterNewDimension_on_the_app', async () => {
        const app = makeApp();
        const spy = jest
            .spyOn(app as unknown as { enterNewDimension: () => Promise<void> }, 'enterNewDimension')
            .mockImplementation(async () => undefined);
        await enterDimensionWithStub(app, 1, 'cyberpunk', 'pulse');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    test('installs_bridge_planAndLoad_spy_returning_blueprint', async () => {
        const app = makeApp();
        const spy = jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'pre' },
                atomIds: ['tower_defense'],
                blueprint: makeBridgeBlueprint(1, 'cyberpunk', 'pulse', 'pre'),
                modules: [],
                seed: 1,
                configSource: 'wasm',
            }));
        // Capture the pre-stub reference so we can verify the
        // helper overwrites it (not the other way around).
        const before = spy.getMockImplementation();
        await enterDimensionWithStub(app, 2, 'cyberpunk', 'pulse');
        const after = spy.getMockImplementation();
        // The helper should have replaced the mock with its
        // own implementation. Different function references
        // is the load-bearing detail.
        expect(after).not.toBe(before);
    });

    test('installs_sceneGenWasm_with_makeWasmStub_shape', async () => {
        const app = makeApp();
        await enterDimensionWithStub(app, 1, 'fantasy', 'epic', {
            biomeId: 'neon-harbor',
            npcCount: 9,
        });
        const wasm = (app as unknown as { sceneGenWasm: ReturnType<typeof makeWasmStub> | null }).sceneGenWasm;
        expect(wasm).not.toBeNull();
        // The helper uses makeWasmStub, so calling
        // `theme_to_scene_json` should return the round-80
        // snake_case JSON. If a future refactor swaps the
        // factory, this assertion fails.
        const json = wasm!.theme_to_scene_json(JSON.stringify({
            visual_style: 'fantasy', music_mood: 'epic', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(json) as { biome_id: string; npc_count: number };
        expect(parsed.biome_id).toBe('neon-harbor');
        expect(parsed.npc_count).toBe(9);
    });

    test('does_not_stub_setLastSceneEventChain_so_round72_persists_for_rollback', async () => {
        // Critical anti-regression: the round-83 test
        // asserts on `worldState.lastSceneEventChain` after
        // a `rollbackToLastGood` call. If the helper stubs
        // `setLastSceneEventChain`, the persistence path
        // short-circuits and the rollback has no chain to
        // restore. Pin the asymmetry: this helper does NOT
        // stub it.
        const app = makeApp();
        await enterDimensionWithStub(app, 1, 'cyberpunk', 'pulse');
        // After the helper runs, `setLastSceneEventChain`
        // should still be a real method on the HUD (i.e.
        // no `jest.spyOn` was installed). We can probe
        // that by checking the method is still in its
        // original prototype.
        const hud = (app as unknown as { hud: { setLastSceneEventChain: unknown } }).hud;
        expect(typeof hud.setLastSceneEventChain).toBe('function');
        // And the helper did NOT replace it with a mock.
        // `jest.spyOn` would set a `.mock` property on the
        // spy; the real method has none. (We use a
        // structural check because the HUD class is
        // private.)
        const isMock = (hud.setLastSceneEventChain as { _isMockFunction?: boolean })._isMockFunction;
        expect(isMock).toBeFalsy();
    });

    test('stubs_setLastBiome_setMinimap_setLastSceneBlueprint_setNpcMindsSnapshot_hideRecoveryBanner', async () => {
        // The complement: these HUD setters ARE stubbed (the
        // round-83 test asserts on WorldState, not HUD). Pin
        // the symmetry side of the asymmetry.
        const app = makeApp();
        await enterDimensionWithStub(app, 1, 'cyberpunk', 'pulse');
        const hud = (app as unknown as { hud: Record<string, unknown> }).hud;
        for (const method of ['setLastBiome', 'setMinimap', 'setLastSceneBlueprint', 'setNpcMindsSnapshot', 'hideRecoveryBanner']) {
            const fn = hud[method] as { _isMockFunction?: boolean };
            expect(fn).toBeDefined();
            expect(fn._isMockFunction).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// `enterDimensionWithFailingWasm` (round 84) — same surface as
// `enterDimensionWithStub` but with a custom `theme_to_scene_json`
// failure and a `spyBag` of WorldState spies. The asymmetry vs
// `enterDimensionWithStub`: this helper DOES stub
// `setLastSceneEventChain` + `setBackupAvailable` (the round-72/53
// failure-path HUD writes are noise for the round-84 test) and
// DOES spy on `worldState.updateLastSceneBlueprintFull` (so the
// test asserts on the spy call, not the persisted state).
// ---------------------------------------------------------------------------

describe('enterDimensionWithFailingWasm — surface (round 90)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns_spyBag_with_updateLastSceneBlueprintFull_spy_called_once', async () => {
        const app = makeApp();
        const spyBag = await enterDimensionWithFailingWasm(
            app,
            1,
            () => JSON.stringify({ error: 'r90-helper-test' }),
        );
        expect(spyBag.updateLastSceneBlueprintFull).toBeDefined();
        // The TS-mirror fallback (round-48) writes exactly
        // once even when WASM fails. If a future refactor
        // double-writes (e.g. on the original WASM call AND
        // the fallback), the round-84 test's "called once"
        // assertion catches it.
        expect(spyBag.updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
    });

    test('overrides_theme_to_scene_json_with_failing_function', async () => {
        const app = makeApp();
        const failingFn = () => JSON.stringify({ error: 'r90-marker' });
        await enterDimensionWithFailingWasm(app, 1, failingFn);
        const wasm = (app as unknown as { sceneGenWasm: { theme_to_scene_json: () => string } }).sceneGenWasm;
        // The helper overrides `theme_to_scene_json` with
        // the failing function — calling it should return
        // the failure JSON, NOT the default makeWasmStub
        // output. This is the load-bearing detail: if a
        // refactor drops the `...makeWasmStub()` spread, the
        // override doesn't take.
        expect(wasm.theme_to_scene_json()).toBe(JSON.stringify({ error: 'r90-marker' }));
    });

    test('stubs_setLastSceneEventChain_and_setBackupAvailable_for_round72_53_noise', async () => {
        // Anti-regression complement: the round-84 test
        // asserts on the TS-mirror fallback's blueprint,
        // not on the round-72/53 HUD writes. The helper
        // stubs those setters so the test's HUD spy can
        // isolate `setLastBiomeAccent` etc. without
        // colliding with the event-chain / backup writes.
        const app = makeApp();
        await enterDimensionWithFailingWasm(app, 1, () => '{}');
        const hud = (app as unknown as { hud: Record<string, unknown> }).hud;
        for (const method of ['setLastSceneEventChain', 'setBackupAvailable']) {
            const fn = hud[method] as { _isMockFunction?: boolean };
            expect(fn).toBeDefined();
            expect(fn._isMockFunction).toBe(true);
        }
    });

    test('stubs_worldState_clearFailedSnapshot_for_round53_failure_path', async () => {
        // The round-53 failure path calls `clearFailedSnapshot`
        // to wipe the round-54 backup so the next dimension
        // doesn't try to roll back to a half-baked snapshot.
        // The helper stubs it so the test's `spyBag` assertion
        // doesn't double-count clear+write.
        const app = makeApp();
        const spyBag = await enterDimensionWithFailingWasm(app, 1, () => '{}');
        const worldState = (app as unknown as { worldState: { clearFailedSnapshot: { _isMockFunction?: boolean } } }).worldState;
        expect(worldState.clearFailedSnapshot._isMockFunction).toBe(true);
        // The `updateLastSceneBlueprintFull` spy is in the
        // bag, the `clearFailedSnapshot` spy is on the
        // WorldState. Both are observable.
        expect(spyBag.updateLastSceneBlueprintFull).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// `enterAtomWithStub` (round 89, renamed from `enterAtomAccentTest`).
// Drives a keyboard 1-8 jump via `enterAtom('tower_defense')`.
// The asymmetry vs `enterDimensionWithStub`: this helper does NOT
// stub HUD setters — the round-89 tests spy on the real HUD
// writes to assert on the round-87 `setLastBiomeAccent` wiring.
// ---------------------------------------------------------------------------

describe('enterAtomWithStub — surface (round 90)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('calls_enterAtom_tower_defense_on_the_app', async () => {
        const app = makeApp();
        const spy = jest
            .spyOn(app as unknown as { enterAtom: (atomId: string) => Promise<void> }, 'enterAtom')
            .mockImplementation(async () => undefined);
        await enterAtomWithStub(app, 1, 'cyberpunk', 'pulse');
        // The round-65 keyboard 1-8 jump path is hard-coded
        // to `tower_defense` in the helper — a regression
        // here would 404 the round-89 accent test.
        expect(spy).toHaveBeenCalledWith('tower_defense');
    });

    test('does_not_stub_HUD_setters_so_round87_setLastBiomeAccent_is_observable', async () => {
        // Critical anti-regression: the round-89 tests
        // install their own `setLastBiomeAccent` spy on the
        // real HUD. If the helper ALSO stubs it (e.g. for
        // "symmetry" with `enterDimensionWithStub`), the
        // round-89 test's spy is replaced and the assertion
        // sees zero calls. Pin the asymmetry.
        const app = makeApp();
        await enterAtomWithStub(app, 1, 'fantasy', 'mysterious', { biomeId: 'forest' });
        const hud = (app as unknown as { hud: Record<string, unknown> }).hud;
        for (const method of ['setLastBiome', 'setMinimap', 'setLastSceneBlueprint', 'setLastSceneEventChain', 'setNpcMindsSnapshot', 'hideRecoveryBanner', 'setLastBiomeAccent', 'setBackupAvailable']) {
            const fn = hud[method] as { _isMockFunction?: boolean } | undefined;
            // The helper doesn't install any HUD spies.
            // We accept either "method exists and is not a
            // mock" or "method doesn't exist on this App
            // version" — but a mock is never acceptable.
            if (fn !== undefined) {
                expect(fn._isMockFunction).toBeFalsy();
            }
        }
    });

    test('installs_sceneGenWasm_with_makeWasmStub_shape_for_biome_accent_test', async () => {
        // The round-89 test asserts on the forest biome's
        // particleColor (`#90c290`). The helper must use
        // `makeWasmStub` so `theme_to_scene_json` returns
        // the biome the test asked for. If a refactor
        // bypasses `makeWasmStub`, the biomeId defaults
        // to 'verdant-ruins' and the forest assertion
        // fails — but not because of the round-89 wiring.
        const app = makeApp();
        await enterAtomWithStub(app, 1, 'fantasy', 'mysterious', { biomeId: 'forest' });
        const wasm = (app as unknown as { sceneGenWasm: { theme_to_scene_json: (j: string) => string } | null }).sceneGenWasm;
        expect(wasm).not.toBeNull();
        const json = wasm!.theme_to_scene_json('{}');
        const parsed = JSON.parse(json) as { biome_id: string };
        expect(parsed.biome_id).toBe('forest');
    });

    test('installs_same_side_effect_stubs_as_enterDimensionWithStub', async () => {
        // Symmetry: scene/audio/npc side effects are
        // stubbed identically (so the test runs headless
        // regardless of which helper it picks). The only
        // asymmetry is the HUD-setter layer.
        const app = makeApp();
        await enterAtomWithStub(app, 1, 'cyberpunk', 'pulse');
        const scene = (app as unknown as { scene: Record<string, unknown> }).scene;
        const audio = (app as unknown as { audio: Record<string, unknown> }).audio;
        const npcMinds = (app as unknown as { npcMinds: Record<string, unknown> }).npcMinds;
        for (const [obj, method] of [
            [scene, 'renderWfcDungeon'],
            [scene, 'spawnNpcWave'],
            [scene, 'setBiomeAtmosphere'],
            [audio, 'setBiomeAmbient'],
            [audio, 'setBiomeSfx'],
            [npcMinds, 'loadFromSnapshots'],
            [npcMinds, 'clear'],
        ] as const) {
            const fn = obj[method] as { _isMockFunction?: boolean };
            expect(fn).toBeDefined();
            expect(fn._isMockFunction).toBe(true);
        }
    });
});
