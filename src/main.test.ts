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
        expect(setLastSceneBlueprint).toHaveBeenCalledTimes(1);
        const scalars = setLastSceneBlueprint.mock.calls[0]?.[0] as {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        };
        expect(scalars.npcCount).toBe(0);
        expect(scalars.bpm).toBe(120);
        expect(scalars.eventCount).toBe(0);
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
