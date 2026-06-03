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
import { AIEngine } from './ai/AIEngine';
import { NPCDialogueAI, NPCProfile } from './ai/NPCDialogueAI';
import { AIBridge, ATOM_MANIFEST } from './gameplay/AIBridge';
import { GameplayManager, SynthesisModule, CardModule } from './gameplay/GameplayManager';
import { DslExecutor } from './scene/DslExecutor';
import { HotReloadController } from './scene/HotReloadController';
import { SceneTransitions } from './scene/SceneTransitions';
import { NpcCombat } from './scene/NpcCombat';
import { generateDungeon, TILE_SPAWN, TILE_GOAL } from './world/WfcLevelGen';
import { parseDSL, combineMemes, compileFallback } from './dsl/MemeCompiler';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { WebAudioService, NullAudioService } from './audio/AudioService';
import { GameAudio } from './audio/GameAudio';
import { Analytics } from './analytics/Analytics';
import { HttpLLMClient } from './ai/HttpLLMClient';

interface AppRefs {
    canvas: HTMLCanvasElement;
    hudRoot: HTMLElement;
    progressionRoot: HTMLElement;
    economyRoot: HTMLElement;
    epochRoot: HTMLElement;
    tutorialRoot?: HTMLElement;
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
    private llm: HttpLLMClient | { complete: typeof HttpLLMClient.prototype.complete } | null = null;

    private npcs: NPCProfile[] = [
        { id: 'sage',   name: '玄真道长', personality: 'wise',      faction: '隐者之塔' },
        { id: 'merch',  name: '游商阿灰', personality: 'grumpy',    faction: '暗巷商会' },
        { id: 'guide',  name: '小灵',     personality: 'playful',   faction: '无限次元城' },
    ];

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
        this.gameplay = new GameplayManager();
        this.bridge = new AIBridge(this.ai, this.gameplay, this.worldState);
        // Audio: prefer Web Audio when available, otherwise silent stub.
        this.audio = new GameAudio(
            (typeof window !== 'undefined' && (window as any).AudioContext)
                ? new WebAudioService()
                : new NullAudioService(),
        );
        this.analytics = new Analytics();
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
        this.epochPanel = new EpochPanel(refs.epochRoot, this.epoch, () => this.triggerCollapse());
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
        const r = await this.bridge.planAndLoad({ playerLevel: this.worldState.player.level });
        this.hud.setState({ dimension: r.blueprint });
        this.scene.onDimensionEntered(r.blueprint);
        this.hud.log(`进入次元: ${r.blueprint.name}`);
        this.hud.log(`玩法组合: ${r.atomIds.join(' + ')}`);
        this.hud.log(`主题: ${(r.blueprint.theme as any).visualStyle}`);
        this.audio.fire('dimension.entered');
        this.analytics.track('dimension.entered', { id: r.blueprint.id });
        this.tutorial?.notify('dimension-entered');
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
        const reply = this.npcAI.reply(profile, 'greeting', '你好');
        this.hud.log(`${profile.name} (${profile.personality}): "${reply.text}"`);
        this.scene.setNpcDialogue(npcIdx, reply.text);
        setTimeout(() => this.scene.clearNpcDialogue(npcIdx), 5000);
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
        this.renderAllPanels();
    }

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
        if (ok) this.analytics.track('save.loaded');
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
    if (!canvas || !hudRoot || !progRoot || !econRoot || !epochRoot) {
        console.error('Missing required DOM roots');
        return;
    }

    const app = new App({ canvas, hudRoot, progressionRoot: progRoot, economyRoot: econRoot, epochRoot, tutorialRoot: tutorialRoot ?? undefined });
    (window as any).__AGI__ = app;
    await app.start();

    // Bind demo buttons
    const bind = (id: string, fn: () => void) => {
        document.getElementById(id)?.addEventListener('click', () => fn());
    };
    bind('btn-enter',     () => app.enterNewDimension());
    bind('btn-event',     () => app.rollWorldEvent());
    bind('btn-dsl',       () => app.hotReloadFromMemes(['Fire', 'Speed', 'Create']));
    bind('btn-collapse',  () => app.triggerCollapse());
    bind('btn-save',      () => app.saveGame());
    bind('btn-load',      () => app.loadGame());
    bind('btn-npc-0',     () => app.talkToNpc(0));
    bind('btn-npc-1',     () => app.talkToNpc(1));
    bind('btn-npc-2',     () => app.talkToNpc(2));
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
