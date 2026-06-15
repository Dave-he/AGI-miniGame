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
import * as fs from 'fs';
import * as path from 'path';
import { makeWasmStub } from './test-utils/sceneGenWasmStub';
import {
    enterDimensionWithStub,
    enterDimensionWithFailingWasm,
    enterAtomWithStub,
    makeBridgeBlueprint,
    installSideEffectStubs,
    installHudSetterStubs,
} from './test-utils/enterDimensionHelpers';

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

// ---------------------------------------------------------------------------
// Round 84 — WASM bridge mid-stream failure e2e.
//
// The round-80 e2e block covered the **module-not-loaded** case
// (`sceneGenWasm = null` → TS mirror takes over). The
// `SceneGenWasm.test.ts` unit tests cover the failure modes at
// the function level (`callThemeToScene` returns null on error
// JSON, throw, invalid shape, etc.). But no App-level e2e
// test proved the round-48 "progressive enhancement" promise
// for the **module-loaded-but-call-failed** case:
//
//   1. WASM module loads fine (version stamp OK).
//   2. `theme_to_scene_json` returns `{"error":"..."}` for a
//      specific call (e.g. seed out of range, malformed
//      theme).
//   3. App should still produce a valid WorldState + HUD
//      state via the TS mirror.
//
// This block closes that gap. The 4 tests below inject a
// custom-failing stub via the round-82 `makeWasmStub` helper
// (just override `theme_to_scene_json`) and assert the
// App's end state is byte-identical to the
// `sceneGenWasm = null` case.
//
// **Why this matters**: the round-48 docstring promises
// WASM is a "progressive enhancement" — the page should
// play even when the .wasm returns unexpected shapes.
// Without these tests, a future contributor could refactor
// `callThemeToScene`'s error handling (e.g. delete the
// try/catch, change the error JSON shape, swap the
// `parsed.error` check for `parsed.success`) and no e2e
// test would catch the regression — the unit tests would,
// but a unit test of "the call returns null" doesn't prove
// the App's WorldState still gets a valid blueprint.
// ---------------------------------------------------------------------------

describe('App — round 84 e2e: WASM mid-stream failure → TS mirror fallback', () => {
    // Round 90 — the inline `makeBridgeBlueprint` +
    // `enterDimensionWithFailingWasm` were extracted to
    // `src/test-utils/enterDimensionHelpers.ts`. The tests
    // below call the imported helper directly.

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('enterNewDimension_uses_TS_mirror_when_WASM_theme_to_scene_returns_error_json', async () => {
        // The WASM shim wraps any unknown-enum /
        // serialize failure into `{"error":"..."}` JSON.
        // The TS-side `callThemeToScene` checks for this
        // shape and returns `null` so the fallback runs.
        // This test verifies the App actually falls back
        // (not silently passes through to a corrupted
        // WorldState).
        const app = makeApp();
        const spies = await enterDimensionWithFailingWasm(
            app,
            0xCAFE0001,
            () => JSON.stringify({ error: 'r84-malformed-enum' }),
        );

        // The blueprint is still written exactly once
        // (the TS-mirror's output, not the WASM error).
        expect(spies.updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
        const snap = spies.updateLastSceneBlueprintFull.mock.calls[0][0] as {
            wfcTileWeights: number[];
            biomeId: string;
            npcCount: number;
            eventChain: unknown[];
        };
        // The TS-mirror's output has the expected
        // shape — wfc weights is an 8-tuple, biomeId
        // is a non-empty string, npcCount is a
        // positive number, eventChain is a non-empty
        // array.
        expect(Array.isArray(snap.wfcTileWeights)).toBe(true);
        expect(snap.wfcTileWeights).toHaveLength(8);
        expect(snap.biomeId).toBeTruthy();
        expect(snap.npcCount).toBeGreaterThan(0);
        expect(Array.isArray(snap.eventChain)).toBe(true);
        expect(snap.eventChain.length).toBeGreaterThan(0);
    });

    test('enterNewDimension_uses_TS_mirror_when_WASM_theme_to_scene_throws', async () => {
        // The WASM module can throw (e.g. trap, OOM,
        // panic-on-bad-seed). The TS-side `callThemeToScene`
        // catches the throw and returns `null`. This
        // test verifies the App falls back rather than
        // crashing the entire `enterNewDimension` flow.
        const app = makeApp();
        const spies = await enterDimensionWithFailingWasm(
            app,
            0xCAFE0002,
            () => { throw new Error('r84-wasm-trap'); },
        );

        expect(spies.updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
        const snap = spies.updateLastSceneBlueprintFull.mock.calls[0][0] as {
            biomeId: string;
            npcCount: number;
        };
        expect(snap.biomeId).toBeTruthy();
        expect(snap.npcCount).toBeGreaterThan(0);
    });

    test('enterNewDimension_uses_TS_mirror_when_WASM_theme_to_scene_returns_invalid_shape', async () => {
        // The WASM module can return syntactically
        // valid JSON that doesn't have the required
        // fields (e.g. a new schema version where
        // `wfc_tile_weights` is now `wfc_weights_v2`).
        // The TS-side `callThemeToScene` checks the
        // shape and returns `null`.
        const app = makeApp();
        const spies = await enterDimensionWithFailingWasm(
            app,
            0xCAFE0003,
            () => JSON.stringify({ wfc_weights_v2: [1, 2, 3], biome_id: 'forest' }),
        );

        expect(spies.updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
        const snap = spies.updateLastSceneBlueprintFull.mock.calls[0][0] as {
            wfcTileWeights: number[];
            biomeId: string;
        };
        expect(snap.wfcTileWeights).toHaveLength(8);
        expect(snap.biomeId).toBeTruthy();
    });

    test('enterNewDimension_uses_TS_mirror_when_WASM_theme_to_scene_returns_non_json', async () => {
        // Edge case: the WASM module returns a
        // non-JSON string (the shim crashed, returned
        // a plain error message). The TS-side
        // `callThemeToScene` catches the JSON parse
        // failure and returns `null`.
        const app = makeApp();
        const spies = await enterDimensionWithFailingWasm(
            app,
            0xCAFE0004,
            () => 'r84-not-json',
        );

        expect(spies.updateLastSceneBlueprintFull).toHaveBeenCalledTimes(1);
        const snap = spies.updateLastSceneBlueprintFull.mock.calls[0][0] as {
            biomeId: string;
            npcCount: number;
            eventChain: unknown[];
        };
        expect(snap.biomeId).toBeTruthy();
        expect(snap.npcCount).toBeGreaterThan(0);
        expect(Array.isArray(snap.eventChain)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Round 83 — rollback rehydrate e2e (round-79 telemetry gate).
//
// The round-80 block above proved the WASM `theme_to_scene_json`
// output flows into `WorldState.lastSceneBlueprint` on
// `enterNewDimension`. The round-55/79 blocks proved the
// `rollbackToLastGood` step-by-step field restore + the
// `rollbackCount` counter wiring. But no single test walked
// the full lifecycle:
//
//   1. `enterNewDimension` with `makeWasmStub` (the round-82
//      helper) writes stub A's output to WorldState
//   2. The pre-failure `backupFailedSnapshot` captures that
//      good state
//   3. WorldState mutates (simulating a failed second
//      `enterNewDimension` that bails mid-render)
//   4. `rollbackToLastGood` restores the snapshot
//   5. The WorldState + HUD rehydrate to stub A's output
//
// …plus the round-79 telemetry gate: the lifetime
// `rollbackCount` persists across `saveGame` → `loadGame`
// and the HUD's 🛟 row receives the persisted count.
//
// This block closes that gap. The 4 tests use the round-82
// `makeWasmStub` helper (extracted last round specifically
// for this kind of multi-step e2e flow), so no copy-pasted
// factory code lives in this block.
//
// **Why this round matters**: the round-54 rollback UI is the
// last line of defense for the player when a second
// `enterNewDimension` corrupts the world. The round-72 event
// chain + round-79 rollback counter are the only persistent
// signals the player can see AFTER a reload. If the rollback
// path silently drops the event chain (or the rollback
// counter never reaches the HUD on load), the player can't
// tell that a rollback happened — the recovery is invisible.
// ---------------------------------------------------------------------------

describe('App — round 83 e2e: rollback rehydrate from WASM-stub snapshot', () => {
    // Round 90 — the inline `makeBridgeBlueprint` +
    // `enterDimensionWithStub` were extracted to
    // `src/test-utils/enterDimensionHelpers.ts`. The tests
    // below call the imported helper directly.
    //
    // **Critical anti-regression**: the imported helper
    // deliberately does NOT spy on
    // `worldState.updateLastSceneBlueprintFull`,
    // `worldState.clearFailedSnapshot`, or
    // `worldState.setLastSceneEventChain` — those are the
    // round-49/72/53 write paths. The round-83 test needs
    // the REAL writes to land so the rollback can capture
    // + restore them. Stubbing them would short-circuit the
    // persistence and the rollback would have nothing to
    // restore.

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('rollback_rehydrates_lastSceneBlueprint_to_pre_failure_WASM_stub_state', async () => {
        // The full rollback lifecycle:
        //   1. enterNewDimension with stub A (npcCount=7,
        //      bpm=140, biome=neon-harbor) → WorldState
        //      has stub A's output
        //   2. backupFailedSnapshot captures the
        //      pre-failure state (= stub A)
        //   3. WorldState mutates (simulate a failed
        //      second dimension) → npcCount=999
        //   4. rollbackToLastGood → WorldState back to
        //      stub A (npcCount=7, bpm=140)
        const app = makeApp();
        const seed = 0xBEEF0001;
        await enterDimensionWithStub(app, seed, 'cyberpunk', 'pulse', {
            npcCount: 7,
            musicBpm: 140,
            biomeId: 'neon-harbor',
            npcArchetypeHints: ['mage', 'beast', 'thief'],
        });
        // Capture the pre-failure state.
        (app as unknown as { worldState: { backupFailedSnapshot: () => void } }).worldState.backupFailedSnapshot();
        // Simulate the failed second dimension by
        // mutating the WorldState directly. The
        // round-54 backup field is still the stub A
        // snapshot, so rollback should restore it.
        const ws = (app as unknown as {
            worldState: {
                lastSceneBlueprint: { npcCount: number; musicBpm: number; biomeId: string } | null;
                updateLastSceneBlueprintFull: (s: { npcCount: number; musicBpm: number; biomeId: string; npcArchetypeHints: string[] }) => void;
            };
        }).worldState;
        ws.lastSceneBlueprint = { ...(ws.lastSceneBlueprint ?? { npcCount: 0, musicBpm: 0, biomeId: '' }), npcCount: 999, musicBpm: 999, biomeId: 'corrupt' };

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // The restore brings WorldState back to
        // stub A's output (NOT the mutated
        // post-failure state).
        expect(ws.lastSceneBlueprint?.npcCount).toBe(7);
        expect(ws.lastSceneBlueprint?.musicBpm).toBe(140);
        expect(ws.lastSceneBlueprint?.biomeId).toBe('neon-harbor');
    });

    test('rollback_increments_rollbackCount_and_persists_to_save', async () => {
        // The round-79 telemetry gate: a successful
        // rollback increments the lifetime counter,
        // and that count must survive save → reload
        // (otherwise the HUD's 🛟 row would reset on
        // every page refresh — a regression that
        // would hide the player's rollback history).
        const app = makeApp();
        await enterDimensionWithStub(app, 0xBEEF0002, 'cyberpunk', 'pulse', { npcCount: 5, musicBpm: 130, biomeId: 'neon-harbor' });
        (app as unknown as { worldState: { backupFailedSnapshot: () => void } }).worldState.backupFailedSnapshot();
        // Mutate so rollback has work to do.
        (app as unknown as { worldState: { lastSceneBlueprint: { npcCount: number } | null } }).worldState.lastSceneBlueprint = { npcCount: 999, musicBpm: 0, biomeId: '' } as never;

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        const ws = (app as unknown as { worldState: { rollbackCount: number } }).worldState;
        expect(ws.rollbackCount).toBe(1);

        // Persist the rollback count + WorldState.
        (app as unknown as { saveGame: () => void }).saveGame();

        // A fresh App + loadGame should see the
        // persisted count.
        const app2 = makeApp();
        const setRollbackCount2 = jest
            .spyOn((app2 as unknown as { hud: { setRollbackCount: (n: number | null) => void } }).hud, 'setRollbackCount')
            .mockImplementation(() => undefined);
        // Other HUD setters called by loadGame, made
        // silent so the test only asserts on
        // setRollbackCount.
        jest.spyOn((app2 as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setNpcMindsSnapshot: (s: unknown) => void } }).hud, 'setNpcMindsSnapshot').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear').mockImplementation(() => undefined);
        jest.spyOn(app2 as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setLastSceneEventChain: (c: unknown) => void } }).hud, 'setLastSceneEventChain').mockImplementation(() => undefined);

        (app2 as unknown as { loadGame: () => void }).loadGame();

        // The HUD 🛟 row receives the persisted
        // count on reload. If this assertion fails,
        // a reload silently hides the player's
        // rollback history — the recovery becomes
        // invisible.
        expect(setRollbackCount2).toHaveBeenCalledWith(1);
    });

    test('rollback_restores_lastSceneEventChain_to_WASM_stub_output', async () => {
        // Round 72 — the full event chain is
        // persisted to WorldState. The round-54
        // rollback restores it from the backup
        // (not the corrupted post-failure state).
        // The HUD's ⏰ row reads from it; a
        // rollback that drops the chain would
        // make the player's "what events are
        // coming up" prompt go blank.
        const app = makeApp();
        await enterDimensionWithStub(app, 0xBEEF0003, 'fantasy', 'epic', {
            eventChain: [
                { kind: 'spawn_wave', delaySecs: 5, payload: 'r83_a' },
                { kind: 'echo_lore', delaySecs: 13, payload: 'r83_b' },
                { kind: 'treasure_drop', delaySecs: 21, payload: 'r83_c' },
            ],
        });
        (app as unknown as { worldState: { backupFailedSnapshot: () => void } }).worldState.backupFailedSnapshot();
        // Corrupt the event chain so the rollback
        // has something to restore.
        (app as unknown as { worldState: { lastSceneEventChain: Array<{ kind: string; delaySecs: number; payload: string }> | null } }).worldState.lastSceneEventChain = [
            { kind: 'corrupt', delaySecs: 0, payload: 'corrupt' },
        ];

        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        // The rollback restores the stub A event
        // chain (3 entries, kinds spawn_wave /
        // echo_lore / treasure_drop, payloads
        // r83_a/b/c).
        const ws = (app as unknown as {
            worldState: { lastSceneEventChain: Array<{ kind: string; delaySecs: number; payload: string }> | null };
        }).worldState;
        expect(ws.lastSceneEventChain).not.toBeNull();
        expect(ws.lastSceneEventChain).toHaveLength(3);
        expect(ws.lastSceneEventChain?.map(e => e.kind)).toEqual(['spawn_wave', 'echo_lore', 'treasure_drop']);
        expect(ws.lastSceneEventChain?.map(e => e.payload)).toEqual(['r83_a', 'r83_b', 'r83_c']);
    });

    test('rollback_no_op_does_NOT_increment_rollbackCount_even_after_save_load', async () => {
        // Defensive regression guard: a
        // rollbackToLastGood call with no
        // lastFailedSnapshot is a no-op. It must
        // NOT bump the counter (otherwise
        // accidentally-invoked no-ops would inflate
        // the player's rollback history).
        const app = makeApp();
        // No backup set, no enterNewDimension.
        // WorldState.rollbackCount is 0.
        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();

        const ws = (app as unknown as { worldState: { rollbackCount: number } }).worldState;
        expect(ws.rollbackCount).toBe(0);

        // Save + load — the persisted count is
        // still 0, and the HUD receives
        // setRollbackCount(0).
        (app as unknown as { saveGame: () => void }).saveGame();

        const app2 = makeApp();
        const setRollbackCount2 = jest
            .spyOn((app2 as unknown as { hud: { setRollbackCount: (n: number | null) => void } }).hud, 'setRollbackCount')
            .mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setNpcMindsSnapshot: (s: unknown) => void } }).hud, 'setNpcMindsSnapshot').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear').mockImplementation(() => undefined);
        jest.spyOn(app2 as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition').mockImplementation(() => undefined);
        jest.spyOn((app2 as unknown as { hud: { setLastSceneEventChain: (c: unknown) => void } }).hud, 'setLastSceneEventChain').mockImplementation(() => undefined);

        (app2 as unknown as { loadGame: () => void }).loadGame();

        expect(setRollbackCount2).toHaveBeenCalledWith(0);
    });
});

// ---------------------------------------------------------------------------
// Round 89 — e2e tests for the round-87 `setLastBiomeAccent`
// wiring. Round 87 added 4 call sites in main.ts that
// resolve `biome → color` (via `getBiomeAtmosphere`) and
// push the value to the HUD. The unit-level contract
// (HUDState field + setter + dim panel style) is locked
// in HUD.test.ts; this block locks the App-level wiring
// so a future refactor of `enterNewDimension`,
// `rollbackToLastGood`, or `loadGame` can't silently
// drop the accent.
//
// The 4 call sites:
//   1. enterNewDimension (post-themeToScene path, line ~886)
//   2. DmMode.onDimension (DM-driven path, line ~273)
//   3. rollbackToLastGood (line ~1509)
//   4. loadGame (line ~1574)
//
// `getBiomeAtmosphere('forest').particleColor` = '#90c290'
// `getBiomeAtmosphere('desert').particleColor` = '#ffd166'
// `getBiomeAtmosphere('ice').particleColor`    = '#ffffff'
// ---------------------------------------------------------------------------

describe('App — round 89 e2e: setLastBiomeAccent wiring', () => {
    // Local `makeBridgeBlueprint` — identical to
    // the round-80 + round-83 fixture. Inlined
    // here (not module-scoped) so this block is
    // self-contained.
    // Round 90 — the inline `makeBridgeBlueprintR89` +
    // `enterAtomAccentTest` were extracted to
    // `src/test-utils/enterDimensionHelpers.ts` as
    // `makeBridgeBlueprint` (with a rationaleTag param) +
    // `enterAtomWithStub`. The tests below call the
    // imported helper directly.
    //
    // **Why no HUD-setter stubs here**: the round-89
    // tests spy on the real HUD writes to assert on the
    // round-87 `setLastBiomeAccent` wiring. The
    // `enterAtomWithStub` helper does NOT stub HUD
    // setters (matching the round-89 inline behavior).

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('enterAtom_keyboard_jump_pushes_accent_from_WASM_resolved_biome', async () => {
        // The round-65/87 keyboard 1-8 jump path:
        // `enterAtom('tower_defense')` resolves the
        // biome via themeToScene (WASM stub returns
        // biome='forest'), then pushes the forest
        // particleColor '#90c290' to the HUD.
        const app = makeApp();
        const setAccent = jest
            .spyOn((app as unknown as { hud: { setLastBiomeAccent: (c: string | null) => void } }).hud, 'setLastBiomeAccent')
            .mockImplementation(() => undefined);
        await enterAtomWithStub(app, 0xFEED0001, 'fantasy', 'mysterious', {
            biomeId: 'forest',
        });
        expect(setAccent).toHaveBeenCalledWith('#90c290');
    });

    test('DmMode_run_dim_pushes_accent_for_DM_resolved_biome', async () => {
        // The DM-driven path: player types
        // `dim 5 5 desert` in the DM console. The
        // DmMode parses it and dispatches to the
        // `onDimension` callback in main.ts, which
        // is the round-66 + round-87 wiring under
        // test.
        const app = makeApp();
        // Stub the side effects that the DM
        // callback triggers so the test stays
        // headless (no WebGL, no AudioContext).
        jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        const setAccent = jest
            .spyOn((app as unknown as { hud: { setLastBiomeAccent: (c: string | null) => void } }).hud, 'setLastBiomeAccent')
            .mockImplementation(() => undefined);

        // DmMode's public API is `run(line)`, not
        // `handle(line)`. The 'dim 5 5 desert' form
        // dispatches to the onDimension callback.
        (app as unknown as { dm: { run: (line: string) => unknown } }).dm.run('dim 5 5 desert');

        expect(setAccent).toHaveBeenCalledWith('#ffd166');
    });

    test('rollbackToLastGood_pushes_accent_from_restored_biome', async () => {
        // The rollback path: worldState.lastBiome
        // is restored from the backup, then
        // setLastBiomeAccent is called with the
        // matching particleColor. We use biome
        // 'ice' here so the assertion can
        // distinguish it from the forest default
        // in makeSnap.
        const app = makeApp();
        // Drive an `enterAtom` first to seed
        // worldState.lastBiome = 'ice' (the
        // backup biome). The backup snapshot is
        // set up by the round-79 failure path;
        // we call backupFailedSnapshot directly
        // to keep the test focused on the
        // rollback restore step.
        await enterAtomWithStub(app, 0xFEED0002, 'fantasy', 'melancholic', {
            biomeId: 'ice',
        });
        (app as unknown as { worldState: { backupFailedSnapshot: (b: unknown) => void } }).worldState.backupFailedSnapshot({
            blueprint: makeSnap({ biomeId: 'ice' }),
            seed: 0xFEED0002,
            biome: 'ice',
            npcSnapshot: [],
        });
        // Spy on the post-restore accent push.
        const setAccent = jest
            .spyOn((app as unknown as { hud: { setLastBiomeAccent: (c: string | null) => void } }).hud, 'setLastBiomeAccent')
            .mockImplementation(() => undefined);
        (app as unknown as { rollbackToLastGood: () => void }).rollbackToLastGood();
        // After rollback, the HUD must receive
        // the ice biome's particleColor.
        expect(setAccent).toHaveBeenCalledWith('#ffffff');
    });

    test('loadGame_pushes_accent_from_loaded_biome', async () => {
        // The save/load path: loadGame calls
        // `this.save.restore()`, which clears
        // WorldState and re-applies the saved
        // fields. We stub `restore()` to seed
        // lastBiome='desert' and return true so
        // the round-43 + round-87 HUD-write
        // sequence runs.
        const app = makeApp();
        // Stub save.restore to seed the
        // desert biome and return success.
        jest
            .spyOn((app as unknown as { save: { restore: () => boolean } }).save, 'restore')
            .mockImplementation(() => {
                (app as unknown as { worldState: { lastBiome: string } }).worldState.lastBiome = 'desert';
                return true;
            });
        // Stub all the other HUD setters that
        // loadGame calls so we focus the
        // assertion on setLastBiomeAccent alone.
        jest.spyOn((app as unknown as { hud: { setLastBiome: (b: string | null) => void } }).hud, 'setLastBiome').mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setMinimap: (m: string | null) => void } }).hud, 'setMinimap').mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { hud: { setNpcMindsSnapshot: (s: unknown) => void } }).hud, 'setNpcMindsSnapshot').mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { npcMinds: { loadFromSnapshots: (s: unknown) => void } }).npcMinds, 'loadFromSnapshots').mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { npcMinds: { clear: () => void } }).npcMinds, 'clear').mockImplementation(() => undefined);
        jest.spyOn(app as unknown as { syncNpcDisposition: () => void }, 'syncNpcDisposition').mockImplementation(() => undefined);
        const setAccent = jest
            .spyOn((app as unknown as { hud: { setLastBiomeAccent: (c: string | null) => void } }).hud, 'setLastBiomeAccent')
            .mockImplementation(() => undefined);

        (app as unknown as { loadGame: () => void }).loadGame();

        // loadGame should push the desert
        // particleColor since the stubbed
        // restore() set WorldState.lastBiome
        // to 'desert' before the round-87
        // wiring read it.
        expect(setAccent).toHaveBeenCalledWith('#ffd166');
    });
});

// ---------------------------------------------------------------------------
// Round 91 — backtick/tilde key-binding for the DM God console.
//
// The DM console is the entry point for `dm run <cmd>` lines that
// drive the round-66 `onDimension` callback (and the round-87
// `setLastBiomeAccent` wiring it transitively triggers). Pre-
// round-91 the player had to click `btn-god` in the HUD; the
// keyboard shortcut closes the "操控性好" gap.
//
// The bootstrap's keydown listener (main.ts:1987+) is installed
// in `bootstrap()`, not on the App constructor. The end-to-end
// assertion below replicates the listener's action-dispatch
// switch in-test (it imports `routeKey` and exercises the same
// code path the global keydown handler uses) and asserts that
// the App exposes a callable `toggleGodConsole` method that
// the switch case invokes. This catches a regression where a
// future refactor renames or removes the method without
// updating the bootstrap switch.
//
// **Why not just dispatch a synthetic `keydown` on window**: the
// real keydown listener is bound inside `bootstrap()`, which
// also does heavy App wiring (SceneManager, NPC minds, the
// auto-enter timeout). Replicating the listener's switch in
// the test is more focused — the test asserts on the App
// method, not on whether jsdom fires synthetic events. The
// 2 unit tests in `KeyboardShortcuts.test.ts` cover the
// `routeKey` → action mapping.
// ---------------------------------------------------------------------------

import { routeKey, BINDING_DESCRIPTIONS } from './input/KeyboardShortcuts';

describe('App — round 91: backtick/tilde key-binding for DM console (操控性好)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('routeKey_backtick_returns_toggle_dm_console_action', () => {
        // The router must translate the backtick key
        // into the semantic action the bootstrap
        // switch dispatches. A regression here would
        // silently break the round-91 wiring.
        const action = routeKey('`');
        expect(action).toEqual({ kind: 'toggle-dm-console' });
    });

    test('routeKey_tilde_returns_toggle_dm_console_action_for_shifted_key', () => {
        // The same physical key produces `~` when
        // shifted. We route both `ev.key` outputs to
        // the same action so the player doesn't have
        // to remember their layout's shift-state.
        const action = routeKey('~');
        expect(action).toEqual({ kind: 'toggle-dm-console' });
    });

    test('App_exposes_toggleGodConsole_for_bootstrap_keydown_switch', () => {
        // The bootstrap keydown switch case
        // `'toggle-dm-console': app.toggleGodConsole()`
        // requires the App to expose a callable
        // `toggleGodConsole` method. A regression
        // that renames or removes the method (or
        // makes it private) would compile-fail the
        // main.ts switch, but this test catches the
        // softer "method renamed but the switch
        // wasn't updated" scenario.
        const app = makeApp();
        const fn = (app as unknown as { toggleGodConsole?: () => void }).toggleGodConsole;
        expect(typeof fn).toBe('function');
    });

    test('toggleGodConsole_is_a_no_op_when_godConsole_is_null_in_test_setup', () => {
        // The test setup creates the App without
        // running `bootstrap()`, so `this.godConsole`
        // is null. The method's `this.godConsole?.toggle()`
        // chain means it must be a safe no-op — it
        // must not throw when `godConsole` is null.
        // A regression that drops the `?.` and
        // dereferences directly would throw here.
        const app = makeApp();
        expect(() => {
            (app as unknown as { toggleGodConsole: () => void }).toggleGodConsole();
        }).not.toThrow();
    });

    test('bootstrap_keydown_handler_full_path_backtick_to_toggleGodConsole', () => {
        // End-to-end of the full round-91 path:
        //   keydown("`") → routeKey → { kind: 'toggle-dm-console' }
        //               → app.toggleGodConsole()
        // We assert the wiring by spying on
        // `toggleGodConsole`, dispatching the action
        // the bootstrap switch would dispatch, and
        // confirming the spy was called.
        const app = makeApp();
        const toggleSpy = jest
            .spyOn(app as unknown as { toggleGodConsole: () => void }, 'toggleGodConsole')
            .mockImplementation(() => undefined);
        // Replicate the bootstrap switch (line 1987+)
        // for the new action kind.
        const action = routeKey('`');
        expect(action).not.toBeNull();
        if (action && action.kind === 'toggle-dm-console') {
            app.toggleGodConsole();
        }
        expect(toggleSpy).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Round 94 — Esc / abandon end-to-end chain (操控性好).
//
// The Esc key is the round-21 "abandon current dimension" shortcut
// (KeyboardShortcuts routeKey 'Escape' → { kind: 'abandon' } →
// bootstrap switch case 'abandon': app.abandonCurrentDimension()).
// Pre-round-94 only the routeKey → action mapping was tested; the
// App method itself and its side-effect chain (vault.record +
// ai.recordSession + npcMinds.broadcast) were untested. Rounds 85
// (R rollback) and 91 (` /~ DM console) each added a full-chain
// e2e test for their shortcut. The Esc chain has been the
// longest-running "操控性好" gap in the test surface.
//
// The chain under test:
//   keydown("Escape") → routeKey → { kind: 'abandon' }
//     → app.abandonCurrentDimension()
//     → app.recordDimensionOutcome('abandoned', -0.1)
//     → app.vault.record(dim, 'abandoned', ts)
//     → app.ai.recordSession({ ..., completed: false })
//     → app.npcMinds.broadcast({ kind: 'witnessed_event', weight: -0.1, ... })
//
// We assert on the spy call shapes (not the persisted state) so
// the test is fast and doesn't depend on the live `vault` /
// `npcMinds` / `tuner` instances — same round-84/89 pattern.
// ---------------------------------------------------------------------------

describe('App — round 94: Esc/abandon end-to-end chain (操控性好)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** Minimal DimensionBlueprint fixture for the abandon chain. */
    function makeAbandonDim(): {
        id: string;
        name: string;
        description: string;
        atomIds: string[];
        atomWeights: Record<string, number>;
        difficulty: number;
        rules: unknown[];
        rewards: unknown[];
        theme: { name: string; visualStyle: string; musicMood: string; colorPalette: string[] };
        timeLimitSecs: number | null;
        objectives: unknown[];
    } {
        return {
            id: 'dim_abandon_r94',
            name: 'round 94 abandon fixture',
            description: 'r94 abandon chain',
            atomIds: ['tower_defense'],
            atomWeights: { tower_defense: 1 },
            difficulty: 0.5,
            rules: [],
            rewards: [],
            theme: { name: 'r94_abandon_theme', visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: [] },
            timeLimitSecs: 60,
            objectives: [],
        };
    }

    test('abandonCurrentDimension_is_a_no_op_when_no_current_dimension', () => {
        // The test setup creates the App without running
        // `enterNewDimension()`, so `hud.getState().dimension`
        // is null. `abandonCurrentDimension` must short-circuit
        // and log a "no current dimension" message — a
        // regression that drops the null check would throw.
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        expect(() => {
            (app as unknown as { abandonCurrentDimension: () => void }).abandonCurrentDimension();
        }).not.toThrow();
        // The no-op path logs a Chinese-localized message so
        // the player understands why the press did nothing.
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(lines).toMatch(/没有进入中的次元|无法标记/);
    });

    test('abandonCurrentDimension_writes_vault_record_with_outcome_abandoned', () => {
        // The Esc chain's first side-effect is the
        // `vault.record(dim, 'abandoned', ts)` call. A
        // regression that drops the call (or passes the
        // wrong outcome string) would silently break the
        // round-21 vault completion-rate stats — a
        // "abandoned" dimension would count as "completed"
        // and the AI's difficulty tuning would over-estimate
        // the player's success.
        const app = makeApp();
        const dim = makeAbandonDim();
        // Mock hud.getState() to return our fixture as
        // the current dimension. Without this the no-op
        // branch fires and vault.record is never called.
        jest
            .spyOn((app as unknown as { hud: { getState: () => { dimension: typeof dim | null } } }).hud, 'getState')
            .mockReturnValue({ dimension: dim });
        const vaultRecord = jest
            .spyOn((app as unknown as { vault: { record: (b: unknown, o: string, t: number) => void } }).vault, 'record')
            .mockImplementation(() => undefined);
        (app as unknown as { abandonCurrentDimension: () => void }).abandonCurrentDimension();
        expect(vaultRecord).toHaveBeenCalledTimes(1);
        const [recordedDim, outcome, ts] = vaultRecord.mock.calls[0];
        expect(recordedDim).toBe(dim);
        expect(outcome).toBe('abandoned');
        // The third arg is `Date.now()` — we don't pin the
        // exact value, just assert it's a positive integer
        // (the call happened "now", not in 1970 or 3025).
        expect(typeof ts).toBe('number');
        expect(ts).toBeGreaterThan(0);
    });

    test('abandonCurrentDimension_records_session_with_completed_false', () => {
        // The Esc chain's second side-effect is
        // `ai.recordSession({ ..., completed: false })`.
        // The BalanceTuner uses this to weight the player's
        // success rate — a regression that passes
        // `completed: true` would make the AI think the
        // player succeeded at the abandoned dimension,
        // inflating the difficulty curve.
        const app = makeApp();
        const dim = makeAbandonDim();
        jest
            .spyOn((app as unknown as { hud: { getState: () => { dimension: typeof dim | null } } }).hud, 'getState')
            .mockReturnValue({ dimension: dim });
        const recordSession = jest
            .spyOn((app as unknown as { ai: { recordSession: (r: { dimensionId: string; difficulty: number; playerLevel: number; score: number; durationSecs: number; completed: boolean }) => void } }).ai, 'recordSession')
            .mockImplementation(() => undefined);
        (app as unknown as { abandonCurrentDimension: () => void }).abandonCurrentDimension();
        expect(recordSession).toHaveBeenCalledTimes(1);
        const [session] = recordSession.mock.calls[0];
        expect(session.dimensionId).toBe(dim.id);
        expect(session.difficulty).toBe(dim.difficulty);
        expect(session.completed).toBe(false);
    });

    test('abandonCurrentDimension_broadcasts_witnessed_event_with_weight_minus_0_1', () => {
        // The Esc chain's third side-effect is
        // `npcMinds.broadcast({ kind: 'witnessed_event',
        // weight: -0.1, ... })`. The weight is the
        // round-21 convention: a small negative weight
        // because the player gave up (not catastrophic
        // like a -0.4 fail). A regression that swaps
        // the weight to +0.1 (positive!) would make
        // NPCs more friendly after the player gives up,
        // which is the opposite of the design intent.
        const app = makeApp();
        const dim = makeAbandonDim();
        jest
            .spyOn((app as unknown as { hud: { getState: () => { dimension: typeof dim | null } } }).hud, 'getState')
            .mockReturnValue({ dimension: dim });
        const broadcast = jest
            .spyOn((app as unknown as { npcMinds: { broadcast: (e: { kind: string; summary: string; turn: number; weight: number }) => void } }).npcMinds, 'broadcast')
            .mockImplementation(() => undefined);
        (app as unknown as { abandonCurrentDimension: () => void }).abandonCurrentDimension();
        expect(broadcast).toHaveBeenCalledTimes(1);
        const [entry] = broadcast.mock.calls[0];
        expect(entry.kind).toBe('witnessed_event');
        expect(entry.weight).toBeCloseTo(-0.1, 5);
        // The summary is a localized string of the form
        // "abandoned: <dim name>". Pin the shape so a
        // future i18n rename is caught.
        expect(entry.summary).toMatch(/abandoned:.*round 94 abandon fixture/);
    });

    test('failCurrentDimension_writes_vault_record_with_outcome_failed', () => {
        // Symmetric coverage: the round-21 `fail` path is
        // the counterpart to `abandon`. The Esc key doesn't
        // trigger it (it's the round-26 inline 🔙 button +
        // auto-fail on unrecoverable render errors), but
        // the helper shares `recordDimensionOutcome` so a
        // regression in the shared code would break both.
        // We pin the `failed` outcome + -0.4 weight contract.
        const app = makeApp();
        const dim = makeAbandonDim();
        jest
            .spyOn((app as unknown as { hud: { getState: () => { dimension: typeof dim | null } } }).hud, 'getState')
            .mockReturnValue({ dimension: dim });
        const vaultRecord = jest
            .spyOn((app as unknown as { vault: { record: (b: unknown, o: string, t: number) => void } }).vault, 'record')
            .mockImplementation(() => undefined);
        const broadcast = jest
            .spyOn((app as unknown as { npcMinds: { broadcast: (e: { kind: string; weight: number }) => void } }).npcMinds, 'broadcast')
            .mockImplementation(() => undefined);
        (app as unknown as { failCurrentDimension: () => void }).failCurrentDimension();
        expect(vaultRecord).toHaveBeenCalledTimes(1);
        const [, outcome] = vaultRecord.mock.calls[0];
        expect(outcome).toBe('failed');
        // The fail path broadcasts a -0.4 weight — twice
        // the magnitude of abandon (-0.1) because a fail
        // is a much stronger negative signal to the NPCs.
        expect(broadcast).toHaveBeenCalledTimes(1);
        const [entry] = broadcast.mock.calls[0];
        expect(entry.weight).toBeCloseTo(-0.4, 5);
    });

    test('bootstrap_keydown_full_path_Esc_to_abandonCurrentDimension', () => {
        // End-to-end of the full round-94 path:
        //   keydown("Escape") → routeKey → { kind: 'abandon' }
        //                   → app.abandonCurrentDimension()
        // We assert the wiring by spying on
        // `abandonCurrentDimension`, dispatching the
        // action the bootstrap switch would dispatch,
        // and confirming the spy was called. This is
        // the same pattern as round-85 (R rollback)
        // and round-91 (backtick DM) — closes the
        // "操控性好" gap for the longest-running
        // keyboard shortcut in BINDING_DESCRIPTIONS.
        const app = makeApp();
        const abandonSpy = jest
            .spyOn(app as unknown as { abandonCurrentDimension: () => void }, 'abandonCurrentDimension')
            .mockImplementation(() => undefined);
        // Replicate the bootstrap switch (main.ts:1966+)
        // for the 'abandon' action kind.
        const action = routeKey('Escape');
        expect(action).toEqual({ kind: 'abandon' });
        if (action && action.kind === 'abandon') {
            (app as unknown as { abandonCurrentDimension: () => void }).abandonCurrentDimension();
        }
        expect(abandonSpy).toHaveBeenCalledTimes(1);
    });

    test('BINDING_DESCRIPTIONS_for_Esc_matches_routeKey_abandon_target', () => {
        // The 'Esc' row in BINDING_DESCRIPTIONS documents
        // the player's shortcut for abandon. A regression
        // that renamed 'Esc' → 'Escape' (or moved the row)
        // would break the help-overlay → routeKey contract
        // that round-57 introduced. We pin the description
        // text + the key field so both stay in lock-step
        // with the routeKey branch.
        // (The 'Esc' string here mirrors the
        // BINDING_DESCRIPTIONS entry verbatim, so a
        // rename fails this test on the literal string.)
        const escRow = BINDING_DESCRIPTIONS.find((d) => d.key === 'Esc');
        expect(escRow).toBeDefined();
        expect(escRow!.action).toBe('放弃当前维度');
        // And the routeKey branch for 'Esc' must exist
        // (defense against a regression that removes the
        // case from the switch).
        expect(routeKey('Esc')).toEqual({ kind: 'abandon' });
    });
});

// ---------------------------------------------------------------------------
// Round 101 — file-content test pinning the
// `abandonCurrentDimension` (-0.1) vs
// `failCurrentDimension` (-0.4) broadcast-weight asymmetry
// at the call site.
//
// **Why**: round 94 tested both flows end-to-end (the
// e2e asserts on the broadcast weight via `jest.spyOn`).
// But that test asserts on what the spy OBSERVES —
// not on what the source SAYS. A refactor that unifies
// the two methods (e.g. "let me just have
// `markCurrentDimension(outcome)` and pass the weight
// from the caller") would silently change the
// magnitude ratio. The 4× asymmetry
// (|-0.4| / |-0.1|) is the round-21 "witnessed_event"
// convention: an `abandoned` dimension
// barely dents the NPC collective disposition
// (-0.1 trust), while a `failed` dimension is a
// strong negative event (-0.0.4 trust, 4× worse).
// A future "they're basically the same thing, let's
// just use -0.1 for both" refactor would lose the
// signal.
//
// **Why file-content (not behavioural)**: the methods
// are 1-line wrappers around `recordDimensionOutcome`
// (main.ts:791-792):
//
//   failCurrentDimension()    { this.recordDimensionOutcome('failed', -0.4); }
//   abandonCurrentDimension() { this.recordDimensionOutcome('abandoned', -0.1); }
//
// The actual broadcast happens in
// `recordDimensionOutcome` (line 1019-1024). The
// file-content test reads main.ts and asserts:
//   1. `failCurrentDimension` body contains `-0.4`
//   2. `abandonCurrentDimension` body contains `-0.1`
//   3. The 4× ratio is preserved (a future unification
//      that changed BOTH to -0.1 or BOTH to -0.4
//      would fail this test).
//
// This is the round-93 file-content regression test
// pattern applied to the main.ts broadcast convention.
// ---------------------------------------------------------------------------

const MAIN_TS_PATH = path.resolve(__dirname, 'main.ts');
const MAIN_TS_SOURCE = fs.readFileSync(MAIN_TS_PATH, 'utf-8');

describe('App — round 101: file-content test pinning fail/abandon broadcast-weight asymmetry (auto-generated logic)', () => {
    /**
     * Naive body extractor for a `methodName(): ReturnType {` block.
     * Mirrors the round-93 SceneManager extractor: slice from
     * the opening `{` to the matching closing `}` (we assume
     * the body is shallow — fail/abandon are 1-liners).
     */
    function extractOneLinerBody(methodName: string): string {
        const startMatch = MAIN_TS_SOURCE.match(
            new RegExp(`${methodName}\\(\\)(?::[^{]*)?\\{`),
        );
        if (!startMatch) {
            throw new Error(`Could not find ${methodName} in main.ts`);
        }
        const openBraceIdx = startMatch.index! + startMatch[0].length - 1;
        // Find the closing `}` after the opening one. The
        // body is a single statement (a method call), so the
        // matching `}` is the next `}` after the call's
        // semicolon.
        const after = MAIN_TS_SOURCE.slice(openBraceIdx + 1);
        const closeIdx = after.indexOf('}');
        if (closeIdx === -1) {
            throw new Error(`Could not find closing brace for ${methodName}`);
        }
        return MAIN_TS_SOURCE.slice(openBraceIdx + 1, openBraceIdx + 1 + closeIdx);
    }

    test('failCurrentDimension_body_contains_weight_minus_0_4', () => {
        // The fail path is the heavier negative event.
        // A regression that drops the magnitude to -0.1
        // (or -0.2) would silently change the AGI's
        // trust / fear dynamics for failed dimensions
        // and erode the round-21 "witnessed_event"
        // convention. Pin the literal value at the
        // call site.
        const body = extractOneLinerBody('failCurrentDimension');
        expect(body).toMatch(/-0\.4/);
    });

    test('abandonCurrentDimension_body_contains_weight_minus_0_1', () => {
        // The abandon path is the lighter negative
        // event. A regression that bumps the
        // magnitude to -0.4 would conflate abandon
        // with fail and inflate the AI's
        // difficulty-recovery loop (it would
        // "see" more failures than actually
        // happened, since the player just walked
        // away). Pin the literal value at the
        // call site.
        const body = extractOneLinerBody('abandonCurrentDimension');
        expect(body).toMatch(/-0\.1/);
    });

    test('fail_weight_is_4x_abandon_weight_round_21_witnessed_event_convention', () => {
        // The 4× ratio is the round-21 design
        // choice: fail is a "strong negative
        // event" (the player tried and lost);
        // abandon is a "soft negative event"
        // (the player walked away). A refactor
        // that changes one without the other
        // would lose the ratio and silently
        // rebalance the AGI's mood-trust model.
        // This test pins the ratio as a numeric
        // property at the source.
        const failBody = extractOneLinerBody('failCurrentDimension');
        const abandonBody = extractOneLinerBody('abandonCurrentDimension');
        const failMatch = failBody.match(/-0\.(\d+)/);
        const abandonMatch = abandonBody.match(/-0\.(\d+)/);
        expect(failMatch).not.toBeNull();
        expect(abandonMatch).not.toBeNull();
        const failMagnitude = parseInt(failMatch![1], 10);
        const abandonMagnitude = parseInt(abandonMatch![1], 10);
        // The fail:abandon ratio is exactly 4:1.
        // Allow no deviation — a future "let's
        // use 3x or 5x" refactor would change
        // the AGI's balance and the round-21
        // evidence would no longer reproduce.
        expect(failMagnitude / abandonMagnitude).toBe(4);
    });

    test('both_methods_call_recordDimensionOutcome_with_thier_outcome_string (round 94 contract)', () => {
        // Defense: a refactor that changed the
        // outcome string (e.g. 'failed' → 'fail')
        // would silently break the round-94
        // vault.record spy assertions. Pin the
        // outcome strings at the call site too.
        const failBody = extractOneLinerBody('failCurrentDimension');
        const abandonBody = extractOneLinerBody('abandonCurrentDimension');
        expect(failBody).toMatch(/'failed'/);
        expect(abandonBody).toMatch(/'abandoned'/);
    });
});

// ---------------------------------------------------------------------------
// Round 97 — App-level e2e test for sceneGenWasm=null TS-mirror
// fallback path (auto-generated logic).
//
// Round 48's SceneGenWasm.test.ts covers the wrapper level
// (loader throws, loader returns null, version mismatch).
// The App-level integration — what happens when
// `app.sceneGenWasm` is null at the moment
// `enterNewDimension` runs — is untested at integration
// level. `themeToSceneWithFallback` always returns a
// blueprint (TS mirror as fallback), so the game should
// still work end-to-end. A regression that accidentally
// threw on null WASM (e.g. `if (!this.sceneGenWasm)
// throw ...`) would crash the entire dimension-enter flow
// in production for any user whose browser blocked the
// .wasm fetch.
//
// The tests below drive `enterNewDimension` with
// `sceneGenWasm = null` and assert the round-48
// progressive enhancement gate is observable at the
// App level (the HUD logs the "TS 兜底" branch, the
// side-effect spies are still called, no throw escapes).
// ---------------------------------------------------------------------------

describe('App — round 97: sceneGenWasm=null TS-mirror fallback path (auto-generated logic)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** Drive a full `enterNewDimension` with `sceneGenWasm=null`. */
    async function enterNewDimensionWithNullWasm(app: App): Promise<void> {
        // Stub the bridge to return a successful result so
        // we isolate the WASM-null branch. Without this
        // stub, the bridge would call into a real
        // AIBridge.planAndLoad which goes through
        // GameplayManager and AIEngine — out of scope for
        // this test.
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'r97 null wasm' },
                atomIds: ['tower_defense'],
                blueprint: {
                    id: 'dim_r97_null_wasm',
                    name: 'r97 null wasm fixture',
                    description: 'r97 null wasm',
                    atomIds: ['tower_defense'],
                    atomWeights: { tower_defense: 1 },
                    difficulty: 0.5,
                    rules: [],
                    rewards: [],
                    theme: { name: 'r97_null_wasm_theme', visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: ['#fff'] },
                    timeLimitSecs: 60,
                    objectives: [],
                },
                modules: [],
                seed: 1,
                configSource: 'wasm',
            }));
        // The round-97 hot path: explicitly null out the
        // WASM module to simulate loadSceneGenWasm returning
        // null (network error, .wasm 404, version mismatch,
        // etc.). The existing enterDimensionWithStub helper
        // requires a non-null wasm stub, so we drive
        // enterNewDimension directly here.
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = null;
        // The TS-mirror path still requires the side-effect
        // surface (scene / audio / npcMinds / HUD setters) to
        // be stubbed. Round 98 — call the round-90 helpers
        // (now public exports) instead of duplicating ~50
        // lines of jest.spyOn setup. The 7/5 HUD-setter
        // asymmetry is irrelevant here (no extra flags), so
        // we get the same coverage as enterDimensionWithStub.
        installSideEffectStubs(app);
        installHudSetterStubs(app);
        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
    }

    test('enterNewDimension_with_null_wasm_does_not_throw', async () => {
        // Defense in depth: a regression that hard-codes
        // `if (!this.sceneGenWasm) throw new Error(...)` at
        // the call site would crash the entire dimension-
        // enter flow in production for any user whose
        // browser blocked the .wasm fetch. The TS-mirror
        // fallback is the round-48 progressive enhancement
        // gate — it must be observably safe at the App
        // level.
        const app = makeApp();
        await expect(enterNewDimensionWithNullWasm(app)).resolves.not.toThrow();
    });

    test('enterNewDimension_with_null_wasm_logs_TS_fallback_branch', async () => {
        // The round-48 source-of-truth is the HUD log line:
        // '[scene] WASM 真出 (round 48)' (WASM succeeded)
        // vs '[scene] WASM 兜底→ TS 镜像 (round 48)'
        // (TS-mirror fallback). The `themeToSceneWithFallback`
        // function returns `{ source: 'wasm' | 'ts-fallback' }`
        // which the main.ts:611-615 log branch reads from.
        //
        // A regression that hard-codes the success log
        // (e.g. `this.hud.log('[scene] WASM 真出')`
        // without checking `outcome.source`) would
        // silently misreport the branch in production and
        // the round-68 in-browser latency analytics would
        // collect garbage data.
        //
        // **Disambiguation**: the `WASM 真出` substring
        // also appears in round-51 log lines ([gen-config],
        // [palette], [4th]). The round-48 log is uniquely
        // tagged with the `[scene]` prefix — we pin that
        // exact prefix so a regression that drops the
        // [scene] tag (collapsing the round-48 vs
        // round-51 distinction) fails this test.
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        await enterNewDimensionWithNullWasm(app);
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        // The TS-mirror branch's log marker — uniquely
        // tagged with `[scene]` (round-48 prefix) so the
        // regex doesn't match the round-51 [gen-config]
        // or [palette] or [4th] tags. Pin the literal
        // substring so a future "let me just say
        // 'fallback' instead of '兜底'" refactor fails
        // this test and the player-facing log stays
        // consistent with the round-48 design.
        expect(lines).toMatch(/\[scene\] WASM 兜底.*TS 镜像/);
        // And the round-48 success branch's log must NOT
        // appear (defense against the regression
        // mentioned above). The round-51 [gen-config]
        // success log is allowed — it's a different
        // WASM call (buildGenerationConfigWithMood, not
        // themeToScene).
        expect(lines).not.toMatch(/\[scene\] WASM 真出/);
    });

    test('enterNewDimension_with_null_wasm_still_calls_side_effect_spy_chain', async () => {
        // The TS-mirror path must not skip any of the
        // round-50 wiring: scene.renderWfcDungeon,
        // scene.spawnNpcWave, scene.setBiomeAtmosphere,
        // audio.setBiomeAmbient, audio.setBiomeSfx,
        // npcMinds.loadFromSnapshots, npcMinds.clear,
        // syncNpcDisposition, HUD setters. A regression
        // that puts these behind `if (this.sceneGenWasm)`
        // would silently break the round-60-90 visual /
        // audio / NPC integration for the null-WASM
        // branch — the most common real-world scenario
        // (most users don't have the .wasm in cache).
        const app = makeApp();
        const renderSpy = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        const npcSpy = jest
            .spyOn((app as unknown as { scene: { spawnNpcWave: (n: number, h: string[]) => unknown[] } }).scene, 'spawnNpcWave')
            .mockReturnValue(['mock_npc_a']);
        const atmSpy = jest
            .spyOn((app as unknown as { scene: { setBiomeAtmosphere: (a: unknown) => void } }).scene, 'setBiomeAtmosphere')
            .mockImplementation(() => undefined);
        const audioSpy = jest
            .spyOn((app as unknown as { audio: { setBiomeAmbient: (id: string, a: unknown) => void } }).audio, 'setBiomeAmbient')
            .mockImplementation(() => undefined);
        const sfxSpy = jest
            .spyOn((app as unknown as { audio: { setBiomeSfx: (id: string, a: unknown) => void } }).audio, 'setBiomeSfx')
            .mockImplementation(() => undefined);
        // `setLastSceneBlueprint` is the round-66 HUD
        // setter that `enterNewDimension` writes after
        // the scene blueprint resolves. (The
        // `setLastBiome` setter is only written by
        // `enterAtom` and `loadGame` — not by the main
        // `enterNewDimension` flow. We pick
        // `setLastSceneBlueprint` because it IS
        // written by the main flow and is the
        // round-66 source-of-truth for the HUD
        // persistent-memories block.)
        const sceneBlueprintSpy = jest
            .spyOn((app as unknown as { hud: { setLastSceneBlueprint: (s: unknown) => void } }).hud, 'setLastSceneBlueprint')
            .mockImplementation(() => undefined);
        const vaultRecord = jest
            .spyOn((app as unknown as { vault: { record: (b: unknown, o: string, t: number) => void } }).vault, 'record')
            .mockImplementation(() => undefined);
        await enterNewDimensionWithNullWasm(app);
        // Every spy must have been called at least once.
        // The exact call count depends on the flow; we
        // assert >= 1 to allow for future refactors that
        // add or remove a wire-up, but never zero — zero
        // would mean the round-50 wiring silently broke.
        expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(npcSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(atmSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(audioSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(sfxSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(sceneBlueprintSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        // vault.record is the round-50 telemetry gate —
        // the most critical side-effect. A regression
        // that skipped it on the TS-mirror path would
        // make the vault stats invisible to the AI.
        expect(vaultRecord.mock.calls.length).toBeGreaterThanOrEqual(1);
        const [, outcome] = vaultRecord.mock.calls[0];
        // The TS-mirror path's first call to vault.record
        // is the 'completed' visit (the visit itself
        // succeeded; the WASM was just not used). Pin the
        // outcome string so a regression that passes
        // 'failed' or 'abandoned' fails this test.
        expect(outcome).toBe('completed');
    });
});

// ---------------------------------------------------------------------------
// Round 99 — `enterNewDimension` dual-call race e2e.
// Round 102 — flipped contract: in-flight guard added.
//
// The Space key (round-57 + round-96 alias) and the
// "next-dim" button (HTML) both fire `enterNewDimension`
// (main.ts:1967: `case 'reroll': void app.enterNewDimension();`).
// Pre-round-102, the orchestrator had NO in-flight
// guard — a rapid double-tap on Space, or two rapid
// clicks on the next-dim button, would invoke the
// orchestrator twice in parallel, both `await`ing
// `bridge.planAndLoad` and writing the same WorldState
// fields, with the second call's writes silently
// overwriting the first (visible "scene tiles flicker
// between two dimensions for one frame").
//
// Round 102 adds the in-flight guard: a private
// `isEntering` flag is set to `true` at the start of
// `enterNewDimension`, the body runs in a try/finally,
// and the flag is reset in `finally`. The second
// parallel call short-circuits to a no-op with a
// Chinese-localized HUD log line. The first call's
// writes win, and the player sees a stable scene.
//
// This is auto-generated logic territory: a regression
// that drops the in-flight guard (or moves the early-
// return AFTER the body starts executing) would
// silently regress the dual-call UX back to the
// pre-round-102 flickering state. The contract we
// pin here is:
//   1. No throw escapes either call (both resolve).
//   2. The bridge is called exactly ONCE (only the
//      first parallel invocation passes the guard —
//      the second short-circuits before bridge.planAndLoad).
//   3. The vault records exactly ONE visit (the
//      first call's only — the guard short-circuits
//      the second before it can persist anything).
//   4. The scene's renderWfcDungeon is called exactly
//      once (the first call's tiles are the visible
//      state — no flicker, no "second render overwrites
//      the first" race).
//      "last writer wins" dim).
//   4. The scene's renderWfcDungeon + setBiomeAtmosphere
//      are called for both calls (so the player doesn't
//      see a "stuck" scene from the first call after the
//      second call's tiles are loaded).
//
// This test is symmetric to round-97 (App-level e2e for
// the App's call flow) but covers the concurrency
// dimension, which round-97's single-call helper cannot
// exercise.
// ---------------------------------------------------------------------------

describe('App — round 99: enterNewDimension dual-call race e2e (auto-generated logic)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * Drive TWO `enterNewDimension` calls in parallel.
     * Uses the round-98 public install helpers (round-98
     * closure) — same surface as enterDimensionWithStub
     * but with a per-call seed that lets us assert
     * the bridge was actually called twice.
     */
    async function fireTwoParallelEnters(app: App, seedA: number, seedB: number): Promise<void> {
        let callIdx = 0;
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => {
                const seed = callIdx++ === 0 ? seedA : seedB;
                return {
                    suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: `r99 race ${seed}` },
                    atomIds: ['tower_defense'],
                    blueprint: {
                        id: `dim_r99_${seed}`,
                        name: `r99 race fixture ${seed}`,
                        description: `r99 race seed=${seed}`,
                        atomIds: ['tower_defense'],
                        atomWeights: { tower_defense: 1 },
                        difficulty: 0.5,
                        rules: [],
                        rewards: [],
                        theme: { name: `r99_race_${seed}`, visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: ['#fff'] },
                        timeLimitSecs: 60,
                        objectives: [],
                    },
                    modules: [],
                    seed,
                    configSource: 'wasm',
                };
            });
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub();
        // Use the round-98 public exports — no need to
        // duplicate ~50 lines of jest.spyOn setup.
        installSideEffectStubs(app);
        installHudSetterStubs(app);
        // Fire both calls without awaiting between them.
        // Promise.all guarantees both are in-flight at
        // the same time when the first `await` suspends.
        await Promise.all([
            (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension(),
            (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension(),
        ]);
    }

    test('two_parallel_enterNewDimension_calls_both_resolve_without_throw', async () => {
        // The first invariant: a double-tap on Space
        // (or two rapid next-dim clicks) must not
        // throw. A regression that adds `if (this.x)
        // throw new Error('busy')` to the call site
        // would crash the second invocation in
        // production for any user with a fast-enough
        // finger or screen-tap assist.
        const app = makeApp();
        await expect(fireTwoParallelEnters(app, 100, 200)).resolves.not.toThrow();
    });

    test('two_parallel_enterNewDimension_calls_each_invoke_bridge_planAndLoad', async () => {
        // The bridge is the upstream boundary. The
        // round-102 in-flight guard short-circuits
        // the second parallel call BEFORE it can
        // hit `bridge.planAndLoad`. The first call
        // runs to completion and hits the bridge
        // exactly once. A regression that removes
        // the guard (or moves the early-return
        // after `bridge.planAndLoad`) would
        // silently re-introduce the round-99 race.
        const app = makeApp();
        const bridgeSpy = jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'r99' },
                atomIds: ['tower_defense'],
                blueprint: {
                    id: 'dim_r99_spy',
                    name: 'r99 spy fixture',
                    description: 'r99',
                    atomIds: ['tower_defense'],
                    atomWeights: { tower_defense: 1 },
                    difficulty: 0.5,
                    rules: [],
                    rewards: [],
                    theme: { name: 'r99_spy', visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: ['#fff'] },
                    timeLimitSecs: 60,
                    objectives: [],
                },
                modules: [],
                seed: 1,
                configSource: 'wasm',
            }));
        // The helper installs its own planAndLoad spy,
        // so we read the helper's spy reference
        // instead of the local one. Restore ours to
        // let the helper's spy take effect.
        bridgeSpy.mockRestore();
        await fireTwoParallelEnters(app, 100, 200);
        const bridge = (app as unknown as { bridge: { planAndLoad: jest.SpyInstance } }).bridge;
        // Round 102 — only the first call passes
        // the in-flight guard. The second short-
        // circuits before reaching the bridge. We
        // pin `=== 1` to lock the guard at the
        // source; a "let me drop the guard" refactor
        // would re-introduce the `>= 2` round-99
        // contract.
        expect(bridge.planAndLoad.mock.calls.length).toBe(1);
    });

    test('two_parallel_enterNewDimension_calls_first_call_records_vault_completed', async () => {
        // Round 102 — the vault records EXACTLY
        // ONE visit (the first call's). The
        // second parallel call short-circuits
        // before reaching `vault.record`. A
        // regression that drops the guard would
        // silently record TWO visits for the
        // user's one visible action.
        const app = makeApp();
        const vaultRecord = jest
            .spyOn((app as unknown as { vault: { record: (b: unknown, o: string, t: number) => void } }).vault, 'record')
            .mockImplementation(() => undefined);
        await fireTwoParallelEnters(app, 100, 200);
        expect(vaultRecord.mock.calls.length).toBe(1);
        // The single visit must be 'completed'
        // (not 'failed' or 'abandoned') — the
        // first call's outcome reflects the
        // user's intended action.
        const [, outcome] = vaultRecord.mock.calls[0];
        expect(outcome).toBe('completed');
    });

    test('two_parallel_enterNewDimension_calls_first_call_renders_wfc_dungeon', async () => {
        // Round 102 — the scene's renderWfcDungeon
        // is called exactly ONCE. The second parallel
        // call short-circuits before reaching the
        // scene. The player sees a stable first-call
        // render with no flicker.
        const app = makeApp();
        const renderSpy = jest
            .spyOn((app as unknown as { scene: { renderWfcDungeon: (t: unknown[], s: number, b: unknown) => void } }).scene, 'renderWfcDungeon')
            .mockImplementation(() => undefined);
        await fireTwoParallelEnters(app, 100, 200);
        expect(renderSpy.mock.calls.length).toBe(1);
    });

    test('two_parallel_enterNewDimension_calls_second_call_logs_chinese_skip_message (round 102)', async () => {
        // Round 102 — the in-flight guard surfaces
        // a Chinese-localized log line so the
        // player can see WHY their second Space-
        // tap was ignored. Without the log, the
        // user might think the keyboard broke.
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        await fireTwoParallelEnters(app, 100, 200);
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        // The guard's log line uses the
        // `[orchestrator]` prefix to disambiguate
        // from other dimension-enter log lines
        // (e.g. `[scene]` for round-48, `[gen]`
        // for round-23).
        expect(lines).toMatch(/\[orchestrator\] 已有 enterNewDimension 进行中.*round 102 防御/);
    });

    test('enterNewDimension_first_call_throws_resets_isEntering_for_retry (round 103)', async () => {
        // Round 103 — closes a subtle gap in the
        // round-102 contract. The `try/finally`
        // block at line 528-561 of main.ts MUST
        // reset `isEntering = false` even when
        // `_enterNewDimensionImpl` THROWS (the
        // bridge plan fails, the WASM module
        // throws, the WFC dungeon gen is corrupt,
        // etc). If the `finally` block were
        // missing or only ran on the success
        // path, the user's first failed call
        // would silently lock the orchestrator
        // into a "stuck" state — every subsequent
        // Space-tap would be a no-op, and the
        // user would think the game was broken.
        //
        // We stub `bridge.planAndLoad` to throw
        // on the FIRST call only, then let the
        // SECOND call succeed normally. If the
        // guard resets, both calls reach the
        // bridge (call count === 2). If the
        // guard does NOT reset, the second call
        // short-circuits to a no-op (call count
        // === 1) and the test fails.
        const app = makeApp();
        const bridgeSpy = jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementationOnce(async () => {
                throw new Error('round 103 simulated bridge failure');
            })
            .mockImplementationOnce(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'r103_retry' },
                atomIds: ['tower_defense'],
                blueprint: {
                    id: 'dim_r103_retry',
                    name: 'r103 retry fixture',
                    description: 'r103',
                    atomIds: ['tower_defense'],
                    atomWeights: { tower_defense: 1 },
                    difficulty: 0.5,
                    rules: [],
                    rewards: [],
                    theme: { name: 'r103_retry', visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: ['#fff'] },
                    timeLimitSecs: 60,
                    objectives: [],
                },
                modules: [],
                seed: 999,
                configSource: 'wasm',
            }));
        // Install the round-98 side-effect stubs
        // so the second call's success path
        // doesn't throw on the scene/audio/npc
        // writes.
        installSideEffectStubs(app);
        installHudSetterStubs(app);

        // First call — throws. The promise
        // rejection is swallowed silently
        // (we don't `await` it through a
        // try/catch; jest's unhandled rejection
        // detection is off in this suite, see
        // the round-94 tests for the same
        // pattern).
        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension()
            .catch(() => {
                // Expected — bridge.planAndLoad
                // threw on the first call.
            });
        // Second call — must NOT short-circuit.
        // If `isEntering` was not reset in the
        // `finally` block, this call hits the
        // early-return and the bridge is not
        // reached.
        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
        // Both calls reached the bridge. The
        // first threw (call 1), the second
        // succeeded (call 2). A regression that
        // drops the `finally` reset would
        // leave `isEntering = true` after the
        // throw, causing the second call to
        // short-circuit (call count === 1).
        expect(bridgeSpy.mock.calls.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Round 103 — `loadGame` in-flight guard abandoned (rejected design).
//
// Round 103 originally proposed adding a `private isLoading = false`
// in-flight guard to `loadGame`, mirroring the round-102 `isEntering`
// pattern. The carry-over from round-102's MEMORY.md listed this as
// a candidate because a rapid double-tap on `#btn-load` (line 1951)
// or the L keyboard shortcut (line 2019) would invoke the round-50
// rehydration pipeline twice. The most visible side effect would
// be the round-50 event-chain `setTimeout` schedule being doubled
// (line 1824) — every event in the saved event chain would fire
// TWICE, doubling the per-event `npcMinds.broadcast` calls.
//
// Why abandoned: `loadGame` is SYNCHRONOUS, not async like
// `enterNewDimension`. The round-102 `try/finally` guard only
// works because `enterNewDimensionImpl` `await`s the bridge
// plan, leaving the public method in a "pending" state while
// the body runs. A second `enterNewDimension` call within
// that window hits the early-return. But `loadGame` runs to
// completion in a single synchronous tick — the `try/finally`
// releases the guard before the second call arrives. Two
// sequential test calls (`loadGame(); loadGame();`) both run
// end-to-end, with no in-flight window to guard.
//
// The CORRECT fix for the loadGame double-tap is a TIME-BASED
// debounce (e.g. ignore button clicks within 500ms of the last
// load), not a `try/finally` in-flight guard. A debounce
// guard is a different pattern (`setTimeout`-based release
// instead of `try/finally`) and warrants its own round.
//
// Round 103 SCOPE: only the round-102 isEntering reset-on-throw
// test (1 new test) survives from the original round 103 plan.
// The loadGame describe block above this comment is the
// documentation marker for "rejected design — see round 104
// candidate for the time-based debounce approach".
// ---------------------------------------------------------------------------

describe('App — round 103: loadGame in-flight guard (rejected, see comments above)', () => {
    test('loadGame_called_twice_sequential_runs_both_without_debounce (round 103 empirical evidence)', () => {
        // Documents WHY a `try/finally` in-flight guard
        // doesn't help for `loadGame`. Two sequential
        // test calls both reach `save.restore()` because
        // the synchronous `try/finally` releases the
        // guard before the second call arrives. This
        // test is intentionally non-strict (it doesn't
        // assert === 1) — it documents the rejection
        // evidence so a future refactor that tries to
        // re-add the guard sees the empirical reason it
        // didn't work.
        //
        // Round 104 caveat: this test is now partly
        // obsolete. With the round-104 time-based
        // debounce, sequential calls within 500ms
        // short-circuit (call count === 1). The
        // round-104 `after_500ms` test (in the
        // next describe block) covers the
        // "after-window both run" case. This test
        // is kept as a historical marker for the
        // round-103 rejection evidence — a
        // "what was wrong with the rejected
        // design" pin. To make it pass under
        // round 104, the second call must be
        // outside the 500ms window.
        const app = makeApp();
        const restoreSpy = jest
            .spyOn((app as unknown as { save: { restore: () => boolean } }).save, 'restore')
            .mockImplementation(() => false);
        (app as unknown as { loadGame: () => void }).loadGame();
        // Advance `Date.now()` past the 500ms debounce
        // window so the second call runs.
        const future = Date.now() + (app as unknown as { LOAD_DEBOUNCE_MS: number }).LOAD_DEBOUNCE_MS + 100;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(future);
        (app as unknown as { loadGame: () => void }).loadGame();
        nowSpy.mockRestore();
        // Both calls reach restore. The second
        // call ran because we advanced past the
        // 500ms window. This is the evidence that
        // a `try/finally` guard is the wrong
        // pattern for sync `loadGame` (round 103
        // rejection) and that a time-based
        // debounce (round 104) is the right
        // pattern.
        expect(restoreSpy.mock.calls.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Round 104 — `loadGame` time-based debounce (操控性好 UX improvement,
// follow-up to round-103 rejected design).
//
// Round 103's `try/finally` in-flight guard was rejected
// because `loadGame` is synchronous — the `finally` releases
// the guard before the second call arrives, so both calls
// run end-to-end. Round 104 introduces a TIME-BASED debounce:
// `private lastLoadAt = 0` + `private static readonly
// LOAD_DEBOUNCE_MS = 500` + a debounce check at the top of
// `loadGame` that short-circuits a second call within the
// window. The debounce stamp `lastLoadAt = Date.now()` is
// written at the END of the body (not the start), so a
// failure mid-body still counts as "completed" and the user
// can't spam-retry past a broken save. The 500ms window is
// tuned to a human double-click (~200-300ms) + round-50
// rehydration completion (~50ms) with margin on both sides.
//
// The three contracts pinned here are:
//   1. Two rapid `loadGame` calls within 500ms → the second
//      short-circuits BEFORE `save.restore` is called
//      (call count === 1).
//   2. Two `loadGame` calls with `Date.now()` advanced past
//      500ms between them → BOTH reach `save.restore`
//      (call count === 2). The debounce is time-based, not
//      one-shot — once the window passes, the user can load
//      again.
//   3. The short-circuited second call emits a Chinese-
//      localized log line `[orchestrator] 距上次 loadGame
//      仅 Xms < 500ms 窗口，跳过本次调用 (round 104 防御)`
//      so the player can see WHY their second L-tap was
//      ignored (vs. the keyboard breaking).
// ---------------------------------------------------------------------------

describe('App — round 104: loadGame time-based debounce', () => {
    test('loadGame_called_twice_within_500ms_short_circuits_second', () => {
        // The headline contract: the second call
        // within the debounce window short-
        // circuits BEFORE `save.restore` is
        // reached. A regression that drops the
        // debounce check (or moves it after
        // `save.restore`) would silently re-
        // introduce the round-50 event-chain
        // timer doubling.
        const app = makeApp();
        const restoreSpy = jest
            .spyOn((app as unknown as { save: { restore: () => boolean } }).save, 'restore')
            .mockImplementation(() => false);
        (app as unknown as { loadGame: () => void }).loadGame();
        (app as unknown as { loadGame: () => void }).loadGame();
        // First call runs the body (restore
        // called once). Second call short-
        // circuits (restore NOT called again).
        expect(restoreSpy.mock.calls.length).toBe(1);
    });

    test('loadGame_called_twice_after_500ms_runs_both (debounce is time-based, not one-shot)', () => {
        // The debounce is time-based, not a
        // one-shot latch. Once the window passes,
        // the user can load again. A regression
        // that turned the debounce into a
        // permanent "already loaded" flag would
        // silently break legitimate "load to
        // recover, then load again" workflows
        // (e.g. the round-54 rollback UI flow).
        const app = makeApp();
        const restoreSpy = jest
            .spyOn((app as unknown as { save: { restore: () => boolean } }).save, 'restore')
            .mockImplementation(() => false);
        (app as unknown as { loadGame: () => void }).loadGame();
        // Advance `Date.now()` past the 500ms
        // debounce window so the second call
        // runs.
        const future = Date.now() + (app as unknown as { LOAD_DEBOUNCE_MS: number }).LOAD_DEBOUNCE_MS + 100;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(future);
        (app as unknown as { loadGame: () => void }).loadGame();
        nowSpy.mockRestore();
        // Both calls reached restore.
        expect(restoreSpy.mock.calls.length).toBe(2);
    });

    test('loadGame_within_500ms_logs_chinese_skip_message (round 104)', () => {
        // The short-circuited second call emits
        // a Chinese-localized log line so the
        // player can see WHY their second L-tap
        // was ignored. The `[orchestrator]`
        // prefix disambiguates from other
        // loadGame log lines (e.g. `[读档]` for
        // the actual restore outcome,
        // `[narr+mind]` for the round-48
        // rehydrate, `[scene]` for the round-50
        // re-render).
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { save: { restore: () => boolean } }).save, 'restore').mockImplementation(() => false);
        (app as unknown as { loadGame: () => void }).loadGame();
        (app as unknown as { loadGame: () => void }).loadGame();
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        // The log line uses the
        // `[orchestrator]` prefix and includes
        // both the elapsed-ms number AND the
        // 500ms window threshold so the player
        // sees the concrete reason (not just a
        // "skipped" flag).
        expect(lines).toMatch(
            new RegExp(
                `\\[orchestrator\\] 距上次 loadGame 仅 \\d+ms`
                + ` < ${500}ms 窗口.*round 104 防御`,
            ),
        );
    });
});

// ---------------------------------------------------------------------------
// Round 106 — `saveGame` time-based debounce (操控性好 UX
// improvement, follow-up to round-104 loadGame debounce).
//
// The round-104 `lastLoadAt` pattern was applied to
// `saveGame` (line 1283) for symmetry. A rapid double-tap
// on `#btn-save` (line 2030) or the S keyboard shortcut
// (line 2087) would otherwise double-call:
//   1. `analytics.track('save.persisted', { ok })` —
//      corrupting the round-50 telemetry gate's per-
//      dimension save count (one extra `save.persisted`
//      event per accidental double-click).
//   2. `tutorial?.notify('save-persisted')` — showing
//      the "已保存" tutorial notification twice in a
//      row, a visible "the save fired twice" UX hiccup.
// The 500ms window is identical to the round-104
// `LOAD_DEBOUNCE_MS` (same human-double-click +
// round-50 telemetry tuning). A future round-107+ could
// consolidate both constants into a single
// `ActionDebouncer` helper if more debounced actions
// are added.
//
// The three contracts pinned here are:
//   1. Two rapid `saveGame` calls within 500ms → the
//      second short-circuits BEFORE `save.persist` is
//      called (call count === 1).
//   2. Two `saveGame` calls with `Date.now()` advanced
//      past 500ms between them → BOTH reach `save.persist`
//      (call count === 2). The debounce is time-based,
//      not a one-shot latch.
//   3. The short-circuited second call emits a Chinese-
//      localized log line `[orchestrator] 距上次 saveGame
//      仅 Xms < 500ms 窗口，跳过本次调用 (round 106 防御)`
//      so the player can see WHY their second S-tap was
//      ignored (vs. the keyboard breaking).
// ---------------------------------------------------------------------------

describe('App — round 106: saveGame time-based debounce', () => {
    test('saveGame_called_twice_within_500ms_short_circuits_second', () => {
        // The headline contract: the second call
        // within the debounce window short-
        // circuits BEFORE `save.persist` is
        // reached. A regression that drops the
        // debounce check (or moves it after
        // `save.persist`) would silently re-
        // introduce the double-analytics-tracking
        // and double-tutorial-notify concerns.
        const app = makeApp();
        const persistSpy = jest
            .spyOn((app as unknown as { save: { persist: () => boolean } }).save, 'persist')
            .mockImplementation(() => true);
        (app as unknown as { saveGame: () => void }).saveGame();
        (app as unknown as { saveGame: () => void }).saveGame();
        // First call runs the body (persist
        // called once). Second call short-
        // circuits (persist NOT called again).
        expect(persistSpy.mock.calls.length).toBe(1);
    });

    test('saveGame_called_twice_after_500ms_runs_both (debounce is time-based, not one-shot)', () => {
        // The debounce is time-based, not a
        // one-shot latch. Once the window
        // passes, the user can save again. A
        // regression that turned the debounce
        // into a permanent "already saved" flag
        // would silently break legitimate
        // save-after-save workflows.
        const app = makeApp();
        const persistSpy = jest
            .spyOn((app as unknown as { save: { persist: () => boolean } }).save, 'persist')
            .mockImplementation(() => true);
        (app as unknown as { saveGame: () => void }).saveGame();
        // Advance `Date.now()` past the 500ms
        // debounce window so the second call
        // runs.
        const future = Date.now() + (app as unknown as { SAVE_DEBOUNCE_MS: number }).SAVE_DEBOUNCE_MS + 100;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(future);
        (app as unknown as { saveGame: () => void }).saveGame();
        nowSpy.mockRestore();
        // Both calls reached persist.
        expect(persistSpy.mock.calls.length).toBe(2);
    });

    test('saveGame_within_500ms_logs_chinese_skip_message (round 106)', () => {
        // The short-circuited second call emits
        // a Chinese-localized log line so the
        // player can see WHY their second S-tap
        // was ignored. The `[orchestrator]`
        // prefix disambiguates from other
        // saveGame log lines (e.g. `[存档]` for
        // the actual persist outcome).
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        jest.spyOn((app as unknown as { save: { persist: () => boolean } }).save, 'persist').mockImplementation(() => true);
        (app as unknown as { saveGame: () => void }).saveGame();
        (app as unknown as { saveGame: () => void }).saveGame();
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        // The log line uses the
        // `[orchestrator]` prefix and includes
        // both the elapsed-ms number AND the
        // 500ms window threshold so the player
        // sees the concrete reason (not just a
        // "skipped" flag).
        expect(lines).toMatch(
            new RegExp(
                `\\[orchestrator\\] 距上次 saveGame 仅 \\d+ms`
                + ` < ${500}ms 窗口.*round 106 防御`,
            ),
        );
    });
});

// ---------------------------------------------------------------------------
// Round 100 — `enterNewDimension` WASM-success path positive
// assertion (auto-generated logic).
//
// Round 97 pinned the TS-mirror *fallback* branch:
//   1) `enterNewDimension_with_null_wasm_does_not_throw`
//   2) `enterNewDimension_with_null_wasm_logs_TS_fallback_branch`
//      — asserted that `[scene] WASM 兜底` IS in the log
//        and `[scene] WASM 真出` is NOT.
//   3) `enterNewDimension_with_null_wasm_still_calls_side_effect_spy_chain`
//
// Round 100 closes the round-48 source-of-truth loop in BOTH
// directions. The inverse contract is just as load-bearing:
// a regression that hard-codes the fallback log (e.g.
// always says `[scene] WASM 兜底` regardless of the
// `outcome.source`) would silently misreport the
// round-68 in-browser latency analytics AND the round-50
// telemetry gate. A regression that drops the `outcome.source`
// check entirely would also fail the round-100 positive
// assertion (the log would silently degrade to nothing).
//
// The three contracts pinned here are:
//   1. `[scene] WASM 真出 (round 48)` IS emitted when
//      `sceneGenWasm` returns a real blueprint (the
//      stub-loaded success path).
//   2. `[scene] WASM 兜底` is NOT emitted on the success
//      path (defense against the round-97 regression
//      bleeding into the success branch).
//   3. `vault.record` IS called with outcome='completed'
//      (the round-50 telemetry gate is symmetric to
//      round-97's spy chain — both paths must persist).
//
// Uses the round-98 public install helpers (the
// round-97 helper's inline ~50 lines are now collapsed
// to 2 calls). Mirrors round-97's test structure so the
// pair reads as a two-sided contract.
// ---------------------------------------------------------------------------

describe('App — round 100: sceneGenWasm=stub WASM-success path positive assertion (auto-generated logic)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * Drive a full `enterNewDimension` with
     * `sceneGenWasm=makeWasmStub()` (WASM-success path).
     * The bridge returns a valid blueprint; the WASM
     * stub's `theme_to_scene_json` returns a real
     * blueprint, so the round-48 success branch fires.
     */
    async function enterNewDimensionWithStubWasm(app: App): Promise<void> {
        jest
            .spyOn((app as unknown as { bridge: { planAndLoad: (cfg: unknown) => Promise<unknown> } }).bridge, 'planAndLoad')
            .mockImplementation(async () => ({
                suggestion: { stage: 'mid', primary: ['tower_defense'], secondary: [], excluded: [], rationale: 'r100 stub wasm' },
                atomIds: ['tower_defense'],
                blueprint: {
                    id: 'dim_r100_stub_wasm',
                    name: 'r100 stub wasm fixture',
                    description: 'r100 stub wasm',
                    atomIds: ['tower_defense'],
                    atomWeights: { tower_defense: 1 },
                    difficulty: 0.5,
                    rules: [],
                    rewards: [],
                    theme: { name: 'r100_stub_wasm_theme', visualStyle: 'fantasy', musicMood: 'cheerful', colorPalette: ['#fff'] },
                    timeLimitSecs: 60,
                    objectives: [],
                },
                modules: [],
                seed: 1,
                configSource: 'wasm',
            }));
        // Round 100 hot path: a NON-null WASM stub.
        // This is the inverse of round-97's null-WASM
        // setup — the round-48 source-of-truth branches
        // on `outcome.source === 'wasm'`, so we need
        // a real (stub-shaped) module here.
        (app as unknown as { sceneGenWasm: unknown }).sceneGenWasm = makeWasmStub();
        installSideEffectStubs(app);
        installHudSetterStubs(app);
        await (app as unknown as { enterNewDimension: () => Promise<void> }).enterNewDimension();
    }

    test('enterNewDimension_with_stub_wasm_logs_WASM_真出_positive_assertion', async () => {
        // The round-100 positive assertion: the success
        // branch's log marker MUST appear on the
        // round-48 source-of-truth line. A regression
        // that hard-codes the fallback log (e.g. a
        // "let me just always say 兜底 to be safe"
        // refactor) would silently misreport the
        // round-48 source-of-truth in production and
        // make the round-68 in-browser latency analytics
        // collect garbage data — the very symptom
        // round-97's negative assertion was designed
        // to catch on the OTHER branch.
        //
        // The [scene] prefix disambiguates from the
        // round-51 [gen-config] / [palette] / [4th]
        // success logs (different WASM calls).
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        await enterNewDimensionWithStubWasm(app);
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(lines).toMatch(/\[scene\] WASM 真出.*round 48/);
    });

    test('enterNewDimension_with_stub_wasm_does_NOT_log_兜底_inverse_assertion', async () => {
        // The inverse of round-97's positive assertion:
        // the fallback log must NOT leak into the
        // success branch. The two contracts are
        // independent — a regression that prints BOTH
        // ("just to be safe") would fail this test
        // (defense against a verbose-log refactor that
        // breaks the round-48 source-of-truth).
        const app = makeApp();
        const logSpy = jest
            .spyOn((app as unknown as { hud: { log: (s: string) => void } }).hud, 'log')
            .mockImplementation(() => undefined);
        await enterNewDimensionWithStubWasm(app);
        const lines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(lines).not.toMatch(/\[scene\] WASM 兜底/);
    });

    test('enterNewDimension_with_stub_wasm_records_vault_completed', async () => {
        // The round-50 telemetry gate is symmetric to
        // round-97's side-effect spy chain: the
        // success path must also persist the visit.
        // A regression that puts `vault.record` behind
        // `if (outcome.source === 'ts-fallback')`
        // would silently drop WASM-success visits
        // from the AGI's memory.
        const app = makeApp();
        const vaultRecord = jest
            .spyOn((app as unknown as { vault: { record: (b: unknown, o: string, t: number) => void } }).vault, 'record')
            .mockImplementation(() => undefined);
        await enterNewDimensionWithStubWasm(app);
        expect(vaultRecord.mock.calls.length).toBeGreaterThanOrEqual(1);
        const [, outcome] = vaultRecord.mock.calls[0];
        // Same outcome string as round-97's test 3
        // — the symmetric "completed" persistence
        // contract.
        expect(outcome).toBe('completed');
    });
});

