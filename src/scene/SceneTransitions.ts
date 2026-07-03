/**
 * SceneTransitions — hub↔gameplay fade orchestration.
 *
 * The PRD §2.3 promises a "无缝切换" experience. The transition
 * controller fades the active dimension out, plays a "返回无限次元城"
 * animation, queues the next-suggested dimension, then fades back in.
 *
 * The controller is engine-agnostic: it doesn't know about Three.js,
 * only the `SceneManager` interface, and emits events the HUD and
 * audio system can hook into.
 */

import type { SceneManager } from './SceneManager';
import type { AIEngine, DimensionBlueprint } from '../ai/AIEngine';
import type { AIBridge } from '../gameplay/AIBridge';

export type TransitionPhase = 'idle' | 'fading-out' | 'in-hub' | 'fading-in' | 'in-dimension';

export interface TransitionEvent {
    phase: TransitionPhase;
    blueprint?: DimensionBlueprint;
    rewards?: Array<{ itemId: string; quantity: number }>;
    message?: string;
}

export interface TransitionConfig {
    fadeOutMs: number;
    hubHoldMs: number;
    fadeInMs: number;
}

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
    fadeOutMs: 500,
    hubHoldMs: 1500,
    fadeInMs: 500,
};

export class SceneTransitions {
    private scene: SceneManager;
    private ai: AIEngine;
    private bridge: AIBridge;
    private cfg: TransitionConfig;
    private listeners: Array<(e: TransitionEvent) => void> = [];
    private phase: TransitionPhase = 'idle';
    private fadeEl: HTMLElement | null = null;

    constructor(scene: SceneManager, ai: AIEngine, bridge: AIBridge, cfg: TransitionConfig = DEFAULT_TRANSITION_CONFIG) {
        this.scene = scene;
        this.ai = ai;
        this.bridge = bridge;
        this.cfg = cfg;
    }

    on(listener: (e: TransitionEvent) => void): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    getPhase(): TransitionPhase { return this.phase; }

    /** Trigger a hub return. Optionally carry the rewards that just unlocked. */
    returnToHub(rewards?: Array<{ itemId: string; quantity: number }>): void {
        if (this.phase !== 'idle' && this.phase !== 'in-dimension') return;
        this.emit({ phase: 'fading-out', message: '回归无限次元城…', rewards });
        this.phase = 'fading-out';
        this.installFade();
        this.fadeEl?.style && (this.fadeEl.style.opacity = '1');

        setTimeout(() => {
            this.scene.onDimensionCleared();
            this.phase = 'in-hub';
            this.emit({ phase: 'in-hub', rewards, message: `+${rewards?.length ?? 0} 项奖励已结算` });
        }, this.cfg.fadeOutMs);

        setTimeout(() => {
            this.enterNextDimension();
        }, this.cfg.fadeOutMs + this.cfg.hubHoldMs);
    }

    /** Enter the next AI-suggested dimension. */
    async enterNextDimension(): Promise<void> {
        const ws = (this.bridge as any).worldState;
        const level = ws?.player?.level ?? 1;
        const recentLossCount = 0; // could be derived from session history
        const result = await this.bridge.planAndLoad({ playerLevel: level, recentLossCount });
        this.phase = 'fading-in';
        this.emit({ phase: 'fading-in', blueprint: result.blueprint, message: `进入 ${result.blueprint.name}` });
        setTimeout(() => {
            this.scene.onDimensionEntered(result.blueprint);
            this.phase = 'in-dimension';
            this.emit({ phase: 'in-dimension', blueprint: result.blueprint });
            if (this.fadeEl) this.fadeEl.style.opacity = '0';
        }, this.cfg.fadeInMs);
    }

    private installFade(): void {
        if (this.fadeEl) return;
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; inset: 0; z-index: 9998;
            background: radial-gradient(circle at 50% 50%, #0b0b22 0%, #000 100%);
            opacity: 0; transition: opacity 240ms linear;
            pointer-events: none;
        `;
        document.body.appendChild(el);
        this.fadeEl = el;
    }

    private emit(e: TransitionEvent): void {
        for (const l of this.listeners) l(e);
    }
}
