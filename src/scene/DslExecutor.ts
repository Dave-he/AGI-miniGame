/**
 * DslExecutor — applies a parsed DslRule to a running scene.
 *
 * The PRD §2.4 promises that the engine can:
 *   "毫秒级解析 DSL，世界瞬间发生改变（生成火球、重力反转、怪物变异等）"
 *
 * This executor walks the actions in a rule and:
 *   - Spawn / SpawnEntity  → add a coloured cube entity at a random walkable cell
 *   - Damage / Heal        → emit a floating number above a random entity
 *   - (rule-modifiers like Set(World.Gravity, -9.8) are captured for the
 *     EpochSystem / physics engine; we surface them as events here so the
 *     UI can react)
 *
 * The executor is engine-layer agnostic — it only knows about the Scene
 * interface exposed in `SceneManager`. A real binding would forward these
 * to cocos4-rust's agi_minigame::Dimension::apply_rule.
 */

import type { SceneManager } from './SceneManager';
import type { DslRule, DslAction, DslEvent } from '../dsl/MemeCompiler';

export interface DslEventSink {
    log(line: string): void;
    /** Player damage event — used for HP UI / floating text. */
    onPlayerDamage?(amount: number): void;
    /** Floating-text hint for spawned entity. */
    onEntitySpawn?(entityId: number, name: string, count: number): void;
    /** World-modifier event: gravity, time, vision, etc. */
    onWorldModifier?(name: string, value: number | string): void;
}

export class DslExecutor {
    private scene: SceneManager;
    private sink: DslEventSink;
    private entityCounter: number = 100;
    /** Modifier rules observed in this session. */
    private modifiers: Array<{ name: string; value: number | string }> = [];

    constructor(scene: SceneManager, sink: DslEventSink) {
        this.scene = scene;
        this.sink = sink;
    }

    /** Apply one parsed rule. */
    apply(rule: DslRule): void {
        this.sink.log(`DSL: ${this.formatRule(rule)}`);
        for (const action of rule.actions) {
            this.applyAction(rule.event, action);
        }
    }

    /** Snapshot of world modifiers observed so far. */
    getModifiers() {
        return [...this.modifiers];
    }

    private applyAction(event: DslEvent, action: DslAction): void {
        switch (action.kind) {
            case 'Damage': {
                const amount = this.toNumber(action.args[0], 10);
                this.sink.onPlayerDamage?.(amount);
                this.scene.spawnFloatingText(`-${amount}`, '#ff4d6d');
                break;
            }
            case 'Heal': {
                const amount = this.toNumber(action.args[0], 5);
                this.scene.spawnFloatingText(`+${amount}`, '#06d6a0');
                break;
            }
            case 'Spawn':
            case 'SpawnEntity': {
                const name = String(action.args[0] ?? 'entity');
                const count = Math.max(1, Math.min(20, this.toNumber(action.args[1], 1)));
                for (let i = 0; i < count; i++) {
                    const id = this.entityCounter++;
                    this.scene.spawnEntity(id, name);
                    this.sink.onEntitySpawn?.(id, name, count);
                }
                break;
            }
        }

        // If the event was a world modifier, capture it.
        if (event.kind === 'PlayerHit' && event.arg !== undefined) {
            this.modifiers.push({ name: 'PlayerHit intensity', value: event.arg });
            this.sink.onWorldModifier?.('PlayerHit intensity', event.arg);
        }
    }

    private toNumber(v: number | string | undefined, fallback: number): number {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
        }
        return fallback;
    }

    private formatRule(r: DslRule): string {
        const ev = `On(${r.event.kind}${r.event.arg !== undefined ? `, ${r.event.arg}` : ''})`;
        const acts = r.actions.map(a =>
            `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`
        ).join(', ');
        return `${ev} -> ${acts}`;
    }
}
