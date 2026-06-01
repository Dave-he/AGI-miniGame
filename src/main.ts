/**
 * AGI-miniGame entry point.
 *
 * Wires together:
 *   - SceneManager (Three.js hub scene)
 *   - HUD (cyberpunk overlay with AI panel + console log)
 *   - GameManager (dimension / gameplay / world state)
 *   - AIEngine (the 4 super-brains)
 *
 * This file is intentionally framework-agnostic: no React, no Vue, no
 * specific build tool assumptions beyond plain DOM + Vite.
 */

import { SceneManager } from './scene/SceneManager';
import { HUD } from './ui/HUD';
import { WorldState } from './world/WorldState';
import { AIEngine, GameplayCombinerAI, SmartWorldAI } from './ai/AIEngine';
import { combineMemes, compileFallback, parseDSL, toEngineJSON } from './dsl/MemeCompiler';
import type { DimensionBlueprint } from './ai/AIEngine';

interface AppRefs {
    canvas: HTMLCanvasElement;
    hudRoot: HTMLElement;
}

class App {
    private scene: SceneManager;
    private hud: HUD;
    private worldState: WorldState;
    private ai: AIEngine;
    private currentDim: DimensionBlueprint | null = null;

    constructor(refs: AppRefs) {
        this.scene = new SceneManager(refs.canvas);
        this.hud = new HUD(refs.hudRoot);
        this.worldState = new WorldState('local-player', '次元旅者');
        this.ai = new AIEngine(Date.now());

        this.hud.setState({
            playerLevel: this.worldState.player.level,
            gold: this.worldState.getGold(),
            gem: this.worldState.getGem(),
        });
        this.hud.log('AGI-miniGame 已启动');
        this.hud.log('4 大 AI 中枢已就位: 玩法组合 / 内容生成 / 平衡调参 / 智能世界');
    }

    async start(): Promise<void> {
        await this.scene.start();
        this.hud.log('Three.js 场景加载完成，进入「无限次元城」');
        // Demo: roll a world event after a short delay.
        setTimeout(() => this.rollWorldEvent(), 3000);
    }

    enterNewDimension(): void {
        // 1. GameplayCombinerAI picks a combination
        const suggestion = this.ai.gameplayAI.suggest(this.worldState.player.level);
        this.hud.log(`玩法组合 AI 决策: 阶段=${suggestion.stage} 主玩法=${suggestion.primary.join('+')}`);

        // 2. Build the GenerationConfig from the suggestion
        const config = this.ai.gameplayAI.toGenerationConfig(
            this.worldState.player.level,
            0,
            { minAtoms: 2, maxAtoms: 4, rewardMultiplier: 1.0, difficultyRange: [0.3, 0.8] },
        );

        // 3. AIEngine.generateDimension uses all 4 AIs
        const dim = this.ai.generateDimension(config);
        this.currentDim = dim;
        this.worldState.setActiveDimension(dim.id, dim.atomIds);
        this.hud.setState({ dimension: dim });
        this.scene.onDimensionEntered(dim);
        this.hud.log(`进入次元: ${dim.name} (难度 ${dim.difficulty.toFixed(2)})`);
        this.hud.log(`生成 art 提示词: ${(dim.theme as any).artPrompt?.slice(0, 60) ?? 'n/a'}…`);
    }

    rollWorldEvent(): void {
        const evt = this.ai.worldAI.rollEvent(this.worldState.player.level, 0);
        if (!evt) return;
        this.hud.setState({ worldEvent: evt });
        this.hud.log(`世界 AI 事件: ${evt.name} — ${evt.description}`);
        this.hud.log(`NPC: "${evt.npcLine}"`);
    }

    demoMemeCompile(): void {
        const memes = ['Fire', 'Speed', 'Create'] as const;
        const prompt = combineMemes([...memes]);
        this.hud.log(`[DSL] 准备调用 LLM，prompt 长度 ${prompt.prompt.length}`);
        // Offline fallback: deterministic rule
        const rule = compileFallback([...memes]);
        const dslLine = `On(${rule.event.kind}${rule.event.arg !== undefined ? `, ${rule.event.arg}` : ''}) -> ${rule.actions.map(a => `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`).join(', ')}`;
        this.hud.log(`[DSL] 离线编译结果: ${dslLine}`);
        this.hud.log(`[DSL] 引擎 JSON: ${JSON.stringify(toEngineJSON(rule))}`);
    }
}

async function bootstrap(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const hudRoot = document.getElementById('hud-root') as HTMLElement | null;
    if (!canvas || !hudRoot) {
        console.error('Missing #game-canvas or #hud-root in DOM');
        return;
    }

    const app = new App({ canvas, hudRoot });
    (window as any).__AGI__ = app; // for debugging
    await app.start();

    // Demo bindings
    document.getElementById('btn-enter')?.addEventListener('click', () => app.enterNewDimension());
    document.getElementById('btn-event')?.addEventListener('click', () => app.rollWorldEvent());
    document.getElementById('btn-dsl')?.addEventListener('click', () => app.demoMemeCompile());

    // Auto-enter the first dimension after 1.5s so the demo is visible.
    setTimeout(() => app.enterNewDimension(), 1500);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
}

export { App, bootstrap };
