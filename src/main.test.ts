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
 *
 * Out of scope (deliberately):
 *   - WebGL real-render assertions (jsdom has no WebGL).
 *   - WASM bridge paths (covered by `SceneGenWasm.test.ts`).
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
 */

import { App } from './main';
import type { SceneBlueprintSnapshot } from './world/WorldState';

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
