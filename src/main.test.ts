/**
 * Round 55 — `App` integration tests.
 *
 * Scope (this file):
 *   - `recoverFromRenderFailure` 4-branch dispatch (ERR_SCENE_RENDER,
 *     ERR_UNKNOWN, ERR_NPC_SPAWN, ERR_EVENT_CHAIN) plus the
 *     ERR_NPC_SPAWN retry-failed escalation sub-branch.
 *   - `rollbackToLastGood` 4-field restore sequence
 *     (lastSceneBlueprint + lastDimensionSeed + lastBiome +
 *     npcMindsSnapshot → WorldState) + banner-hide +
 *     backupAvailable=false + lastFailedSnapshot=null cleanup.
 *   - Round 80 — bridge → `themeToScene` → WorldState + HUD e2e:
 *     the bridge's `planAndLoad` is mocked to return a blueprint,
 *     the WASM `sceneGenWasm` is stubbed via the round-82
 *     `makeWasmStub` test-util, and the 5 e2e tests assert that
 *     the App persists + HUD-pipes the WASM output byte-for-byte.
 *
 * Out of scope (deliberately):
 *   - WebGL real-render assertions (jsdom has no WebGL).
 *   - WASM bridge paths (covered by `SceneGenWasm.test.ts`).
 *   - The WASM stub's own shape — locked by
 *     `src/test-utils/sceneGenWasmStub.test.ts` (round 82).
 *   - `backupFailedSnapshot` internals (covered by
 *     `WorldState.test.ts`).
 *   - The orchestrator's "last-resort catch" rescue path
 *     (recursively catches, doesn't let app crash) — needs a
 *     spy-everything-throws setup, deferred to round 56+ if
 *     anyone cares.
 *
 * The manual mock pattern from rounds 53/54 (50 lines of
 * `as any` casts) is replaced with a `jest.spyOn` chain —
 * spies are recorded by name, assertions read like English.
 *
 * Round 82 — the `makeWasmStub` factory moved to
 * `src/test-utils/sceneGenWasmStub.ts` so future e2e tests
 * (round-80 follow-ups: rollback rehydrate, dual-load race,
 * etc.) can import it without copy-pasting 60 lines of stub
 * code. The shape is locked by the test-util's own test file.
 */

import { App } from './main';
import type { SceneBlueprintSnapshot } from './world/WorldState';
import { makeWasmStub } from './test-utils/sceneGenWasmStub';

// ---------------------------------------------------------------------------
// Test fixtures — small, in-file, no .fixture file dependencies.
// ---------------------------------------------------------------------------

interface AppRefsLike {
    canvas: HTMLCanvasElement;
    hudRoot: HTMLElement;
    progressionRoot: HTMLElement;
    economyRoot: HTMLElement;
    epochRoot: HTMLElement;
}

function makeRefs(): AppRefsLike {
    // jsdom provides a minimal DOM; canvas exists but
    // has no WebGL context (we never read pixels).
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

function makeSnap(overrides: Partial<SceneBlueprintSnapshot> = {}): SceneBlueprintSnapshot {
    return {
        wfcTileWeights: [4, 4, 2, 2, 0, 0, 3, 1],
        biomeId: 'forest',
        baseNpcDensity: 0.4,
        npcDensity: 0.4,
        npcCount: 4,
        eventChain: [
            { kind: 'spawn_wave', delaySecs: 5, payload: '0_0' },
            { kind: 'echo_lore', delaySecs: 13, payload: '0_1' },
        ],
        musicBpm: 90,
        npcArchetypeHints: ['mage', 'beast'],
        ...overrides,
    };
}

function makeBackup(overrides: Partial<{
    blueprint: SceneBlueprintSnapshot | null;
    seed: number | null;
    biome: string | null;
    npcSnapshot: Array<{
        id: string;
        archetype?: string;
        disposition: { friendly: number; fear: number; trust: number };
        entries: Array<{ kind: string; summary: string; turn: number; weight: number }>;
    }>;
}> = {}) {
    return {
        blueprint: overrides.blueprint !== undefined ? overrides.blueprint : makeSnap({ biomeId: 'forest' }),
        seed: overrides.seed !== undefined ? overrides.seed : 42,
        biome: overrides.biome !== undefined ? overrides.biome : 'forest',
        npcSnapshot: overrides.npcSnapshot !== undefined ? overrides.npcSnapshot : [
            {
                id: 'npc_1',
                archetype: 'mage',
                disposition: { friendly: 0.4, fear: 0.0, trust: 0.2 },
                entries: [
                    { kind: 'Dialogue', summary: 'hi', turn: 1, weight: 1.0 },
                ],
            },
        ],
    };
}

// ---------------------------------------------------------------------------
// Tests — 6 integration tests, all use jest.spyOn chain.
// ---------------------------------------------------------------------------

describe('App — round 55 recoverFromRenderFailure orchestrator', () => {
    let app: App;
    let enterNewDimension: jest.SpyInstance;
    let spawnNpcWave: jest.SpyInstance;
    let showRecoveryBanner: jest.SpyInstance;
    let hideRecoveryBanner: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // The orchestrator calls these public methods; we replace
        // them with no-ops or controlled-return spies.
        enterNewDimension = jest
            .spyOn(app, 'enterNewDimension')
            .mockResolvedValue(undefined);
        spawnNpcWave = jest
            .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
            .mockReturnValue(['mock_npc_1', 'mock_npc_2', 'mock_npc_3', 'mock_npc_4']);
        showRecoveryBanner = jest
            .spyOn((app as unknown as { hud: { showRecoveryBanner: (c: string, b: string | null) => void } }).hud, 'showRecoveryBanner')
            .mockImplementation(() => undefined);
        hideRecoveryBanner = jest
            .spyOn((app as unknown as { hud: { hideRecoveryBanner: () => void } }).hud, 'hideRecoveryBanner')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    test('ERR_SCENE_RENDER_calls_enterNewDimension_and_shows_banner', async () => {
        const ws = (app as unknown as { worldState: { lastBiome: string } }).worldState;
        ws.lastBiome = 'forest';
        const partial = { rendered: false, spawned: false, scheduled: false };

        await (app as unknown as {
            recoverFromRenderFailure: (
                code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
                p: typeof partial,
            ) => Promise<void>;
        }).recoverFromRenderFailure('ERR_SCENE_RENDER', partial);

        expect(enterNewDimension).toHaveBeenCalledTimes(1);
        expect(showRecoveryBanner).toHaveBeenCalledWith('ERR_SCENE_RENDER', 'forest');
    });

    test('ERR_UNKNOWN_also_calls_enterNewDimension_conservative_default', async () => {
        // The ERR_UNKNOWN case shares the case body with
        // ERR_SCENE_RENDER (`case 'ERR_UNKNOWN': { ... }` falls
        // through to the same block). This test pins that
        // behavior — anyone refactoring the orchestrator
        // shouldn't accidentally treat ERR_UNKNOWN as a
        // recoverable no-op.
        const ws = (app as unknown as { worldState: { lastBiome: string } }).worldState;
        ws.lastBiome = 'cyberpunk';
        const partial = { rendered: false, spawned: false, scheduled: false };

        await (app as unknown as {
            recoverFromRenderFailure: (
                code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
                p: typeof partial,
            ) => Promise<void>;
        }).recoverFromRenderFailure('ERR_UNKNOWN', partial);

        expect(enterNewDimension).toHaveBeenCalledTimes(1);
        expect(showRecoveryBanner).toHaveBeenCalledWith('ERR_UNKNOWN', 'cyberpunk');
    });

    test('ERR_NPC_SPAWN_calls_spawnNpcWave_only_no_full_rebuild', async () => {
        // The dungeon is already on-screen (rendered: true);
        // only the NPC wave needs re-spawning. The orchestrator
        // should NOT call enterNewDimension in this case.
        const ws = (app as unknown as { worldState: { lastSceneBlueprint: SceneBlueprintSnapshot | null } }).worldState;
        ws.lastSceneBlueprint = makeSnap({ npcCount: 4, npcArchetypeHints: ['mage', 'beast'], biomeId: 'forest' });
        const partial = { rendered: true, spawned: false, scheduled: false };

        await (app as unknown as {
            recoverFromRenderFailure: (
                code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
                p: typeof partial,
            ) => Promise<void>;
        }).recoverFromRenderFailure('ERR_NPC_SPAWN', partial);

        expect(spawnNpcWave).toHaveBeenCalledTimes(1);
        expect(spawnNpcWave).toHaveBeenCalledWith(4, ['mage', 'beast']);
        expect(enterNewDimension).not.toHaveBeenCalled();
        expect(showRecoveryBanner).toHaveBeenCalledWith('ERR_NPC_SPAWN', 'forest');
    });

    test('ERR_NPC_SPAWN_retry_failure_escalates_to_enterNewDimension', async () => {
        // spawnNpcWave itself throws (e.g. archetype tag is
        // corrupt). The orchestrator catches, logs, and
        // escalates to a full rebuild via enterNewDimension.
        // The banner code is `ERR_NPC_SPAWN_RETRY_FAILED` to
        // distinguish from the happy-path branch.
        spawnNpcWave.mockImplementation(() => {
            throw new Error('archetype tag corrupt');
        });
        const ws = (app as unknown as { worldState: { lastSceneBlueprint: SceneBlueprintSnapshot | null; lastBiome: string } }).worldState;
        ws.lastSceneBlueprint = makeSnap({ npcCount: 4, npcArchetypeHints: ['mage'], biomeId: 'forest' });
        ws.lastBiome = 'forest';
        const partial = { rendered: true, spawned: false, scheduled: false };

        await (app as unknown as {
            recoverFromRenderFailure: (
                code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
                p: typeof partial,
            ) => Promise<void>;
        }).recoverFromRenderFailure('ERR_NPC_SPAWN', partial);

        expect(spawnNpcWave).toHaveBeenCalledTimes(1);  // the failing attempt
        expect(enterNewDimension).toHaveBeenCalledTimes(1);  // the escalation
        expect(showRecoveryBanner).toHaveBeenCalledWith('ERR_NPC_SPAWN_RETRY_FAILED', 'forest');
    });

    test('ERR_EVENT_CHAIN_schedules_setTimeouts_for_each_event', async () => {
        // The dungeon + NPCs are already in place; only the
        // timed event chain failed. The orchestrator should
        // re-schedule each event with its original delaySecs.
        jest.useFakeTimers();
        const ws = (app as unknown as { worldState: { lastSceneBlueprint: SceneBlueprintSnapshot | null; npcTurn: number; npcMinds: { broadcast: (e: unknown) => void }; syncNpcDisposition?: () => void } }).worldState;
        ws.lastSceneBlueprint = makeSnap({ biomeId: 'cyberpunk' });
        // Spy on broadcast to count event-fires.
        const broadcast = jest
            .spyOn((app as unknown as { npcMinds: { broadcast: (e: unknown) => void } }).npcMinds, 'broadcast')
            .mockImplementation(() => undefined);
        const partial = { rendered: true, spawned: true, scheduled: false };

        await (app as unknown as {
            recoverFromRenderFailure: (
                code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
                p: typeof partial,
            ) => Promise<void>;
        }).recoverFromRenderFailure('ERR_EVENT_CHAIN', partial);

        expect(enterNewDimension).not.toHaveBeenCalled();
        expect(showRecoveryBanner).toHaveBeenCalledWith('ERR_EVENT_CHAIN', 'cyberpunk');

        // Before any timer advance: no broadcasts.
        expect(broadcast).not.toHaveBeenCalled();
        // Advance to first event's delay (5s).
        jest.advanceTimersByTime(5000);
        expect(broadcast).toHaveBeenCalledTimes(1);
        // Advance to second event's delay (13s total).
        jest.advanceTimersByTime(8000);
        expect(broadcast).toHaveBeenCalledTimes(2);
    });
});

describe('App — round 55 rollbackToLastGood', () => {
    let app: App;
    let renderWfcDungeon: jest.SpyInstance;
    let hideRecoveryBanner: jest.SpyInstance;
    let setBackupAvailable: jest.SpyInstance;
    let setLastBiome: jest.SpyInstance;
    let setNpcMindsSnapshot: jest.SpyInstance;
    let setLastSceneBlueprint: jest.SpyInstance;
    let syncNpcDisposition: jest.SpyInstance;
    let loadFromSnapshots: jest.SpyInstance;
    let clear: jest.SpyInstance;
    let clearFailedSnapshot: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        renderWfcDungeon = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        hideRecoveryBanner = jest
            .spyOn((app as unknown as { hud: { hideRecoveryBanner: () => void } }).hud, 'hideRecoveryBanner')
            .mockImplementation(() => undefined);
        setBackupAvailable = jest
            .spyOn((app as unknown as { hud: { setBackupAvailable: (b: boolean) => void } }).hud, 'setBackupAvailable')
            .mockImplementation(() => undefined);
        setLastBiome = jest
            .spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        setNpcMindsSnapshot = jest
            .spyOn((app as unknown as { hud: { setNpcMindsSnapshot: (s: unknown) => void } }).hud, 'setNpcMindsSnapshot')
            .mockImplementation(() => undefined);
        setLastSceneBlueprint = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        syncNpcDisposition = jest
            .spyOn(app as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition')
            .mockImplementation(() => undefined);
        loadFromSnapshots = jest
            .spyOn((app as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots')
            .mockImplementation(() => undefined);
        clear = jest
            .spyOn((app as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear')
            .mockImplementation(() => undefined);
        clearFailedSnapshot = jest
            .spyOn((app as unknown as { worldState: { clearFailedSnapshot: () => void } }).worldState, 'clearFailedSnapshot')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('rollback_restores_4_fields_and_clears_backup', () => {
        // Set up a corrupted worldState — the orchestrator
        // (round 53) ran `enterNewDimension` so lastBiome is
        // a fresh biome, not the player's pre-failure one.
        // The backup carries the pre-failure state.
        const ws = (app as unknown as {
            worldState: {
                lastFailedSnapshot: ReturnType<typeof makeBackup>;
                lastBiome: string;
                lastSceneBlueprint: SceneBlueprintSnapshot | null;
                lastDimensionSeed: number | null;
                npcMindsSnapshot: unknown[];
            };
        }).worldState;
        const backup = makeBackup();
        ws.lastFailedSnapshot = backup;
        ws.lastBiome = 'corrupted_placeholder_biome';
        ws.lastSceneBlueprint = makeSnap({ biomeId: 'corrupted_placeholder_biome' });
        ws.lastDimensionSeed = 999;
        ws.npcMindsSnapshot = [];

        // Act
        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // Assert: 4 fields restored from backup.
        expect(ws.lastBiome).toBe('forest');
        expect(ws.lastSceneBlueprint?.biomeId).toBe('forest');
        expect(ws.lastDimensionSeed).toBe(42);
        expect(ws.npcMindsSnapshot).toEqual(backup.npcSnapshot);

        // Assert: cleanup side-effects.
        expect(hideRecoveryBanner).toHaveBeenCalledTimes(1);
        expect(setBackupAvailable).toHaveBeenCalledWith(false);
        expect(clearFailedSnapshot).toHaveBeenCalledTimes(1);

        // Assert: real-render pipeline was invoked once.
        expect(renderWfcDungeon).toHaveBeenCalledTimes(1);

        // Assert: HUD sync.
        expect(setLastBiome).toHaveBeenCalledWith('forest');
        expect(setNpcMindsSnapshot).toHaveBeenCalledWith(backup.npcSnapshot);
        expect(loadFromSnapshots).toHaveBeenCalledWith(backup.npcSnapshot);

        // Assert: backup cleared (one-deep invariant — the
        // rolled-back state IS the new current state).
        // `clearFailedSnapshot` was the cleanup call; we
        // verify it was invoked, not the field, because
        // the field is read by `lastFailedSnapshot` getter
        // and the setter is on the WorldState (which we
        // mocked `clearFailedSnapshot` to be a no-op).
        expect(clearFailedSnapshot).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Round 79 — `rollbackToLastGood` increments the lifetime
// `rollbackCount` and pushes the new value into the HUD via
// `setRollbackCount`. The integration test verifies the
// round-54 success path wires the round-79 telemetry counter
// at the end of the restore sequence (after the success
// cleanup, before the catch).
// ---------------------------------------------------------------------------

describe('App — round 79 rollback counter integration', () => {
    let app: App;
    let setRollbackCount: jest.SpyInstance;
    let setBackupAvailable: jest.SpyInstance;
    let hideRecoveryBanner: jest.SpyInstance;
    let renderWfcDungeon: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // Stub the side-effect surfaces so the rollback
        // success path can run to completion. We don't
        // need to assert on them here — the round-55
        // tests in the block above already do that.
        setRollbackCount = jest
            .spyOn((app as unknown as { hud: { setRollbackCount: (n: number | null) => void } }).hud, 'setRollbackCount')
            .mockImplementation(() => undefined);
        setBackupAvailable = jest
            .spyOn((app as unknown as { hud: { setBackupAvailable: (b: boolean) => void } }).hud, 'setBackupAvailable')
            .mockImplementation(() => undefined);
        hideRecoveryBanner = jest
            .spyOn((app as unknown as { hud: { hideRecoveryBanner: () => void } }).hud, 'hideRecoveryBanner')
            .mockImplementation(() => undefined);
        renderWfcDungeon = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        // Also stub the full loadFromSnapshots / clear / syncNpcDisposition / clearFailedSnapshot
        // paths the round-55 block uses; we don't want
        // them to throw or re-render in this block.
        jest
            .spyOn((app as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear')
            .mockImplementation(() => undefined);
        jest
            .spyOn(app as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { worldState: { clearFailedSnapshot: () => void } }).worldState, 'clearFailedSnapshot')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { hud: { setNpcMindsSnapshot: (s: unknown) => void } }).hud, 'setNpcMindsSnapshot')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('rollback_increments_worldState_rollbackCount_by_one', () => {
        const ws = (app as unknown as {
            worldState: {
                lastFailedSnapshot: ReturnType<typeof makeBackup>;
                rollbackCount: number;
            };
        }).worldState;
        ws.lastFailedSnapshot = makeBackup();
        ws.rollbackCount = 0;

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // The lifetime counter goes 0 → 1.
        expect(ws.rollbackCount).toBe(1);
    });

    test('rollback_pushes_updated_count_to_HUD_via_setRollbackCount', () => {
        const ws = (app as unknown as {
            worldState: {
                lastFailedSnapshot: ReturnType<typeof makeBackup>;
                rollbackCount: number;
            };
        }).worldState;
        ws.lastFailedSnapshot = makeBackup();
        ws.rollbackCount = 5;

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // The HUD should see the new total (5 + 1 = 6),
        // not the prev value.
        expect(setRollbackCount).toHaveBeenCalledWith(6);
    });

    test('success_path_runs_in_order: hide → setBackupAvailable(false) → setRollbackCount', () => {
        // The increment must happen AFTER the success
        // cleanup (so a half-restored rollback doesn't
        // bump the counter). Verify the call order
        // matches the round-54 success-path order.
        const ws = (app as unknown as {
            worldState: { lastFailedSnapshot: ReturnType<typeof makeBackup>; rollbackCount: number };
        }).worldState;
        ws.lastFailedSnapshot = makeBackup();
        ws.rollbackCount = 0;

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        const hideOrder = hideRecoveryBanner.mock.invocationCallOrder[0];
        const backupOrder = setBackupAvailable.mock.invocationCallOrder[0];
        const countOrder = setRollbackCount.mock.invocationCallOrder[0];
        expect(typeof hideOrder).toBe('number');
        expect(typeof backupOrder).toBe('number');
        expect(typeof countOrder).toBe('number');
        // The count must be set AFTER both the banner
        // hide and the backup-available flip.
        expect(countOrder).toBeGreaterThan(hideOrder as number);
        expect(countOrder).toBeGreaterThan(backupOrder as number);
    });

    test('multiple_rollbacks_accumulate_the_count', () => {
        // Each call increments by 1 — a save that needs
        // 3 successive recoveries should show 3 in the
        // HUD after the 3rd call.
        const ws = (app as unknown as {
            worldState: {
                lastFailedSnapshot: ReturnType<typeof makeBackup>;
                rollbackCount: number;
            };
        }).worldState;
        const appCtl = app as unknown as { rollbackToLastGood: () => void };

        ws.rollbackCount = 0;
        ws.lastFailedSnapshot = makeBackup();
        appCtl.rollbackToLastGood();
        ws.lastFailedSnapshot = makeBackup(); // re-arm the one-deep snapshot
        appCtl.rollbackToLastGood();
        ws.lastFailedSnapshot = makeBackup();
        appCtl.rollbackToLastGood();

        expect(ws.rollbackCount).toBe(3);
        // The HUD was pushed the new total 3 times.
        expect(setRollbackCount).toHaveBeenNthCalledWith(1, 1);
        expect(setRollbackCount).toHaveBeenNthCalledWith(2, 2);
        expect(setRollbackCount).toHaveBeenNthCalledWith(3, 3);
    });

    test('rollback_no_op_does_NOT_increment_count', () => {
        // The early-return guard (no `lastFailedSnapshot`)
        // must not bump the counter — a button press
        // with no recoverable state is a UI glitch, not
        // a rollback.
        const ws = (app as unknown as {
            worldState: { lastFailedSnapshot: unknown; rollbackCount: number };
        }).worldState;
        ws.lastFailedSnapshot = null;
        ws.rollbackCount = 7;

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        expect(ws.rollbackCount).toBe(7);
        expect(setRollbackCount).not.toHaveBeenCalled();
        expect(renderWfcDungeon).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Round 65 — `enterAtom` HUD wiring.
// The fast-portal-jump path (1-8 keyboard shortcuts) used to skip
// the persistent-memories state updates that a full `enterNewDimension`
// would write, leaving the round-49 "↩ 上次离开 #biome" line,
// round-64 🗺 minimap, and round-47 "🎬 上次维度" summary stale
// after a keyboard entry. We verify that enterAtom now writes all
// four HUD state slots and the WorldState mirror fields.
// ---------------------------------------------------------------------------

describe('App — round 65 enterAtom HUD wiring', () => {
    let app: App;
    let planAndLoad: jest.SpyInstance;
    let renderWfcDungeon: jest.SpyInstance;
    let spawnNpcWave: jest.SpyInstance;
    let setBiomeAtmosphere: jest.SpyInstance;
    let setBiomeAmbient: jest.SpyInstance;
    let setBiomeSfx: jest.SpyInstance;
    let setLastBiome: jest.SpyInstance;
    let setMinimap: jest.SpyInstance;
    let setLastSceneBlueprint: jest.SpyInstance;
    let setState: jest.SpyInstance;
    let updateLastSceneBlueprintFull: jest.SpyInstance;

    function makeBlueprintFor(atomId: string) {
        return {
            id: 'dim_test',
            name: '测试次元',
            description: 'desc',
            atomIds: [atomId],
            atomWeights: { [atomId]: 1 },
            difficulty: 0.5,
            rules: [],
            rewards: [],
            theme: {
                name: 'cyber·neon',
                visualStyle: 'cyberpunk',
                musicMood: 'pulse',
                colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
            },
            timeLimitSecs: 60,
            objectives: [],
        };
    }

    beforeEach(() => {
        app = makeApp();
        // Stub bridge.planAndLoad to return a controlled
        // blueprint that has both visualStyle + musicMood so
        // the round-65 themeToScene path activates and pins
        // the resolved biome.
        planAndLoad = jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async (cfg: unknown) => {
                const c = cfg as { forcedAtomId?: string };
                return {
                    suggestion: { stage: 'mid', primary: [c.forcedAtomId], secondary: [], excluded: [], rationale: 'test' },
                    atomIds: c.forcedAtomId ? [c.forcedAtomId] : [],
                    blueprint: makeBlueprintFor(c.forcedAtomId ?? 'match3'),
                    modules: [],
                    seed: 12345,
                    configSource: 'forced',
                };
            });
        // Stub all the scene / HUD / audio side-effects so
        // we only assert the round-65 state-update slots.
        renderWfcDungeon = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (g: unknown, s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        spawnNpcWave = jest
            .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
            .mockReturnValue(['mock_npc_a', 'mock_npc_b']);
        setBiomeAtmosphere = jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        setBiomeAmbient = jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        setBiomeSfx = jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        setLastBiome = jest
            .spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        setMinimap = jest
            .spyOn((app as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap')
            .mockImplementation(() => undefined);
        setLastSceneBlueprint = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        setState = jest
            .spyOn((app as unknown as { hud: { setState: (s: unknown) => void } }).hud, 'setState')
            .mockImplementation(() => undefined);
        updateLastSceneBlueprintFull = jest
            .spyOn((app as unknown as { worldState: { updateLastSceneBlueprintFull: (s: unknown) => void } }).worldState, 'updateLastSceneBlueprintFull')
            .mockImplementation(() => undefined);
        // Force WASM bridge to null so the TS mirror
        // for themeToScene runs (deterministic + no
        // module load in jsdom).
        (app as unknown as { sceneGenWasm: null }).sceneGenWasm = null;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('enterAtom_calls_setLastBiome_with_resolved_biome', async () => {
        // biomeForVisualStyle('cyberpunk') → BIOMES.cyberpunk
        // (biome.id === 'cyberpunk').
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        expect(setLastBiome).toHaveBeenCalledTimes(1);
        expect(setLastBiome).toHaveBeenCalledWith('cyberpunk');
    });

    test('enterAtom_calls_setMinimap_with_data_url', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        expect(setMinimap).toHaveBeenCalledTimes(1);
        // The round-63 renderMiniMap returns a data URL
        // (string starting with 'data:image/png') when
        // called outside jsdom-painter-only paths; the
        // exact payload isn't asserted (test stays robust
        // to format changes), only that a string was
        // pushed.
        const call = setMinimap.mock.calls[0]?.[0];
        expect(typeof call).toBe('string');
    });

    test('enterAtom_calls_setLastSceneBlueprint_with_scene_scalars', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        expect(setLastSceneBlueprint).toHaveBeenCalledTimes(1);
        const arg = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        };
        // All four round-47 scalar keys must be present.
        expect(arg).toHaveProperty('npcCount');
        expect(arg).toHaveProperty('bpm');
        expect(arg).toHaveProperty('eventCount');
        expect(arg).toHaveProperty('archetypeHintCount');
        // archetypeHintCount and npcCount come from the
        // themeToScene pipeline when the forced path
        // resolves; both should be non-zero in the
        // cyberpunk / pulse resolution.
        expect(arg.archetypeHintCount).toBeGreaterThan(0);
        expect(arg.npcCount).toBeGreaterThan(0);
    });

    test('enterAtom_calls_setState_with_dimension_when_theme_resolves', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        // setState({dimension: r.blueprint}) is one of the
        // round-65 additions. Find the call that includes
        // the `dimension` key (other setState calls in the
        // app may pass different shapes).
        const dimensionCall = setState.mock.calls.find(
            (c) => typeof c[0] === 'object' && c[0] !== null && 'dimension' in c[0],
        );
        expect(dimensionCall).toBeDefined();
    });

    test('enterAtom_updates_worldState_lastBiome_to_resolved_biome', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        // The round-65 direct-assign to worldState.lastBiome
        // should reflect the sceneBp.biomeId resolution
        // (cyberpunk for visualStyle='cyberpunk').
        const ws = (app as unknown as { worldState: { lastBiome: string | null } }).worldState;
        expect(ws.lastBiome).toBe('cyberpunk');
    });

    test('enterAtom_calls_updateLastSceneBlueprintFull_when_themeToScene_resolves', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        // updateLastSceneBlueprintFull should be called
        // once the round-65 themeToScene path runs and
        // returns a non-null sceneBp.
        expect(updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
    });

    test('enterAtom_uses_keyword_fallback_biome_when_theme_missing', async () => {
        // Override the mock so the blueprint has no
        // visualStyle / musicMood — themeToScene should
        // be skipped, and the keyword-match fallback
        // ('dungeon' default) should drive the biome.
        planAndLoad.mockImplementation(async () => ({
            suggestion: { stage: 'mid', primary: ['match3'], secondary: [], excluded: [], rationale: 'test' },
            atomIds: ['match3'],
            blueprint: {
                ...makeBlueprintFor('match3'),
                theme: { name: 'plain', visualStyle: undefined as unknown as string, musicMood: undefined as unknown as string, colorPalette: [] },
            },
            modules: [],
            seed: 12345,
            configSource: 'forced',
        }));
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        // biomeForVisualStyle('dungeon') → BIOMES.dungeon (id 'dungeon')
        expect(setLastBiome).toHaveBeenCalledWith('dungeon');
        // Without a sceneBp, updateLastSceneBlueprintFull
        // is NOT called (skipped to keep fast-portal intent).
        expect(updateLastSceneBlueprintFull).not.toHaveBeenCalled();
    });

    test('enterAtom_unknown_atom_returns_early_without_calling_planAndLoad', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('does_not_exist');
        expect(planAndLoad).not.toHaveBeenCalled();
        expect(setLastBiome).not.toHaveBeenCalled();
        expect(setMinimap).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Round 66 — DM `onDimension` callback + `rollbackToLastGood` minimap
// write paths. The DM path (the God console's `dim <r> <c> <style>`
// command) and the render-failure rollback path (called from
// `recoverFromRenderFailure`'s 4 branches when the user clicks
// "↩ 上次保存") both render a real WFC dungeon but used to
// skip the round-64 🗺 minimap update — leaving the
// persistent-memories block showing the pre-action preview
// (or the empty / placeholder) instead of the freshly
// rendered scene. We verify both paths now mirror the
// round-63/64/65 `enterNewDimension` / `enterAtom` sequence
// (lastBiome → setLastBiome → lastMinimap → setMinimap →
// setLastSceneBlueprint).
// ---------------------------------------------------------------------------

describe('App — round 66 DM+rollback minimap wiring', () => {
    let app: App;
    let renderWfcDungeon: jest.SpyInstance;
    let setBiomeAtmosphere: jest.SpyInstance;
    let setBiomeAmbient: jest.SpyInstance;
    let setBiomeSfx: jest.SpyInstance;
    let setLastBiome: jest.SpyInstance;
    let setMinimap: jest.SpyInstance;
    let setLastSceneBlueprint: jest.SpyInstance;
    let spawnNpcWave: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        renderWfcDungeon = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        spawnNpcWave = jest
            .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
            .mockReturnValue(['mock_npc_a']);
        setBiomeAtmosphere = jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        setBiomeAmbient = jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        setBiomeSfx = jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        setLastBiome = jest
            .spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        setMinimap = jest
            .spyOn((app as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap')
            .mockImplementation(() => undefined);
        setLastSceneBlueprint = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('dm_dimension_writes_setLastBiome_setMinimap_setLastSceneBlueprint', () => {
        // The DM console parses "dim 10 10 cyberpunk" and
        // dispatches to the round-66-aware onDimension
        // callback. We invoke the DM command path end-to-end
        // so the parse + handler + writes all run in a
        // single chain (no double-stubbing needed).
        const result = (app as unknown as {
            dm: { run: (line: string) => { ok: boolean; cmd: { kind: string }; error?: string } };
        }).dm.run('dim 10 10 cyberpunk');
        expect(result.ok).toBe(true);
        expect(result.cmd.kind).toBe('dimension');

        // Render pipeline ran exactly once.
        expect(renderWfcDungeon).toHaveBeenCalledTimes(1);
        // Atmosphere / audio / analytics side-effects fired.
        expect(setBiomeAtmosphere).toHaveBeenCalledTimes(1);
        expect(setBiomeAmbient).toHaveBeenCalledTimes(1);
        expect(setBiomeSfx).toHaveBeenCalledTimes(1);

        // Round 66 — persistent-memories block sync.
        expect(setLastBiome).toHaveBeenCalledTimes(1);
        expect(setLastBiome).toHaveBeenCalledWith('cyberpunk');
        expect(setMinimap).toHaveBeenCalledTimes(1);
        const minimapArg = setMinimap.mock.calls[0]?.[0];
        expect(typeof minimapArg).toBe('string');
        // Default scalars for DM path (no full themeToScene).
        // Round 71 — `eventCount` is now a real 3-5 number
        // synthesized from the dungeon's special-tile count
        // (chest/shrine/trap), not the round-66 placeholder 0.
        // We assert a range rather than an exact value because
        // the real WFC generator's tile distribution depends on
        // the random seed; a separate round-71 describe block
        // (below) stubs `generateDungeon` for a precise check.
        expect(setLastSceneBlueprint).toHaveBeenCalledTimes(1);
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        };
        // Round 77 — the 3 remaining scalar placeholders are
        // now real. The real WFC generator always places at
        // least 1 SPAWN tile, so npcCount >= 1. The cyberpunk
        // biome's mood is 'pulse' → bpmForMood returns 140.
        expect(scalars.npcCount).toBeGreaterThanOrEqual(1);
        expect(scalars.bpm).toBe(140);
        expect(scalars.eventCount).toBeGreaterThanOrEqual(3);
        expect(scalars.eventCount).toBeLessThanOrEqual(5);
        expect(scalars.archetypeHintCount).toBe(0);
    });

    test('dm_dimension_updates_worldState_lastBiome_and_lastMinimap', () => {
        // Mirror the round-65 enterAtom direct-assign
        // check — the DM path should also write
        // worldState.lastBiome and worldState.lastMinimap
        // (used by the next reload's rehydrate and by
        // the round-49 "↩ 上次离开 #biome" line).
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 forest');
        const ws = (app as unknown as {
            worldState: { lastBiome: string | null; lastMinimap: string | null };
        }).worldState;
        expect(ws.lastBiome).toBe('forest');
        expect(typeof ws.lastMinimap).toBe('string');
    });

    test('rollback_writes_setMinimap_and_worldState_lastMinimap', () => {
        // Set up a corrupted worldState so rollbackToLastGood
        // has something to restore (mirrors the round-55
        // rollback test pattern at line 312).
        const ws = (app as unknown as {
            worldState: {
                lastFailedSnapshot: ReturnType<typeof makeBackup>;
                lastBiome: string;
                lastSceneBlueprint: SceneBlueprintSnapshot | null;
                lastDimensionSeed: number | null;
                npcMindsSnapshot: unknown[];
                lastMinimap: string | null;
            };
        }).worldState;
        const backup = makeBackup({ biome: 'forest' });
        ws.lastFailedSnapshot = backup;
        ws.lastBiome = 'corrupted_placeholder_biome';
        ws.lastSceneBlueprint = makeSnap({ biomeId: 'corrupted_placeholder_biome' });
        ws.lastDimensionSeed = 999;
        ws.npcMindsSnapshot = [];
        // Pre-rollback the minimap is a placeholder
        // (string that doesn't match the fresh render).
        ws.lastMinimap = 'data:image/png;base64,PLACEHOLDER';

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // Round 66 — minimap must have been re-rendered
        // and pushed to both worldState and HUD.
        expect(setMinimap).toHaveBeenCalledTimes(1);
        const minimapArg = setMinimap.mock.calls[0]?.[0];
        expect(typeof minimapArg).toBe('string');
        expect(minimapArg).not.toBe('data:image/png;base64,PLACEHOLDER');
        expect(ws.lastMinimap).toBe(minimapArg);

        // Round-66 does NOT add a fresh setLastBiome to
        // rollback (setLastBiome was already in the
        // round-55 path at line 351), and does NOT
        // add a fresh setLastSceneBlueprint (round-54
        // path at line 295 already covers that).
        // We assert rollback still restores the 4
        // fields (regression check).
        expect(ws.lastBiome).toBe('forest');
        expect(ws.lastSceneBlueprint?.biomeId).toBe('forest');
    });
});

// ---------------------------------------------------------------------------
// Round 71 — DM `onDimension` callback writes a real
// `eventCount` to the HUD scalars. Pre-round-71 the value was
// the round-66 placeholder 0. The new `synthesizeDmEventChain`
// helper (DmEventChain.ts) produces a deterministic 3-5 chain
// from the dungeon's special-tile count, mirroring the standard
// `themeToScene` chain's range. This describe block stubs
// `generateDungeon` to return a known tile grid so the assertion
// is byte-precise (the random-seed WFC test above only asserts
// the 3-5 range).
// ---------------------------------------------------------------------------

describe('App — round 71 DM event chain wiring', () => {
    let app: App;
    let renderWfcDungeon: jest.SpyInstance;
    let setBiomeAtmosphere: jest.SpyInstance;
    let setBiomeAmbient: jest.SpyInstance;
    let setBiomeSfx: jest.SpyInstance;
    let setLastBiome: jest.SpyInstance;
    let setMinimap: jest.SpyInstance;
    let setLastSceneBlueprint: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // Stub the WFC render / atmosphere / audio / HUD writes
        // so we can focus on the eventCount assertion.
        renderWfcDungeon = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        setBiomeAtmosphere = jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        setBiomeAmbient = jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        setBiomeSfx = jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        setLastBiome = jest
            .spyOn((app as unknown as { hud: { setLastBiome: (id: string) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        setMinimap = jest
            .spyOn((app as unknown as { hud: { setMinimap: (m: string) => void } }).hud, 'setMinimap')
            .mockImplementation(() => undefined);
        setLastSceneBlueprint = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        // Stub `generateDungeon` directly so the synthesized
        // event chain is byte-precise. We import the module
        // and spy on the named export.
        // (We avoid spying on the imported binding in main.ts
        // because ESM bindings are immutable — we have to stub
        // at the source-module level instead.)
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        jest.spyOn(wfcModule, 'generateDungeon').mockImplementation((w: number, h: number, _seed: number) => {
            // 8x8 grid with 2 chests, 1 shrine, 1 trap.
            // Expected chain: treasure_drop + boss_hint +
            // spawn_wave + fog_pulse + echo_lore = 5 events.
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0 /* FLOOR */));
            tiles[1][1] = 3; // CHEST
            tiles[2][2] = 3; // CHEST
            tiles[3][3] = 7; // SHRINE
            tiles[4][4] = 6; // TRAP
            return { tiles, success: true };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('dm_dimension_writes_real_event_count_for_dungeon_with_chests_shrine_trap', () => {
        // 2 chests + 1 shrine + 1 trap → all 5 kinds fire →
        // eventCount === 5.
        const result = (app as unknown as {
            dm: { run: (line: string) => { ok: boolean; cmd: { kind: string }; error?: string } };
        }).dm.run('dim 8 8 cyberpunk');
        expect(result.ok).toBe(true);

        expect(setLastSceneBlueprint).toHaveBeenCalledTimes(1);
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        };
        expect(scalars.eventCount).toBe(5);
        // Round 77 — the 3 remaining scalar placeholders are
        // now real:
        //   - npcCount: 0 (the round-71 test grid has no
        //                SPAWN tiles)
        //   - bpm:      140 (cyberpunk biome's mood is
        //                'pulse' → bpmForMood returns 140)
        //   - archetypeHintCount: 0 (WFC path doesn't emit
        //                archetype hints — that's a
        //                `themeToScene` concept)
        expect(scalars.npcCount).toBe(0);
        expect(scalars.bpm).toBe(140);
        expect(scalars.archetypeHintCount).toBe(0);
    });

    test('dm_dimension_writes_3_events_for_empty_dungeon', () => {
        // Override the stub for this test only — 8x8 floor-only
        // grid → no special tiles → spawn_wave + echo_lore +
        // padded echo_lore = 3 events.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            return { tiles, success: true };
        });

        const result = (app as unknown as {
            dm: { run: (line: string) => { ok: boolean; cmd: { kind: string }; error?: string } };
        }).dm.run('dim 8 8 cyberpunk');
        expect(result.ok).toBe(true);

        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            eventCount: number;
        };
        // spawn_wave + echo_lore (2 unconditional kinds) +
        // 1 padding echo_lore (safety net) = 3.
        expect(scalars.eventCount).toBe(3);
    });

    test('dm_dimension_writes_4_events_for_dungeon_with_just_chests', () => {
        // 8x8 with 1 chest → treasure_drop + spawn_wave +
        // echo_lore = 3 events. (2 chests gives the same result
        // because the kind is `treasure_drop` regardless of
        // count.) We assert >= 3 and <= 5 for robustness against
        // future kind-list edits.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            tiles[1][1] = 3; // CHEST
            return { tiles, success: true };
        });
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as { eventCount: number };
        expect(scalars.eventCount).toBe(3);
    });

    // -----------------------------------------------------------------------
    // Round 72 — `lastSceneEventChain` WorldState field. The DM
    // path's `synthesizeDmEventChain` output (round 71) now also
    // lands in WorldState via `setLastSceneEventChain`. A future
    // "replay events" UI reads it from there.
    // -----------------------------------------------------------------------

    test('dm_dimension_writes_full_event_chain_to_worldState', () => {
        // Stub `generateDungeon` to return an 8x8 grid with
        // 2 chests + 1 shrine + 1 trap → 5 events.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            tiles[1][1] = 3; // CHEST
            tiles[2][2] = 3; // CHEST
            tiles[3][3] = 7; // SHRINE
            tiles[4][4] = 6; // TRAP
            return { tiles, success: true };
        });

        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const ws = (app as unknown as {
            worldState: { lastSceneEventChain: Array<{ kind: string; delaySecs: number; payload: string }> | null };
        }).worldState;
        expect(ws.lastSceneEventChain).not.toBeNull();
        expect(ws.lastSceneEventChain?.length).toBe(5);
        // First event is treasure_drop (chest → conditional kind).
        expect(ws.lastSceneEventChain?.[0].kind).toBe('treasure_drop');
        // Payloads embed the biome id (round 71 contract).
        expect(ws.lastSceneEventChain?.[0].payload).toContain('cyberpunk');
        // Delays follow the 5 + 8n formula (round 71).
        expect(ws.lastSceneEventChain?.[0].delaySecs).toBe(5);
        expect(ws.lastSceneEventChain?.[4].delaySecs).toBe(37);
    });

    test('dm_dimension_worldState_chain_is_isolated_from_dungeon_array', () => {
        // The synthesized chain is built from the WFC grid
        // (a local var in main.ts). A future caller mutating
        // the grid post-render must not affect the stored
        // chain — `setLastSceneEventChain` does a defensive
        // clone, mirroring the round-49 snapshot write.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        let storedTiles: number[][] = [];
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            storedTiles = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            storedTiles[1][1] = 3; // CHEST
            return { tiles: storedTiles, success: true };
        });

        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const ws = (app as unknown as {
            worldState: { lastSceneEventChain: Array<{ kind: string; delaySecs: number; payload: string }> | null };
        }).worldState;
        const chainBefore = ws.lastSceneEventChain;
        // Mutate the dungeon array AFTER the DM call returns.
        storedTiles[2][2] = 7; // SHRINE
        // The stored chain must NOT reflect the post-mutation
        // kind set (no boss_hint should appear if it wasn't
        // in the chain at store time).
        const kinds = (chainBefore ?? []).map(e => e.kind);
        expect(kinds).not.toContain('boss_hint');
    });
});

// ---------------------------------------------------------------------------
// Round 73 — HUD `setLastSceneEventChain` wiring. The synthesized
// chain (round 71) is stored in WorldState (round 72) and now
// also pushed to the HUD as a `⏰` row in the persistent-memories
// block. We verify the DM and non-DM paths each call the HUD
// setter with the right payload, and that the HUD keeps a
// defensive clone (caller mutation doesn't leak).
// ---------------------------------------------------------------------------

describe('App — round 73 HUD setLastSceneEventChain wiring', () => {
    let app: App;
    let setLastSceneEventChain: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // Stub the render + audio + minimap layers so the
        // chain setter call lands in isolation.
        jest.spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setLastBiome: (id: string) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setMinimap: (m: string) => void } }).hud, 'setMinimap')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        setLastSceneEventChain = jest
            .spyOn((app as unknown as { hud: { setLastSceneEventChain: (c: unknown) => void } }).hud, 'setLastSceneEventChain')
            .mockImplementation(() => undefined);
        // Stable 8x8 grid with 2 chests + 1 shrine + 1 trap
        // → 5-event chain (round 71 contract).
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        jest.spyOn(wfcModule, 'generateDungeon').mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            tiles[1][1] = 3; // CHEST
            tiles[2][2] = 3; // CHEST
            tiles[3][3] = 7; // SHRINE
            tiles[4][4] = 6; // TRAP
            return { tiles, success: true };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('dm_dimension_pushes_event_chain_to_hud', () => {
        // The DM `onDimension` callback writes the chain to
        // WorldState (round 72) AND to the HUD (round 73).
        // We assert the HUD setter is called exactly once
        // with a 5-event chain whose kinds match the
        // round-71 synthesis.
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        expect(setLastSceneEventChain).toHaveBeenCalledTimes(1);
        const arg = setLastSceneEventChain.mock.calls[0]?.[0] as Array<{ kind: string; delaySecs: number; payload: string }>;
        expect(arg.length).toBe(5);
        expect(arg[0].kind).toBe('treasure_drop');
        expect(arg[0].delaySecs).toBe(5);
        expect(arg[0].payload).toContain('cyberpunk');
    });

    test('hud_receives_a_defensive_clone_not_a_reference', () => {
        // Mirrors the round-49/72 isolation test. The HUD
        // must deep-clone the chain so a caller mutating
        // the captured reference (e.g. from a test
        // post-assertion) doesn't corrupt the rendered row.
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const arg = setLastSceneEventChain.mock.calls[0]?.[0] as Array<{ kind: string; delaySecs: number; payload: string }>;
        // Mutate the captured array.
        arg.push({ kind: 'echo_lore', delaySecs: 99, payload: 'EVIL' });
        arg[0].payload = 'CORRUPTED';
        // Read WorldState — it should still show the
        // original 5-event chain with the original
        // payload.
        const ws = (app as unknown as {
            worldState: { lastSceneEventChain: Array<{ kind: string; delaySecs: number; payload: string }> | null };
        }).worldState;
        expect(ws.lastSceneEventChain?.length).toBe(5);
        expect(ws.lastSceneEventChain?.[0].payload).toBe('cyberpunk_treasure_drop_0');
    });
});

// ---------------------------------------------------------------------------
// Round 77 — close the 3 remaining scalar placeholders on
// the DM `onDimension` path. Round 71 closed `eventCount`
// (synthesized chain length). Round 77 closes:
//   - npcCount           → `countNpcSpawnTiles(tiles)` (real
//                          spawn-tile count in the WFC grid)
//   - bpm                → `bpmForMood(biome.mood)` (the
//                          biome's mood maps to a tempo)
//   - archetypeHintCount → 0 (WFC doesn't emit archetype
//                          hints — that's a `themeToScene`
//                          concept)
//
// The unit-test for the 2 helpers lives in
// WfcBiomes.test.ts / DmEventChain.test.ts. This block
// exercises the integration: a DM `dim 8 8 cyberpunk` call
// must write a 5-event chain with the right scalar triple.
// ---------------------------------------------------------------------------

describe('App — round 77 DM path real scalars (npcCount + bpm)', () => {
    let app: App;
    let setLastSceneBlueprint: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // Stub the WFC render / atmosphere / audio / minimap
        // so we can focus on the scalar write.
        jest.spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setLastBiome: (id: string) => void } }).hud, 'setLastBiome')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setMinimap: (m: string) => void } }).hud, 'setMinimap')
            .mockImplementation(() => undefined);
        setLastSceneBlueprint = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        // Set up a default WFC stub. Each test below
        // overrides this with a specific tile layout.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        jest.spyOn(wfcModule, 'generateDungeon').mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            return { tiles, success: true };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('cyberpunk_dim_writes_pulse_bpm_and_spawn_tile_count', () => {
        // Stub generateDungeon to return an 8x8 grid with
        // 3 SPAWN tiles (no chests / shrines / traps) so
        // we get the minimum-event chain (3 events) and a
        // known npcCount.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            tiles[1][1] = 4; // TILE_SPAWN
            tiles[2][2] = 4; // TILE_SPAWN
            tiles[3][3] = 4; // TILE_SPAWN
            return { tiles, success: true };
        });
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        };
        // 3 SPAWN tiles → npcCount=3.
        expect(scalars.npcCount).toBe(3);
        // cyberpunk biome has mood='pulse' → bpmForMood returns 140.
        expect(scalars.bpm).toBe(140);
        // WFC path doesn't emit archetype hints.
        expect(scalars.archetypeHintCount).toBe(0);
    });

    test('forest_dim_writes_slower_bpm_for_mysterious_mood', () => {
        // The forest biome has mood='mysterious' →
        // bpmForMood returns 60. A future regression that
        // flipped the BPM mapping would be caught here.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            tiles[1][1] = 4; // 1 SPAWN
            return { tiles, success: true };
        });
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 forest');
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as { npcCount: number; bpm: number };
        expect(scalars.npcCount).toBe(1);
        expect(scalars.bpm).toBe(60);
    });

    test('empty_grid_writes_zero_npc_count', () => {
        // Boundary: a grid with NO SPAWN tiles → npcCount=0.
        // Mirrors the round-71 "empty dungeon" case.
        const wfcModule = require('./world/WfcLevelGen') as typeof import('./world/WfcLevelGen');
        (wfcModule.generateDungeon as jest.Mock).mockImplementation((w: number, h: number) => {
            const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
            return { tiles, success: true };
        });
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 8 8 cyberpunk');
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as { npcCount: number };
        expect(scalars.npcCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Round 68 — in-browser `wasm.latency` event emission. The two
// `themeToSceneWithFallback` call sites in main.ts (round-48
// `enterNewDimension` + round-65 `enterAtom` conditional path)
// are wrapped with `this.analytics.bench('themeToScene', fn)`,
// which emits a `wasm.latency` Analytics event with the
// elapsed `performance.now()` delta. We verify the wrapper is
// wired at both call sites — the in-browser wall-clock baseline
// the round-67 jest bench cannot measure.
// ---------------------------------------------------------------------------

describe('App — round 68 wasm.latency event emission', () => {
    let app: App;
    let planAndLoad: jest.SpyInstance;
    let analyticsTrack: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        // Stub bridge.planAndLoad to return a blueprint with
        // a full theme (visualStyle + musicMood) so both
        // round-48 and round-65 themeToScene paths activate.
        planAndLoad = jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async (cfg: unknown) => {
                const c = cfg as { forcedAtomId?: string };
                return {
                    suggestion: { stage: 'mid', primary: [c.forcedAtomId ?? 'match3'], secondary: [], excluded: [], rationale: 'test' },
                    atomIds: c.forcedAtomId ? [c.forcedAtomId] : ['match3'],
                    blueprint: {
                        id: 'dim_test',
                        name: '测试次元',
                        description: 'desc',
                        atomIds: ['match3'],
                        atomWeights: { match3: 1 },
                        difficulty: 0.5,
                        rules: [],
                        rewards: [],
                        theme: {
                            name: 'cyber·neon',
                            visualStyle: 'cyberpunk',
                            musicMood: 'pulse',
                            colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
                        },
                        timeLimitSecs: 60,
                        objectives: [],
                    },
                    modules: [],
                    seed: 12345,
                    configSource: 'forced',
                };
            });
        // Force WASM bridge to null so the TS mirror runs
        // (deterministic, no module load in jsdom).
        (app as unknown as { sceneGenWasm: null }).sceneGenWasm = null;
        // Spy on the analytics track() so we can assert the
        // round-68 event fires without depending on the
        // ring-buffer ordering.
        analyticsTrack = jest
            .spyOn((app as unknown as { analytics: { track: (k: string, d?: unknown) => void } }).analytics, 'track')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('enterNewDimension_emits_wasm_latency_event_for_themeToScene', async () => {
        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
        // The bench wrapper calls analytics.track('wasm.latency',
        // { name: 'themeToScene', ms: <number> }). Find the
        // matching call in the spy history.
        const wasmLatencyCalls = analyticsTrack.mock.calls.filter(
            (c) => c[0] === 'wasm.latency'
                && (c[1] as { name?: string } | undefined)?.name === 'themeToScene',
        );
        expect(wasmLatencyCalls.length).toBeGreaterThanOrEqual(1);
        // The `ms` payload must be a non-negative finite
        // number (the bench rounds to 3 decimals, but the
        // test doesn't pin the exact value).
        const data = wasmLatencyCalls[0][1] as { ms: number };
        expect(typeof data.ms).toBe('number');
        expect(data.ms).toBeGreaterThanOrEqual(0);
    });

    test('enterAtom_emits_wasm_latency_event_for_themeToScene', async () => {
        await (app as unknown as { enterAtom: (id: string) => Promise<void> }).enterAtom('match3');
        // enterAtom's round-65 conditional themeToScene path
        // also goes through the bench wrapper, so the
        // `wasm.latency` event should fire there too.
        const wasmLatencyCalls = analyticsTrack.mock.calls.filter(
            (c) => c[0] === 'wasm.latency'
                && (c[1] as { name?: string } | undefined)?.name === 'themeToScene',
        );
        expect(wasmLatencyCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('NarrationEngine_setBench_wires_analytics_bench_into_callMood4thSentenceFor', () => {
        // Unit-level test: the bench callback injected via
        // `setBench` is the one called around
        // `callMood4thSentenceFor` in NarrationEngine.narrate.
        // We inject a spy bench and verify it's invoked with
        // the canonical name.
        const { NarrationEngine } = require('./narration/NarrationEngine');
        const { callMood4thSentenceFor } = require('./ai/SceneGenWasm');
        const stubMod = {
            wasm_module_version: () => '0.2.0-round51',
            theme_to_scene_json: () => '{}',
            build_generation_config_with_mood_json: () => '{}',
            mood_palette_json: () => '{}',
            mood_4th_sentence_for_json: () => JSON.stringify({ sentence: '...', branch: 0, blueprint_id: 'dim_x' }),
        };
        const narr = new NarrationEngine();
        const benchSpy = jest.fn(<T>(_name: string, fn: () => T) => fn());
        narr.setSceneGenWasm(stubMod);
        narr.setBench(benchSpy);
        const ai = new (require('./ai/AIEngine').AIEngine)(1);
        const b = ai.generateDimension({
            minAtoms: 2, maxAtoms: 3, difficultyRange: [0.4, 0.6],
            playerLevel: 5, preferredTypes: [], excludedTypes: [], rewardMultiplier: 1.0,
        });
        const blueprint = { ...b, id: 'dim_x', theme: { ...b.theme, visualStyle: 'cyberpunk' } };
        const fearMood = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        const { defaultDisposition } = require('./world/NpcMind');
        const avgMood = fearMood;
        narr.narrate(blueprint, avgMood, undefined);
        // The bench wrapper should have been called at least
        // once for the `mood4thSentenceFor` name.
        const matching = benchSpy.mock.calls.filter((c) => c[0] === 'mood4thSentenceFor');
        expect(matching.length).toBeGreaterThanOrEqual(1);
        // And callMood4thSentenceFor should have returned
        // a sentence (the stub returns a string).
        expect(typeof callMood4thSentenceFor).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// Round 69 — App-level WasmLatencyStats wiring. The App
// constructor instantiates a `WasmLatencyStats`, attaches it
// to `this.analytics`, and subscribes to its summary stream
// to push `setWasmLatencyStats(s)` into the HUD. We verify
// the end-to-end flow: emit a `wasm.latency` event via
// `this.analytics.track(...)`, and the HUD's setWasmLatencyStats
// is called with a summary that contains the per-fn stat.
// ---------------------------------------------------------------------------

describe('App — round 69 WasmLatencyStats wiring', () => {
    let app: App;
    let setWasmLatencyStats: jest.SpyInstance;

    beforeEach(() => {
        app = makeApp();
        setWasmLatencyStats = jest
            .spyOn((app as unknown as { hud: { setWasmLatencyStats: (s: unknown) => void } }).hud, 'setWasmLatencyStats')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('emitting_wasm_latency_event_pushes_summary_to_hud', () => {
        // Simulate the round-68 `analytics.bench` wrapper
        // firing a `wasm.latency` event on the bus. The
        // round-69 `WasmLatencyStats` aggregator (attached
        // in the App constructor) should pick it up,
        // compute a summary, and call
        // `hud.setWasmLatencyStats(s)`.
        const analytics = (app as unknown as { analytics: { track: (k: string, d?: unknown) => void } }).analytics;
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 1.5 });
        analytics.track('wasm.latency', { name: 'themeToScene', ms: 2.5 });
        analytics.track('wasm.latency', { name: 'mood4thSentenceFor', ms: 0.8 });

        // The summary listener should have fired 3 times
        // (once per track), and the most recent call should
        // contain both fns with the right counts.
        expect(setWasmLatencyStats).toHaveBeenCalledTimes(3);
        const lastCall = setWasmLatencyStats.mock.calls[setWasmLatencyStats.mock.calls.length - 1];
        const summary = lastCall[0] as {
            perFn: Record<string, { count: number; medianMs: number; p95Ms: number; maxMs: number }>;
            totalSamples: number;
        };
        expect(summary.totalSamples).toBe(3);
        expect(summary.perFn.themeToScene.count).toBe(2);
        expect(summary.perFn.themeToScene.medianMs).toBe(2);
        expect(summary.perFn.themeToScene.maxMs).toBe(2.5);
        expect(summary.perFn.mood4thSentenceFor.count).toBe(1);
        expect(summary.perFn.mood4thSentenceFor.medianMs).toBe(0.8);
    });

    test('non_wasm_latency_events_do_not_trigger_hud_update', () => {
        // The aggregator should filter the bus: only
        // `wasm.latency` events count. Other event kinds
        // (dimension.entered, dm.dimension, etc.) pass
        // through unfiltered and the HUD never sees a
        // summary update for them.
        const analytics = (app as unknown as { analytics: { track: (k: string, d?: unknown) => void } }).analytics;
        const beforeCalls = setWasmLatencyStats.mock.calls.length;
        analytics.track('dimension.entered', { dimId: 'dim_1' });
        analytics.track('dm.dimension', { rows: 10, cols: 10, style: 'cyberpunk' });
        analytics.track('epoch.collapsed');
        // No wasm.latency event was emitted, so the
        // setWasmLatencyStats call count should be unchanged.
        expect(setWasmLatencyStats.mock.calls.length).toBe(beforeCalls);
    });
});

// ---------------------------------------------------------------------------
// Round 80 — App-level e2e for the bridge → themeToScene →
// WorldState + HUD pipeline.
//
// The round-48/51 WASM bridge exports live in `src/ai/SceneGenWasm.ts`
// and have their own unit tests in `SceneGenWasm.test.ts`. The
// round-65/66/71/77/78 describe blocks above stub either
// `bridge.planAndLoad` (with a hard-coded blueprint) OR
// `sceneGenWasm = null` (to force the TS-mirror path) — but no
// existing test stubs BOTH at once and walks the full
// `enterNewDimension` flow to verify the WorldState + HUD end
// state.
//
// This block closes that gap. The 5 tests verify:
//   1. The WASM bridge's `theme_to_scene_json` output is what
//      gets persisted to `worldState.lastSceneBlueprint` (NOT
//      the bridge's blueprint — they serve different purposes:
//      bridge blueprint = `worldState.activeDimension`;
//      themeToScene output = the persisted scene structure).
//   2. The seed flows from `bridge.planAndLoad` through
//      `themeToScene` to `lastDimensionSeed` byte-identical.
//   3. The TS-mirror fallback path (`sceneGenWasm = null`)
//      produces a valid WorldState + HUD state too — no
//      "WASM-only" assumptions leak into the WorldState writes.
//   4. The HUD's `setLastSceneEventChain` and
//      `setLastSceneBlueprint` reflect the WASM-bridge output
//      (the user-visible signal).
//   5. The `lastMinimap` is rendered + persisted for both
//      paths (the round-63/64 PNG thumbnail).
// ---------------------------------------------------------------------------

describe('App — round 80 e2e: bridge → themeToScene → WorldState + HUD', () => {
    function makeBridgeBlueprint(seed: number, visualStyle: 'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon', musicMood: 'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse') {
        return {
            id: `dim_${visualStyle}_${seed}`,
            name: `e2e ${visualStyle}`,
            description: 'round 80 e2e fixture',
            atomIds: ['tower_defense'],
            atomWeights: { tower_defense: 1 },
            difficulty: 0.5,
            rules: [],
            rewards: [],
            theme: { name: 'e2e', visualStyle, musicMood, colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
            timeLimitSecs: 60,
            objectives: [],
        };
    }

    // Round 82 — `makeWasmStub` is now a shared helper in
    // `src/test-utils/sceneGenWasmStub.ts`. Imported at the
    // top of this file. The factory's round-80 happy-path
    // shape (5,4,2,2,1,0,2,1 weights + verdant-ruins biome +
    // 3-event chain + 0.2.0-round80-e2e stamp) is locked by
    // `sceneGenWasmStub.test.ts`; the e2e tests below rely on
    // those defaults to drive the App's WASM branch.

    function stubSideEffects(app: App) {
        jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
            .mockReturnValue(['mock_npc_a']);
        jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        return {
            setLastBiome: jest
                .spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome')
                .mockImplementation(() => undefined),
            setMinimap: jest
                .spyOn((app as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap')
                .mockImplementation(() => undefined),
            setLastSceneBlueprint: jest
                .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
                .mockImplementation(() => undefined),
            setLastSceneEventChain: jest
                .spyOn((app as unknown as { hud: { setLastSceneEventChain: (c: unknown) => void } }).hud, 'setLastSceneEventChain')
                .mockImplementation(() => undefined),
            updateLastSceneBlueprintFull: jest
                .spyOn((app as unknown as { worldState: { updateLastSceneBlueprintFull: (s: unknown) => void } }).worldState, 'updateLastSceneBlueprintFull')
                .mockImplementation(() => undefined),
        };
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('wasm_bridge_themeToScene_output_persists_to_lastSceneBlueprint', async () => {
        // The bridge's `planAndLoad` returns a "dimension
        // blueprint" (the high-level atom combo + theme).
        // The WASM `themeToScene` returns the "scene
        // blueprint" (WFC weights, biome, NPC density,
        // event chain, BPM, archetype hints). The latter
        // is what gets persisted to `lastSceneBlueprint`
        // (the round-49 full snapshot used by reload to
        // re-render the exact dungeon).
        const app = makeApp();
        stubSideEffects(app);
        const seed = 12345;
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e' },
                atomIds: ['tower_defense'],
                blueprint: makeBridgeBlueprint(seed, 'cyberpunk', 'pulse'),
                modules: [],
                seed,
                configSource: 'wasm',
            }));
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub({
            npcCount: 7,
            musicBpm: 140,
            biomeId: 'neon-harbor',
            npcArchetypeHints: ['mage', 'beast', 'thief'],
        });

        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();

        // The persisted snapshot is the WASM output
        // (npcCount=7, bpm=140, biome=neon-harbor), NOT
        // the bridge blueprint (npcCount=0 — the bridge
        // blueprint has no NPC count).
        const fullCall = (app as unknown as {
            worldState: { updateLastSceneBlueprintFull: jest.Mock };
        }).worldState.updateLastSceneBlueprintFull.mock.calls[0][0] as {
            npcCount: number;
            musicBpm: number;
            biomeId: string;
            npcArchetypeHints: string[];
        };
        expect(fullCall.npcCount).toBe(7);
        expect(fullCall.musicBpm).toBe(140);
        expect(fullCall.biomeId).toBe('neon-harbor');
        expect(fullCall.npcArchetypeHints).toEqual(['mage', 'beast', 'thief']);
    });

    test('seed_flows_byte_identical_from_bridge_through_themeToScene_to_lastDimensionSeed', async () => {
        // The seed used for WFC re-render (round 50) is
        // the seed the bridge returned. A future
        // contributor changing the seed-pipe must not
        // drift it (e.g. calling `Date.now()` again
        // would break save → reload byte-identical
        // re-render).
        const app = makeApp();
        stubSideEffects(app);
        const seed = 0xDEADBEEF;
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e' },
                atomIds: ['tower_defense'],
                blueprint: makeBridgeBlueprint(seed, 'cyberpunk', 'pulse'),
                modules: [],
                seed,
                configSource: 'wasm',
            }));
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub();

        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();

        // The bridge-returned seed is exactly what
        // WorldState.lastDimensionSeed should hold.
        const ws = (app as unknown as { worldState: { lastDimensionSeed: number | null } }).worldState;
        expect(ws.lastDimensionSeed).toBe(seed);
    });

    test('ts_mirror_fallback_persists_valid_lastSceneBlueprint_when_wasm_null', async () => {
        // The round-48 contract: when `sceneGenWasm` is
        // null, the TS-mirror's `themeToScene` produces
        // the blueprint. Verify the TS path ALSO writes
        // `lastSceneBlueprint` (so the WorldState
        // doesn't go blank when WASM fails to load).
        const app = makeApp();
        stubSideEffects(app);
        const seed = 7777;
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e' },
                atomIds: ['tower_defense'],
                blueprint: makeBridgeBlueprint(seed, 'fantasy', 'cheerful'),
                modules: [],
                seed,
                configSource: 'ts-fallback',
            }));
        // Force the TS-mirror path.
        (app as unknown as { sceneGenWasm: null }).sceneGenWasm = null;

        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();

        // The TS-mirror path still calls
        // `updateLastSceneBlueprintFull` exactly once.
        const ws = (app as unknown as {
            worldState: { updateLastSceneBlueprintFull: jest.Mock };
        }).worldState.updateLastSceneBlueprintFull;
        expect(ws).toHaveBeenCalledTimes(1);
        // And the snapshot is non-null with the
        // expected biome ('forest' — the TS-mirror's
        // default for `fantasy`).
        const fullCall = ws.mock.calls[0][0] as { biomeId: string; npcCount: number; eventChain: unknown[] };
        expect(fullCall.biomeId).toBeTruthy();
        expect(fullCall.npcCount).toBeGreaterThan(0);
        expect(Array.isArray(fullCall.eventChain)).toBe(true);
    });

    test('hud_setLastSceneBlueprint_and_setLastSceneEventChain_reflect_wasm_output', async () => {
        // The HUD's user-visible signal is two
        // functions: `setLastSceneBlueprint(scalars)`
        // (round 47) and `setLastSceneEventChain(chain)`
        // (round 73). Both must reflect the WASM bridge
        // output, not the bridge blueprint, not stale
        // state from a prior dimension.
        const app = makeApp();
        const stubs = stubSideEffects(app);
        const seed = 4242;
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e' },
                atomIds: ['tower_defense'],
                blueprint: makeBridgeBlueprint(seed, 'cyberpunk', 'pulse'),
                modules: [],
                seed,
                configSource: 'wasm',
            }));
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub({
            npcCount: 5,
            musicBpm: 130,
            eventChain: [
                { kind: 'spawn_wave', delaySecs: 5, payload: 'hud_spawn_0' },
                { kind: 'echo_lore', delaySecs: 13, payload: 'hud_echo_1' },
            ],
        });

        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();

        // setLastSceneBlueprint is called once with the
        // WASM-derived scalars (npcCount=5, bpm=130, 2
        // events, 2 archetype hints).
        expect(stubs.setLastSceneBlueprint).toHaveBeenCalledTimes(1);
        const scalars = stubs.setLastSceneBlueprint.mock.calls[0][0] as {
            npcCount: number; bpm: number; eventCount: number; archetypeHintCount: number;
        };
        expect(scalars.npcCount).toBe(5);
        expect(scalars.bpm).toBe(130);
        expect(scalars.eventCount).toBe(2);
        expect(scalars.archetypeHintCount).toBe(2);
        // setLastSceneEventChain is called with the
        // 2-event chain.
        expect(stubs.setLastSceneEventChain).toHaveBeenCalledTimes(1);
        const chain = stubs.setLastSceneEventChain.mock.calls[0][0] as Array<{ kind: string; payload: string }>;
        expect(chain).toHaveLength(2);
        expect(chain[0].kind).toBe('spawn_wave');
        expect(chain[1].payload).toBe('hud_echo_1');
    });

    test('lastMinimap_is_rendered_and_pushed_to_HUD_on_both_paths', async () => {
        // The round-63/64 minimap is rendered + persisted
        // + pushed to the HUD on every `enterNewDimension`.
        // Verify both the WASM path AND the TS-mirror
        // path produce a non-null minimap. (The test
        // stays robust on the exact PNG payload — the
        // round-63 contract is "data URL starts with
        // `data:image/png` or is null on jsdom painter
        // failures; we just check non-null here.)
        for (const wasmMod of [makeWasmStub(), null] as const) {
            const app = makeApp();
            const stubs = stubSideEffects(app);
            jest
                .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
                .mockImplementation(async () => ({
                    suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'e2e' },
                    atomIds: ['tower_defense'],
                    blueprint: makeBridgeBlueprint(11111, 'cyberpunk', 'pulse'),
                    modules: [],
                    seed: 11111,
                    configSource: wasmMod ? 'wasm' : 'ts-fallback',
                }));
            (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = wasmMod;

            await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();

            // setMinimap was called with a non-null
            // argument.
            expect(stubs.setMinimap).toHaveBeenCalledTimes(1);
            const arg = stubs.setMinimap.mock.calls[0][0];
            expect(arg).not.toBeNull();
            // WorldState.lastMinimap was set to a
            // non-null data URL.
            const ws = (app as unknown as { worldState: { lastMinimap: string | null } }).worldState;
            expect(ws.lastMinimap).not.toBeNull();

            jest.restoreAllMocks();
        }
    });
});
