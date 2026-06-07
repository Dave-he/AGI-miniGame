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
import { GameplayManager, SynthesisModule, CardModule } from './gameplay/GameplayManager';
import { DslExecutor } from './scene/DslExecutor';
import { HotReloadController } from './scene/HotReloadController';
import { SceneTransitions } from './scene/SceneTransitions';
import { NpcCombat } from './scene/NpcCombat';
import { generateDungeon, generateDungeonWithWeights, TILE_SPAWN, TILE_GOAL } from './world/WfcLevelGen';
import { biomeForVisualStyle } from './world/WfcBiomes';
import { parseDSL, combineMemes, compileFallback } from './dsl/MemeCompiler';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { renderStatsPanel, StatsPanelHandle } from './ui/StatsPanel';
import { GodConsole } from './ui/GodConsole';
import { PlayerHealth } from './player/PlayerHealth';
import { DmMode } from './dm/DmMode';
import { SessionReplay } from './analytics/SessionReplay';
import { NpcFactory } from './ai/NpcFactory';
import { NarrationEngine } from './narration/NarrationEngine';
import { WebAudioService, NullAudioService } from './audio/AudioService';
import { GameAudio } from './audio/GameAudio';
import { Analytics } from './analytics/Analytics';
import { HttpLLMClient } from './ai/HttpLLMClient';
import { DimensionVault } from './world/DimensionVault';
import { renderVaultPanel, VaultPanelHandle } from './ui/VaultPanel';
import { NpcMind, NpcRegistry, makeEntry } from './world/NpcMind';
import { renderNpcMindPanel, NpcMindPanelHandle } from './ui/NpcMindPanel';
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
    private statsHandle: StatsPanelHandle | null = null;
    private statsTimer: ReturnType<typeof setInterval> | null = null;
    private llm: HttpLLMClient | { complete: typeof HttpLLMClient.prototype.complete } | null = null;
    private health: PlayerHealth;
    private dm: DmMode;
    private godConsole: GodConsole | null = null;
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
    /** Monotonic turn counter for NpcMemoryEntry.turn. */
    private npcTurn = 0;

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
                this.analytics.track('dm.dimension', { rows: r, cols: c, style: s });
                this.hud.log(`[DM] 渲染 ${biome.name} 主题地牢 ${r}x${c}`);
            },
        });
        this.replay = new SessionReplay(this.analytics, 200);
        this.replay.startRecording();
        this.narration = new NarrationEngine();
        // Round 20 — the AGI's "memory" of visited dimensions.
        this.vault = new DimensionVault();
        // Round 21 — per-NPC memory + disposition. Mirrors the engine's
        // NpcRegistry. One mind per generated NPC profile.
        this.npcMinds = new NpcRegistry();
        for (const profile of this.npcs) {
            // Round 29 — pass the profile's archetype so the
            // new NpcMind seeds its initial disposition from
            // the round-27 archetype table. (No-op when the
            // profile has no archetype, e.g. vanilla
            // generateRoster() output.)
            this.npcMinds.insert(new NpcMind(profile.id, NpcMind.DEFAULT_CAPACITY, profile.archetype));
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
        if (refs.vaultRoot) {
            this.vaultHandle = renderVaultPanel(refs.vaultRoot, this.vault, this.i18n);
            this.vaultTimer = setInterval(() => this.vaultHandle?.refresh(), 1000);
        }
        if (refs.npcMindRoot) {
            this.npcMindHandle = renderNpcMindPanel(refs.npcMindRoot, this.npcMinds, this.i18n);
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
        this.economy = new EconomyPanel(refs.economyRoot, this.worldState);
        this.epochPanel = new EpochPanel(refs.epochRoot, this.epoch, () => this.triggerCollapse(), this.i18n);
    }

    /**
     * Round 48 — inject the loaded WASM bridge for `themeToScene`.
     * Called by `bootstrap()` after `App.start()` returns. Passing
     * `null` (loader failed) is valid — the TS mirror takes over.
     */
    setSceneGenWasm(mod: SceneGenWasmModule | null): void {
        this.sceneGenWasm = mod;
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
            // Round 48 — try the WASM bridge first; on null result
            // (module not loaded, error JSON, wasm trap), fall back
            // to the TS mirror. `themeToSceneWithFallback` always
            // returns a blueprint, so `sceneBp` is non-null after
            // this line. The `source` field lets us log which
            // branch ran.
            const outcome = themeToSceneWithFallback(this.sceneGenWasm, themeInput);
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
                const sceneScalars = {
                    npcCount: sceneBp.npcCount,
                    bpm: sceneBp.musicBpm,
                    eventCount: sceneBp.eventChain.length,
                    archetypeHintCount: sceneBp.npcArchetypeHints.length,
                };
                this.worldState.updateLastSceneBlueprint(sceneScalars);
                this.hud.setLastSceneBlueprint(sceneScalars);
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
    }

    /** Round 21 — record the current dimension as failed/abandoned. */
    failCurrentDimension(): void { this.recordDimensionOutcome('failed', -0.4); }
    abandonCurrentDimension(): void { this.recordDimensionOutcome('abandoned', -0.1); }

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
        const ok = this.save.persist();
        this.hud.log(ok ? '[存档] 已保存' : '[存档] 保存失败');
        this.analytics.track('save.persisted', { ok });
        this.tutorial?.notify('save-persisted');
    }

    loadGame(): void {
        const ok = this.save.restore();
        this.hud.log(ok ? '[读档] 已恢复' : '[读档] 没有可恢复的存档');
        if (ok) {
            this.analytics.track('save.loaded');
            // Round 43 — push the round-32 lastBiome
            // snapshot into the HUD so the "上次离开
            // #biome" prompt becomes visible.
            this.hud.setLastBiome(this.worldState.lastBiome);
            // Round 45 — push the round-40 per-NPC
            // memory snapshot into the HUD so the
            // "🧠 N 个 NPC 记住了 K 段记忆" tally
            // becomes visible.
            this.hud.setNpcMindsSnapshot(this.worldState.npcMindsSnapshot);
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
                this.hud.setLastSceneBlueprint({
                    npcCount: this.worldState.lastSceneNpcCount,
                    bpm: this.worldState.lastSceneBpm ?? 0,
                    eventCount: this.worldState.lastSceneEventCount ?? 0,
                    archetypeHintCount: this.worldState.lastSceneArchetypeHintCount ?? 0,
                });
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
    bind('btn-complete',  () => app.completeRun(2500, [
        { itemId: 'gold', quantity: 100 },
        { itemId: 'gem',  quantity: 5 },
    ]));

    // Auto-enter the first dimension after 1.5s
    setTimeout(() => app.enterNewDimension(), 1500);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
}

export { App, bootstrap };
