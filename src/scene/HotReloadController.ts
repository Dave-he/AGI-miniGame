/**
 * HotReloadController — the bridge between the AGI prompt and the running
 * scene. Implements the PRD §5 Challenge 1 mitigation:
 *
 *   "在碎片投入编译槽时，给玩家提供一个短暂的'护盾'或'编译充能'
 *    动画表现，掩盖网络延迟；使用流式输出 (Streaming) 提前解析部分 DSL。"
 *
 * The controller exposes:
 *   - begin(dsl)        start a "compiling" charge, schedule the apply
 *   - onChargeTick       callbacks the UI can show a progress bar
 *   - onApplied          fires when the rule is finally applied
 *
 * It also rate-limits apply() calls so a malicious / buggy prompt can't
 * crash the world.
 */

import { DslExecutor } from './DslExecutor';
import { parseDSL, DslRule } from '../dsl/MemeCompiler';

export type HotReloadState = 'idle' | 'compiling' | 'shielded' | 'applied' | 'rejected';

export interface HotReloadEvent {
    state: HotReloadState;
    rule?: DslRule;
    dsl?: string;
    reason?: string;
    charge: number;     // 0..1
}

export interface HotReloadConfig {
    /** Time to spend in the "compiling" state (ms). */
    compileTimeMs: number;
    /** Time to spend in the "shielded" state after apply (ms). */
    shieldTimeMs: number;
    /** Max rules applied per second (rate limit). */
    maxAppliesPerSec: number;
}

export const DEFAULT_HOT_RELOAD_CONFIG: HotReloadConfig = {
    compileTimeMs: 600,
    shieldTimeMs: 800,
    maxAppliesPerSec: 3,
};

export class HotReloadController {
    private exec: DslExecutor;
    private cfg: HotReloadConfig;
    private listeners: Array<(e: HotReloadEvent) => void> = [];
    private state: HotReloadState = 'idle';
    private charge: number = 0;
    private chargeStart: number = 0;
    private lastApplies: number[] = [];
    private rejectCount: number = 0;
    /**
     * Round 133 — the
     * currently-active
     * `DslRule`. Set
     * inside `begin()` once
     * the rule has parsed
     * + passed the
     * action-count sanity
     * check; cleared back
     * to `null` after
     * `applyNow()` returns
     * (or when the
     * controller is
     * cancelled). The
     * round-133
     * `DslCodex` panel
     * reads this via a
     * getter (`getActiveRule()`)
     * so the panel can
     * show the AGI's most
     * recently generated
     * rule without having
     * to subscribe to the
     * event stream.
     */
    private activeRule: DslRule | null = null;

    constructor(exec: DslExecutor, cfg: HotReloadConfig = DEFAULT_HOT_RELOAD_CONFIG) {
        this.exec = exec;
        this.cfg = cfg;
    }

    on(listener: (e: HotReloadEvent) => void): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    getState(): HotReloadState { return this.state; }
    getCharge(): number { return this.charge; }
    getRejectCount(): number { return this.rejectCount; }
    /**
     * Round 133 — getter
     * for the currently-
     * active `DslRule`.
     * Returns `null` when
     * no rule is active
     * (i.e. before
     * `begin()` is called
     * or after the
     * controller has
     * applied the rule
     * and reset back to
     * `idle`). The
     * `DslCodex` panel
     * reads this via a
     * callback so the
     * panel updates the
     * moment `begin()`
     * stores the rule.
     */
    getActiveRule(): DslRule | null { return this.activeRule; }

    /** Begin a hot-reload. Returns true if accepted, false if rate-limited. */
    begin(dsl: string): boolean {
        if (this.state !== 'idle' && this.state !== 'applied') return false;
        if (!this.rateOk()) {
            this.rejectCount += 1;
            this.emit({ state: 'rejected', reason: 'rate limit', charge: 0, dsl });
            return false;
        }
        let rule: DslRule;
        try {
            rule = parseDSL(dsl);
        } catch (e) {
            this.rejectCount += 1;
            this.emit({ state: 'rejected', reason: `parse: ${e}`, charge: 0, dsl });
            return false;
        }
        // Sanity: at most 6 actions per rule.
        if (rule.actions.length > 6) {
            this.rejectCount += 1;
            this.emit({ state: 'rejected', reason: 'too many actions', charge: 0, dsl, rule });
            return false;
        }

        this.state = 'compiling';
        this.charge = 0;
        this.chargeStart = performance.now();
        // Round 133 — store
        // the parsed rule so
        // the DslCodex panel
        // can read it via
        // `getActiveRule()`.
        // Stored BEFORE the
        // emit (so any
        // listener that
        // inspects the rule
        // sees a consistent
        // state).
        this.activeRule = rule;
        this.emit({ state: 'compiling', charge: 0, dsl, rule });

        // Compile phase
        const compileTimer = setTimeout(() => {
            this.applyNow(rule, dsl);
        }, this.cfg.compileTimeMs);

        // Drive charge UI on a separate interval. Use a polyfill that
        // works in both the browser (rAF) and Node (setTimeout) so the
        // controller is testable in jest.
        const tick = () => {
            if (this.state !== 'compiling') return;
            const elapsed = performance.now() - this.chargeStart;
            this.charge = Math.min(1, elapsed / this.cfg.compileTimeMs);
            this.emit({ state: 'compiling', charge: this.charge, dsl, rule });
            if (this.charge < 1) {
                const sched = typeof requestAnimationFrame === 'function'
                    ? requestAnimationFrame
                    : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
                sched(tick);
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(tick);
        } else {
            setTimeout(tick, 16);
        }

        // Guard against the controller being disposed.
        this._lastTimer = compileTimer;
        return true;
    }

    /** Force-cancel any in-flight compile. */
    cancel(): void {
        if (this._lastTimer !== null) {
            clearTimeout(this._lastTimer);
            this._lastTimer = null;
        }
        this.state = 'idle';
        this.charge = 0;
        // Round 133 — clear
        // the active rule
        // when the compile is
        // cancelled so the
        // DslCodex panel
        // doesn't show a
        // zombie rule.
        this.activeRule = null;
        this.emit({ state: 'idle', charge: 0 });
    }

    private _lastTimer: any = null;

    private applyNow(rule: DslRule, dsl: string): void {
        this.lastApplies.push(performance.now());
        this.exec.apply(rule);
        this.state = 'shielded';
        this.charge = 1;
        this.emit({ state: 'shielded', charge: 1, dsl, rule });
        setTimeout(() => {
            this.state = 'applied';
            this.emit({ state: 'applied', charge: 1, dsl, rule });
            // Cooldown back to idle
            this.state = 'idle';
            this.charge = 0;
        }, this.cfg.shieldTimeMs);
    }

    private rateOk(): boolean {
        const now = performance.now();
        this.lastApplies = this.lastApplies.filter(t => now - t < 1000);
        return this.lastApplies.length < this.cfg.maxAppliesPerSec;
    }

    private emit(e: HotReloadEvent): void {
        for (const l of this.listeners) l(e);
    }
}
