/**
 * AGI-miniGame entry point — the full PRD loop wired together.
 *
 * Wires:
 *   - SceneManager      (Three.js hub + 3D entities + WFC + NPCs)
 *   - HUD               (cyberpunk overlay)
 *   - ProgressionUI     (XP bar + talent tree)
 *   - EconomyPanel      (currencies + inventory)
 *   - EpochPanel        (纪元更迭)
 *   - WorldState        (unified player + economy + dimension history)
 *   - Progression       (XP + talents)
 *   - EpochSystem       (大坍缩)
 *   - AIEngine          (4 super-brains)
 *   - AIBridge          (AI ↔ gameplay modules)
 *   - DslExecutor       (apply DSL rules to the scene)
 *   - HotReloadController (live DSL hot-reload with shielding)
 *   - SceneTransitions  (hub ↔ gameplay fades)
 *   - SaveSystem        (unified save/load)
 */

import { SceneManager } from './scene/SceneManager';
import { HUD } from './ui/HUD';
import { I18n } from './i18n/I18n';
import { ProgressionUI } from './ui/ProgressionUI';
import { EconomyPanel } from './ui/EconomyPanel';
import { EpochPanel } from './ui/EpochPanel';
import { WorldState } from './world/WorldState';
import { Progression } from './player/Progression';
import { EpochSystem } from './world/EpochSystem';
import { SaveSystem } from './world/SaveSystem';
import { AIEngine, BalanceTuner } from './ai/AIEngine';
import { NPCDialogueAI, NPCProfile } from './ai/NPCDialogueAI';
import { AIBridge, ATOM_MANIFEST } from './gameplay/AIBridge';
import { routeKey, BINDING_DESCRIPTIONS, MOUSE_BINDINGS, PANEL_TOGGLE_DESCRIPTIONS, PANEL_TOGGLE_BINDINGS, panelToggleBindingByKey, panelToggleBindingByMethod, panelToggleMethodByKind } from './input/KeyboardShortcuts';
import { GameplayManager, SynthesisModule, CardModule } from './gameplay/GameplayManager';
import { DslExecutor } from './scene/DslExecutor';
import { HotReloadController } from './scene/HotReloadController';
import { SceneTransitions } from './scene/SceneTransitions';
import { NpcCombat } from './scene/NpcCombat';
import { generateDungeon, generateDungeonWithWeights, TILE_SPAWN, TILE_GOAL } from './world/WfcLevelGen';
import { renderMiniMap } from './world/MiniMap';
import { biomeForVisualStyle, bpmForMood } from './world/WfcBiomes';
import { synthesizeDmEventChain, countNpcSpawnTiles } from './ai/DmEventChain';
import { ZERO_SCENE_SCALARS, cloneSceneScalars, type SceneScalars } from './ai/SceneScalars';
import { getBiomeAtmosphere } from './scene/BiomeAtmosphere';
import { getBiomeAudio } from './audio/BiomeAudio';
import { parseDSL, combineMemes, compileFallback } from './dsl/MemeCompiler';
import { autoGenerateForDimension } from './dsl/codegenBindings';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { renderStatsPanel, StatsPanelHandle } from './ui/StatsPanel';
import { GodConsole } from './ui/GodConsole';
import { SettingsPanel, type DebounceWindow, type Difficulty, type SceneSpeedPreset, SCENE_SPEED_PRESETS } from './ui/SettingsPanel';
import { PlayerHealth } from './player/PlayerHealth';
import { DmMode } from './dm/DmMode';
import { SessionReplay } from './analytics/SessionReplay';
import { NpcFactory } from './ai/NpcFactory';
import { ActionDebouncer } from './utils/ActionDebouncer';
import { NarrationEngine } from './narration/NarrationEngine';
import { WebAudioService, NullAudioService } from './audio/AudioService';
import { GameAudio } from './audio/GameAudio';
import { Analytics } from './analytics/Analytics';
import { WasmLatencyStats } from './analytics/WasmLatencyStats';
import { HttpLLMClient } from './ai/HttpLLMClient';
import { DimensionVault } from './world/DimensionVault';
import { renderVaultPanel, VaultPanelHandle } from './ui/VaultPanel';
import { NpcMind, NpcRegistry, makeEntry } from './world/NpcMind';
import { renderNpcMindPanel, NpcMindPanelHandle } from './ui/NpcMindPanel';
// Round 118 — AchievementsPanel
// module. The mount point +
// V key + App.toggleAchievements
// were added in round-115; round
// 118 ships the actual
// `renderAchievementsPanel`
// function (sourcing from
// `PlayerProfile.achievements`)
// and wires it into the App
// constructor.
import { renderAchievementsPanel, AchievementsPanelHandle } from './ui/AchievementsPanel';
// Round 119 — BiomeLibraryPanel
// module. The mount point +
// B key + App.toggleBiomeLibrary
// are added in round-119. The
// panel shows the 6 biomes from
// `WfcBiomes.BIOMES` with the
// current biome highlighted.
import { renderBiomeLibraryPanel, BiomeLibraryPanelHandle } from './ui/BiomeLibraryPanel';
// Round 151 — extracted from the
// previously inline `BIOME_HOTKEYS`
// map (was at line ~310 of this
// file, declared at module load).
// Moving the map to its own module
// makes the lookup contract
// testable: `getBiomeHotkeyContext`
// + `listMappedBiomeIds` are now
// importable from biomeHotkeys.test.ts
// without spinning up the App.
// Round 151 also backfills the
// `space` and `dungeon` biomes (the
// BiomeLibraryPanel knows about all
// 6; the round-150 inline map only
// covered 4).
import { getBiomeHotkeyContext } from './ui/biomeHotkeys';
// Round 128 — the D-key DebugOverlay
// panel showing the 4 ActionDebouncer
// instances' runtime state (window /
// ms since last stamp / currently
// debouncing?). Developer + QA tool.
import { renderDebugOverlay, DebugOverlayHandle, type DebugOverlayDebouncerInfo } from './ui/DebugOverlay';
// Round 132 — the Z-key EventLog
// panel showing the 50-event
// ring buffer from
// `Analytics.recent` (the
// chronological log of "what
// just happened in this
// session": dimension enter
// / complete, tutorial step,
// item use, save, DM
// commands, WASM latency
// events, etc). 13th panel-
// toggle.
import { renderEventLogPanel, EventLogPanelHandle } from './ui/EventLogPanel';
// Round 133 — the K-key
// DslCodex panel showing
// the AGI's most recently
// generated / hot-reloaded
// `DslRule` (the round-15/16
// `MemeCompiler` output) as
// a small codex. 14th
// panel-toggle.
import { renderDslCodexPanel, DslCodexPanelHandle } from './ui/DslCodexPanel';
// Round 137 — wire the
// pre-existing
// `InventoryUI` module
// (use/drop actions,
// kind icon, detail
// pane — already
// implemented in
// `src/ui/InventoryUI.ts`
// with its own test
// suite, but never
// instantiated by the
// App). The 15th panel-
// toggle (I key +
// `btn-inventory` mouse
// button) finally
// mounts it on
// `#inventory-root`.
import { InventoryUI } from './ui/InventoryUI';
// Round 48 — `themeToScene` itself is no longer called from main.ts;
// the WASM bridge below wraps it. The `ThemeInput` type alias is
// still needed to type the input to the bridge.
import type { ThemeInput, SceneBlueprint } from './ai/SceneGen';
// Round 48 — WASM bridge for themeToScene. The TS mirror in
// `./ai/SceneGen` stays in tree as a fallback for when the WASM
// module fails to load or fails at runtime. See
// `docs/prds/2026-06-07-round-48-wasm-bridge-a.md`.
import {
    loadSceneGenWasm,
    themeToSceneWithFallback,
    type SceneGenWasmModule,
} from './ai/SceneGenWasm';

interface AppRefs {
    canvas: HTMLCanvasElement;
    hudRoot: HTMLElement;
    progressionRoot: HTMLElement;
    economyRoot: HTMLElement;
    epochRoot: HTMLElement;
    tutorialRoot?: HTMLElement;
    statsRoot?: HTMLElement;
    godRoot?: HTMLElement;
    vaultRoot?: HTMLElement;
    npcMindRoot?: HTMLElement;
    /**
     * Round 115 — optional root for
     * the achievements panel
     * (player.achievements list).
     * The panel is constructed only
     * if the host page provides a
     * DOM node with
     * `id="achievements-root"`. The
     * V key shortcut is the primary
     * way to open the panel (the
     * round-22 follow-up will add a
     * mouse button alongside the V
     * key — round-115 ships the
     * toggle group entry only).
     */
    achievementsRoot?: HTMLElement;
    /**
     * Round 119 — optional root
     * for the biome library
     * panel (6 biomes from
     * `WfcBiomes.BIOMES`). The
     * panel is constructed only
     * if the host page provides
     * a DOM node with
     * `id="biome-library-root"`.
     * The B key shortcut is the
     * primary way to open the
     * panel.
     */
    biomeLibraryRoot?: HTMLElement;
    /**
     * Round 128 — optional root
     * for the DebugOverlay panel
     * (4 ActionDebouncer
     * instances' runtime state).
     * The D key shortcut is the
     * primary way to open the
     * panel.
     */
    debugOverlayRoot?: HTMLElement;
    /**
     * Round 132 — optional root
     * for the EventLog panel
     * (the 50-event ring buffer
     * from `Analytics.recent`).
     * The Z key shortcut is the
     * primary way to open the
     * panel.
     */
    eventLogRoot?: HTMLElement;
    /**
     * Round 133 — optional root
     * for the DslCodex panel
     * (the AGI's most recently
     * generated / hot-reloaded
     * `DslRule`). The K key
     * shortcut is the primary
     * way to open the panel.
     */
    dslCodexRoot?: HTMLElement;
    /**
     * Round 137 — optional root
     * for the pre-existing
     * `InventoryUI` module
     * (use/drop actions,
     * kind icon, detail
     * pane). The 15th
     * panel-toggle (I key +
     * `btn-inventory` mouse
     * button) wires the
     * UI to this mount
     * point. The UI class
     * is constructed only
     * if the host page
     * provides a DOM node
     * with id
     * `inventory-root` —
     * pre-round-137 pages
     * that don't include
     * the mount point
     * still boot cleanly
     * (the toggle is a
     * no-op for them).
     */
    inventoryRoot?: HTMLElement;
    /**
     * Round 111 — optional root for the
     * SettingsPanel (audio / difficulty /
     * language / debounce window). The
     * panel is constructed only if the
     * host page provides a DOM node with
     * `id="settings-root"`. The keyboard
     * shortcut `?` opens the keyboard
     * help overlay; settings panel can
     * be opened via a future `P` key
     * (round-112+ candidate).
     */
    settingsRoot?: HTMLElement;
}

/**
 * Round 50 — back-compat seed for round-49 saves that don't carry
 * `lastDimensionSeed`. We mix a few stable scalar fields from the
 * snapshot into a 32-bit integer; reloading the same save twice
 * produces the same dungeon tiles (not necessarily the same as the
 * original `enterNewDimension` would have rolled — that information
 * is lost — but at least consistent across reloads).
 *
 * Not cryptographically meaningful; just a deterministic mixing of
 * the few `number` fields the snapshot carries.
 */
function stableSeedFromSnapshot(snap: { wfcTileWeights: readonly number[]; npcCount: number; musicBpm: number; biomeId: string; eventChain: readonly unknown[] }): number {
    let h = 0x811c9dc5; // FNV offset basis, 32-bit
    h = (h ^ snap.wfcTileWeights[0]) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h = (h ^ snap.npcCount) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h = (h ^ snap.musicBpm) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h = (h ^ snap.eventChain.length) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    // Fold the biomeId string into the mix so different biomes
    // get different fallback seeds.
    for (let i = 0; i < snap.biomeId.length; i++) {
        h = (h ^ snap.biomeId.charCodeAt(i)) >>> 0;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

// Round 151 — biome hotkey map
// moved to ./ui/biomeHotkeys.ts.
// The two consumers in this file
// (the keyboard 1-8 jump path and
// the DM-driven dimension path)
// call `getBiomeHotkeyContext`
// instead of reading the map
// directly. Round 151 also
// backfills the `space` and
// `dungeon` biomes that were
// known to BiomeLibraryPanel but
// had no bindings here.

class App {
    private scene: SceneManager;
    private i18n: I18n;
    private hud: HUD;
    private progUI: ProgressionUI;
    private economy: EconomyPanel;
    private epochPanel: EpochPanel;

    private worldState: WorldState;
    private progression: Progression;
    private epoch: EpochSystem;
    private save: SaveSystem;
    private ai: AIEngine;
    private npcAI: NPCDialogueAI;
    private gameplay: GameplayManager;
    private bridge: AIBridge;
    private dslExec: DslExecutor;
    private hot: HotReloadController;
    private transitions: SceneTransitions;
    private tutorial: TutorialOverlay | null = null;
    private npcCombat: NpcCombat;
    private audio: GameAudio;
    private analytics: Analytics;
    /**
     * Round 69 — per-fn WASM latency aggregator. Subscribes
     * to the round-68 `wasm.latency` event stream and pushes
     * a (count, median, p95, max) breakdown into the HUD on
     * every event. The aggregation happens in-process so the
     * HUD only sees a single state update per event. The
     * per-fn ring buffer is bounded (default 200 samples) so
     * a long session doesn't unbounded-grow the Map.
     */
    private wasmLatencyStats: WasmLatencyStats;
    private statsHandle: StatsPanelHandle | null = null;
    private statsTimer: ReturnType<typeof setInterval> | null = null;
    private llm: HttpLLMClient | { complete: typeof HttpLLMClient.prototype.complete } | null = null;
    private health: PlayerHealth;
    private dm: DmMode;
    private godConsole: GodConsole | null = null;
    /**
     * Round 111 — settings panel instance
     * (audio / difficulty / language /
     * debounce window). Created in the
     * constructor only if `refs.settingsRoot`
     * is provided. The debounce window
     * knob calls `applySettings(ms)` which
     * fans out to all 4 ActionDebouncer
     * instances via `setWindowMs(ms)`.
     */
    private settingsPanel: SettingsPanel | null = null;
    /**
     * Round 111 — current debounce window
     * (mirrors the SettingsPanel's
     * `is-active` state). Default is
     * `App.ACTION_DEBOUNCE_MS` (500).
     * Surfaced via `getCurrentDebounceWindow()`
     * for the SettingsPanel's getter.
     */
    private currentDebounceWindowMs: 0 | 100 | 250 | 500 | 1000 | 2000 =
        loadDebounceMsFromStorage() ?? 500;
    /**
     * Round 126 — current difficulty tier
     * surfaced via `getCurrentDifficulty()`
     * for the SettingsPanel's getter. The
     * UI was already in place since round
     * 111 (`settings.diff.{easy,normal,hard}`
     * buttons); the App just wasn't wiring
     * the hooks so the row was hidden.
     * Round 126 wires the 2 hooks
     * (`onDifficultyChange` +
     * `getCurrentDifficulty`) + adds the
     * App state + `applyDifficultySettings`
     * method + new
     * `BalanceTuner.setTargetWinRate` setter
     * so the picked difficulty actually
     * changes the AI's tuning bias.
     */
    private currentDifficulty: Difficulty =
        loadDifficultyFromStorage() ?? 'normal';
    /**
     * Round 161 — current scene
     * speed preset surfaced via
     * `getCurrentSceneSpeed()`
     * for the SettingsPanel's
     * getter. The 4 presets are
     * 0.5x / 1x / 2x / 4x. The
     * default is 1x (matches
     * the round-1 normal
     * update rate). The N key
     * cycles through the
     * presets in
     * `SCENE_SPEED_PRESETS`
     * order (0.5 → 1 → 2 → 4
     * → 0.5), and the
     * SettingsPanel's
     * scene-speed row has 4
     * buttons in the same
     * order. The value is
     * persisted to
     * localStorage
     * (`agi_scene_speed`) so
     * the choice survives a
     * page reload.
     */
    private currentSceneSpeed: SceneSpeedPreset =
        loadSceneSpeedFromStorage() ?? 1;
    /**
     * Round 161 — the
     * scene-speed
     * multiplier that
     * downstream code
     * (the Three.js
     * render loop, the
     * scene's particle
     * systems, etc.)
     * reads each frame
     * to scale delta-
     * time. Defaults
     * to 1 (the round-1
     * 1:1 update rate).
     * The 4 valid values
     * are 0.5 / 1 / 2 /
     * 4. Stored
     * separately from
     * `currentSceneSpeed`
     * so the
     * `applySceneSpeed`
     * method can detect
     * "no-op" calls
     * (the
     * `cycleSceneSpeed`
     * method calls it
     * unconditionally,
     * and the panel
     * click handler
     * calls it only on
     * a real change).
     */
    private sceneSpeedMultiplier: SceneSpeedPreset = 1;
    private replay: SessionReplay;
    private narration: NarrationEngine;
    private vault: DimensionVault;
    private vaultHandle: VaultPanelHandle | null = null;
    private vaultTimer: ReturnType<typeof setInterval> | null = null;
    /**
     * Round 48 — the loaded WASM bridge for `themeToScene`. Null
     * means the WASM module failed to load (browser blocks wasm,
     * 404, version mismatch); the TS mirror takes over in that
     * case. Injected by `bootstrap()` after `App.start()`.
     */
    private sceneGenWasm: SceneGenWasmModule | null = null;
    /** Round 21 — per-NPC memory + disposition. */
    private npcMinds: NpcRegistry;
    private npcMindHandle: NpcMindPanelHandle | null = null;
    /**
     * Round 118 — achievements
     * panel handle. The handle's
     * `refresh()` re-renders the
     * `<div id="achievements-root">`
     * from the current
     * `worldState.player.achievements`
     * list. Wired in the constructor
     * (after the V key toggle /
     * `mount point` were added in
     * round-115) so the panel shows
     * the latest list whenever
     * the player adds an achievement
     * (or the host app refreshes
     * the snapshot).
     */
    private achievementsHandle: AchievementsPanelHandle | null = null;
    /**
     * Round 119 — biome
     * library panel handle.
     * The handle's
     * `refresh()` re-renders
     * the
     * `<div id="biome-library-root">`
     * from the current
     * `worldState.lastBiome`.
     * Wired in the constructor
     * (after the B key toggle /
     * mount point are added in
     * round-119) so the panel
     * shows the current biome
     * badge whenever the
     * player enters a new
     * dimension.
     */
    private biomeLibraryHandle: BiomeLibraryPanelHandle | null = null;
    /**
     * Round 128 — handle for the
     * DebugOverlay panel (the
     * 12-key panel-toggle D
     * shortcut's content).
     * Refreshed every 200ms via
     * `debugOverlayTimer` so the
     * `ms since stamp` counts
     * tick in real time. Null
     * when the mount point is
     * not provided.
     */
    private debugOverlayHandle: DebugOverlayHandle | null = null;
    private debugOverlayTimer: ReturnType<typeof setInterval> | null = null;
    /**
     * Round 132 — handle for the
     * 13th panel-toggle Z
     * shortcut's content. The
     * panel renders the 50-event
     * ring buffer from
     * `Analytics.recent` (the
     * chronological log of "what
     * just happened in this
     * session"). Refreshed every
     * second via `eventLogTimer`
     * so the "ago" labels
     * update over time. Null
     * when the mount point is
     * not provided.
     */
    private eventLogHandle: EventLogPanelHandle | null = null;
    private eventLogTimer: ReturnType<typeof setInterval> | null = null;
    /**
     * Round 133 — handle for
     * the 14th panel-toggle
     * K shortcut's content.
     * The panel renders the
     * AGI's most recently
     * generated / hot-reloaded
     * `DslRule` (the
     * round-15/16
     * `MemeCompiler` output)
     * as a small codex. Null
     * when the mount point is
     * not provided.
     */
    private dslCodexHandle: DslCodexPanelHandle | null = null;
    /**
     * Round 137 — the pre-existing
     * `InventoryUI` instance
     * (use/drop actions, kind
     * icon, detail pane). Null
     * when the mount point is
     * not provided. The
     * `refresh()` re-renders
     * the inventory list
     * (called from the same
     * `onHotEvent` listener
     * that drives the
     * dslCodexHandle).
     */
    private inventoryUI: InventoryUI | null = null;
    /**
     * Round 133 — the most
     * recently accepted
     * `DslRule` from a
     * `hotReloadFromMemes`
     * call. The DslCodex
     * panel reads this via
     * a callback (so the
     * panel updates
     * automatically when
     * the field is
     * mutated). Null when
     * no hot-reload has
     * happened yet.
     */
    private currentDslRule: import('./dsl/MemeCompiler').DslRule | null = null;
    /**
     * Round 133 — the outcome
     * of the most recent
     * `hotReloadFromMemes`
     * call. The DslCodex
     * panel surfaces this as
     * a "已接受" / "被拒绝"
     * status badge in the
     * title. 'none' when no
     * hot-reload has been
     * attempted.
     */
    private lastDslOutcome: 'accepted' | 'rejected' | 'none' = 'none';
    /**
     * Round 130 — `Date.now()` snapshot taken
     * at App construction. Surfaced to the
     * DebugOverlay's "session duration" cell
     * so QA can see how long the App has been
     * running without a reload.
     */
    private sessionStartedAt: number = Date.now();
    /** Monotonic turn counter for NpcMemoryEntry.turn. */
    private npcTurn = 0;
    /**
     * Round 102 — in-flight guard for `enterNewDimension`.
     * Set to `true` while the orchestrator is running
     * (from the early-return check through the `try/finally`
     * in the method body), reset to `false` in the
     * `finally` block. A rapid double-tap on Space
     * (round-57 + round-96 alias) or two rapid clicks on
     * the next-dim button would otherwise invoke the
     * orchestrator twice in parallel; the second call
     * would silently overwrite the first's WorldState
     * writes (round-99 dual-call race). The guard
     * short-circuits the second call to a no-op
     * (with a Chinese-localized log line) so the
     * player sees a stable scene-tile render.
     */
    private isEntering = false;
    /**
     * Round 108 — time-based debounce for `loadGame`,
     * consolidating the round-104 inline
     * `lastLoadAt` field into a single
     * `ActionDebouncer` instance. The class
     * encapsulates `lastFiredAt` +
     * `windowMs` + the Chinese-skip-message
     * formatting, so the per-action App
     * code reduces from a 6-line debounce
     * block (check `if (this.lastLoadAt > 0
     * && now - this.lastLoadAt < ...)` +
     * log + return) to a single
     * `if (!this.debouncerLoadGame.check()) return;`
     * line. The 500ms window matches the
     * round-104 human-double-click tuning.
     * The stamp is placed at END of body
     * (round-104 contract) — "a failure
     * mid-body still counts as completed
     * so the user can't spam-retry past a
     * broken load." See `ActionDebouncer`
     * JSDoc for the stamp-position-asymmetry
     * rationale.
     */
    private debouncerLoadGame: ActionDebouncer;
    /**
     * Round 108 — time-based debounce for
     * `saveGame`, consolidating the
     * round-106 inline `lastSaveAt` field.
     * Same 500ms window as `loadGame`.
     * The stamp is placed at END of body
     * (round-106 contract).
     */
    private debouncerSaveGame: ActionDebouncer;
    /**
     * Round 108 — time-based debounce for
     * `rollWorldEvent`, consolidating the
     * round-107 inline `lastEventAt`
     * field. Same 500ms window. The stamp
     * is placed at BEGINNING of body
     * (round-107 contract) — "even a
     * null-returning `if (!evt) return;`
     * counts as called once so the user
     * can't spam-roll to flood the
     * logs." See `ActionDebouncer` JSDoc
     * for the stamp-position-asymmetry
     * rationale.
     */
    private debouncerRollWorldEvent: ActionDebouncer;
    /**
     * Round 109 — time-based debounce for
     * `enterAtom` (round-65 keyboard 1-8
     * jump path), the 4th `ActionDebouncer`
     * use case after round-104/106/107/108.
     * The async `enterAtom` method (line
     * 983) has the WORST dual-call problem
     * of the 4 debounced methods: a rapid
     * double-tap on keyboard '3' (jump to
     * atom 3) would otherwise:
     *   1. Call `bridge.planAndLoad` twice
     *      (waste network/disk + duplicate
     *      analytics).
     *   2. Call `themeToSceneWithFallback`
     *      twice (waste compute).
     *   3. Call `renderWfcDungeon` twice
     *      (visible flicker between two
     *      atom scenes).
     *   4. Call `setBiomeAtmosphere` twice
     *      (visible atmosphere pop).
     *   5. Call `spawnNpcWave` twice
     *      (visible double-NPC spawn).
     *   6. Emit `进入次元:` log twice
     *      (visible duplicate log line).
     *   7. Run `narrate()` twice (visible
     *      double-narration).
     * The `await` in the middle means the
     * first call hasn't completed when the
     * second one starts, so they're both
     * in-flight simultaneously — worse than
     * round-99's sync `enterNewDimension`
     * dual-call. The debounce check at the
     * top short-circuits the second call
     * BEFORE any side effects. The stamp
     * is placed at the BEGINNING of the
     * body (round-107 contract) because
     * `enterAtom` has two early-return
     * paths (`!atomId`, `!known`) and a
     * network-failure catch — stamp-at-
     * start is more user-friendly because
     * the second tap is blocked even on
     * failure (no network spam-retry).
     */
    private debouncerEnterAtom: ActionDebouncer;
    /**
     * Round 110 — single debounce window for all 4
     * time-based debounced actions
     * (loadGame/saveGame/rollWorldEvent/enterAtom).
     * Folded from the round-104 `LOAD_DEBOUNCE_MS`,
     * round-106 `SAVE_DEBOUNCE_MS`, round-107
     * `EVENT_DEBOUNCE_MS`, and round-109
     * `ENTER_ATOM_DEBOUNCE_MS` — all 4 shared
     * the same 500ms value, so a single constant
     * is the cleanest source of truth. The
     * 500ms tuning rationale (carried forward
     * from round-104): a human double-click on
     * a button/key takes ~200-300ms (faster than
     * a deliberate second click), and the
     * round-50 rehydration + setTimeout schedule
     * typically completes within ~50ms. 500ms
     * gives margin on both sides. A future
     * round-111+ could expose this as a debug
     * knob in the help overlay
     * (`settings.actionDebounceMs`) so QA can
     * dial it down to 0ms for the "I really want
     * to save twice" workflow without
     * re-compiling.
     *
     * The 4 debouncer instances (`debouncerLoadGame`,
     * `debouncerSaveGame`, `debouncerRollWorldEvent`,
     * `debouncerEnterAtom`) all receive this single
     * constant via their constructors. A
     * `setter` on the App could mutate this
     * constant at runtime to update all 4
     * debouncers' windows — would require a
     * per-instance `setWindowMs` method on
     * `ActionDebouncer` (round-111+ candidate).
     */
    private static readonly ACTION_DEBOUNCE_MS = 500;

    /** NPC roster, procedurally generated by NpcFactory (round 17). */
    private npcs: NPCProfile[] = [];

    constructor(refs: AppRefs) {
        this.scene = new SceneManager(refs.canvas);
        this.i18n = new I18n();
        this.hud = new HUD(refs.hudRoot, this.i18n);
        // Round 152 — restore the HUD compact
        // mode from localStorage on boot so a
        // player who enabled it on a previous
        // visit doesn't have to re-enable it.
        // The setter is idempotent: a fresh
        // boot with no saved value defaults
        // to compact OFF (false).
        this.hud.setCompact(loadHudCompactFromStorage());
        this.hud.setFadeEnabled(loadHudFadeFromStorage());
        this.hud.setCorner(loadHudCornerFromStorage());
        this.hud.setPinned(loadHudPinnedFromStorage());
        // Round 156 — restore click-through
        // state from localStorage alongside
        // compact, fade, corner, and pin.
        // The setter is idempotent: a fresh
        // boot with no saved value defaults
        // to click-through OFF (false).
        this.hud.setClickThrough(loadHudClickThroughFromStorage());
        // Round 159 — restore the
        // auto-hide-on-fullscreen
        // state alongside compact,
        // fade, corner, pin, and
        // click-through. The setter
        // is idempotent: a fresh boot
        // with no saved value defaults
        // to auto-hide OFF (false) —
        // the player has to explicitly
        // press K to opt in.
        this.hud.setAutoHideFullscreen(loadHudAutoHideFullscreenFromStorage());
        // Round 160 — restore the
        // minimized state alongside
        // compact, fade, corner,
        // pin, click-through, and
        // auto-hide. The setter
        // is idempotent: a fresh
        // boot with no saved value
        // defaults to minimized
        // OFF (false) — the player
        // has to explicitly press
        // B to opt in.
        this.hud.setMinimized(loadHudMinimizedFromStorage());
        // Round 161 — restore the
        // scene speed preset
        // alongside the HUD
        // modes. The setter
        // is idempotent: a fresh
        // boot with no saved
        // value defaults to 1x
        // (the round-1 default
        // rate) — the player has
        // to explicitly press N
        // (or click a button in
        // the settings panel) to
        // opt in to a different
        // speed. The 4 presets
        // are 0.5x / 1x / 2x / 4x.
        this.currentSceneSpeed = loadSceneSpeedFromStorage();
        this.applySceneSpeed(this.currentSceneSpeed);
        this.worldState = new WorldState('local-player', '次元旅者');
        this.progression = new Progression();
        this.epoch = new EpochSystem(Date.now());
        this.save = new SaveSystem(this.worldState, this.epoch, this.progression);
        this.ai = new AIEngine(Date.now());
        // Round 127 — sync the BalanceTuner
        // to the persisted difficulty tier
        // (if any). The field initializer at
        // line ~262 already loaded the saved
        // value into `currentDifficulty`; this
        // call propagates it to
        // `ai.tuner.targetWinRate` so the AI's
        // first `suggestDifficulty` call uses
        // the restored rate. Idempotent when
        // the value is the default 'normal'
        // (0.60 = constructor default).
        this.applyDifficultySettings(this.currentDifficulty);
        this.npcAI = new NPCDialogueAI(Date.now());
        // Procedurally generate the NPC roster (round 17).
        this.npcs = new NpcFactory(Date.now()).generateRoster({ count: 5, seed: Date.now() });
        this.gameplay = new GameplayManager();
        this.bridge = new AIBridge(this.ai, this.gameplay, this.worldState);
        // Audio: prefer Web Audio when available, otherwise silent stub.
        this.audio = new GameAudio(
            (typeof window !== 'undefined' && (window as any).AudioContext)
                ? new WebAudioService()
                : new NullAudioService(),
        );
        this.analytics = new Analytics();
        // Round 69 — attach the latency aggregator to the
        // analytics bus. `attach()` is idempotent (matches
        // the SessionReplay pattern at line 270), so the
        // double-call in App.setSceneGenWasm or any future
        // re-init path is safe.
        this.wasmLatencyStats = new WasmLatencyStats();
        this.wasmLatencyStats.attach(this.analytics);
        // Push the per-fn summary into the HUD on every
        // event. The aggregator already throttles via the
        // bounded ring buffer (median over ≤200 samples),
        // so we don't need an additional setInterval gate.
        this.wasmLatencyStats.onSummary((s) => {
            this.hud.setWasmLatencyStats(s);
        });
        this.health = new PlayerHealth({
            epochTriggerCollapse: () => this.triggerCollapse(),
            analytics: this.analytics,
        }, {
            onDamage: (amount, hp) => this.hud.log(`受到 ${amount} 伤害，HP ${hp}/${this.health.getMaxHp()}`),
            onDeath:  () => this.hud.log('你死了！大坍缩启动，世界重置...'),
            onRevive: () => this.hud.log('新纪元开始，你在 1 HP 复活'),
        });
        this.dm = new DmMode({
            onSpawnNpc: (c) => {
                const idx = (this.scene as any).npcs?.length ?? 0;
                this.scene.spawnNpc(idx, c.name);
                this.npcCombat.register(idx, c.name, 30);
                this.hud.log(`[DM] 生成 NPC: ${c.name} (${c.personality})`);
            },
            onSpawnRule: (dsl) => {
                const accepted = this.hot.begin(dsl);
                this.hud.log(accepted ? `[DM] 规则已提交编译: ${dsl}` : `[DM] 规则被拒绝: ${dsl}`);
            },
            onEvent: (name) => {
                // Use the world AI to roll a real event
                const evt = this.ai.worldAI.rollEvent(this.worldState.player.level, 0);
                if (evt) {
                    this.hud.setState({ worldEvent: evt });
                    this.hud.log(`[DM] ${evt.name} — ${evt.description}`);
                } else {
                    this.hud.log(`[DM] 自定义事件: ${name}`);
                }
            },
            onDimension: (r, c, s) => {
                // Actually generate a WFC dungeon with the chosen biome
                const biome = biomeForVisualStyle(s);
                const dungeon = generateDungeon(r, c, Math.floor(Math.random() * 1e6));
                this.scene.renderWfcDungeon(dungeon.tiles, 1.0, biome);
                this.scene.setBiomeAtmosphere(getBiomeAtmosphere(biome.id));
                this.audio.setBiomeAmbient(biome.id, getBiomeAudio(biome.id));
                this.audio.setBiomeSfx(biome.id, getBiomeAudio(biome.id));
                this.analytics.track('dm.dimension', { rows: r, cols: c, style: s });
                this.hud.log(`[DM] 渲染 ${biome.name} 主题地牢 ${r}x${c}`);
                // Round 66 — keep the persistent-memories
                // block in sync after a DM-driven dimension.
                // Without this, the round-49 "↩ 上次离开
                // #biome" line, round-64 🗺 minimap, and
                // round-47 "🎬 上次维度" summary all stay
                // stale after the player / GM uses the God
                // console to spawn a dimension. We use
                // biome defaults for the 4 scalars
                // (npcCount=0, bpm=120, eventCount=0,
                // archetypeHintCount=0) since the DM path
                // doesn't run the full themeToScene pipeline
                // (the player just picks rows/cols/style
                // interactively). The minimap is rendered
                // with the resolved biome's palette so the
                // 🗺 preview matches what the player sees
                // on screen.
                this.worldState.lastBiome = biome.id;
                this.hud.setLastBiome(biome.id);
                // Round 87 — push the biome's particle color
                // as the HUD dim panel's left-border accent.
                // Resolved here (not in the HUD) so the HUD
                // module stays decoupled from BiomeAtmosphere.
                this.hud.setLastBiomeAccent(getBiomeAtmosphere(biome.id).particleColor);
                // Round 150 — push
                // the biome-
                // contextual
                // hotkey strip
                // (mirrors the
                // round-150 push
                // in the
                // keyboard 1-8
                // jump path).
                {
                    const ctx = getBiomeHotkeyContext(biome.id);
                    if (ctx === null) {
                        this.hud.setBiomeHotkeys(null, null);
                    } else {
                        this.hud.setBiomeHotkeys(ctx.label, ctx.bindings);
                    }
                }
                this.worldState.lastMinimap = renderMiniMap(dungeon.tiles, biome.id);
                this.hud.setMinimap(this.worldState.lastMinimap);
                // Round 71 — synthesize a content-driven event chain
                // for the DM-spawned dimension. The pre-round-71 code
                // wrote `eventCount: 0` because the DM path skips
                // `themeToScene` and so had no real chain to count.
                // The synthesized chain is deterministic for the same
                // (dungeon, biome) and uses the same 5 event kinds as
                // the standard path (spawn_wave / treasure_drop /
                // fog_pulse / boss_hint / echo_lore), so a future
                // round-72+ "replay events" UI can render either path
                // through the same code. See `DmEventChain.ts`.
                const dmEventChain = synthesizeDmEventChain(dungeon.tiles, biome);
                // Round 77 — close the 3 remaining scalar
                // placeholders. The DM path doesn't run
                // `themeToScene` (no AI-generated theme to
                // read from), so the 4 scalars were:
                //   - npcCount           = 0    (placeholder)
                //   - bpm                = 120  (placeholder)
                //   - eventCount         = dmEventChain.length (round 71)
                //   - archetypeHintCount = 0    (placeholder)
                //
                // The WFC grid + the resolved biome are
                // enough to compute the other three:
                //   - npcCount           = countNpcSpawnTiles(tiles)
                //                            (real spawn tiles in
                //                             the generated grid)
                //   - bpm                = bpmForMood(biome.mood)
                //                            (the biome's mood
                //                             maps to a sensible
                //                             tempo)
                //   - archetypeHintCount = 0  (WFC doesn't emit
                //                            archetype hints —
                //                            that's a
                //                            `themeToScene`
                //                            concept. The DM
                //                            path correctly
                //                            reports 0.)
                this.hud.setLastSceneBlueprint({
                    // Round 78 — typed against SceneScalars
                    // (the shared value object in
                    // src/ai/SceneScalars.ts). The round-77
                    // work closed the placeholders; this
                    // is now a 4-tuple of real values.
                    npcCount: countNpcSpawnTiles(dungeon.tiles),
                    bpm: bpmForMood(biome.mood),
                    // Round 71 — the real count, not 0. The
                    // 3-5 range mirrors the standard chain's.
                    eventCount: dmEventChain.length,
                    archetypeHintCount: 0,
                });
                // Round 72 — also store the full event-chain
                // timeline in WorldState so a future
                // "replay events" UI can read it. The non-DM
                // path syncs this automatically via
                // `updateLastSceneBlueprintFull` (round 49
                // extension), so the DM path's manual call
                // keeps the two paths symmetric.
                this.worldState.setLastSceneEventChain(dmEventChain);
                // Round 73 — push the chain into the HUD so
                // the persistent-memories block can render
                // the `⏰ next: <kind> in <delay>s` hint. The
                // non-DM path's `enterNewDimension` /
                // `enterAtom` flows pipe this through
                // `setLastSceneBlueprintFull` → round-49
                // helper (see below), so the HUD sees the
                // same chain either way.
                this.hud.setLastSceneEventChain(dmEventChain);
            },
        });
        this.replay = new SessionReplay(this.analytics, 200);
        this.replay.startRecording();
        this.narration = new NarrationEngine();
        // Round 68 — inject the in-browser `wasm.latency`
        // bench wrapper into the narration engine so the
        // round-51 `callMood4thSentenceFor` call site emits
        // an event alongside the two `themeToScene` call
        // sites instrumented in this round. Default
        // `setBench` is a no-op (covered in
        // NarrationEngine.test.ts) so the no-App path
        // (used in unit tests) keeps working.
        this.narration.setBench(
            <T>(name: string, fn: () => T) => this.analytics.bench(name, fn),
        );
        // Round 20 — the AGI's "memory" of visited dimensions.
        this.vault = new DimensionVault();
        // Round 21 — per-NPC memory + disposition. Mirrors the engine's
        // NpcRegistry. One mind per generated NPC profile.
        this.npcMinds = new NpcRegistry();
        // Round 48 — rehydrate from the round-40 persisted
        // snapshot when one is present (i.e. the player
        // saved, closed the tab, and re-opened the app on
        // a fresh load). Otherwise, generate a fresh roster
        // from the NpcFactory output the way round-21
        // did. The fresh-boot path is the same code as
        // before; the rehydrate path lets the world's NPC
        // memory (entries + disposition + archetype) carry
        // across reloads.
        if (this.worldState.npcMindsSnapshot.length > 0) {
            this.npcMinds.loadFromSnapshots(this.worldState.npcMindsSnapshot);
            const totalEntries = this.worldState.npcMindsSnapshot
                .reduce((n, s) => n + s.entries.length, 0);
            this.hud.log(
                `[narr+mind] 还原 ${this.npcMinds.len()} 个 NPC, ${totalEntries} 段记忆`,
            );
        } else {
            for (const profile of this.npcs) {
            // Round 29 — pass the profile's archetype so the
            // new NpcMind seeds its initial disposition from
            // the round-27 archetype table. (No-op when the
            // profile has no archetype, e.g. vanilla
            // generateRoster() output.)
            this.npcMinds.insert(new NpcMind(profile.id, NpcMind.DEFAULT_CAPACITY, profile.archetype));
            }
        }
        // NpcCombat wired to the scene's NPC dialog methods.
        this.npcCombat = new NpcCombat({
            flashNpc: (i) => { this.scene.flashNpc(i); },
            hideNpc: (i) => { this.scene.hideNpc(i); },
            floatOverNpc: (i, t, c) => { this.scene.spawnFloatingText(t, c); },
            setNpcDialogue: (i, t) => this.scene.setNpcDialogue(i, t),
            clearNpcDialogue: (i) => this.scene.clearNpcDialogue(i),
        }, {
            onDefeated: (i, n) => this.hud.log(`${n} 已被击败`),
            onDamage:    (i, n, d) => this.audio.fire('trap.hit'),
        });
        // Real LLM client (falls back to MockLLMClient when no apiKey).
        this.llm = new HttpLLMClient({
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            apiKey: '', // empty → mock fallback
        });
        if (refs.tutorialRoot) {
            this.tutorial = new TutorialOverlay(refs.tutorialRoot);
        }
        if (refs.statsRoot) {
            this.statsHandle = renderStatsPanel(refs.statsRoot, this.analytics, this.i18n);
            // Refresh the panel whenever an event is fired.
            this.analytics.onEvent(() => this.statsHandle?.refresh());
            // Plus a 1s tick for the uptime counter.
            this.statsTimer = setInterval(() => this.statsHandle?.refresh(), 1000);
        }
        if (refs.godRoot) {
            this.godConsole = new GodConsole(refs.godRoot, this.dm, {
                onResult: (r) => this.hud.log(`[DM] ${r.cmd.kind} → ${r.ok ? 'ok' : r.error}`),
            });
        }
        // Round 111 — SettingsPanel construction.
        // Created only if the host page provides a
        // `settings-root` DOM node. The 4 hooks
        // (onDebounceChange + getCurrentDebounce
        // + onDifficultyChange + getCurrentDifficulty)
        // are wired so the panel can both
        // read the App's current state (for
        // the `is-active` highlight) and
        // push changes back into the App.
        // Round 126 added the 2 difficulty
        // hooks (the row was hidden since
        // round 111 because the App
        // omitted these hooks).
        if (refs.settingsRoot) {
            this.settingsPanel = new SettingsPanel(refs.settingsRoot, this.i18n, this.audio, {
                onDebounceChange: (ms) => this.applyDebounceSettings(ms),
                getCurrentDebounce: () => this.currentDebounceWindowMs,
                onDifficultyChange: (d) => this.applyDifficultySettings(d),
                getCurrentDifficulty: () => this.currentDifficulty,
                // Round 161 — wire the
                // scene-speed row
                // hooks. The
                // `onSceneSpeedChange`
                // callback updates
                // the in-memory
                // `currentSceneSpeed`
                // field + persists to
                // localStorage +
                // applies the new
                // multiplier to the
                // scene's update
                // loop. The
                // `getCurrentSceneSpeed`
                // getter is used by
                // the SettingsPanel
                // to highlight the
                // active preset on
                // render. Mirrors
                // the round-111
                // debounce wiring.
                onSceneSpeedChange: (sp) => {
                    this.currentSceneSpeed = sp;
                    saveSceneSpeedToStorage(sp);
                    this.applySceneSpeed(sp);
                },
                getCurrentSceneSpeed: () => this.currentSceneSpeed,
            });
        }
        if (refs.vaultRoot) {
            this.vaultHandle = renderVaultPanel(refs.vaultRoot, this.vault, this.i18n);
            this.vaultTimer = setInterval(() => this.vaultHandle?.refresh(), 1000);
        }
        if (refs.npcMindRoot) {
            this.npcMindHandle = renderNpcMindPanel(refs.npcMindRoot, this.npcMinds, this.i18n);
        }
        // Round 118 — wire the
        // AchievementsPanel. The
        // mount point + V key +
        // App.toggleAchievements
        // were added in round-115;
        // round-118 ships the actual
        // `renderAchievementsPanel`
        // function (sourcing from
        // `PlayerProfile.achievements`)
        // and wires it into the App
        // constructor. Mirrors the
        // round-20 `renderVaultPanel`
        // pattern exactly (root
        // ref + i18n). No
        // `setInterval` refresh
        // because the
        // `achievements` list only
        // changes on
        // `addAchievement(id)` calls
        // — the host can call
        // `this.achievementsHandle?.refresh()`
        // explicitly when needed.
        if (refs.achievementsRoot) {
            this.achievementsHandle = renderAchievementsPanel(
                refs.achievementsRoot,
                this.worldState.player,
                this.i18n,
            );
        }
        // Round 119 — wire the
        // BiomeLibraryPanel. The
        // mount point + B key +
        // App.toggleBiomeLibrary
        // are added in round-119;
        // round-119 also ships the
        // `renderBiomeLibraryPanel`
        // function (sourcing
        // from
        // `WfcBiomes.BIOMES` +
        // `worldState.lastBiome`)
        // and wires it into the
        // App constructor. No
        // `setInterval` refresh
        // — the `lastBiome`
        // only changes on
        // `enterNewDimension`
        // calls, so the host can
        // call
        // `this.biomeLibraryHandle?.refresh()`
        // explicitly when needed.
        if (refs.biomeLibraryRoot) {
            this.biomeLibraryHandle = renderBiomeLibraryPanel(
                refs.biomeLibraryRoot,
                this.worldState.lastBiome,
                this.i18n,
            );
        }
        // Round 128 — wire the DebugOverlay
        // panel showing the 4 ActionDebouncer
        // instances' runtime state. The
        // panel is refreshed every 200ms via
        // setInterval so the `ms since stamp`
        // counts tick in real time. The
        // mount point is hidden by default;
        // the D key (or future mouse button)
        // toggles it via the round-117
        // `togglePanel` helper.
        //
        // The wiring happens AFTER the 4
        // debouncer constructors (lines
        // 890-925) + the round-127
        // applyDebounceSettings call below
        // because the DebugOverlay's
        // render pass reads `d.msSinceLastFire`
        // + `d.windowSizeMs` — the
        // debouncers must exist first.
        // Round 128 originally placed this
        // block here (before debouncer
        // construction), which crashed
        // with "Cannot read properties of
        // undefined (reading 'msSinceLastFire')"
        // on every makeApp() call. Moving
        // the block to after line 925 fixes
        // the boot order.
        this.dslExec = new DslExecutor(this.scene, {
            log: (line) => this.hud.log(line),
            onPlayerDamage: (n) => this.hud.log(`受到 ${n} 点伤害`),
            onEntitySpawn: (id, label, count) => this.hud.log(`生成 ${count} 个 ${label} (id=${id})`),
            onWorldModifier: (name, value) => this.epoch.addRule({
                id: `${name}_${Date.now()}`,
                name: String(name),
                description: `${name} = ${value}`,
                kind: 'modifier',
                params: { intensity: typeof value === 'number' ? value : 1 },
                addedAt: Date.now(),
            }),
        });
        this.hot = new HotReloadController(this.dslExec);
        this.transitions = new SceneTransitions(this.scene, this.ai, this.bridge);
        this.progUI = new ProgressionUI(refs.progressionRoot, this.progression, {
            onLevelUp: (oldL, newL) => this.hud.log(`升级 Lv ${oldL} → ${newL}`),
            onTalentLearned: (t) => this.hud.log(`习得天赋：${t.name}`),
        });
        // Round 108 — instantiate the 3 time-based debouncers.
        // The constructor wires up the debounce window,
        // action name (used in the Chinese skip log line),
        // and the round tag (used as the version marker
        // in the skip log line). The `logFn` is captured
        // here via `this.hud.log.bind(this.hud)` so the
        // debouncer's log line is rendered in the same
        // place as the rest of the orchestrator's output.
        // Round 110 — all 4 debouncers
        // share the single `ACTION_DEBOUNCE_MS`
        // constant (folded from the 4
        // round-104/106/107/109 per-action
        // constants). 500ms matches
        // human-double-click tuning
        // (200-300ms) + telemetry/visual
        // margin. See `ACTION_DEBOUNCE_MS`
        // JSDoc for the full rationale.
        this.debouncerLoadGame = new ActionDebouncer(
            App.ACTION_DEBOUNCE_MS,
            'loadGame',
            'round 104',
            (line) => this.hud.log(line),
        );
        this.debouncerSaveGame = new ActionDebouncer(
            App.ACTION_DEBOUNCE_MS,
            'saveGame',
            'round 106',
            (line) => this.hud.log(line),
        );
        this.debouncerRollWorldEvent = new ActionDebouncer(
            App.ACTION_DEBOUNCE_MS,
            'rollWorldEvent',
            'round 107',
            (line) => this.hud.log(line),
        );
        // Round 109 — 4th `ActionDebouncer`
        // use case. The async `enterAtom`
        // (round-65 keyboard 1-8 jump path)
        // has the worst dual-call problem
        // of the 4 debounced methods (the
        // `await bridge.planAndLoad` in
        // the middle means the first call
        // hasn't completed when the second
        // one starts). Same 500ms window
        // as the other 3 (now via the
        // single `ACTION_DEBOUNCE_MS`).
        this.debouncerEnterAtom = new ActionDebouncer(
            App.ACTION_DEBOUNCE_MS,
            'enterAtom',
            'round 109',
            (line) => this.hud.log(line),
        );
        // Round 127 — push the restored
        // debounce window (from
        // localStorage, if any) down to
        // all 4 debouncers. The field
        // initializer at line ~244 reads
        // localStorage; the debouncers
        // were constructed above with
        // the hardcoded
        // `ACTION_DEBOUNCE_MS` (500), so
        // this applySettings call syncs
        // them to the persisted value.
        // Idempotent when the value
        // matches the default.
        this.applyDebounceSettings(this.currentDebounceWindowMs);
        // Round 128 — wire the
        // DebugOverlay panel now that all
        // 4 ActionDebouncer instances
        // exist. The panel reads
        // `d.msSinceLastFire` +
        // `d.windowSizeMs` so it MUST be
        // constructed AFTER the debouncers.
        if (refs.debugOverlayRoot) {
            const debouncerInfos: DebugOverlayDebouncerInfo[] = [
                { debouncer: this.debouncerLoadGame,       chineseLabel: '读取存档' },
                { debouncer: this.debouncerSaveGame,       chineseLabel: '保存游戏' },
                { debouncer: this.debouncerRollWorldEvent, chineseLabel: '世界事件' },
                { debouncer: this.debouncerEnterAtom,      chineseLabel: '进入 atom' },
            ];
            // Round 130 — pass the optional `extras`
            // session-stats section. The "last action"
            // cells are derived from the debouncers
            // themselves (no separate field needed in
            // the App). `sessionStartedAt` is captured
            // at construction so the panel can show
            // "how long has this App been running?".
            this.debugOverlayHandle = renderDebugOverlay(
                refs.debugOverlayRoot,
                debouncerInfos,
                {
                    playerLevel: this.progression.level,
                    currentBiome: this.worldState.lastBiome,
                    sessionStartedAt: this.sessionStartedAt,
                },
            );
            this.debugOverlayTimer = setInterval(() => {
                this.debugOverlayHandle?.refresh();
            }, 200);
        }
        // Round 146 — push the 4
        // ActionDebouncer
        // instances into the
        // HUD so the
        // round-51 memories
        // block renders the
        // debouncer mini-strip.
        // Mirrors the
        // round-128 debug
        // panel's source
        // (same `chineseLabel`
        // map) so the player
        // sees the same
        // language in both
        // places.
        this.hud.setDebouncers([
            { debouncer: this.debouncerLoadGame,       chineseLabel: '读取存档' },
            { debouncer: this.debouncerSaveGame,       chineseLabel: '保存游戏' },
            { debouncer: this.debouncerRollWorldEvent, chineseLabel: '世界事件' },
            { debouncer: this.debouncerEnterAtom,      chineseLabel: '进入 atom' },
        ]);
        // Round 162 — push the
        // current scene speed
        // preset into the HUD
        // so the round-162
        // scene-speed mini-strip
        // renders. Mirrors
        // `setDebouncers`:
        // called once at App
        // construction; the
        // strip stays
        // permanently visible
        // (the `,` key cycle
        // just re-renders with
        // the new active
        // preset). The
        // `currentSceneSpeed`
        // field was already
        // restored from
        // localStorage above,
        // so this reflects the
        // persisted choice.
        this.hud.setSceneSpeed(this.currentSceneSpeed);
        // Round 147 — push the
        // 4 essential hotkey
        // bindings into the HUD
        // so the player sees the
        // controls at a glance
        // (操控性好). Mirrors
        // the
        // BINDING_DESCRIPTIONS /
        // PANEL_TOGGLE_DESCRIPTIONS
        // source of truth in
        // main.ts: P = settings
        // (panel toggle), Q =
        // codex (panel toggle),
        // R = rollback (recovery
        // path), T = stats (panel
        // toggle). The host can
        // extend this list in
        // future rounds.
        this.hud.setHotkeys([
            { key: 'P', action: '设置',    group: '面板' },
            { key: 'Q', action: '代码',    group: '面板' },
            { key: 'T', action: '状态',    group: '面板' },
            { key: 'R', action: '回滚',    group: '系统' },
            // Round 152 — H key toggles the HUD
            // compact mode (collapses the
            // round-51 memories block's per-row
            // detail lists). Mirrored in
            // BINDING_DESCRIPTIONS so the help
            // overlay auto-picks it up.
            { key: 'H', action: '紧凑',    group: '系统' },
            // Round 153 — J key toggles HUD fade
            // mode (auto-fade .hud-stats to
            // 0.25 opacity after 3s of
            // inactivity; snap back on any
            // input). Mirrored in
            // BINDING_DESCRIPTIONS so the
            // help overlay auto-picks it up.
            // Note: F is taken by the
            // round-21 vault toggle, so J is
            // the next free letter after H.
            { key: 'J', action: '淡出',    group: '系统' },
            // Round 154 — C key cycles the HUD
            // through the 4-corner sequence
            // (tl → tr → br → bl → tl).
            // Lets right-handed / left-handed
            // / one-handed-mobile players
            // pick a corner that doesn't
            // occlude their mouse or
            // dominant-hand finger. The
            // preference persists in
            // localStorage (`agi_hud_corner`)
            // so it survives page reloads.
            // C reads as "Corner"; K is
            // already taken by the
            // round-130 DSL codex toggle.
            { key: 'C', action: '角落',    group: '系统' },
            // Round 155 — X key toggles the
            // always-on-top pin flag. When
            // enabled, the HUD z-index
            // jumps from 10 to 10000 so the
            // panel stays clickable above
            // fullscreen Three.js canvases
            // (操控性好 — the player can
            // keep an eye on stats even
            // when a fullscreen scene
            // claims pointer-events). The
            // preference persists in
            // localStorage (`agi_hud_pinned`)
            // so it survives page reloads.
            // X reads as "eXtra on top";
            // it's the next free letter
            // after C (which round 154
            // bound to corner cycling).
            { key: 'X', action: '置顶',    group: '系统' },
            // Round 156 — Y key toggles
            // HUD click-through mode.
            // Y is the next free letter
            // after X (which round 155
            // bound to pin toggling). Y
            // reads as "bYpass" (clicks
            // bypass the HUD onto the
            // scene). Companion to X:
            // pinned controls stacking
            // (HUD above scene), click-
            // through controls interaction
            // (scene clickable through HUD).
            // Both can be enabled together.
            { key: 'Y', action: '穿透',    group: '系统' },
        ]);
        // Round 150 — push an
        // initial biome
        // hotkey context
        // (the round-30
        // welcome
        // dimension's
        // biome). The
        // biome strip is
        // EMPTY in the
        // welcome hub (no
        // contextual
        // bindings), so
        // we pass null to
        // start — the
        // strip is hidden
        // until the
        // player enters a
        // dimension with
        // biome-specific
        // bindings.
        this.hud.setBiomeHotkeys(null, null);
        // Round 132 — wire the
        // EventLog panel. The
        // panel renders the
        // 50-event ring buffer
        // from `Analytics.recent`
        // (the chronological
        // log of "what just
        // happened in this
        // session": dimension
        // enter / complete,
        // tutorial step, item
        // use, save, DM commands,
        // WASM latency events,
        // etc). The 13th panel-
        // toggle (Z key +
        // btn-event-log mouse
        // button) opens this
        // panel via the
        // round-117 `togglePanel`
        // helper, and the panel
        // itself is built at
        // runtime by
        // `renderEventLogPanel`.
        if (refs.eventLogRoot) {
            this.eventLogHandle = renderEventLogPanel(
                refs.eventLogRoot,
                this.analytics,
                this.i18n,
            );
            // Refresh every 1s so
            // the "ago" labels
            // update over time
            // (the bucketings are
            // Ns / Nm / Nh / Nd +
            // 刚刚 for the first
            // 2 seconds).
            this.eventLogTimer = setInterval(() => {
                this.eventLogHandle?.refresh();
            }, 1000);
        }
        // Round 133 — wire the
        // DslCodex panel. The
        // panel renders the
        // AGI's most recently
        // generated / hot-
        // reloaded `DslRule`
        // (the round-15/16
        // `MemeCompiler` output)
        // as a small codex
        // showing the source
        // DSL + the parsed AST
        // breakdown. The 14th
        // panel-toggle (K key +
        // btn-dsl-codex mouse
        // button) opens this
        // panel via the
        // round-117 `togglePanel`
        // helper. The panel
        // itself is built at
        // runtime by
        // `renderDslCodexPanel`
        // and reads `this.currentDslRule`
        // + `this.lastDslOutcome`
        // via callbacks (so the
        // panel updates
        // immediately when
        // `hotReloadFromMemes`
        // mutates either
        // field).
        if (refs.dslCodexRoot) {
            this.dslCodexHandle = renderDslCodexPanel(
                refs.dslCodexRoot,
                () => this.currentDslRule,
                () => this.lastDslOutcome,
                // Round 134 — pass the
                // `HotReloadController`
                // `getRuleHistory()`
                // ring-buffer getter
                // so the DslCodex
                // panel can render
                // the last 5
                // successfully-
                // applied rules as
                // a "历史" list
                // below the main
                // codex block.
                () => this.hot.getRuleHistory(),
                this.i18n,
                // Round 135 —
                // click-to-apply
                // callback: when
                // the player
                // clicks a
                // history row,
                // re-apply the
                // rule via the
                // `HotReloadController`
                // `reApplyRule()`
                // (immediate,
                // bypasses the
                // compile phase).
                // We also close
                // the panel +
                // emit a Chinese
                // log so the
                // player sees
                // the result of
                // the re-apply.
                (rule) => {
                    const ok = this.hot.reApplyRule(rule);
                    this.toggleDslCodex();
                    if (ok) {
                        this.analytics.track('dsl.applied', {
                            source: 'history-replay',
                            event: rule.event.kind,
                            actions: rule.actions.length,
                        });
                    } else {
                        this.analytics.track('dsl.rejected', {
                            reason: 'history-replay-rate-limit-or-compile-in-flight',
                            event: rule.event.kind,
                        });
                    }
                },
            );
        }
        // Round 137 — wire
        // the pre-existing
        // `InventoryUI`
        // module (use/drop
        // actions, kind
        // icon, detail
        // pane — already
        // implemented in
        // `src/ui/InventoryUI.ts`
        // with its own test
        // suite, but never
        // instantiated by
        // the App). The 15th
        // panel-toggle (I
        // key + `btn-inventory`
        // mouse button)
        // finally mounts it
        // on `#inventory-root`.
        // The `onAction`
        // callback logs the
        // use/drop result to
        // the HUD (so the
        // player sees "使用
        // 生命药剂，恢复 20
        // 体力" or "丢弃 X")
        // + emits an
        // analytics event for
        // replay analysis.
        if (refs.inventoryRoot) {
            this.inventoryUI = new InventoryUI(
                refs.inventoryRoot,
                this.worldState,
                (action) => {
                    if (action.type === 'used' && action.result) {
                        this.hud.log(`[背包] ${action.result}`);
                        this.analytics.track('item.used', {
                            itemId: action.itemId,
                            name: action.name,
                        });
                    } else if (action.type === 'dropped') {
                        this.hud.log(`[背包] 丢弃 ${action.name}`);
                        this.analytics.track('item.dropped', {
                            itemId: action.itemId,
                            name: action.name,
                        });
                    }
                },
            );
        }
        this.economy = new EconomyPanel(refs.economyRoot, this.worldState);
        this.epochPanel = new EpochPanel(refs.epochRoot, this.epoch, () => this.triggerCollapse(), this.i18n);
        // Round 54 — wire the rollback callback into the
        // HUD so the recovery banner can render the
        // inline "🔙 回滚" button. The callback is a
        // closure over `this` (the App) so the HUD
        // doesn't need to know about the App class —
        // it just calls the closure when the player
        // clicks. The HUD also receives a
        // `setBackupAvailable(true|false)` signal
        // in the same render cycle that calls
        // `setLastBiome` etc. so the button visibility
        // is gated on a real lastFailedSnapshot.
        this.hud.setRollbackHandler(() => this.rollbackToLastGood());
    }

    /**
     * Round 48 → 51 — inject the loaded WASM bridge for `themeToScene`,
     * `buildGenerationConfigWithMood`, `moodPalette`, and
     * `mood_4th_sentence_for`. Called by `bootstrap()` after
     * `App.start()` returns. Passing `null` (loader failed) is valid —
     * the TS mirror takes over for all 4 functions.
     *
     * Round 51 — the bridge is propagated to AIBridge (for
     * buildGenerationConfigWithMood), AIEngine (for moodPalette), and
     * NarrationEngine (for the 4th-sentence pick). All three expose
     * source tags that the HUD log reads after each call.
     */
    setSceneGenWasm(mod: SceneGenWasmModule | null): void {
        this.sceneGenWasm = mod;
        this.bridge.setSceneGenWasm(mod);
        this.ai.setSceneGenWasm(mod);
        this.narration.setSceneGenWasm(mod);
        if (mod) {
            this.hud.log(`[wasm] scene_gen 桥已装载 (${mod.wasm_module_version()})`);
        } else {
            this.hud.log('[wasm] scene_gen 桥未装载 — 使用 TS 镜像兜底');
        }
    }

    async start(): Promise<void> {
        await this.scene.start();
        this.hud.log('AGI-miniGame 已启动');
        this.hud.log('4 大 AI 中枢: 玩法 / 内容 / 平衡 / 智能世界');
        // Spawn NPCs into the scene
        this.npcs.forEach((n, i) => this.scene.spawnNpc(i, n.name));
        // Render a sample WFC dungeon into the hub
        const dungeon = generateDungeon(8, 6, 7);
        this.scene.renderWfcDungeon(dungeon.tiles);
        this.hud.log(`WFC 地图生成: ${dungeon.tiles.length}x${dungeon.tiles[0].length}, 路径连通`);
        this.renderAllPanels();
        // Auto-save every 30s
        this.save.startAutoSave();
    }

    private renderAllPanels(): void {
        this.hud.setState({
            playerLevel: this.worldState.player.level,
            gold: this.worldState.getGold(),
            gem: this.worldState.getGem(),
            score: 0,
        });
        this.progUI.render();
        this.economy.render();
        this.epochPanel.render();
    }

    /** Demo: AI picks a dimension combo, loads modules, generates theme. */
    async enterNewDimension(): Promise<void> {
        // Round 102 — in-flight guard. Without this,
        // a rapid double-tap on Space (round-57 +
        // round-96 alias) or two rapid clicks on the
        // next-dim button would invoke the orchestrator
        // twice in parallel; the second call would
        // silently overwrite the first's WorldState
        // writes (round-99 dual-call race). The guard
        // short-circuits the second call to a no-op
        // so the player sees a stable scene-tile
        // render.
        if (this.isEntering) {
            this.hud.log('[orchestrator] 已有 enterNewDimension 进行中，跳过本次调用 (round 102 防御)');
            return;
        }
        this.isEntering = true;
        try {
            await this._enterNewDimensionImpl();
        } finally {
            // Always release the guard, even on
            // throw — a future refactor that adds
            // an error path would still let the
            // next user click proceed.
            this.isEntering = false;
        }
    }

    /**
     * Round 102 — extracted `enterNewDimension` body.
     * The original method was wrapped in a try/finally
     * to host the in-flight guard. The body itself
     * is unchanged.
     */
    private async _enterNewDimensionImpl(): Promise<void> {
        // Round 22 — preview the reflexive loop: NpcMind 集体情绪 → BalanceTuner bias.
        const avgMood = this.npcMinds.averageDisposition();
        const moodBias = BalanceTuner.moodBias(avgMood);
        if (moodBias !== 0) {
            const sign = moodBias > 0 ? '+' : '';
            this.hud.log(`[平衡] NPC 平均情绪 (友善 ${avgMood.friendly.toFixed(2)} / 恐惧 ${avgMood.fear.toFixed(2)} / 信任 ${avgMood.trust.toFixed(2)}) → 难度 ${sign}${moodBias.toFixed(2)}`);
        }
        // Round 23 — actually feed the mood into scene generation. The
        // bridge's `toGenerationConfig` step will use the mood to nudge
        // the difficulty range and the preferredTypes order, closing
        // the round-22 reflexive loop.
        const r = await this.bridge.planAndLoad({
            playerLevel: this.worldState.player.level,
            mood: avgMood,
            seed: Date.now(),
        });
        // Round 51 — log which source fed the
        // `buildGenerationConfigWithMood` call. The `r.configSource`
        // is `'wasm'` when the WASM bridge ran, `'ts-fallback'`
        // when the TS mirror took over, `'n/a'` when no mood was
        // supplied (the original `toGenerationConfig` path).
        if (r.configSource === 'wasm') {
            this.hud.log('[gen-config] WASM 真出 (round 51)');
        } else if (r.configSource === 'ts-fallback') {
            this.hud.log('[gen-config] WASM 兜底→ TS 镜像 (round 51)');
        }
        // Round 51 — log which source fed the `moodPalette` call.
        // The AIEngine stamps the source tag inside `generateDimension`,
        // which is invoked from inside `bridge.planAndLoad`. We read
        // it after the call returns.
        const paletteSrc = this.ai.getLastPaletteSource();
        if (paletteSrc === 'wasm') {
            this.hud.log('[palette] WASM 真出 (round 51)');
        } else if (paletteSrc === 'ts-fallback') {
            this.hud.log('[palette] WASM 兜底→ TS 镜像 (round 51)');
        }
        // Round 23 — log the applied difficulty range when the mood
        // actually moved it (i.e. away from the base 0.3–0.8 hint).
        // Round 42 — `difficulty` and `difficultyRange` are
        // now properly typed on `DimensionBlueprint`; the
        // `as any` casts from earlier rounds are no longer
        // needed.
        const lo = r.blueprint.difficulty ?? 0;
        const range = r.blueprint.difficultyRange;
        if (range && (range[0] > 0.3 + 1e-4 || range[1] < 0.8 - 1e-4)) {
            this.hud.log(`[gen] mood → 难度带 [${range[0].toFixed(2)}, ${range[1].toFixed(2)}]`);
        }
        // Round 24 — log the applied color palette so the mood-aware
        // visual signal is visible in the HUD.
        const palette = r.blueprint.theme?.colorPalette ?? [];
        if (palette.length === 3) {
            this.hud.log(`[gen] mood → 调色板 [${palette.join(', ')}]`);
        }
        // Round 24 — close the ThemeContent → scene-structure loop.
        // Build a `ThemeInput` from the blueprint's visualStyle / musicMood
        // and the bridge-supplied difficulty, then call `themeToScene` to
        // get the full scene blueprint (WFC weights, biome, NPC density,
        // event chain, BPM, archetype hints). Re-render the WFC dungeon
        // with the theme's tile weights and spawn a wave of on-theme NPCs.
        const visualStyle = r.blueprint.theme?.visualStyle as
            'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon' | undefined;
        const musicMood = r.blueprint.theme?.musicMood as
            'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse' | undefined;
        let sceneBp: SceneBlueprint | null = null;
        if (visualStyle && musicMood) {
            const themeInput: ThemeInput = {
                visualStyle,
                musicMood,
                difficulty: r.blueprint.difficulty,
                seed: r.seed ?? Date.now(),
            };
            // Round 50 — persist the seed used to roll this
            // dimension's blueprint so loadGame can re-render
            // the exact same WFC tiles. Without this, reload
            // would get the same blueprint but a fresh tile
            // layout.
            this.worldState.setLastDimensionSeed(themeInput.seed);
            // Round 48 — try the WASM bridge first; on null result
            // (module not loaded, error JSON, wasm trap), fall back
            // to the TS mirror. `themeToSceneWithFallback` always
            // returns a blueprint, so `sceneBp` is non-null after
            // this line. The `source` field lets us log which
            // branch ran. Round 68 — `analytics.bench` wraps
            // the call with `performance.now()` and emits a
            // `wasm.latency` event (the in-browser wall-clock
            // baseline the round-67 jest bench cannot measure
            // because jest never loads a real .wasm module).
            const outcome = this.analytics.bench('themeToScene',
                () => themeToSceneWithFallback(this.sceneGenWasm, themeInput));
            sceneBp = outcome.blueprint;
            this.hud.log(
                outcome.source === 'wasm'
                    ? '[scene] WASM 真出 (round 48)'
                    : '[scene] WASM 兜底→ TS 镜像 (round 48)',
            );
            // Round 31 — pin the resolved BiomeId onto the
            // blueprint so AIBridge → WorldState can carry it
            // across visits without re-deriving from visualStyle.
            r.blueprint.biome = sceneBp.biomeId;
            // Re-render the WFC dungeon with the theme's tile weights.
            const themedDungeon = generateDungeonWithWeights(
                10, 10, r.seed ?? Date.now(), sceneBp.wfcTileWeights,
            );
            const themedBiome = biomeForVisualStyle(sceneBp.biomeId);
            this.scene.renderWfcDungeon(themedDungeon.tiles, 1.0, themedBiome);
            this.scene.setBiomeAtmosphere(getBiomeAtmosphere(themedBiome.id));
            this.audio.setBiomeAmbient(themedBiome.id, getBiomeAudio(themedBiome.id));
            this.audio.setBiomeSfx(themedBiome.id, getBiomeAudio(themedBiome.id));
            // Round 63 — render an 80×60 PNG thumbnail of the
            // dungeon grid with the resolved biome's tile
            // palette and persist it on the WorldState. The HUD
            // reads `worldState.lastMinimap` to show the player
            // a visual preview of their last visited dimension
            // (and the snapshot survives save → reload).
            this.worldState.lastMinimap = renderMiniMap(themedDungeon.tiles, themedBiome.id);
            // Round 64 — push the freshly-rendered thumbnail
            // into the HUD so the memories block shows the
            // visual preview immediately on enter.
            this.hud.setMinimap(this.worldState.lastMinimap);
            // Spawn a wave of NPCs tagged with the theme's archetype hints.
            const archetypeIds = sceneBp.npcArchetypeHints.map(a => a as string);
            const spawned = this.scene.spawnNpcWave(sceneBp.npcCount, archetypeIds);
            if (spawned.length > 0) {
                this.hud.log(`[scene] 主题=${visualStyle} · 陷阱×${sceneBp.wfcTileWeights[6]} · 神龛×${sceneBp.wfcTileWeights[7]} · NPC×${sceneBp.npcCount} · BPM ${sceneBp.musicBpm}`);
                this.hud.log(`[scene] biome=${sceneBp.biomeId} · density=${sceneBp.npcDensity.toFixed(2)} · events=${sceneBp.eventChain.length}`);
                // Round 47 — persist the four user-visible
                // SceneBlueprint scalars on the WorldState so
                // they survive `save → reload`, and push the
                // same scalars into the HUD so the player
                // sees "🎬 上次维度: NPC×N · BPM T · M 事件
                // · K archetype" immediately on entering, not
                // just on reload.
                // Round 49 — switch to the full snapshot
                // helper: it writes the round-49 full
                // `lastSceneBlueprint` (wfcTileWeights +
                // eventChain + densities) AND keeps the
                // round-47 four scalars in sync internally.
                // The HUD still reads the scalars; round 50
                // will read the full snapshot for re-rendering
                // the exact dungeon on reload.
                const sceneScalars: SceneScalars = {
                    npcCount: sceneBp.npcCount,
                    bpm: sceneBp.musicBpm,
                    eventCount: sceneBp.eventChain.length,
                    archetypeHintCount: sceneBp.npcArchetypeHints.length,
                };
                this.worldState.updateLastSceneBlueprintFull(sceneBp);
                this.hud.setLastSceneBlueprint(sceneScalars);
                // Round 73 — push the full event-chain timeline
                // into the HUD so the persistent-memories
                // block renders the `⏰ next: <kind> in <delay>s`
                // hint. `updateLastSceneBlueprintFull` already
                // stores the chain in WorldState (round 72);
                // the HUD just needs its own copy.
                this.hud.setLastSceneEventChain(sceneBp.eventChain);
                // Push the event chain into the world for downstream
                // consumers (SmartWorldAI / God console). Round 39 —
                // the chain is now actually *scheduled* (delays in
                // seconds) and each fire broadcasts a
                // `witnessed_event` into the NpcRegistry so the
                // world's mood reflects the story beats the
                // theme_to_scene blueprint produced.
                for (const evt of sceneBp.eventChain) {
                    this.hud.log(`[event] t+${evt.delaySecs}s ${evt.kind} (${evt.payload})`);
                    // Capture loop-local refs so the closure
                    // sees the right `evt` even if a later
                    // event re-assigns the iteration variable.
                    const capture = evt;
                    setTimeout(() => {
                        this.hud.log(`[event] ⚡ fired ${capture.kind} (${capture.payload})`);
                        this.npcMinds.broadcast(makeEntry(
                            'witnessed_event',
                            `${capture.kind}: ${capture.payload}`,
                            ++this.npcTurn,
                            0.3,
                        ));
                        this.syncNpcDisposition();
                        this.npcMindHandle?.refresh();
                    }, capture.delaySecs * 1000);
                }
            }
        }
        this.hud.setState({ dimension: r.blueprint });
        this.scene.onDimensionEntered(r.blueprint);
        // Round 164 — auto-generate the rule set
        // for the new dimension and apply it
        // through `HotReloadController.applyGenerated`
        // (the round-162/163/164 codegen is
        // finally wired into the App — closes
        // the "DSL codegen exists but isn't
        // called" gap). The seed is derived from
        // the dimension ID via
        // `seedFromString` (round-164 B) so
        // reloads give the same rules. Failures
        // are caught + logged so a codegen
        // regression can't break the
        // dimension-enter flow (defense in
        // depth: the scene is already set up
        // and the player should not see a
        // blank screen because the auto-gen
        // misfired).
        try {
            this.autoGenerateRulesForCurrentDimension();
        } catch (e) {
            this.hud.log(`[codegen] 自动生成规则失败: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.hud.log(`进入次元: ${r.blueprint.name}`);
        this.hud.log(`玩法组合: ${r.atomIds.join(' + ')}`);
        this.hud.log(`主题: ${r.blueprint.theme?.visualStyle}`);
        // NarrationEngine: log the 3-sentence intro. Round 25 —
        // pass the NPC collective mood so a 4th sentence is appended
        // when the mood branch is fear / friendly / hostile (neutral
        // stays at 3). The branch order matches mood_palette and
        // mood_bias so narrative + visual + difficulty all agree.
        const intro = this.narration.narrate(r.blueprint, avgMood, this.npcMinds);
        for (const s of intro.sentences) this.hud.log(`[narr] ${s}`);
        if (intro.moodBranch && intro.moodBranch !== 'neutral') {
            this.hud.log(`[narr+mind] mood=${intro.moodBranch} → 4th 句已加入 (NPC 集体情绪驱动)`);
        }
        // Round 51 — log which source fed the 4th-sentence pick. The
        // narration engine stamps the source tag inside `narrate`; we
        // read it after the call returns. `null` means no 4th was
        // picked (neutral branch or the individual-NPC path took the
        // slot — which is a round-52 follow-up to also wire).
        const sentenceSrc = this.narration.getLastSentenceSource();
        if (sentenceSrc === 'wasm') {
            this.hud.log('[4th] WASM 真出 (round 51)');
        } else if (sentenceSrc === 'ts-fallback') {
            this.hud.log('[4th] WASM 兜底→ TS 镜像 (round 51)');
        }
        // Round 36 — persist the round-33 individual speaker
        // so the HUD can read "你刚才听见了 X 说：…" after
        // a reload. We also record the speaker's disposition
        // at the time of speech for the "敬畏 / 恐惧 / 友善"
        // tone display.
        if (intro.speakerId) {
            this.worldState.lastSpeakerId = intro.speakerId;
            const speakerMind = this.npcMinds.get(intro.speakerId);
            if (speakerMind) {
                this.worldState.lastSpeakerDisposition = speakerMind.disposition();
            }
            this.hud.log(`[narr+mind] speaker=${intro.speakerId} (${intro.moodBranch}) 4th 句已记录`);
            // Round 44 — push the round-36 lastSpeaker
            // snapshot into the HUD so the player sees
            // "🗣 你刚才听见了 <id> 说" right after the
            // narration, not just on reload.
            this.hud.setLastSpeaker({
                id: intro.speakerId,
                branch: (intro.moodBranch ?? 'neutral') as 'fear' | 'friendly' | 'hostile' | 'neutral',
                disposition: this.worldState.lastSpeakerDisposition ?? { friendly: 0, fear: 0, trust: 0 },
            });
        }
        // Round 20 — record the visit so the AGI's vault remembers it.
        this.vault.record(r.blueprint, 'completed', Date.now());
        const stats = this.vault.stats();
        this.hud.log(`[vault] 记忆: ${stats.totalVisits} 次访问 / ${stats.distinctThemes} 主题 / 通关率 ${(stats.completionRate * 100).toFixed(0)}%`);
        this.vaultHandle?.refresh();
        // Round 21 — every NPC "hears about" the player visiting this dimension.
        // Positive weight when the player's success rate is high; mildly negative
        // when they keep failing (the player looks unreliable).
        const success = stats.completionRate >= 0.5;
        const weight = success ? 0.6 : -0.3;
        this.npcMinds.broadcast(makeEntry(
            'heard_about_dimension',
            `${r.blueprint.theme.name} · ${r.blueprint.name}`,
            ++this.npcTurn,
            weight,
        ));
        this.npcMindHandle?.refresh(); this.syncNpcDisposition();
        this.audio.fire('dimension.entered');
        this.analytics.track('dimension.entered', { id: r.blueprint.id });
        this.tutorial?.notify('dimension-entered');
        // Round 53 — clear the round-53 lastFailedSnapshot
        // backup now that this dimension is successfully
        // established. The backup was a one-deep copy of
        // the pre-failure state; once we have a healthy
        // new dimension in place, the backup is stale and
        // should not linger (a future "rollback to last
        // good" UI would otherwise offer the player a
        // pre-recovery state they no longer need).
        this.worldState.clearFailedSnapshot();
        // Round 54 — sync HUD so the inline "🔙 回滚"
        // button (rendered only when a recoverable
        // backup exists) disappears. Without this,
        // the banner would be hidden but the
        // button's visibility flag would stay set
        // and the next banner would re-show the
        // button (stale backup pointer).
        this.hud.setBackupAvailable(false);
    }

    /** Round 21 — record the current dimension as failed/abandoned. */
    failCurrentDimension(): void { this.recordDimensionOutcome('failed', -0.4); }
    abandonCurrentDimension(): void { this.recordDimensionOutcome('abandoned', -0.1); }

    /**
     * Round 57 — enter a dimension pinned to a specific primary atom
     * (used by the 1-8 keyboard shortcuts). Skips the AI suggestion
     * step in the bridge (via `forcedAtomId`) and renders a quick
     * 10×10 WFC dungeon themed to the atom's manifest entry. The
     * full themeToScene + eventChain pipeline is reserved for the
     * normal `enterNewDimension` path — keyboard entry is a fast
     * portal jump, not a full blueprint rollout.
     */
    async enterAtom(atomId: string): Promise<void> {
        // Round 109 — debounce check delegated to
        // the `ActionDebouncer` instance. The
        // 500ms window + the actionName +
        // the round tag are all baked into the
        // debouncer's constructor (line 597),
        // so the App code reduces to a single
        // guard line. The Chinese skip log
        // line is emitted by the debouncer's
        // `check()` method. Without this
        // debounce, a rapid double-tap on
        // keyboard '3' would double-call
        // `bridge.planAndLoad` (waste network)
        // + `themeToSceneWithFallback` (waste
        // compute) + `renderWfcDungeon`
        // (visible flicker) + `setBiomeAtmosphere`
        // (visible atmosphere pop) +
        // `spawnNpcWave` (visible double-NPC
        // spawn) + `narrate` (visible double-
        // narration). The `await` in the
        // middle means the first call hasn't
        // completed when the second one
        // starts, so they're both in-flight
        // simultaneously — worse than the
        // round-99 sync `enterNewDimension`
        // dual-call.
        if (!this.debouncerEnterAtom.check()) return;
        // Round 109 — stamp at the BEGINNING
        // of the body (round-107 contract).
        // The reason: `enterAtom` has two
        // early-return paths (`!atomId` and
        // `!known`) plus a network-failure
        // catch. Stamp-at-start is more
        // user-friendly because the second
        // tap is blocked even on failure (no
        // network spam-retry). See
        // `ActionDebouncer` JSDoc for the
        // stamp-position-asymmetry rationale.
        this.debouncerEnterAtom.stamp();
        if (!atomId) return;
        const known = ATOM_MANIFEST.find(a => a.id === atomId);
        if (!known) {
            this.hud.log(`[kb] 未知 atom: ${atomId}`);
            return;
        }
        this.hud.log(`[kb] 键 1-8 触发 → ${atomId} (${known.name})`);
        try {
            const avgMood = this.npcMinds.averageDisposition();
            const r = await this.bridge.planAndLoad({
                playerLevel: this.worldState.player.level,
                mood: avgMood,
                seed: Date.now(),
                forcedAtomId: atomId,
            });
            // Quick 10×10 WFC + biome render. Pick the biome
            // from the blueprint's resolved biomeId (if set) or
            // fall back to atom-style keyword match.
            const seed = r.seed ?? Date.now();
            this.worldState.setLastDimensionSeed(seed);
            // Round 65 — try the full themeToScene pipeline
            // (when both visualStyle and musicMood are
            // resolved on the blueprint). This gives us
            // a proper biomeId (resolves keyword "fantasy"
            // → "dungeon" by the SceneGen mapping, not the
            // round-57 keyword fallback) AND the four
            // round-47 scalars (npcCount / bpm /
            // eventCount / archetypeHintCount) so a
            // keyboard jump's persistent-memories block
            // matches what a normal enterNewDimension would
            // have written. The WFC dungeon itself stays
            // uniform (fast portal jump) and we skip the
            // event chain scheduling (also fast). On
            // failure or missing theme, fall back to the
            // round-57 uniform-dungeon + keyword-biome path.
            const visualStyle = r.blueprint.theme?.visualStyle as
                'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon' | undefined;
            const musicMood = r.blueprint.theme?.musicMood as
                'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse' | undefined;
            let sceneBp: SceneBlueprint | null = null;
            if (visualStyle && musicMood) {
                // Round 68 — same `analytics.bench` wrapper as
                // the round-48 `enterNewDimension` path, so the
                // in-browser wall-clock baseline covers both
                // the slow-path (full `enterNewDimension`) and
                // the fast-path (`enterAtom` keyboard shortcut).
                const outcome = this.analytics.bench('themeToScene',
                    () => themeToSceneWithFallback(this.sceneGenWasm, {
                        visualStyle,
                        musicMood,
                        difficulty: r.blueprint.difficulty,
                        seed,
                    }));
                sceneBp = outcome.blueprint;
                // Pin the resolved biome on the blueprint so
                // `worldState.setActiveDimension` (already
                // called by bridge.planAndLoad with `biome
                // = blueprint.biome === undefined`) actually
                // carries it forward on the next recovery /
                // rollback path.
                r.blueprint.biome = sceneBp.biomeId;
                this.hud.log(
                    outcome.source === 'wasm'
                        ? '[scene] WASM 真出 (round 48)'
                        : '[scene] WASM 兜底→ TS 镜像 (round 48)',
                );
            }
            const dungeon = generateDungeon(10, 10, seed);
            // Prefer the sceneBp's biomeId when the
            // themeToScene path ran; otherwise keyword-match
            // (round-57 fallback).
            const biome = sceneBp
                ? biomeForVisualStyle(sceneBp.biomeId)
                : biomeForVisualStyle(visualStyle ?? 'dungeon');
            this.scene.renderWfcDungeon(dungeon.tiles, 1.0, biome);
            this.scene.setBiomeAtmosphere(getBiomeAtmosphere(biome.id));
            this.audio.setBiomeAmbient(biome.id, getBiomeAudio(biome.id));
            this.audio.setBiomeSfx(biome.id, getBiomeAudio(biome.id));
            // Round 65 — keep the HUD's persistent-memories
            // block in sync with keyboard jumps. Without
            // this, the round-49 "↩ 上次离开 #biome" line,
            // round-64 🗺 minimap, and round-47 "🎬 上次
            // 维度: NPC×N · BPM T · M 事件" line all stay
            // stale after a 1-8 keypress. We mirror the
            // round-64 + round-47 update sequence from
            // enterNewDimension.
            this.worldState.lastBiome = biome.id;
            this.hud.setLastBiome(biome.id);
            // Round 87 — dim panel left-border accent.
            this.hud.setLastBiomeAccent(getBiomeAtmosphere(biome.id).particleColor);
            // Round 150 — push
            // the biome-
            // contextual hotkey
            // strip. The
            // BIOME_HOTKEYS map
            // maps biome id →
            // (label, bindings).
            // Unknown biomes
            // (e.g. round-30
            // welcome hub) get
            // null → the
            // biome strip is
            // hidden.
            {
                const ctx = getBiomeHotkeyContext(biome.id);
                if (ctx === null) {
                    this.hud.setBiomeHotkeys(null, null);
                } else {
                    this.hud.setBiomeHotkeys(ctx.label, ctx.bindings);
                }
            }
            this.worldState.lastMinimap = renderMiniMap(dungeon.tiles, biome.id);
            this.hud.setMinimap(this.worldState.lastMinimap);
            const sceneScalars: SceneScalars = sceneBp
                ? {
                      npcCount: sceneBp.npcCount,
                      bpm: sceneBp.musicBpm,
                      eventCount: sceneBp.eventChain.length,
                      archetypeHintCount: sceneBp.npcArchetypeHints.length,
                  }
                : cloneSceneScalars(ZERO_SCENE_SCALARS);
            if (sceneBp) {
                this.worldState.updateLastSceneBlueprintFull(sceneBp);
            }
            this.hud.setLastSceneBlueprint(sceneScalars);
            // Round 73 — push the full event-chain timeline
            // into the HUD. `sceneBp` may be null on a
            // round-49 fast-portal path; fall back to an
            // empty chain so the HUD row stays hidden
            // (the `Array.isArray + length > 0` guard in
            // `renderPersistentMemories` handles the empty
            // case).
            this.hud.setLastSceneEventChain(sceneBp?.eventChain ?? null);
            // Spawn a small wave of NPCs (2-4) keyed to the
            // atom's gameplayType.
            const archetypeIds = r.blueprint.atomIds.slice(0, 3);
            const spawned = this.scene.spawnNpcWave(archetypeIds.length, archetypeIds);
            this.hud.log(
                `[scene] 快速入口: ${atomId} · biome=${biome.id} · ` +
                `NPC×${spawned.length} · seed=${seed}`,
            );
            // Round 65 — emit the standard entrance logs
            // ("进入次元" / "玩法组合" / "主题") + the
            // round-25 NarrationEngine intro (3
            // sentences + optional 4th on mood branch).
            // The fast-portal-jump path used to skip
            // these so the keyboard entry felt muted
            // compared to a full enterNewDimension.
            this.hud.setState({ dimension: r.blueprint });
            this.hud.log(`进入次元: ${r.blueprint.name}`);
            this.hud.log(`玩法组合: ${r.atomIds.join(' + ')}`);
            this.hud.log(`主题: ${r.blueprint.theme?.visualStyle}`);
            const intro = this.narration.narrate(r.blueprint, avgMood, this.npcMinds);
            for (const s of intro.sentences) this.hud.log(`[narr] ${s}`);
            if (intro.moodBranch && intro.moodBranch !== 'neutral') {
                this.hud.log(`[narr+mind] mood=${intro.moodBranch} → 4th 句已加入 (NPC 集体情绪驱动)`);
            }
        } catch (err) {
            this.hud.log(`[kb] enterAtom(${atomId}) 失败: ${(err as Error).message}`);
        }
    }

    /**
     * Round 111 — apply a new debounce window
     * to all 4 `ActionDebouncer` instances.
     * Called by the SettingsPanel's
     * `onDebounceChange` hook. The
     * `currentDebounceWindowMs` field is
     * updated FIRST so a follow-up render
     * reflects the new state (the
     * `getCurrentDebounce` getter reads
     * from it). The 4 debouncers are
     * mutated in-place via
     * `setWindowMs(ms)`. The previous
     * stamp is NOT reset — a window-shrink
     * (500 → 0) allows the next call
     * immediately.
     *
     * Logs a Chinese line so the player
     * sees the change is live (the panel
     * re-renders, but the visual feedback
     * is in the HUD).
     */
    applyDebounceSettings(ms: DebounceWindow): void {
        this.currentDebounceWindowMs = ms;
        this.debouncerLoadGame.setWindowMs(ms);
        this.debouncerSaveGame.setWindowMs(ms);
        this.debouncerRollWorldEvent.setWindowMs(ms);
        this.debouncerEnterAtom.setWindowMs(ms);
        // Round 127 — persist the picked
        // window so a page reload keeps
        // the player's choice (mirror of
        // GameAudio's `agi_muted` save in
        // `setMuted`).
        writeDebounceMsToStorage(ms);
        const msLabel = ms === 0 ? '关闭' : `${ms}ms`;
        this.hud.log(`[settings] 防抖窗口已更新为 ${msLabel} (4 个动作同步)`);
    }

    /**
     * Round 126 — apply a new difficulty tier
     * to the `BalanceTuner`. Called by the
     * SettingsPanel's `onDifficultyChange`
     * hook. The 3 tiers map to:
     *   easy   → 0.75 (forgiving — bias UP
     *                    toward easier difficulty
     *                    when player wins less
     *                    than 65%)
     *   normal → 0.60 (default — mirror of
     *                    BalanceTuner constructor)
     *   hard   → 0.40 (punishing — bias UP
     *                    toward harder difficulty
     *                    when player wins more
     *                    than 50%)
     * Logs a Chinese line so the player
     * sees the change is live (the panel
     * re-renders with the new `is-active`
     * button highlighted, but the HUD
     * confirms the AI bias change).
     * Note: does NOT clear the BalanceTuner
     * history — past gameplay results still
     * inform the next difficulty roll.
     */
    applyDifficultySettings(d: Difficulty): void {
        this.currentDifficulty = d;
        // Round 127 — persist the picked
        // difficulty tier so a page reload
        // keeps the player's choice. Read
        // back in the field initializer
        // above so the BalanceTuner boot
        // state is consistent (the
        // constructor's `setTargetWinRate`
        // call below runs against the
        // restored value).
        writeDifficultyToStorage(d);
        const rate = d === 'easy' ? 0.75 : d === 'hard' ? 0.40 : 0.60;
        this.ai.tuner.setTargetWinRate(rate);
        const label = d === 'easy' ? '简单' : d === 'hard' ? '困难' : '普通';
        this.hud.log(`[settings] 难度已切换为 ${label} (BalanceTuner 目标胜率 ${rate.toFixed(2)})`);
    }

    /**
     * Round 57 — toggle the in-game help overlay. The overlay is a
     * hidden-by-default `<div id="keyboard-help">` that lists every
     * keybinding. We just flip the `hidden` attribute.
     */
    toggleHelp(): void {
        const el = document.getElementById('keyboard-help');
        if (!el) return;
        const isHidden = el.hasAttribute('hidden');
        if (isHidden) {
            el.removeAttribute('hidden');
            this.hud.log('[kb] 帮助浮层已打开 (按 ? 关闭)');
        } else {
            el.setAttribute('hidden', '');
            this.hud.log('[kb] 帮助浮层已关闭');
        }
    }

    /**
     * Round 112 — toggle the settings overlay. The settings
     * overlay is a hidden-by-default `<div id="settings-root">`
     * populated by the round-111 SettingsPanel (audio mute,
     * locale, debounce-window knob). The P key shortcut in
     * the keydown handler routes through this method.
     *
     * Round 117 — body folded into `togglePanel(rootId, label, key)`
     * helper. The 7 public methods now share a single implementation;
     * future panel-toggle additions (round-117+ follow-ups like
     * B / G / D / Z keys) only need a new 1-line wrapper + a new
     * mount point in index.html.
     *
     * Round 131 — body now resolves the panel-toggle
     * binding by method name from the
     * `PANEL_TOGGLE_BINDINGS` table (the single
     * source of truth) and delegates to
     * `toggleByMethod(name)`. The hard-coded
     * `'settings-root' / '设置浮层' / 'P'` triplet
     * is now data, not code.
     */
    toggleSettings(): void { this.toggleByMethod('toggleSettings'); }

    /**
     * Round 113 — toggle the stats panel overlay. The
     * stats panel is the small debugging overlay
     * (`<div id="stats-root">`) populated by
     * round-63/64's StatsPanel. Always visible by
     * default; the Q key shortcut toggles the
     * `hidden` attribute for screenshot / focus mode.
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleStatsPanel(): void { this.toggleByMethod('toggleStatsPanel'); }

    /**
     * Round 152 — toggle the HUD compact mode.
     * The HUD's `setCompact(compact)` setter flips
     * the `compact` flag in the HUD state; the
     * per-row detail lists in the round-51 memories
     * block (WASM latency per-fn lines, the
     * event-chain timeline, the debouncer
     * mini-strip countdowns) collapse to headlines
     * only when `compact === true`. The state is
     * persisted to `localStorage[agi_hud_compact]`
     * so a player who enables it on a visit
     * doesn't have to re-enable it on the next
     * page load.
     *
     * Unlike the panel-toggle family, this does
     * NOT mount/unmount a `<div>` — the HUD's
     * render is idempotent on `compact`, so the
     * toggle is cheap (one boolean flip + one
     * render). The `H` key shortcut calls this
     * via the round-152 `toggle-hud-compact`
     * KeyboardAction.
     */
    toggleHudCompact(): void {
        const next = !this.hud.isCompact();
        this.hud.setCompact(next);
        saveHudCompactToStorage(next);
    }

    /**
     * Round 153 — toggle the HUD fade mode.
     * When fade mode is on, the .hud-stats
     * panel auto-fades to 0.25 opacity after
     * 3s of key/click inactivity, and snaps
     * back to fully visible on the next input
     * event (the App calls `hud.notifyInput()`
     * from the keydown handler). The player's
     * preference is persisted to
     * `localStorage[agi_hud_fade]` so a player
     * who enables it on a visit doesn't have to
     * re-enable it on the next page load.
     *
     * Mirrors the `toggleHudCompact` pattern:
     * one boolean flip + one localStorage write
     * + one re-render. The F key shortcut calls
     * this via the round-153 `toggle-hud-fade`
     * KeyboardAction.
     */
    toggleHudFade(): void {
        const next = !this.hud.isFadeEnabled();
        this.hud.setFadeEnabled(next);
        saveHudFadeToStorage(next);
    }

    /**
     * Round 153 — notify the HUD that an
     * input event (keydown / click) just
     * fired so the round-153 fade mode can
     * snap the stats panel back to full
     * opacity. Public because the keydown
     * listener is a top-level function and
     * `hud` is `private`. No-op when fade is
     * disabled (so the cost on the hot path
     * is one boolean check + one early-
     * return).
     */
    notifyHudInput(): void {
        this.hud.notifyInput();
    }

    /**
     * Round 154 — cycle the HUD through the
     * 4-corner sequence
     * `tl → tr → br → bl → tl`. Lets right-
     * handed / left-handed / one-handed-
     * mobile players pick the corner that
     * doesn't occlude their mouse or
     * dominant-hand finger.
     *
     * One keystroke to pick a new corner — no
     * sub-menu needed. Persists to localStorage
     * so a player who picks `'bl'` on a visit
     * doesn't have to re-pick on the next page
     * load. Mirrors `toggleHudCompact` /
     * `toggleHudFade`: one call + one
     * localStorage write. The K key shortcut
     * calls this via the round-154
     * `cycle-hud-corner` KeyboardAction.
     */
    cycleHudCorner(): void {
        const next = this.hud.cycleCorner();
        saveHudCornerToStorage(next);
    }

    /**
     * Round 155 — toggle the HUD always-on-top
     * pin flag. When enabled, the HUD
     * z-index jumps from 10 to 10000 so
     * the panel stays clickable above
     * fullscreen Three.js canvases (a real
     * problem on some browser configurations
     * where a `position: fixed` canvas can
     * push the HUD below it).
     *
     * Mirrors `toggleHudCompact` /
     * `toggleHudFade`: one call + one
     * localStorage write. The X key
     * shortcut calls this via the
     * round-155 `toggle-hud-pinned`
     * KeyboardAction.
     */
    toggleHudPinned(): void {
        const next = this.hud.togglePinned();
        saveHudPinnedToStorage(next);
    }

    /**
     * Round 156 — toggle HUD click-through
     * mode. When enabled, the `#hud-root`
     * element gets `pointer-events: none`
     * so mouse clicks on the HUD area
     * pass through to the 3D scene
     * beneath. The HUD remains visible
     * (read-only) — the player can keep
     * an eye on the stat readout / biome
     * indicator / event log / debouncer
     * strip while interacting with the
     * scene directly.
     *
     * **Companion to round-155 `toggleHudPinned`**:
     * pinned controls *stacking* (HUD
     * stays above the scene), click-through
     * controls *interaction* (scene stays
     * clickable through the HUD). They can
     * be enabled together: a player with
     * both modes active gets a see-everything-
     * and-click-everything layout that is
     * the "minimal HUD" experience favored
     * by hardcore min-maxers.
     *
     * Mirrors `toggleHudPinned`: one call +
     * one localStorage write. The Y key
     * shortcut calls this via the
     * round-156 `toggle-hud-click-through`
     * KeyboardAction.
     */
    toggleHudClickThrough(): void {
        const next = this.hud.toggleClickThrough();
        saveHudClickThroughToStorage(next);
    }

    /**
     * Round 159 — toggle the
     * auto-hide-on-fullscreen
     * mode. When enabled, the
     * `#hud-root` element gets
     * the
     * `hud-auto-hide-fullscreen`
     * CSS class which collapses
     * the HUD whenever the
     * document is in fullscreen
     * mode (the host also binds
     * a `fullscreenchange`
     * listener to sync state).
     *
     * Mirrors `toggleHudPinned` /
     * `toggleHudClickThrough`:
     * one call + one
     * localStorage write. The
     * K key shortcut calls this
     * via the round-159
     * `toggle-hud-auto-hide-fullscreen`
     * KeyboardAction.
     */
    toggleHudAutoHideFullscreen(): void {
        const next = this.hud.toggleAutoHideFullscreen();
        saveHudAutoHideFullscreenToStorage(next);
    }

    /**
     * Round 160 — toggle the
     * minimize-to-icon mode.
     * When enabled, the
     * `#hud-root` element gets
     * the `hud-minimized` CSS
     * class which collapses the
     * panel to a single 32×32
     * icon (the index.html
     * `index.html` rule sets
     * `width: 32px; height: 32px;
     * border-radius: 50%`). The
     * player can click the icon
     * to expand the panel back
     * to its full size.
     *
     * Mirrors `toggleHudPinned` /
     * `toggleHudClickThrough` /
     * `toggleHudAutoHideFullscreen`:
     * one call + one
     * localStorage write. The
     * B key shortcut calls this
     * via the round-160
     * `toggle-hud-minimized`
     * KeyboardAction.
     */
    toggleHudMinimized(): void {
        const next = this.hud.toggleMinimized();
        saveHudMinimizedToStorage(next);
    }

    /**
     * Round 161 — cycle the
     * scene speed through
     * the 4-preset sequence
     * (0.5x → 1x → 2x → 4x →
     * 0.5x). Slow speeds (0.5x)
     * let the player
     * appreciate the scene
     * atmosphere (画面优美);
     * fast speeds (2x / 4x)
     * let the player skip
     * through scene
     * generation and see the
     * variety quickly (场景
     * 更优). The N key
     * shortcut calls this
     * via the round-161
     * `cycle-scene-speed`
     * KeyboardAction.
     *
     * Mirrors the round-154
     * `cycleHudCorner`:
     * one call + one
     * localStorage write +
     * one applySceneSpeed.
     * The `applySceneSpeed`
     * is a no-op when the
     * value is unchanged
     * (the player can spam
     * the N key without
     * thrashing the scene
     * loop), so the
     * settings panel +
     * the keyboard
     * shortcut stay in
     * sync via the same
     * hook.
     */
    cycleSceneSpeed(): void {
        const cur = this.currentSceneSpeed;
        const idx = SCENE_SPEED_PRESETS.indexOf(cur);
        const next = SCENE_SPEED_PRESETS[(idx + 1) % SCENE_SPEED_PRESETS.length]!;
        this.currentSceneSpeed = next;
        saveSceneSpeedToStorage(next);
        this.applySceneSpeed(next);
        // Round 162 — push
        // the new preset
        // into the HUD so
        // the scene-speed
        // mini-strip
        // re-renders with
        // the new active
        // cell. Without
        // this, the strip
        // would stay on
        // the previous
        // active preset
        // until the next
        // setState call.
        this.hud.setSceneSpeed(next);
    }

    /**
     * Round 161 — apply a
     * scene speed
     * multiplier to the
     * scene's update
     * loop. A no-op when
     * the value is
     * unchanged (so the
     * `cycleSceneSpeed`
     * method can call
     * this unconditionally).
     * The Chinese log line
     * mirrors the
     * round-154/156/160
     * convention (one log
     * per state change).
     */
    applySceneSpeed(multiplier: SceneSpeedPreset): void {
        if (this.sceneSpeedMultiplier === multiplier) return;
        this.sceneSpeedMultiplier = multiplier;
        console.log(`[scene] 速度已更新为 ${multiplier}x (4 档循环: 0.5x / 1x / 2x / 4x)`);
    }

    /**
     * Round 161 — getter
     * for the SettingsPanel
     * scene-speed row.
     * Mirrors
     * `getCurrentDebounceWindow`
     * / `getCurrentDifficulty`:
     * a public method that
     * returns the current
     * preset, so the
     * SettingsPanel can
     * highlight the active
     * button on render.
     */
    getCurrentSceneSpeed(): SceneSpeedPreset {
        return this.currentSceneSpeed;
    }

    /**
     * Round 113 — toggle the progression panel
     * overlay. The progression panel
     * (`<div id="progression-root">`) is populated
     * by round-65's ProgressionUI (XP bar + talent
     * tree) — always visible by default. The W key
     * shortcut toggles the `hidden` attribute for
     * screenshot / focus mode.
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleProgression(): void { this.toggleByMethod('toggleProgression'); }

    /**
     * Round 114 — toggle the tutorial overlay. The
     * tutorial overlay is the on-demand
     * notification panel (`<div id="tutorial-root">`)
     * populated by `TutorialOverlay` (round-86+).
     * The T key shortcut lets the player re-open
     * the notification history (read-only — the
     * panel is also shown via `tutorial.notify`
     * calls from the App, but the T shortcut is
     * a manual toggle).
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleTutorial(): void { this.toggleByMethod('toggleTutorial'); }

    /**
     * Round 114 — toggle the vault panel. The
     * vault panel is the round-20 dimension
     * history overlay (`<div id="vault-root">`)
     * populated by `renderVaultPanel` (showing
     * past completed/failed/abandoned
     * dimensions). The F key shortcut gives
     * keyboard-only players a way to hide the
     * panel for screenshot / focus mode.
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleVault(): void { this.toggleByMethod('toggleVault'); }

    /**
     * Round 114 — toggle the NPC mind panel.
     * The NPC mind panel is the round-21
     * collective-disposition + per-NPC memory
     * overlay (`<div id="npc-mind-root">`)
     * populated by `renderNpcMindPanel`. The
     * M key shortcut gives keyboard-only
     * players a way to hide the panel for
     * screenshot / focus mode.
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleNpcMind(): void { this.toggleByMethod('toggleNpcMind'); }

    /**
     * Round 115 — toggle the
     * achievements panel. The
     * achievements panel is the
     * round-22 per-player
     * achievement list
     * (`<div id="achievements-root">`)
     * sourced from
     * `worldState.player.achievements`
     * (a `string[]` of unlocked
     * achievement ids, populated
     * via `addAchievement(id)`).
     * The V key shortcut is the
     * primary way to open the
     * panel — the panel itself
     * is rendered into the
     * mount point by future
     * round-115 follow-up work
     * (the round-115 contract
     * is: mount point exists in
     * index.html, toggle method
     * exists on App, bootstrap
     * keydown routes 'V'/'v' to
     * the toggle).
     *
     * Round 117 — body folded into `togglePanel` helper.
     */
    toggleAchievements(): void { this.toggleByMethod('toggleAchievements'); }

    /**
     * Round 119 — toggle the
     * biome library panel.
     * The biome library panel
     * is the round-23
     * per-biome gallery
     * (`<div id="biome-library-root">`)
     * showing the 6 biomes
     * from `WfcBiomes.BIOMES`
     * (cyberpunk / forest /
     * desert / ice / space /
     * dungeon) with the
     * current biome
     * (`worldState.lastBiome`)
     * highlighted. The B key
     * shortcut is the primary
     * way to open the panel.
     *
     * Round 119 — body folded
     * into `togglePanel` helper
     * (the round-117 refactor
     * makes the 8th toggle
     * method a 1-line change).
     */
    toggleBiomeLibrary(): void { this.toggleByMethod('toggleBiomeLibrary'); }

    /**
     * Round 121 — G key
     * counterpart to the
     * round-66 `btn-god`
     * mouse button. Toggles
     * the `#god-root` DM God
     * console panel via the
     * round-117 `togglePanel`
     * helper. The pre-existing
     * `~/`` key (round-91)
     * still routes to the
     * separate `toggle-dm-console`
     * action that calls
     * `godConsole.toggle()`
     * directly (the DM
     * console's own visibility
     * method, not the
     * round-117 helper) so
     * the backtick shortcut
     * keeps its pre-round-121
     * log format. The G key
     * uses the standard
     * `[kb] ${label}已打开`
     * / `[kb] ${label}已关闭`
     * format.
     */
    toggleGodConsolePanel(): void { this.toggleByMethod('toggleGodConsolePanel'); }

    /**
     * Round 121 — N key
     * counterpart. Toggles
     * the `#economy-root`
     * panel (the round-25
     * EconomyPanel showing
     * currencies + inventory
     * counts) via the
     * round-117 `togglePanel`
     * helper. N is mnemonic
     * for "Numbers" (the
     * panel's primary
     * content).
     */
    toggleEconomy(): void { this.toggleByMethod('toggleEconomy'); }

    /**
     * Round 121 — O key
     * counterpart. Toggles
     * the `#epoch-root`
     * panel (the round-65
     * EpochPanel showing
     * the current epoch
     * number + epoch rules)
     * via the round-117
     * `togglePanel` helper.
     */
    toggleEpoch(): void { this.toggleByMethod('toggleEpoch'); }

    /**
     * Round 128 — D key
     * counterpart.
     * Toggles the
     * `#debug-overlay-root`
     * panel (the
     * round-128
     * `renderDebugOverlay`
     * showing the 4
     * `ActionDebouncer`
     * instances' runtime
     * state — action label /
     * window / ms since last
     * stamp / currently
     * debouncing?) via the
     * round-117 `togglePanel`
     * helper. The 12th panel
     * in the panel-toggle
     * group, developer + QA
     * tool (the Q key's
     * StatsPanel is the
     * player-facing aggregate
     * counterpart).
     */
    toggleDebugOverlay(): void { this.toggleByMethod('toggleDebugOverlay'); }

    /**
     * Round 132 — Z key
     * counterpart. Toggles
     * the `#event-log-root`
     * panel (the round-132
     * `renderEventLogPanel`
     * showing the 50-event
     * ring buffer from
     * `Analytics.recent` —
     * the chronological
     * log of "what just
     * happened in this
     * session": dimension
     * enter / complete,
     * tutorial step, item
     * use, save, DM
     * commands, WASM
     * latency events, etc)
     * via the round-117
     * `togglePanel` helper.
     * The 13th panel in the
     * round-131 data-driven
     * `PANEL_TOGGLE_BINDINGS`
     * table. Z is mnemonic-
     * friendly (was free in
     * the panel-toggle group,
     * no pre-existing Z
     * mapping in routeKey)
     * and sits naturally next
     * to the QWERTY row
     * housing the other
     * toggle keys.
     */
    toggleEventLog(): void { this.toggleByMethod('toggleEventLog'); }

    /**
     * Round 133 — K key
     * counterpart. Toggles
     * the `#dsl-codex-root`
     * panel (the round-133
     * `renderDslCodexPanel`
     * showing the AGI's most
     * recently generated /
     * hot-reloaded `DslRule`
     * — the round-15/16
     * `MemeCompiler` output —
     * as a small codex with
     * the source DSL + the
     * parsed AST breakdown +
     * a "已接受" / "被拒绝"
     * status badge) via the
     * round-117 `togglePanel`
     * helper. The 14th panel
     * in the round-131 data-
     * driven
     * `PANEL_TOGGLE_BINDINGS`
     * table. K is mnemonic-
     * friendly for "DSL
     * Knowledge" (or just
     * "Codex K") and was free
     * in the panel-toggle
     * group, no pre-existing
     * K mapping in routeKey.
     * Sits naturally next to
     * the QWERTY row housing
     * the other toggle keys
     * (P/Q/W/T/F/M/V/B/G/N/O/D
     * /Z — K is row 2 of the
     * QWERTY home row, so it
     * fits the established
     * pattern).
     */
    toggleDslCodex(): void { this.toggleByMethod('toggleDslCodex'); }

    /**
     * Round 137 — I key toggles
     * the Inventory panel
     * (`#inventory-root`,
     * populated by the pre-
     * existing `InventoryUI`
     * module that round 137
     * finally wires into the
     * App). The 15th panel-
     * toggle in the
     * round-131 data-driven
     * `PANEL_TOGGLE_BINDINGS`
     * table. Delegates to the
     * round-117 `togglePanel`
     * helper via the
     * `toggleByMethod` indirection
     * (so the panelId / label /
     * key all come from the
     * `PANEL_TOGGLE_BINDINGS`
     * row, not from inline
     * strings).
     */
    toggleInventory(): void { this.toggleByMethod('toggleInventory'); }

    /**
     * Round 117 — shared panel-toggle
     * helper. The 7 panel-toggle
     * methods (toggleSettings /
     * toggleStatsPanel /
     * toggleProgression /
     * toggleTutorial /
     * toggleVault /
     * toggleNpcMind /
     * toggleAchievements) all
     * share the same body:
     * no-op if the mount point
     * is missing, otherwise
     * flip the `hidden` attribute
     * and log a Chinese
     * open/close line.
     *
     * Args:
     *   rootId — the DOM id of
     *            the panel's
     *            mount point
     *            (e.g.
     *            'settings-root',
     *            'stats-root', ...).
     *   label  — the Chinese
     *            panel name used
     *            in the open/close
     *            log line
     *            (e.g. '设置浮层',
     *            '统计面板', ...).
     *            The log message
     *            format is:
     *            open →
     *            `[kb] ${label}已打开 (按 ${key} 关闭)`
     *            close →
     *            `[kb] ${label}已关闭`
     *            The pre-round-117
     *            7 log messages are
     *            preserved exactly.
     *   key    — the keyboard-key
     *            shortcut letter
     *            used in the open
     *            log line
     *            (e.g. 'P', 'Q', ...).
     *
     * Behavior is unchanged from
     * the pre-round-117 inline
     * bodies — the helper is a
     * pure refactor (no observable
     * change other than the
     * line-count delta in main.ts).
     * The 7 existing round-112/
     * 113/114/115 toggle e2e
     * tests (routeKey + App_exposes
     * + no-op + flips hidden +
     * bootstrap + BINDING_DESCRIPTIONS)
     * all pass unchanged, proving
     * the refactor is behavior-
     * preserving.
     *
     * The helper is `private`
     * (not part of the public App
     * surface) so the 7
     * round-112-115 methods
     * remain the public
     * contract for the bootstrap
     * keydown switch + the
     * round-116 mouse buttons.
     */
    private togglePanel(rootId: string, label: string, key: string): void {
        const el = document.getElementById(rootId);
        if (!el) return;
        const isHidden = el.hasAttribute('hidden');
        if (isHidden) {
            el.removeAttribute('hidden');
            this.hud.log(`[kb] ${label}已打开 (按 ${key} 关闭)`);
        } else {
            el.setAttribute('hidden', '');
            this.hud.log(`[kb] ${label}已关闭`);
        }
    }

    /**
     * Round 131 — the 12 public
     * `toggleX()` wrappers all
     * delegate here. Resolves the
     * `PanelToggleBinding` by method
     * name from the
     * `PANEL_TOGGLE_BINDINGS` table
     * (the single source of truth)
     * and forwards to
     * `togglePanel(b.panelId, b.label,
     * b.key)`. A no-op (silent
     * early return) for unknown
     * method names — this should
     * never happen in production
     * (the 12 method names are
     * hard-coded in the wrapper
     * bodies) but the guard makes
     * the helper safe to call from
     * a future programmatic
     * dispatch path (e.g. a
     * plugin / macro system).
     */
    private toggleByMethod(methodName: string): void {
        const b = panelToggleBindingByMethod(methodName);
        if (!b) return;
        this.togglePanel(b.panelId, b.label, b.key);
    }

    /**
     * Round 35 — keep `worldState.lastNpcDisposition` in sync with
     * the NpcRegistry's current average so a save → reload cycle
     * preserves the world's mood signal. Called from every site
     * that broadcasts / remembers into the registry.
     *
     * Round 40 — also refresh the per-NPC memory snapshot
     * (`worldState.npcMindsSnapshot`) so a save → reload preserves
     * the per-NPC entries too. The live registry is rebuilt on
     * app startup, so this is *informational* — the snapshot is
     * a record of what the world remembered at save time.
     */
    private syncNpcDisposition(): void {
        this.worldState.lastNpcDisposition = this.npcMinds.averageDisposition();
        this.worldState.updateNpcMindsSnapshot(
            this.npcMinds.iter().map((m) => ({
                id: m.id(),
                archetype: m.archetype() ?? null,
                disposition: m.disposition(),
                entries: m.recent(m.len()).map((e) => ({
                    kind: e.kind,
                    summary: e.summary,
                    turn: e.turn,
                    weight: e.weight,
                })),
            })),
        );
    }

    private recordDimensionOutcome(outcome: 'failed' | 'abandoned', weight: number): void {
        const dim = this.hud.getState().dimension;
        if (!dim) {
            this.hud.log(`[vault] 当前没有进入中的次元，无法标记 ${outcome}`);
            return;
        }
        this.vault.record(dim, outcome, Date.now());
        this.hud.log(`[vault] 记忆: 次元 ${dim.name} 被标记为 ${outcome}`);
        this.vaultHandle?.refresh();
        // Round 25 — feed the outcome into the BalanceTuner so the
        // balance AI can adjust future difficulty recommendations
        // based on actual player outcomes. Without this, the tuner
        // would only ever see `completed=true` records and the
        // difficulty would creep up monotonically. The
        // `dimension.difficulty` value is the *actual* difficulty
        // the player just faced (not a hardcoded 0.5), so the
        // history reflects the real challenge curve.
        this.ai.recordSession({
            dimensionId: dim.id,
            difficulty: dim.difficulty,
            playerLevel: this.worldState.player.level,
            score: 0,
            durationSecs: 0,
            completed: false,
        });
        this.hud.log(`[balance] record_result: ${dim.id} difficulty=${dim.difficulty.toFixed(2)} completed=false (${outcome})`);
        // NPCs witness the outcome — affects fear/friendly negatively.
        this.npcMinds.broadcast(makeEntry(
            'witnessed_event',
            `${outcome}: ${dim.name}`,
            ++this.npcTurn,
            weight,
        ));
        this.npcMindHandle?.refresh(); this.syncNpcDisposition();
    }

    /** Demo: AGI receives memes and we hot-reload the resulting DSL. */
    async hotReloadFromMemes(memes: Array<'Fire' | 'Speed' | 'Life' | 'Gravity' | 'Shield' | 'Time' | 'Create'>): Promise<void> {
        const prompt = combineMemes(memes);
        this.hud.log(`[AGI] 发送 prompt (${prompt.prompt.length} 字符) → LLM`);
        this.analytics.track('dsl.applied', { memes: memes.join('+') });
        // Call the real LLM (or mock fallback). The HttpLLMClient
        // falls back to MockLLMClient when apiKey is empty.
        const completion = await this.llm!.complete({
            system: 'You are the AGI controlling AGI-miniGame. Emit exactly one DSL line.',
            user: prompt.prompt,
            seed: Date.now(),
        });
        const dsl = completion.dsl ?? compileFallback(memes).toString();
        this.hud.log(`[AGI] 回复 DSL: ${dsl} (${completion.provider})`);
        const accepted = this.hot.begin(dsl);
        // Round 133 — the
        // DslCodex panel
        // surfaces the
        // outcome of every
        // hot-reload. We
        // update the
        // `currentDslRule`
        // + `lastDslOutcome`
        // fields + call
        // `refresh()` so the
        // K-key panel
        // reflects the
        // latest state
        // immediately (no
        // setInterval
        // needed — the
        // panel is purely
        // event-driven).
        if (accepted) {
            this.currentDslRule = this.hot.getActiveRule() ?? null;
            this.lastDslOutcome = 'accepted';
            this.hud.log('[HotReload] 开始编译，护盾激活…');
            this.unlistenHot = this.hot.on(ev => this.onHotEvent(ev));
        } else {
            // Rejection: keep
            // the previous
            // rule visible
            // (so the player
            // can see what
            // was last
            // accepted) but
            // flip the status
            // badge to
            // "被拒绝".
            this.lastDslOutcome = 'rejected';
            this.hud.log('[HotReload] 拒绝：频率限制或格式错误');
        }
        this.dslCodexHandle?.refresh();
    }

    /**
     * Round 164 — auto-generate the rule set
     * for the current dimension and apply it
     * through `HotReloadController.applyGenerated`.
     *
     * The "current dimension" is whatever
     * `this.worldState.lastBiome` points at
     * (set by the dimension-enter flow). The
     * seed is `seedFromString(dimensionId)` so
     * reloading the same dimension gives the
     * same rules (round-72 save stability).
     *
     * The complexity defaults to `Medium` —
     * future rounds could wire this to a
     * player-level / progression-tier signal
     * (e.g. Lv 1-3 = Low, Lv 4-7 = Medium,
     * Lv 8+ = High).
     *
     * The method is a no-op when the codegen
     * bindings import fails (e.g. in test
     * environments where the module is
     * stubbed). The dimension-enter call site
     * already wraps this in try/catch so a
     * codegen regression cannot break the
     * scene setup.
     */
    private autoGenerateRulesForCurrentDimension(): void {
        // The worldState tracks the most
        // recently entered biome. The
        // `autoGenerateForDimension` helper
        // builds the GenInput + emits the
        // rules; the App just plumbs them
        // through to `hot.applyGenerated`.
        const biomeId = this.worldState.lastBiome;
        if (!biomeId) {
            // No biome set yet (very early
            // boot, or a test that bypasses
            // the dimension-enter flow).
            return;
        }
        // Use the last-entered blueprint name
        // as the dimension ID. `worldState`
        // tracks `lastBiome` but not the
        // blueprint name; the HUD state does
        // (via `setState({ dimension: ... })`).
        // We fall back to a stable string when
        // the HUD state doesn't have one yet.
        const dimensionId = this.hud.getState().dimension?.name ?? biomeId;
        const { input, rules } = autoGenerateForDimension(dimensionId, biomeId);
        if (rules.length === 0) {
            // Should never happen (codegen
            // always emits the baseline), but
            // pin the contract.
            return;
        }
        this.hot.applyGenerated(rules);
        // Sync the round-133 K-key panel
        // status badge so the player sees
        // "已接受" instead of the
        // "无 hot-reload" default.
        this.currentDslRule = this.hot.getActiveRule() ?? null;
        this.lastDslOutcome = 'accepted';
        this.hud.log(
            `[codegen] 自动生成 ${rules.length} 条规则 (biome=${input.biome}, mood=${input.mood}, complexity=${input.complexity}, seed=0x${input.seed.toString(16).slice(0, 8)})`,
        );
        this.dslCodexHandle?.refresh();
    }

    private unlistenHot?: () => void;

    private onHotEvent(ev: { state: string; charge?: number; reason?: string; rule?: import('./dsl/MemeCompiler').DslRule }): void {
        // Forward to the audio service.
        if (ev.state === 'applied' || ev.state === 'rejected' || ev.state === 'shielded' || ev.state === 'compiling') {
            this.audio.fireHotReload(ev.state as 'compiling' | 'shielded' | 'applied' | 'rejected');
        }
        if (ev.state === 'rejected') this.hud.log(`[HotReload] 拒绝：${ev.reason}`);
        if (ev.state === 'compiling' && typeof ev.charge === 'number' && ev.charge >= 0.99) {
            this.hud.log('[HotReload] 编译完成，应用规则…');
        }
        if (ev.state === 'applied') {
            this.hud.log('[HotReload] 规则已生效，世界突变！');
            this.analytics.track('dsl.applied');
            this.tutorial?.notify('hot-reload-applied');
            this.epoch.addRule({
                id: `dsl_${Date.now()}`,
                name: 'AGI 突变',
                description: '玩家通过模因组合触发的世界突变',
                kind: 'modifier',
                params: { intensity: 1 },
                addedAt: Date.now(),
            });
            this.epochPanel.render();
        }
        // Round 133 — keep
        // `currentDslRule` in
        // sync with the event
        // stream. The
        // `begin()` path
        // already sets it
        // (via
        // `getActiveRule()`),
        // but the `applied`
        // + `rejected`
        // events also carry
        // the rule so the
        // DslCodex panel
        // stays current even
        // if a future
        // refactor changes
        // the begin→active
        // flow. We re-render
        // the panel on every
        // event so the
        // status badge flips
        // in real time.
        if (ev.rule !== undefined && ev.rule !== null) {
            this.currentDslRule = ev.rule;
        }
        this.dslCodexHandle?.refresh();
    }

    /** Demo: roll a world event. */
    rollWorldEvent(): void {
        // Round 108 — debounce check delegated to
        // the `ActionDebouncer` instance. The
        // 500ms window + the actionName +
        // the round tag are all baked into the
        // debouncer's constructor (line 575),
        // so the App code reduces to a single
        // guard line. The Chinese skip log
        // line is emitted by the debouncer's
        // `check()` method.
        if (!this.debouncerRollWorldEvent.check()) return;
        // Round 108 — stamp BEFORE the body.
        // The stamp-position asymmetry (vs
        // loadGame/saveGame's stamp-at-END)
        // is preserved as a caller-side
        // choice. The reason: rollWorldEvent
        // has an early `if (!evt) return;`
        // path on a null event. Stamping
        // up-front means even a null-
        // returning rollEvent counts as
        // "called once" so the player
        // can't spam-roll to flood logs.
        // See `ActionDebouncer` JSDoc for
        // the stamp-position-asymmetry
        // rationale.
        this.debouncerRollWorldEvent.stamp();
        const evt = this.ai.worldAI.rollEvent(this.worldState.player.level, 0);
        if (!evt) return;
        this.hud.setState({ worldEvent: evt });
        this.hud.log(`[世界] ${evt.name} — ${evt.description}`);
        this.hud.log(`NPC: "${evt.npcLine}"`);
        // Show the line on a random NPC
        const idx = Math.floor(Math.random() * this.npcs.length);
        this.scene.setNpcDialogue(idx, evt.npcLine);
        setTimeout(() => this.scene.clearNpcDialogue(idx), 4000);
    }

    /** Talk to a specific NPC. */
    talkToNpc(npcIdx: number): void {
        const profile = this.npcs[npcIdx];
        if (!profile) return;
        // Round 21 — route NPCDialogueAI topic through NpcMind.suggestTopic.
        const mind = this.npcMinds.get(profile.id);
        const topic = (mind?.suggestTopic(Date.now() & 0xffff) ?? 'greeting') as
            'greeting' | 'trade' | 'quest' | 'lore' | 'farewell' | 'combat' | 'craft';
        const reply = this.npcAI.reply(profile, topic, '你好');
        this.hud.log(`${profile.name} [${mind?.mood() ?? 'neutral'}](${profile.personality}): "${reply.text}"`);
        this.scene.setNpcDialogue(npcIdx, reply.text);
        setTimeout(() => this.scene.clearNpcDialogue(npcIdx), 5000);
        // Record the interaction in the NPC's memory — friendly talk by default.
        mind?.remember(makeEntry(
            'dialogue',
            `${topic}: 你好`,
            ++this.npcTurn,
            0.4,
        ));
        this.npcMindHandle?.refresh(); this.syncNpcDisposition();
    }

    /** Round 21 — give an NPC a gift (+friendly, +trust). */
    giftNpc(npcIdx: number, summary = '神秘礼物'): void {
        const profile = this.npcs[npcIdx];
        if (!profile) return;
        const mind = this.npcMinds.get(profile.id);
        mind?.remember(makeEntry('received_gift', summary, ++this.npcTurn, 0.8));
        this.hud.log(`[NPC] ${profile.name} 收到 ${summary}，好感度上升`);
        this.npcMindHandle?.refresh(); this.syncNpcDisposition();
    }

    /** Round 21 — attack an NPC (-friendly, +fear). */
    attackNpc(npcIdx: number, summary = '攻击'): void {
        const profile = this.npcs[npcIdx];
        if (!profile) return;
        const mind = this.npcMinds.get(profile.id);
        mind?.remember(makeEntry('hostility', summary, ++this.npcTurn, 0.8));
        this.hud.log(`[NPC] ${profile.name} 受到攻击，恐惧度上升`);
        this.npcMindHandle?.refresh(); this.syncNpcDisposition();
    }

    /** Player gains XP from a dimension run. */
    completeRun(score: number, rewards: Array<{ itemId: string; quantity: number }>): void {
        const before = this.progression.level;
        this.progUI.applyXp(Math.floor(score / 10));
        if (this.progression.level > before) {
            this.audio.fire('level.up');
            this.analytics.track('session.start'); // session event placeholder
        }
        for (const r of rewards) {
            if (r.itemId === 'gold') this.worldState.addGold(r.quantity);
            else if (r.itemId === 'gem') this.worldState.addGem(r.quantity);
        }
        this.worldState.recordDimensionComplete('manual', score, rewards);
        this.hud.log(`通关！得分 ${score}, 金币 +${rewards.find(r => r.itemId === 'gold')?.quantity ?? 0}`);
        this.audio.fire('dimension.completed');
        this.analytics.track('dimension.completed', { score });
        // Round 27 — NpcMind feedback reinforcement. When the
        // player conquers a *hard* dimension, the world's NPCs
        // shift toward "reverence" (敬畏): trust goes up (they
        // respect the player) AND fear goes up a touch (they're
        // awed by the achievement). We model this as two parallel
        // broadcasts:
        //   - heard_about_dimension (+0.6) → trust += 0.06
        //   - witnessed_event        (+0.4) → fear  += 0.06
        // Both axes shift in the "reverence" direction. Below
        // the threshold the broadcast is skipped, so easy wins
        // don't earn reverence (otherwise the feedback signal
        // would saturate).
        const dim = this.hud.getState().dimension;
        if (dim && dim.difficulty > 0.6) {
            this.npcMinds.broadcast(makeEntry(
                'heard_about_dimension',
                `revered: ${dim.name} 难度 ${dim.difficulty.toFixed(2)}`,
                ++this.npcTurn,
                0.6,
            ));
            this.npcMinds.broadcast(makeEntry(
                'witnessed_event',
                `awed by: ${dim.name} 难度 ${dim.difficulty.toFixed(2)}`,
                ++this.npcTurn,
                0.4,
            ));
            this.hud.log(`[narr+mind] 高难度通关 (${dim.difficulty.toFixed(2)}) → NPC 集体转"敬畏" (trust+, fear+)`);
            this.npcMindHandle?.refresh(); this.syncNpcDisposition();
        }
        this.renderAllPanels();
    }

    /** Public: toggle the DM God console. */
    toggleGodConsole(): void { this.godConsole?.toggle(); }

    /** Manual epoch collapse. */
    triggerCollapse(): void {
        const r = this.epoch.triggerCollapse();
        this.hud.log(`[大坍缩] 已坍缩，生成 ${r.newRelics.length} 个历史遗迹`);
        this.hud.log(`[新纪元] ${this.epoch.epochName}`);
        this.epochPanel.render();
        this.audio.fire('epoch.collapsed');
        this.analytics.track('epoch.collapsed', { epoch: this.epoch.epochNumber });
        this.tutorial?.notify('epoch-collapsed');
    }

    saveGame(): void {
        // Round 108 — debounce check delegated to
        // the `ActionDebouncer` instance. The
        // 500ms window + the actionName +
        // the round tag are all baked into the
        // debouncer's constructor (line 568),
        // so the App code reduces to a single
        // guard line. The Chinese skip log
        // line is emitted by the debouncer's
        // `check()` method.
        if (!this.debouncerSaveGame.check()) return;
        const ok = this.save.persist();
        this.hud.log(ok ? '[存档] 已保存' : '[存档] 保存失败');
        this.analytics.track('save.persisted', { ok });
        this.tutorial?.notify('save-persisted');
        // Round 108 — stamp AFTER the body runs.
        // The stamp-at-end position is preserved
        // from round-106: "a failure mid-body
        // (full disk, private browsing) still
        // counts as completed so the user can't
        // spam-retry past a broken save." See
        // `ActionDebouncer` JSDoc for the
        // stamp-position-asymmetry rationale.
        this.debouncerSaveGame.stamp();
    }

    /**
     * Round 53 — recovery orchestrator for the loadGame
     * rehydrate pipeline. Called from the catch block at
     * `loadGame` after `backupFailedSnapshot` has captured
     * the 4-field pre-failure state. The orchestrator
     * dispatches on the error code emitted by the round-53
     * graded catch:
     *
     *   ERR_SCENE_RENDER  → full rebuild via
     *                       enterNewDimension (the WFC
     *                       dungeon is unrecoverable)
     *   ERR_NPC_SPAWN     → only re-spawn NPCs (the
     *                       dungeon is already on-screen,
     *                       just empty)
     *   ERR_EVENT_CHAIN   → only schedule the event chain
     *                       (dungeon + NPCs already done,
     *                       just the timed dispatch failed)
     *   ERR_UNKNOWN       → full rebuild via
     *                       enterNewDimension as the
     *                       conservative default
     *
     * The function is `async` even though the recovery
     * path is mostly synchronous — `enterNewDimension`
     * is async (calls `bridge.planAndLoad`), so the
     * orchestrator awaits it. Returns when the recovery
     * completes (or fails gracefully). The non-modal
     * HUD banner is shown via `hud.showRecoveryBanner`
     * with the new biome id after the first successful
     * `enterNewDimension` (the orchestrator queries
     * `worldState.lastBiome` post-call because
     * `enterNewDimension` updates that field via
     * `setActiveDimension`).
     */
    private async recoverFromRenderFailure(
        code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN',
        partialState: { rendered: boolean; spawned: boolean; scheduled: boolean },
    ): Promise<void> {
        try {
            switch (code) {
                case 'ERR_SCENE_RENDER':
                case 'ERR_UNKNOWN': {
                    // Full rebuild — the scene is broken,
                    // so we replace it with a fresh
                    // dimension. The single BEB retry (1
                    // attempt) is implicit: if this
                    // enterNewDimension throws, the outer
                    // try/catch in recoverFromRenderFailure
                    // catches it and logs without re-throwing.
                    await this.enterNewDimension();
                    this.hud.showRecoveryBanner(code, this.worldState.lastBiome);
                    this.hud.log(`[scene] 自动恢复完成: 进入新维度 #${this.worldState.lastBiome} (code=${code})`);
                    break;
                }
                case 'ERR_NPC_SPAWN': {
                    // Re-spawn the NPC wave without
                    // rebuilding the dungeon. The scene
                    // already has tiles; we only need to
                    // re-invoke spawnNpcWave with the
                    // snapshot's count + hints.
                    const snap = this.worldState.lastSceneBlueprint;
                    if (snap) {
                        try {
                            const spawned = this.scene.spawnNpcWave(snap.npcCount, snap.npcArchetypeHints);
                            partialState.spawned = true;
                            this.hud.showRecoveryBanner(code, snap.biomeId);
                            this.hud.log(`[scene] 自动恢复完成: 仅 re-spawn NPC×${spawned.length} (biome=${snap.biomeId})`);
                        } catch (retryErr) {
                            // The retry itself failed —
                            // escalate to full rebuild.
                            this.hud.log(`[scene] ERR_NPC_SPAWN retry 失败, 升级到 enterNewDimension: ${(retryErr as Error).message}`);
                            await this.enterNewDimension();
                            this.hud.showRecoveryBanner('ERR_NPC_SPAWN_RETRY_FAILED', this.worldState.lastBiome);
                            this.hud.log(`[scene] 自动恢复完成: 升级路径 → 新维度 #${this.worldState.lastBiome}`);
                        }
                    } else {
                        // No snapshot to spawn from
                        // (shouldn't happen — backupFailedSnapshot
                        // ran first). Fall through to full
                        // rebuild.
                        await this.enterNewDimension();
                        this.hud.showRecoveryBanner('ERR_NPC_SPAWN_NO_SNAP', this.worldState.lastBiome);
                    }
                    break;
                }
                case 'ERR_EVENT_CHAIN': {
                    // The dungeon + NPCs are already in
                    // place; only the timed event chain
                    // failed. Re-schedule it from the
                    // snapshot's eventChain.
                    const snap = this.worldState.lastSceneBlueprint;
                    if (snap) {
                        for (const evt of snap.eventChain) {
                            const capture = evt;
                            setTimeout(() => {
                                try {
                                    this.hud.log(`[event] ⚡ replay ${capture.kind} (${capture.payload})`);
                                    this.npcMinds.broadcast(makeEntry(
                                        'witnessed_event',
                                        `${capture.kind}: ${capture.payload}`,
                                        ++this.npcTurn,
                                        0.3,
                                    ));
                                    this.syncNpcDisposition();
                                    this.npcMindHandle?.refresh();
                                } catch (e) {
                                    this.hud.log(`[scene] event replay retry failed: ${(e as Error).message}`);
                                }
                            }, capture.delaySecs * 1000);
                        }
                        partialState.scheduled = true;
                        this.hud.showRecoveryBanner(code, snap.biomeId);
                        this.hud.log(`[scene] 自动恢复完成: 仅 re-schedule ${snap.eventChain.length} 个事件`);
                    } else {
                        // No snapshot — give up the
                        // event chain silently; the
                        // dungeon is still on-screen.
                        this.hud.showRecoveryBanner('ERR_EVENT_CHAIN_NO_SNAP', null);
                    }
                    break;
                }
            }
        } catch (e) {
            // Last-resort: even the recovery path
            // threw. Don't bubble — the player still
            // has the HUD with round-50's snapshot
            // log; the 3D scene may be empty, but
            // the app is not crashed.
            this.hud.log(`[scene] 自动恢复失败: ${(e as Error).message} (需要手动 enterNewDimension)`);
        }
    }

    /**
     * Round 54 — player-initiated rollback to the
     * last-good pre-failure state. Called by the
     * inline "🔙 回滚" button in the recovery
     * banner (the button itself is wired via
     * `hud.setRollbackHandler` in the App
     * constructor). The flow is the inverse of
     * `recoverFromRenderFailure`: instead of building
     * a new dimension, we restore the 4 backup
     * fields and re-invoke the round-50 real-render
     * loadGame pipeline so the player returns to
     * the literal last good world.
     *
     * Failure policy: final-answer, NOT recursive
     * (round 53 research recommendation — WebGL
     * failure is most likely hardware-permanent, so
     * chaining into a second auto-recover would
     * compound the problem). On rollback failure
     * we surface a second banner and leave the
     * current auto-recovered state intact, so the
     * player can still see the world they have.
     *
     * One-deep invariant: after successful rollback,
     * `lastFailedSnapshot` is cleared. The player
     * cannot "rollback to rollback" because there
     * is no longer a "last good" — the rolled-back
     * state IS the new current state, and any new
     * failure would create a fresh backup.
     */
    rollbackToLastGood(): void {
        const backup = this.worldState.lastFailedSnapshot;
        if (!backup) {
            // Silent no-op: button shouldn't be
            // clickable in this case (HUD gates
            // render on hasFailedSnapshot), but
            // defensive log if a test or future
            // caller bypasses the gate.
            this.hud.log('[scene] rollback 取消: 无 lastFailedSnapshot (no-op)');
            return;
        }
        this.hud.log(`[scene] 玩家回滚 → #${backup.biome ?? '—'} (round 54)`);
        try {
            // Step 1 — restore the 4 backup fields
            // into the active WorldState slots. These
            // are direct field writes (no validation)
            // because the backup is internally
            // consistent (it was captured by
            // `backupFailedSnapshot` after a successful
            // round-49/50 pipeline).
            if (backup.blueprint) {
                this.worldState.lastSceneBlueprint = backup.blueprint;
                // Also sync the round-47 scalars so
                // the HUD's setLastSceneBlueprint path
                // has values to display.
                this.worldState.lastSceneNpcCount = backup.blueprint.npcCount;
                this.worldState.lastSceneBpm = backup.blueprint.musicBpm;
                this.worldState.lastSceneEventCount = backup.blueprint.eventChain.length;
                this.worldState.lastSceneArchetypeHintCount = backup.blueprint.npcArchetypeHints.length;
                // Round 72 — also restore the full event-chain
                // timeline from the backup so a "replay events"
                // UI can show the events that the rollback
                // undid. Mirrors the DM-path write above; the
                // non-DM path syncs this automatically via
                // `updateLastSceneBlueprintFull`.
                this.worldState.setLastSceneEventChain(backup.blueprint.eventChain);
                // Round 73 — push the chain into the HUD so the
                // rolled-back scene's `⏰ next: <kind> in
                // <delay>s` line reflects the events that
                // survived the rollback. Mirrors the DM-path
                // HUD write above.
                this.hud.setLastSceneEventChain(backup.blueprint.eventChain);
            }
            this.worldState.setLastDimensionSeed(backup.seed);
            this.worldState.lastBiome = backup.biome;
            // updateNpcMindsSnapshot overwrites the
            // full snapshot array (defensive clone
            // happens inside the setter).
            this.worldState.updateNpcMindsSnapshot(backup.npcSnapshot);

            // Step 2 — NpcMind rehydration
            // (defensive). The round-48
            // loadFromSnapshots path can throw on a
            // corrupted snapshot (the very snapshot
            // we're restoring!). If it throws, we
            // fall back to a clear registry — the
            // scene blueprint is still valid, so the
            // player gets a fresh NPC roster instead
            // of the rolled-back one. This is the
            // same fallback as round 53's NpcMind
            // rehydrate catch.
            try {
                if (backup.npcSnapshot.length > 0) {
                    this.npcMinds.loadFromSnapshots(backup.npcSnapshot);
                } else {
                    this.npcMinds.clear();
                }
            } catch (rehydrateErr) {
                this.hud.log(`[narr+mind] rollback 还原失败 (${(rehydrateErr as Error).message}) → 走 fresh NpcFactory (round 54)`);
                this.npcMinds.clear();
            }

            // Step 3 — re-invoke the round-50
            // real-render pipeline. We inline the
            // 3-segment catch logic here (duplicated
            // from loadGame) so the rollback doesn't
            // depend on loadGame's full save-restore
            // cycle (which would overwrite our
            // restored 4 fields). If the render
            // pipeline itself fails AGAIN, we
            // surface a second banner (final-answer,
            // not recursive) and let the player
            // dismiss it to accept the current state.
            const snap = this.worldState.lastSceneBlueprint;
            if (snap) {
                const seed = backup.seed
                    ?? stableSeedFromSnapshot(snap);
                const weightsStr = snap.wfcTileWeights.join(',');
                const partialState = { rendered: false, spawned: false, scheduled: false };
                try {
                    const dungeon = generateDungeonWithWeights(10, 10, seed, snap.wfcTileWeights);
                    const biome = biomeForVisualStyle(snap.biomeId);
                    this.scene.renderWfcDungeon(dungeon.tiles, 1.0, biome);
                    this.scene.setBiomeAtmosphere(getBiomeAtmosphere(biome.id));
                this.audio.setBiomeAmbient(biome.id, getBiomeAudio(biome.id));
                this.audio.setBiomeSfx(biome.id, getBiomeAudio(biome.id));
                    // Round 66 — render + push the
                    // round-63 80×60 PNG minimap into
                    // WorldState + HUD so the persistent
                    // memories block shows the rolled-back
                    // dungeon's preview, not the
                    // pre-rollback corruption placeholder.
                    // Mirrors the round-65 / enterAtom
                    // sequence (and round-63/64
                    // enterNewDimension sequence).
                    this.worldState.lastMinimap = renderMiniMap(dungeon.tiles, biome.id);
                    this.hud.setMinimap(this.worldState.lastMinimap);
                    partialState.rendered = true;
                    const spawned = this.scene.spawnNpcWave(snap.npcCount, snap.npcArchetypeHints);
                    partialState.spawned = true;
                    this.hud.log(
                        `[scene] rollback 真重渲染: seed=${seed} · weights=[${weightsStr}]`
                        + ` · NPC×${spawned.length} · biome=${snap.biomeId}`
                        + ` · events=${snap.eventChain.length} (round 54)`,
                    );
                    for (const evt of snap.eventChain) {
                        const capture = evt;
                        setTimeout(() => {
                            try {
                                this.hud.log(`[event] ⚡ replay (rollback) ${capture.kind} (${capture.payload})`);
                                this.npcMinds.broadcast(makeEntry(
                                    'witnessed_event',
                                    `${capture.kind}: ${capture.payload}`,
                                    ++this.npcTurn,
                                    0.3,
                                ));
                                this.syncNpcDisposition();
                                this.npcMindHandle?.refresh();
                            } catch (evtErr) {
                                this.hud.log(`[scene] event replay (rollback) failed: ${(evtErr as Error).message}`);
                            }
                        }, capture.delaySecs * 1000);
                    }
                    partialState.scheduled = true;
                } catch (renderErr) {
                    // Step 4 (failure path) — surface a
                    // second banner. We do NOT chain
                    // into another auto-recover (final
                    // answer per round 53 research).
                    // The current auto-recovered state
                    // (whatever enterNewDimension
                    // produced before the player
                    // clicked rollback) remains
                    // visible.
                    this.hud.log(`[scene] rollback 自身 re-render 失败: code=ERR_ROLLBACK_FAILED err=${(renderErr as Error).message}`);
                    this.hud.showRecoveryBanner('ERR_ROLLBACK_FAILED', null);
                    return; // skip the success cleanup below
                }
            }

            // Step 4 (success path) — sync the HUD
            // with the restored state, then hide the
            // recovery banner and clear the backup
            // (one-deep invariant).
            this.hud.setLastBiome(this.worldState.lastBiome);
            // Round 87 — restore the dim panel's biome
            // accent from the backup. `lastBiome` may be
            // null (a round-1–32 save that pre-dates the
            // biome memory); in that case, leave the
            // accent null too so the dim panel renders
            // without a left border.
            this.hud.setLastBiomeAccent(
                this.worldState.lastBiome
                    ? getBiomeAtmosphere(this.worldState.lastBiome).particleColor
                    : null,
            );
            this.hud.setNpcMindsSnapshot(this.worldState.npcMindsSnapshot);
            this.syncNpcDisposition();
            if (this.worldState.lastSceneNpcCount != null) {
                // Round 78 — typed against SceneScalars;
                // reads from the round-47 WorldState fields.
                const sceneScalars: SceneScalars = {
                    npcCount: this.worldState.lastSceneNpcCount,
                    bpm: this.worldState.lastSceneBpm ?? 0,
                    eventCount: this.worldState.lastSceneEventCount ?? 0,
                    archetypeHintCount: this.worldState.lastSceneArchetypeHintCount ?? 0,
                };
                this.hud.setLastSceneBlueprint(sceneScalars);
            }
            // If the backup had a speaker (it
            // doesn't currently capture that, but
            // keep the shape symmetric with
            // loadGame's round-44 wiring), restore
            // it.
            // (No-op today: backup doesn't include
            // lastSpeakerId; this is intentional —
            // the player would have heard the
            // narration in the original enterNewDimension
            // and the rollback takes them back to
            // that world; no need to re-narrate.)
            this.worldState.clearFailedSnapshot();
            this.hud.hideRecoveryBanner();
            this.hud.setBackupAvailable(false);
            // Round 79 — increment the lifetime rollback
            // counter on the WorldState and push it into
            // the HUD so the persistent-memories block's
            // 🛟 row updates. We increment AFTER the
            // success cleanup so a rollback that throws
            // partway through (and falls into the catch
            // below) does NOT silently bump the counter
            // — only fully-successful rollbacks count.
            // (The "rollback 自身 re-render 失败" path
            // returns early above; the "灾难性失败"
            // catch below also doesn't bump, so a
            // half-restored state stays un-counted.)
            this.worldState.rollbackCount = (this.worldState.rollbackCount ?? 0) + 1;
            this.hud.setRollbackCount(this.worldState.rollbackCount);
            this.hud.log('[scene] rollback 成功: 4 字段已恢复 + 真重渲染完成 + banner hide');
        } catch (e) {
            // Step 5 (catastrophic failure) —
            // something in the restore path itself
            // threw (e.g. a defensive clone in
            // updateNpcMindsSnapshot). Surface a
            // warning; the partial restore may have
            // left the world in an inconsistent
            // state, but the existing 7-field
            // persistence is intact so the player
            // can save and reload to recover.
            this.hud.log(`[scene] rollback 灾难性失败: ${(e as Error).message} (建议手动 save + reload)`);
        }
    }

    loadGame(): void {
        // Round 108 — debounce check delegated to
        // the `ActionDebouncer` instance. The
        // 500ms window + the actionName +
        // the round tag are all baked into the
        // debouncer's constructor (line 560),
        // so the App code reduces to a single
        // guard line. The Chinese skip log
        // line is emitted by the debouncer's
        // `check()` method. The round-104
        // rationale (round-103 `try/finally`
        // in-flight guard didn't work for
        // sync `loadGame`; time-based debounce
        // is the correct pattern) is unchanged
        // — only the implementation has been
        // consolidated.
        if (!this.debouncerLoadGame.check()) return;
        const ok = this.save.restore();
        this.hud.log(ok ? '[读档] 已恢复' : '[读档] 没有可恢复的存档');
        if (ok) {
            this.analytics.track('save.loaded');
            // Round 43 — push the round-32 lastBiome
            // snapshot into the HUD so the "上次离开
            // #biome" prompt becomes visible.
            this.hud.setLastBiome(this.worldState.lastBiome);
            // Round 87 — restore the dim panel's biome
            // accent from the loaded save.
            this.hud.setLastBiomeAccent(
                this.worldState.lastBiome
                    ? getBiomeAtmosphere(this.worldState.lastBiome).particleColor
                    : null,
            );
            // Round 64 — push the round-63 lastMinimap
            // data URL into the HUD so the persistent
            // memories block renders the 80×60 PNG
            // preview next to the biome line.
            this.hud.setMinimap(this.worldState.lastMinimap);
            // Round 45 — push the round-40 per-NPC
            // memory snapshot into the HUD so the
            // "🧠 N 个 NPC 记住了 K 段记忆" tally
            // becomes visible.
            this.hud.setNpcMindsSnapshot(this.worldState.npcMindsSnapshot);
            // Round 79 — push the round-79 lifetime
            // rollback count into the HUD so the
            // persistent-memories block's 🛟 row shows
            // the count carried across save → reload.
            // Mirrors the round-43/45/64 push pattern.
            this.hud.setRollbackCount(this.worldState.rollbackCount);
            // Round 48 — actually rehydrate the live
            // NpcRegistry from the snapshot (round 40
            // was informational only; the registry was
            // rebuilt fresh at construction time). The
            // rehydrate is the headline of this round:
            // the world's NPC memory now truly carries
            // across save → reload instead of resetting
            // to archetype baseline. The constructor
            // already built a fresh roster for the
            // boot scenario; this call replaces it
            // with the persisted one when a save
            // exists.
            if (this.worldState.npcMindsSnapshot.length > 0) {
                // Round 53 — wrap the round-48 rehydration
                // in try/catch. A throw here (corrupted
                // snapshot, unknown archetype, kind-string
                // mismatch) does NOT trigger a full
                // enterNewDimension — the scene blueprint
                // may still be valid, so we just clear the
                // NPC roster and let the player continue
                // with an empty registry (fresh NpcFactory
                // will repopulate on next enterNewDimension).
                try {
                    this.npcMinds.loadFromSnapshots(this.worldState.npcMindsSnapshot);
                    const totalEntries = this.worldState.npcMindsSnapshot
                        .reduce((n, s) => n + s.entries.length, 0);
                    this.hud.log(
                        `[narr+mind] 还原 ${this.npcMinds.len()} 个 NPC, ${totalEntries} 段记忆`,
                    );
                    this.npcMindHandle?.refresh();
                    this.syncNpcDisposition();
                } catch (rehydrateErr) {
                    this.hud.log(
                        `[narr+mind] 还原失败 (${(rehydrateErr as Error).message})`
                        + ` → 走 fresh NpcFactory (round 53)`,
                    );
                    this.npcMinds.clear();
                    // The scene re-render below can still
                    // proceed with an empty NpcRegistry;
                    // the round-50 snapshot pipeline only
                    // needs the WFC weights + biome + NPC
                    // archetype hints (not the live
                    // registry).
                }
            }
            // Round 46 — push the round-22/35
            // lastNpcDisposition (the average mood
            // snapshot) into the HUD so the
            // "🎭 集体情绪: friendly X / fear Y / trust Z"
            // prompt becomes visible.
            this.hud.setLastNpcDisposition(this.worldState.lastNpcDisposition);
            // Round 47 — push the round-24 themeToScene
            // scalars snapshot (npcCount / bpm /
            // eventCount / archetypeHintCount) into the
            // HUD so the "🎬 上次维度" prompt becomes
            // visible after a reload. Only push when at
            // least one scalar is set — otherwise the
            // HUD is left in its default (no prompt)
            // state, matching the WorldState back-compat
            // path for older saves.
            if (this.worldState.lastSceneNpcCount != null) {
                // Round 78 — typed against SceneScalars;
                // rebuilds the HUD's 4-scalar view from
                // the round-47 WorldState fields.
                const sceneScalars: SceneScalars = {
                    npcCount: this.worldState.lastSceneNpcCount,
                    bpm: this.worldState.lastSceneBpm ?? 0,
                    eventCount: this.worldState.lastSceneEventCount ?? 0,
                    archetypeHintCount: this.worldState.lastSceneArchetypeHintCount ?? 0,
                };
                this.hud.setLastSceneBlueprint(sceneScalars);
            }
            // Round 49 — when a full SceneBlueprint snapshot
            // was persisted (or synthesized from round-47
            // scalars), log the full structure so the player
            // sees scene-level continuity, not just the four
            // top-level numbers. Round 50 will turn this log
            // into an actual re-render of the dungeon +
            // archetype-tagged NPC wave.
            const snap = this.worldState.lastSceneBlueprint;
            if (snap) {
                const weightsStr = snap.wfcTileWeights.join(',');
                this.hud.log(
                    `[scene] 还原: NPC×${snap.npcCount} · BPM ${snap.musicBpm}`
                    + ` · biome=${snap.biomeId} · events=${snap.eventChain.length}`
                    + ` · weights=[${weightsStr}] (来自 save)`,
                );
                // Round 50 — turn the round-49 snapshot into an
                // actual WFC dungeon + NPC wave + timed event
                // chain. The seed comes from
                // `lastDimensionSeed` (round 50) when present,
                // or a stable hash of the snapshot for back-compat
                // with round-49 saves. The whole block is wrapped
                // in try/catch — if any step fails (jsdom has no
                // Three.js renderer, archetype-string mismatch,
                // weights.length validation), loadGame still
                // succeeds; the player just sees the snapshot log
                // without the visual replay.
                //
                // Round 53 — split the round-50 catch-all into
                // three targeted catches with per-segment error
                // codes. The orchestrator (`recoverFromRenderFailure`)
                // picks the right recovery path per segment:
                //   ERR_DUNGEON_GEN  → full re-render via
                //                      enterNewDimension
                //   ERR_SCENE_RENDER → full re-render via
                //                      enterNewDimension
                //   ERR_NPC_SPAWN    → only re-spawn NPCs
                //                      (dungeon already rendered)
                //   ERR_EVENT_CHAIN  → only schedule the event
                //                      chain (dungeon + NPCs
                //                      already done)
                // The 5-second auto-hide banner informs the player
                // when the recovery actually ran. Defensive
                // `backupFailedSnapshot` is called once at the
                // top so any recovery path preserves the failed
                // state for a future round-54 "rollback to last
                // good" UI.
                const seed = this.worldState.lastDimensionSeed
                    ?? stableSeedFromSnapshot(snap);
                const partialState = { rendered: false, spawned: false, scheduled: false };
                this.worldState.backupFailedSnapshot();
                // Round 54 — tell the HUD that a
                // recoverable snapshot is now
                // available, so the inline "🔙 回滚"
                // button can render in the recovery
                // banner (when the banner is shown).
                this.hud.setBackupAvailable(true);
                try {
                    // Segment 1 — generate the WFC dungeon.
                    const dungeon = generateDungeonWithWeights(10, 10, seed, snap.wfcTileWeights);
                    // Segment 2 — push the tiles into the Three.js
                    // scene. This is the most likely failure
                    // point in jsdom (no WebGL) and on devices
                    // with a broken renderer context.
                    const biome = biomeForVisualStyle(snap.biomeId);
                    this.scene.renderWfcDungeon(dungeon.tiles, 1.0, biome);
                    this.scene.setBiomeAtmosphere(getBiomeAtmosphere(biome.id));
                this.audio.setBiomeAmbient(biome.id, getBiomeAudio(biome.id));
                this.audio.setBiomeSfx(biome.id, getBiomeAudio(biome.id));
                    partialState.rendered = true;
                    // Segment 3 — bulk-spawn the NPC wave. A
                    // throw here means the dungeon is on-screen
                    // but empty; the recovery path is "re-spawn
                    // NPCs only", not "rebuild the world".
                    const spawned = this.scene.spawnNpcWave(snap.npcCount, snap.npcArchetypeHints);
                    partialState.spawned = true;
                    this.hud.log(
                        `[scene] 真重渲染: seed=${seed} · weights=[${weightsStr}]`
                        + ` · NPC×${spawned.length} · biome=${snap.biomeId}`
                        + ` · events=${snap.eventChain.length} (round 50)`,
                    );
                    // Segment 4 (async tail-catch) — schedule the
                    // timed event chain. Each setTimeout is its
                    // own microtask boundary, so we wrap the
                    // dispatch logic in a try/catch per-iteration
                    // to keep the round-50 safety net ("never
                    // throw out of a setTimeout") while still
                    // bubbling the failure to the orchestrator.
                    for (const evt of snap.eventChain) {
                        // Capture loop-local ref so the closure
                        // sees the right `evt` even if the
                        // iteration variable is re-assigned.
                        const capture = evt;
                        setTimeout(() => {
                            try {
                                this.hud.log(`[event] ⚡ replay ${capture.kind} (${capture.payload})`);
                                this.npcMinds.broadcast(makeEntry(
                                    'witnessed_event',
                                    `${capture.kind}: ${capture.payload}`,
                                    ++this.npcTurn,
                                    0.3,
                                ));
                                this.syncNpcDisposition();
                                this.npcMindHandle?.refresh();
                            } catch (evtErr) {
                                // Per-iteration tail catch — async
                                // errors are surfaced but do not
                                // break the rest of the chain.
                                this.hud.log(
                                    `[scene] event replay failed: ${(evtErr as Error).message}`
                                    + ` (event=${capture.kind})`,
                                );
                            }
                        }, capture.delaySecs * 1000);
                    }
                    partialState.scheduled = true;
                } catch (e) {
                    // Graded catch — figure out which segment
                    // threw and dispatch to the right recovery
                    // path. We infer from `partialState` which
                    // was the last successful step (since the
                    // throw propagates past the try-block
                    // boundary, a per-segment try would be
                    // redundant nesting).
                    let code: 'ERR_SCENE_RENDER' | 'ERR_NPC_SPAWN' | 'ERR_EVENT_CHAIN' | 'ERR_UNKNOWN';
                    if (!partialState.rendered) {
                        code = 'ERR_SCENE_RENDER';
                    } else if (!partialState.spawned) {
                        code = 'ERR_NPC_SPAWN';
                    } else if (!partialState.scheduled) {
                        code = 'ERR_EVENT_CHAIN';
                    } else {
                        code = 'ERR_UNKNOWN';
                    }
                    this.hud.log(
                        `[scene] 真重渲染失败: code=${code} err=${(e as Error).message}`
                        + ` → 启动自动恢复 (round 53)`,
                    );
                    this.recoverFromRenderFailure(code, partialState);
                }
            }
            // Round 44 — push the round-36 lastSpeaker
            // snapshot into the HUD so the "你刚才听见了
            // <id> 说：…" prompt becomes visible after
            // a reload.
            if (this.worldState.lastSpeakerId) {
                this.hud.setLastSpeaker({
                    id: this.worldState.lastSpeakerId,
                    branch: this.worldState.lastSpeakerDisposition
                        ? (this.worldState.lastSpeakerDisposition.fear > 0.5
                            ? 'fear'
                            : this.worldState.lastSpeakerDisposition.friendly < -0.3
                                ? 'hostile'
                                : this.worldState.lastSpeakerDisposition.friendly > 0.5
                                    ? 'friendly'
                                    : 'neutral')
                        : 'neutral',
                    disposition: this.worldState.lastSpeakerDisposition ?? { friendly: 0, fear: 0, trust: 0 },
                });
            }
        }
        this.renderAllPanels();
        this.renderAllPanels();
        // Round 108 — stamp AFTER the body runs.
        // The stamp-at-end position is preserved
        // from round-104: "a failure mid-body
        // (corrupt save, jsdom Three.js missing,
        // etc.) still counts as a completed load
        // and the user can't spam retry. The
        // dual-call window is specifically about
        // preventing the silent side-effect
        // duplication, not about retry-after-
        // failure." See `ActionDebouncer` JSDoc
        // for the stamp-position-asymmetry
        // rationale.
        this.debouncerLoadGame.stamp();
    }
}

async function bootstrap(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const hudRoot = document.getElementById('hud-root') as HTMLElement | null;
    const progRoot = document.getElementById('progression-root') as HTMLElement | null;
    const econRoot = document.getElementById('economy-root') as HTMLElement | null;
    const epochRoot = document.getElementById('epoch-root') as HTMLElement | null;
    const tutorialRoot = document.getElementById('tutorial-root') as HTMLElement | null;
    const statsRoot = document.getElementById('stats-root') as HTMLElement | null;
    const godRoot = document.getElementById('god-root') as HTMLElement | null;
    const vaultRoot = document.getElementById('vault-root') as HTMLElement | null;
    const npcMindRoot = document.getElementById('npc-mind-root') as HTMLElement | null;
    const achievementsRoot = document.getElementById('achievements-root') as HTMLElement | null;
    const biomeLibraryRoot = document.getElementById('biome-library-root') as HTMLElement | null;
    const debugOverlayRoot = document.getElementById('debug-overlay-root') as HTMLElement | null;
    const eventLogRoot = document.getElementById('event-log-root') as HTMLElement | null;
    const dslCodexRoot = document.getElementById('dsl-codex-root') as HTMLElement | null;
    // Round 137 — 15th panel-toggle
    // (I key) wires the pre-
    // existing `InventoryUI`
    // module to `#inventory-root`.
    const inventoryRoot = document.getElementById('inventory-root') as HTMLElement | null;
    if (!canvas || !hudRoot || !progRoot || !econRoot || !epochRoot) {
        console.error('Missing required DOM roots');
        return;
    }

    const app = new App({
        canvas,
        hudRoot,
        progressionRoot: progRoot,
        economyRoot: econRoot,
        epochRoot,
        tutorialRoot: tutorialRoot ?? undefined,
        statsRoot: statsRoot ?? undefined,
        godRoot: godRoot ?? undefined,
        vaultRoot: vaultRoot ?? undefined,
        npcMindRoot: npcMindRoot ?? undefined,
        achievementsRoot: achievementsRoot ?? undefined,
        biomeLibraryRoot: biomeLibraryRoot ?? undefined,
        debugOverlayRoot: debugOverlayRoot ?? undefined,
        eventLogRoot: eventLogRoot ?? undefined,
        dslCodexRoot: dslCodexRoot ?? undefined,
        inventoryRoot: inventoryRoot ?? undefined,
    });
    (window as any).__AGI__ = app;
    await app.start();

    // Round 48 — load the WASM bridge after `start()` so the engine
    // boot log lands first. Loader returns null on any failure
    // (404, browser blocks wasm, version mismatch); App.setSceneGenWasm
    // logs the outcome and the bridge stays null → TS fallback runs.
    const sceneGenWasm = await loadSceneGenWasm();
    app.setSceneGenWasm(sceneGenWasm);

    // Bind demo buttons
    const bind = (id: string, fn: () => void) => {
        document.getElementById(id)?.addEventListener('click', () => fn());
    };
    bind('btn-enter',     () => app.enterNewDimension());
    bind('btn-fail',      () => app.failCurrentDimension());
    bind('btn-abandon',   () => app.abandonCurrentDimension());
    bind('btn-event',     () => app.rollWorldEvent());
    bind('btn-dsl',       () => app.hotReloadFromMemes(['Fire', 'Speed', 'Create']));
    bind('btn-collapse',  () => app.triggerCollapse());
    bind('btn-save',      () => app.saveGame());
    bind('btn-load',      () => app.loadGame());
    bind('btn-npc-0',     () => app.talkToNpc(0));
    bind('btn-npc-1',     () => app.talkToNpc(1));
    bind('btn-npc-2',     () => app.talkToNpc(2));
    bind('btn-gift-0',    () => app.giftNpc(0));
    bind('btn-attack-0',  () => app.attackNpc(0));
    bind('btn-god',       () => app.toggleGodConsole());
    // Round 112 — button counterpart
    // to the P key shortcut. Opens /
    // closes the round-111
    // SettingsPanel.
    // Round 131 — the 12 panel-toggle
    // mouse button binds (round-112
    // to round-128) are now
    // generated from the
    // `PANEL_TOGGLE_BINDINGS` table
    // (the single source of truth
    // for the panel-toggle group).
    // Each row's `buttonId` /
    // `methodName` pair is what
    // the loop wires; the closure
    // captures the row so the
    // iteration variable can't
    // drift across rounds.
    for (const b of PANEL_TOGGLE_BINDINGS) {
        // The closure captures `b` per iteration
        // (a `for…of` loop creates a new binding
        // per step, so the 12 closures don't
        // share a single `b`). The dispatch is
        // by public method-name lookup so the
        // App's 12 `toggleX()` surface stays
        // the contract — the private
        // `toggleByMethod` is an internal
        // implementation detail.
        bind(b.buttonId, () => {
            const fn = (app as unknown as Record<string, () => void>)[b.methodName];
            if (typeof fn === 'function') fn.call(app);
        });
    }
    bind('btn-complete',  () => app.completeRun(2500, [
        { itemId: 'gold', quantity: 100 },
        { itemId: 'gem',  quantity: 5 },
    ]));

    // Round 57 — global keyboard shortcuts. Bound at the window
    // level so the player can drive the game from anywhere; the
    // router translates each keydown into a semantic action that
    // dispatches into the App. Modifier-held keys (Ctrl/Meta/Alt)
    // are ignored so browser shortcuts (Cmd+S, Ctrl+L etc.) still
    // work for the page itself.
    // Populate the help overlay body once at boot from the
    // canonical BINDING_DESCRIPTIONS so the two stay in sync.
    // Round 59 — also render the MOUSE_BINDINGS section with
    // a divider label, so the player sees both surfaces in one
    // place.
    {
        const body = document.getElementById('keyboard-help-body');
        if (body) {
            // Section 1: keyboard.
            const kbHeader = document.createElement('div');
            kbHeader.className = 'kb-help-section';
            kbHeader.textContent = '键盘';
            body.appendChild(kbHeader);
            for (const d of BINDING_DESCRIPTIONS) {
                const keyEl = document.createElement('div');
                keyEl.className = 'kb-help-key';
                keyEl.textContent = d.key;
                const actEl = document.createElement('div');
                actEl.className = 'kb-help-action';
                actEl.textContent = d.action;
                body.appendChild(keyEl);
                body.appendChild(actEl);
            }
            // Section 2: mouse / pointer.
            const mouseHeader = document.createElement('div');
            mouseHeader.className = 'kb-help-section';
            mouseHeader.textContent = '鼠标';
            body.appendChild(mouseHeader);
            for (const d of MOUSE_BINDINGS) {
                const keyEl = document.createElement('div');
                keyEl.className = 'kb-help-key';
                keyEl.textContent = d.key;
                const actEl = document.createElement('div');
                actEl.className = 'kb-help-action';
                actEl.textContent = d.action;
                body.appendChild(keyEl);
                body.appendChild(actEl);
            }
            // Round 120 — Section 3:
            // the 11 panel-toggle
            // keys (P / Q / W + T /
            // F / M + V + B + G / N
            // / O), shown
            // in a dedicated visually-
            // distinct section. The
            // player can scan this
            // 8-row block instead of
            // hunting through the
            // full BINDING_DESCRIPTIONS
            // list. Uses a distinct
            // CSS class
            // (.kb-help-section-toggle)
            // so the section reads
            // as a quick-reference
            // card with a cyan
            // border.
            // Round 132 — Z (13th).
            // Round 133 — K (14th).
            // Round 137 — I (15th).
            // Round 159 — K shared with
            // auto-hide-fullscreen
            // (panel-toggle + HUD-
            // mode are orthogonal, so
            // K was reclaimed here
            // for the round-159 HUD
            // mode; the original
            // round-133 K was a
            // separate panel-toggle
            // that has since been
            // superseded — the
            // header still lists 16
            // entries because the
            // panel-toggle roster
            // plus the HUD-mode
            // roster combine to
            // fill the section).
            // Round 160 — B key
            // (17th entry) added
            // for the
            // minimize-to-icon
            // HUD mode.
            const toggleHeader = document.createElement('div');
            toggleHeader.className = 'kb-help-section kb-help-section-toggle';
            toggleHeader.textContent = '面板开关 (18 键)';
            body.appendChild(toggleHeader);
            for (const d of PANEL_TOGGLE_DESCRIPTIONS) {
                const keyEl = document.createElement('div');
                keyEl.className = 'kb-help-key kb-help-key-toggle';
                keyEl.textContent = d.key;
                const actEl = document.createElement('div');
                actEl.className = 'kb-help-action kb-help-action-toggle';
                actEl.textContent = d.action;
                body.appendChild(keyEl);
                body.appendChild(actEl);
            }
        }
    }
    window.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        // Round 153 — notify the HUD that an
        // input event just fired so the round-
        // 153 fade mode can snap the stats
        // panel back to full opacity. This is
        // a no-op when fade is disabled, so the
        // cost on the hot path is one boolean
        // check + one early-return. Routes
        // through a public App method because
        // `hud` is `private`.
        app.notifyHudInput();
        const action = routeKey(ev.key);
        if (!action) return;
        switch (action.kind) {
            case 'cycle-hud-corner': app.cycleHudCorner(); break;
            case 'toggle-hud-pinned': app.toggleHudPinned(); break;
            // Round 156 — Y key toggles HUD
            // click-through mode. Routed through
            // the same handler the panel-toggles
            // use; the method body is small
            // (one boolean flip + one
            // localStorage write) so it
            // doesn't need its own block.
            case 'toggle-hud-click-through': app.toggleHudClickThrough(); break;
            // Round 159 — K key
            // toggles the HUD
            // auto-hide-on-fullscreen
            // mode. The HUD
            // collapses whenever
            // the document is in
            // fullscreen mode. Same
            // handler pattern as
            // the other HUD toggles
            // (one boolean flip +
            // localStorage write +
            // re-render).
            case 'toggle-hud-auto-hide-fullscreen': app.toggleHudAutoHideFullscreen(); break;
            // Round 160 — B key
            // toggles the
            // minimize-to-icon
            // mode. The HUD
            // collapses to a
            // 32×32 icon; click
            // the icon to
            // expand. Same
            // handler pattern
            // as the other HUD
            // toggles (one
            // boolean flip +
            // localStorage write
            // + re-render).
            case 'toggle-hud-minimized': app.toggleHudMinimized(); break;
            // Round 161 — N
            // key cycles
            // the scene
            // speed
            // through the
            // 4-preset
            // sequence
            // (0.5x → 1x
            // → 2x → 4x
            // → 0.5x).
            // Same
            // handler
            // pattern as
            // the other
            // HUD
            // toggles —
            // one call +
            // one
            // localStorage
            // write + one
            // applyScene
            // Speed.
            case 'cycle-scene-speed': app.cycleSceneSpeed(); break;
            case 'enter-atom': void app.enterAtom(action.atomId); break;
            // Round 152 — H key toggles the HUD
            // compact mode (the round-51 memories
            // block collapses its per-row detail
            // lists). Routed through the same
            // handler the panel-toggles use; the
            // method body is small (one boolean
            // flip + localStorage write + re-render).
            case 'toggle-hud-compact': app.toggleHudCompact(); break;
            // Round 153 — J key toggles the HUD
            // fade mode. The stats panel auto-
            // fades to 0.25 opacity after
            // `hudFadeIdleMs` of input inactivity
            // and snaps back to fully visible on
            // any `notifyInput()` call. Mirrors
            // `toggle-hud-compact`: one boolean
            // flip + localStorage write + re-
            // render. The J key in the hotkey
            // strip mirrors this for discoverability.
            // Note: F is already taken by the
            // round-21 vault toggle.
            case 'toggle-hud-fade': app.toggleHudFade(); break;
            case 'abandon':    app.abandonCurrentDimension(); break;
            case 'reroll':     void app.enterNewDimension(); break;
            case 'toggle-help':app.toggleHelp(); break;
            case 'save':       app.saveGame(); break;
            case 'load':       void app.loadGame(); break;
            case 'event':      app.rollWorldEvent(); break;
            // Round 85 — R key shortcut for the round-54
            // rollback UI. The shortcut calls the
            // same `rollbackToLastGood` that the inline
            // HUD button does; if there's no
            // `lastFailedSnapshot`, the method is a
            // no-op (the HUD gates the button on
            // `hasFailedSnapshot`, but the keyboard
            // shortcut can't gate visually, so a
            // defensive no-op is the right default).
            case 'rollback':   app.rollbackToLastGood(); break;
            // Round 91 — backtick/tilde toggles the DM
            // God console. The console is the entry
            // point for `dm run <cmd>` lines that drive
            // the round-66 onDimension callback (and the
            // round-87 setLastBiomeAccent wiring it
            // transitively triggers). The shortcut calls
            // the same `toggleGodConsole` that the
            // round-66 `btn-god` button does; the
            // GodConsole class itself manages open/close
            // state, so the toggle is idempotent.
            case 'toggle-dm-console': app.toggleGodConsole(); break;
            // Round 131 — the 12 panel-toggle cases
            // (toggle-settings / toggle-stats /
            // toggle-progression / toggle-tutorial /
            // toggle-vault / toggle-npc-mind /
            // toggle-achievements / toggle-biome-library
            // / toggle-god-console-panel / toggle-economy
            // / toggle-epoch / toggle-debug-overlay)
            // are now collapsed to a single
            // `panelToggleMethodByKind` lookup. The
            // 12 case arms that lived here from
            // round 112 → 128 are gone — adding
            // a 13th panel-toggle (round-131+
            // follow-up) now needs (1) a new
            // KeyboardAction union member, (2)
            // a new routeKey case, and (3) one
            // new row in `PANEL_TOGGLE_BINDINGS`.
            // The dispatch table follows
            // automatically.
            default: {
                const methodName = panelToggleMethodByKind(action.kind);
                if (methodName) {
                    const fn = (app as unknown as Record<string, () => void>)[methodName];
                    if (typeof fn === 'function') fn.call(app);
                }
                break;
            }
        }
        // Only swallow the event when we actually handled it so
        // tab navigation, Esc-into-fullscreen-exit etc. still
        // behave normally.
        ev.preventDefault();
    });

    // Auto-enter the first dimension after 1.5s
    setTimeout(() => app.enterNewDimension(), 1500);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
}

// Round 127 — localStorage persistence for
// the SettingsPanel's two App-owned
// state fields (`currentDebounceWindowMs`
// + `currentDifficulty`). Mirrors the
// pattern in `i18n/I18n.ts` (agi_locale)
// + `audio/GameAudio.ts` (agi_muted).
// Keys are namespaced under `agi_` so
// future settings can share the prefix.
// All reads return null on missing /
// malformed / unavailable storage; the
// field initializers fall back to the
// default value (`500` / `'normal'`).
const DEBOUNCE_STORAGE_KEY = 'agi_debounce_ms';
const DIFFICULTY_STORAGE_KEY = 'agi_difficulty';

function loadDebounceMsFromStorage(): 0 | 100 | 250 | 500 | 1000 | 2000 | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(DEBOUNCE_STORAGE_KEY);
        if (raw === '0') return 0;
        if (raw === '100') return 100;
        if (raw === '250') return 250;
        if (raw === '500') return 500;
        if (raw === '1000') return 1000;
        if (raw === '2000') return 2000;
        return null;
    } catch {
        return null;
    }
}

function writeDebounceMsToStorage(ms: 0 | 100 | 250 | 500 | 1000 | 2000): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(DEBOUNCE_STORAGE_KEY, String(ms));
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

function loadDifficultyFromStorage(): Difficulty | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
        if (raw === 'easy' || raw === 'normal' || raw === 'hard') return raw;
        return null;
    } catch {
        return null;
    }
}

function writeDifficultyToStorage(d: Difficulty): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(DIFFICULTY_STORAGE_KEY, d);
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// Round 152 — localStorage persistence
// for the HUD compact mode (the H key
// toggles it). Mirrors the round-127
// pattern: a `load…FromStorage` /
// `save…ToStorage` pair with the same
// `typeof localStorage === 'undefined'`
// guard (the non-browser test env has
// no `localStorage` global). The key
// `agi_hud_compact` stores the literal
// string `'1'` (compact ON) or
// `'0'` (compact OFF, default). On a
// missing / malformed / unavailable
// storage, the load returns `false` so
// the in-memory state falls back to the
// default (compact OFF).
const HUD_COMPACT_STORAGE_KEY = 'agi_hud_compact';

function loadHudCompactFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_COMPACT_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudCompactToStorage(compact: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_COMPACT_STORAGE_KEY, compact ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 154 — `agi_hud_corner` localStorage key for the
// HUD 4-corner snap mode. Same
// `loadXxxFromStorage` / `saveXxxToStorage`
// shape as the round-152 compact / round-153
// fade helpers, but stores a STRING ('tl' /
// 'tr' / 'br' / 'bl') instead of a boolean.
// On missing / malformed / unavailable
// storage, the load returns 'tr' so the
// in-memory state falls back to the round-1
// default (top-right).
// ---------------------------------------------------------------------------

const HUD_CORNER_STORAGE_KEY = 'agi_hud_corner';
type HudCorner = 'tl' | 'tr' | 'br' | 'bl';

function loadHudCornerFromStorage(): HudCorner {
    if (typeof localStorage === 'undefined') return 'tr';
    try {
        const raw = localStorage.getItem(HUD_CORNER_STORAGE_KEY);
        if (raw === 'tl' || raw === 'tr' || raw === 'br' || raw === 'bl') {
            return raw;
        }
        return 'tr';
    } catch {
        return 'tr';
    }
}

function saveHudCornerToStorage(corner: HudCorner): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_CORNER_STORAGE_KEY, corner);
    } catch {
        // localStorage can throw in private
        // mode / quota errors. Swallow —
        // the in-memory state is already
        // updated.
    }
}

// ---------------------------------------------------------------------------
// Round 155 — `agi_hud_pinned` localStorage key for the
// HUD always-on-top pin toggle. Same
// `loadXxxFromStorage` / `saveXxxToStorage`
// shape as the round-152 compact / round-153
// fade / round-154 corner helpers. Stores the
// literal string `'1'` (pinned ON) or `'0'`
// (pinned OFF, default). On a missing /
// malformed / unavailable storage, the load
// returns `false` so the in-memory state
// falls back to the round-1 default (z-index
// 10, HUD may be pushed below a fullscreen
// canvas).
// ---------------------------------------------------------------------------

const HUD_PINNED_STORAGE_KEY = 'agi_hud_pinned';

function loadHudPinnedFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_PINNED_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudPinnedToStorage(pinned: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_PINNED_STORAGE_KEY, pinned ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 156 — `agi_hud_click_through` localStorage key for the
// HUD click-through toggle. Same `loadXxxFromStorage` /
// `saveXxxToStorage` shape as the round-152 compact /
// round-153 fade / round-154 corner / round-155 pin helpers
// (typeof guard + try/catch — non-browser test envs skip
// the call silently).
// ---------------------------------------------------------------------------

const HUD_CLICK_THROUGH_STORAGE_KEY = 'agi_hud_click_through';

function loadHudClickThroughFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_CLICK_THROUGH_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudClickThroughToStorage(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_CLICK_THROUGH_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 159 — `agi_hud_auto_hide_fullscreen` localStorage key for
// the HUD auto-hide-on-fullscreen toggle. Same `loadXxxFromStorage` /
// `saveXxxToStorage` shape as the round-152/153/154/155/156
// persistence helpers. Stores `'1'` / `'0'` boolean literal.
// ---------------------------------------------------------------------------

const HUD_AUTO_HIDE_FULLSCREEN_STORAGE_KEY = 'agi_hud_auto_hide_fullscreen';

function loadHudAutoHideFullscreenFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_AUTO_HIDE_FULLSCREEN_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudAutoHideFullscreenToStorage(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_AUTO_HIDE_FULLSCREEN_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 160 — `agi_hud_minimized` localStorage key for
// the HUD minimize-to-icon toggle. Same `loadXxxFromStorage` /
// `saveXxxToStorage` shape as the round-152/153/154/155/156/159
// persistence helpers. Stores `'1'` / `'0'` boolean literal.
// ---------------------------------------------------------------------------

const HUD_MINIMIZED_STORAGE_KEY = 'agi_hud_minimized';

function loadHudMinimizedFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_MINIMIZED_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudMinimizedToStorage(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_MINIMIZED_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 161 — `agi_scene_speed` localStorage key for
// the scene speed cycle. The 4 valid values are
// "0.5" / "1" / "2" / "4"; any other string (or
// missing key) returns the default 1 (the round-1
// 1x update rate). The N key cycles through
// `SCENE_SPEED_PRESETS` in order; the SettingsPanel
// scene-speed row has 4 buttons in the same order;
// both write to this key. The App reads it on
// boot (via `loadSceneSpeedFromStorage`) to
// restore the chosen preset.
// ---------------------------------------------------------------------------

const SCENE_SPEED_STORAGE_KEY = 'agi_scene_speed';

function loadSceneSpeedFromStorage(): SceneSpeedPreset {
    if (typeof localStorage === 'undefined') return 1;
    try {
        const raw = localStorage.getItem(SCENE_SPEED_STORAGE_KEY);
        const sp = raw == null ? NaN : Number(raw);
        if (sp === 0.5 || sp === 1 || sp === 2 || sp === 4) return sp;
        return 1;
    } catch {
        return 1;
    }
}

function saveSceneSpeedToStorage(multiplier: SceneSpeedPreset): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(SCENE_SPEED_STORAGE_KEY, String(multiplier));
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

// ---------------------------------------------------------------------------
// Round 153 — `agi_hud_fade` localStorage key for the HUD
// fade-mode toggle. Same `loadXxxFromStorage` /
// `saveXxxToStorage` shape as the round-152 compact
// helpers above, but a separate key so a player can
// enable compact and disable fade (or vice versa)
// independently.
// ---------------------------------------------------------------------------

const HUD_FADE_STORAGE_KEY = 'agi_hud_fade';

function loadHudFadeFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(HUD_FADE_STORAGE_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

function saveHudFadeToStorage(fade: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(HUD_FADE_STORAGE_KEY, fade ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private mode / quota errors.
        // Swallow — the in-memory state
        // is already updated.
    }
}

export { App, bootstrap };
