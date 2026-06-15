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
import { routeKey, BINDING_DESCRIPTIONS, MOUSE_BINDINGS, PANEL_TOGGLE_DESCRIPTIONS } from './input/KeyboardShortcuts';
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
import { TutorialOverlay } from './ui/TutorialOverlay';
import { renderStatsPanel, StatsPanelHandle } from './ui/StatsPanel';
import { GodConsole } from './ui/GodConsole';
import { SettingsPanel, type DebounceWindow } from './ui/SettingsPanel';
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
    private currentDebounceWindowMs: 0 | 500 | 1000 | 2000 = 500;
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
        this.worldState = new WorldState('local-player', '次元旅者');
        this.progression = new Progression();
        this.epoch = new EpochSystem(Date.now());
        this.save = new SaveSystem(this.worldState, this.epoch, this.progression);
        this.ai = new AIEngine(Date.now());
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
        // `settings-root` DOM node. The 2 hooks
        // (onDebounceChange, getCurrentDebounce)
        // are wired so the panel can both
        // read the App's current debounce
        // state (for the `is-active`
        // highlight) and push changes back
        // into the App. The
        // `getCurrentDebounce` returns the
        // live `currentDebounceWindowMs`
        // field; `onDebounceChange` calls
        // `applyDebounceSettings(ms)` which
        // fans out to all 4 debouncers.
        // Difficulty hooks are omitted (the
        // App has no global difficulty
        // concept — each dimension rolls
        // its own) so the difficulty row
        // is hidden in the panel.
        if (refs.settingsRoot) {
            this.settingsPanel = new SettingsPanel(refs.settingsRoot, this.i18n, this.audio, {
                onDebounceChange: (ms) => this.applyDebounceSettings(ms),
                getCurrentDebounce: () => this.currentDebounceWindowMs,
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
        const msLabel = ms === 0 ? '关闭' : `${ms}ms`;
        this.hud.log(`[settings] 防抖窗口已更新为 ${msLabel} (4 个动作同步)`);
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
     */
    toggleSettings(): void { this.togglePanel('settings-root', '设置浮层', 'P'); }

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
    toggleStatsPanel(): void { this.togglePanel('stats-root', '统计面板', 'Q'); }

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
    toggleProgression(): void { this.togglePanel('progression-root', '进度面板', 'W'); }

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
    toggleTutorial(): void { this.togglePanel('tutorial-root', '教程浮层', 'T'); }

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
    toggleVault(): void { this.togglePanel('vault-root', '档案库面板', 'F'); }

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
    toggleNpcMind(): void { this.togglePanel('npc-mind-root', 'NPC 心智面板', 'M'); }

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
    toggleAchievements(): void { this.togglePanel('achievements-root', '成就面板', 'V'); }

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
    toggleBiomeLibrary(): void { this.togglePanel('biome-library-root', '生物群系图鉴', 'B'); }

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
    toggleGodConsolePanel(): void { this.togglePanel('god-root', 'DM God 控制台', 'G'); }

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
    toggleEconomy(): void { this.togglePanel('economy-root', '经济面板', 'N'); }

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
    toggleEpoch(): void { this.togglePanel('epoch-root', '纪元面板', 'O'); }

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
        if (accepted) {
            this.hud.log('[HotReload] 开始编译，护盾激活…');
            this.unlistenHot = this.hot.on(ev => this.onHotEvent(ev));
        } else {
            this.hud.log('[HotReload] 拒绝：频率限制或格式错误');
        }
    }

    private unlistenHot?: () => void;

    private onHotEvent(ev: { state: string; charge?: number; reason?: string }): void {
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
    bind('btn-settings',  () => app.toggleSettings());
    // Round 116 — 6 mouse-button
    // counterparts to the
    // round-113/114/115 panel-toggle
    // keyboard shortcuts (Q / W / T /
    // F / M / V). Each button routes
    // to the same `app.toggleX()`
    // method that the bootstrap
    // keydown switch dispatches —
    // so the keyboard and mouse
    // entry points are fully
    // symmetric. 7-button toggle
    // cluster (⚙ settings P +
    // 📊 stats Q + ⏳ progression W
    // + 📖 tutorial T + 📚 vault F
    // + 🧠 npc-mind M + 🏅
    // achievements V).
    bind('btn-stats',         () => app.toggleStatsPanel());
    bind('btn-progression',   () => app.toggleProgression());
    bind('btn-tutorial',      () => app.toggleTutorial());
    bind('btn-vault',         () => app.toggleVault());
    bind('btn-npc-mind',      () => app.toggleNpcMind());
    bind('btn-achievements',  () => app.toggleAchievements());
    // Round 119 — B key mouse
    // counterpart. Opens /
    // closes the
    // `BiomeLibraryPanel`.
    bind('btn-biome-library', () => app.toggleBiomeLibrary());
    // Round 121 — 3 mouse
    // button counterparts to
    // the round-121 G / N / O
    // keyboard shortcuts
    // (god-console / economy /
    // epoch panels). The 3
    // buttons extend the
    // round-116 7-button
    // toggle cluster + the
    // round-119 8th biome-
    // library button to 11
    // buttons total. Same
    // case-insensitive
    // mirror convention as
    // the keyboard keys —
    // the btn- route +
    // the kb- route call
    // the same `app.toggleX()`
    // method.
    bind('btn-god-panel',  () => app.toggleGodConsolePanel());
    bind('btn-economy',    () => app.toggleEconomy());
    bind('btn-epoch',      () => app.toggleEpoch());
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
            const toggleHeader = document.createElement('div');
            toggleHeader.className = 'kb-help-section kb-help-section-toggle';
            toggleHeader.textContent = '面板开关 (11 键)';
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
        const action = routeKey(ev.key);
        if (!action) return;
        switch (action.kind) {
            case 'enter-atom': void app.enterAtom(action.atomId); break;
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
            // Round 112 — P key shortcut
            // for the round-111
            // SettingsPanel. The panel
            // itself is rendered into
            // `<div id="settings-root">`
            // (see index.html + the
            // AppRefs construction in
            // main.ts). The shortcut
            // calls the same
            // `toggleSettings()` that
            // the round-112 `btn-settings`
            // button does; the App's
            // `toggleSettings` flips
            // the `hidden` attribute,
            // so the toggle is
            // idempotent.
            case 'toggle-settings':  app.toggleSettings(); break;
            // Round 113 — Q key shortcut
            // for the round-63/64
            // StatsPanel. The panel
            // itself is rendered into
            // `<div id="stats-root">`
            // via `renderStatsPanel`
            // during construction. The
            // shortcut calls the same
            // `toggleStatsPanel()` that
            // (if a `btn-stats` button
            // is added later) the
            // mouse counterpart would
            // call; the method flips
            // the `hidden` attribute,
            // so the toggle is
            // idempotent.
            case 'toggle-stats':      app.toggleStatsPanel(); break;
            // Round 113 — W key shortcut
            // for the round-65
            // ProgressionUI. The UI is
            // rendered into
            // `<div id="progression-root">`
            // via `new ProgressionUI`
            // during construction. The
            // shortcut calls the same
            // `toggleProgression()` that
            // (if a `btn-progression`
            // button is added later)
            // the mouse counterpart
            // would call; the method
            // flips the `hidden`
            // attribute, so the toggle
            // is idempotent.
            case 'toggle-progression': app.toggleProgression(); break;
            // Round 114 — T / F / M
            // shortcuts for the
            // tutorial / vault /
            // NPC-mind panels. The
            // panel content is
            // rendered into
            // `<div id="tutorial-root">`,
            // `<div id="vault-root">`,
            // `<div id="npc-mind-root">`
            // during construction.
            // The shortcuts call
            // the same
            // `toggleX()` methods
            // that the round-114
            // bootstrap switch
            // dispatches; each
            // method flips the
            // `hidden` attribute,
            // so the toggles are
            // idempotent.
            case 'toggle-tutorial':  app.toggleTutorial(); break;
            case 'toggle-vault':     app.toggleVault(); break;
            case 'toggle-npc-mind':  app.toggleNpcMind(); break;
            // Round 115 — V key for
            // the achievements panel.
            // The panel content is
            // rendered into
            // `<div id="achievements-root">`
            // (currently empty in
            // round-115; the round-22
            // follow-up will populate
            // it from
            // `worldState.player.achievements`).
            // The shortcut calls the
            // same `toggleAchievements()`
            // method that the mouse
            // entry point (round-115
            // follow-up `btn-achievements`)
            // will dispatch; the method
            // flips the `hidden`
            // attribute, so the toggle
            // is idempotent.
            case 'toggle-achievements': app.toggleAchievements(); break;
            // Round 119 — B key for
            // the biome library
            // panel. The panel
            // content is rendered
            // into
            // `<div id="biome-library-root">`
            // during construction.
            // The shortcut calls
            // the same
            // `toggleBiomeLibrary()`
            // method that the
            // round-119 mouse entry
            // point
            // (`btn-biome-library`)
            // dispatches; the
            // method flips the
            // `hidden` attribute,
            // so the toggle is
            // idempotent.
            case 'toggle-biome-library': app.toggleBiomeLibrary(); break;
            // Round 121 — G / N / O
            // 3-key batch. All 3
            // route through the
            // round-117 `togglePanel`
            // helper, so the
            // keydown switch
            // collapses to 3
            // one-liners. The G
            // key is distinct from
            // the round-91 `~/``
            // key (which routes to
            // `toggle-dm-console`
            // and calls
            // `godConsole.toggle()`
            // directly) so the
            // backtick shortcut
            // keeps its
            // pre-round-121 log
            // format.
            case 'toggle-god-console-panel': app.toggleGodConsolePanel(); break;
            case 'toggle-economy':          app.toggleEconomy();          break;
            case 'toggle-epoch':            app.toggleEpoch();            break;
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

export { App, bootstrap };
