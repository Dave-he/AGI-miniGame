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

/**
 * Render a `DslRule`
 * back to its source
 * DSL form (used for
 * the `HotReloadEvent`
 * `dsl` payload during
 * `reApplyRule`).
 * Mirrors the
 * `DslCodexPanel`
 * `ruleToSource`
 * helper exactly.
 */
function ruleToSource(rule: DslRule): string {
    const eventPart = rule.event.arg !== undefined
        ? `On(${rule.event.kind}, ${JSON.stringify(rule.event.arg)})`
        : `On(${rule.event.kind})`;
    const actionParts = rule.actions.map((a) => {
        if (a.args.length === 0) {
            return `${a.kind}()`;
        }
        const argStrs = a.args.map((arg) => JSON.stringify(arg));
        return `${a.kind}(${argStrs.join(', ')})`;
    });
    return `${eventPart} -> ${actionParts.join(', ')}`;
}

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
    /**
     * Round 134 — bounded
     * ring buffer of the
     * last
     * `HISTORY_CAPACITY`
     * successfully-applied
     * rules (in
     * chronological order
     * — index 0 is the
     * oldest, the last
     * index is the
     * newest). Populated
     * inside `applyNow()`
     * once the rule has
     * been applied; older
     * entries are dropped
     * once the buffer
     * reaches
     * `HISTORY_CAPACITY`.
     * The round-134
     * DslCodex panel
     * history list reads
     * this via a getter
     * (`getRuleHistory()`)
     * so the player can
     * see the AGI's last
     * few generated
     * rules, not just
     * the most recent
     * one.
     */
    private ruleHistory: DslRule[] = [];
    /**
     * Round 134 — the
     * maximum number of
     * rules to keep in
     * the ring buffer
     * history. 5 is a
     * sweet spot: long
     * enough for the
     * player to spot
     * the AGI's pattern
     * of recent
     * generations,
     * short enough to
     * fit in the codex
     * panel without
     * scrolling.
     */
    private static readonly HISTORY_CAPACITY = 5;
    /**
     * Round 169 —
     * WeakSet of rules
     * that came from
     * `applyGenerated`
     * (codegen path),
     * NOT from manual
     * `begin(dsl)` /
     * `reApplyRule(...)`.
     *
     * The DslCodex panel
     * queries this via
     * `isGenerated(rule)`
     * so it can render a
     * `🤖` badge + the
     * `dsl-codex-history-
     * row-generated` class
     * on rows that the
     * AGI auto-generated,
     * letting the player
     * distinguish "the
     * AGI did this on its
     * own" from "I
     * hot-reloaded this
     * myself".
     *
     * Using a WeakSet
     * (not an array of
     * references) means
     * rules evicted from
     * the ring buffer
     * (and any other
     * strong-reference
     * holder dropped)
     * garbage-collect
     * cleanly without
     * leaking the marker.
     */
    private generatedRules: WeakSet<DslRule> = new WeakSet();

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
    /**
     * Round 134 — getter
     * for the ring-buffer
     * history of
     * successfully-
     * applied rules. The
     * returned array is
     * a fresh copy (so
     * a caller can't
     * mutate the
     * controller's
     * internal state)
     * and is in
     * chronological
     * order (index 0 =
     * oldest, last index
     * = newest). The
     * `DslCodex` history
     * list reads this
     * via a callback so
     * the panel updates
     * the moment
     * `applyNow()` runs.
     * Returns an empty
     * array when no rule
     * has been applied
     * yet.
     */
    getRuleHistory(): DslRule[] { return this.ruleHistory.slice(); }

    /**
     * Round 164 — apply a pre-built array of
     * `DslRule` instances. Bypasses the rate
     * limiter and the DSL parser (the rules
     * are already valid `DslRule` objects, not
     * raw DSL strings). Each rule is dispatched
     * to the executor in order; the last applied
     * rule becomes the new `activeRule`; the
     * full set is pushed to the ring-buffer
     * history (capped at HISTORY_CAPACITY,
     * oldest-first).
     *
     * Intended use case: the App's
     * `autoGenerateForDimension` codegen call
     * (round-164 A) feeds the result of
     * `generateRules(input)` straight into
     * this method at dimension-enter time, so
     * the scene starts with a fully-formed
     * auto-generated rule set — no player
     * hot-reload required. The first rule
     * becomes the "current" rule that
     * `getActiveRule()` returns, and the panel
     * history list shows the rest of the
     * generated rules.
     *
     * The method emits one `applied` event per
     * rule, so any subscriber (the
     * `DslCodex` panel, the
     * `DebugOverlay`, etc.) updates the
     * moment the rule lands. The state stays
     * `applied` after the loop ends (the
     * shielded/charge transitions are
     * suppressed for codegen — codegen rules
     * are "always on" not "shielded for 1
     * round" — so the next player hot-reload
     * is not blocked by the codegen's own
     * rules).
     */
    applyGenerated(rules: DslRule[]): void {
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            // Round 169 — mark each
            // generated rule so the
            // DslCodexPanel can badge
            // codegen rows with 🤖.
            // Must happen BEFORE
            // `exec.apply(rule)` so
            // the marker is set even
            // if `apply()` throws
            // (we'd rather the panel
            // show "this came from
            // codegen" than silently
            // hide the source).
            this.generatedRules.add(rule);
            this.lastApplies.push(performance.now());
            this.exec.apply(rule);
            if (i === rules.length - 1) {
                // The last rule in the batch
                // becomes the "active" rule (so
                // `getActiveRule()` returns it).
                this.activeRule = rule;
            }
        }
        // Push the whole set onto the history
        // ring buffer. The buffer drops the
        // oldest entries first (FIFO, capped at
        // HISTORY_CAPACITY = 5).
        for (const rule of rules) {
            this.ruleHistory.push(rule);
        }
        while (this.ruleHistory.length > HotReloadController.HISTORY_CAPACITY) {
            this.ruleHistory.shift();
        }
        this.state = 'applied';
        this.charge = 0;
        // Emit a single "applied" event so any
        // subscriber (DslCodex panel, Debug
        // overlay) refreshes once with the new
        // history. The per-rule `applied` event
        // would be too chatty for a 5-rule
        // batch (the panel would re-render 5
        // times in a row).
        this.emit({
            state: 'applied',
            charge: 0,
            dsl: '<codegen>',
            rule: this.activeRule,
        });
    }

    /**
     * Round 169 — returns true if `rule` was
     * produced by a codegen call
     * (`applyGenerated`) and not by manual
     * hot-reload (`begin` / `reApplyRule`).
     *
     * The DslCodex panel calls this from its
     * `getIsGenerated?: (rule) => boolean`
     * callback so it can show the `🤖`
     * auto-generated badge on codegen rows.
     *
     * O(1) WeakSet.has lookup. Returns false
     * for any rule that isn't tracked (e.g.
     * rules built by tests that bypassed
     * `applyGenerated`).
     */
    isGenerated(rule: DslRule): boolean {
        return this.generatedRules.has(rule);
    }

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

    /**
     * Round 135 — re-apply
     * a previously-applied
     * rule (typically a
     * history entry from
     * `getRuleHistory()`).
     * This is the click-to-
     * apply path: the
     * player picks a rule
     * out of the DslCodex
     * "历史" list and the
     * controller re-runs
     * the same machinery
     * as a fresh apply
     * (rate-limit check,
     * exec.apply, history
     * push, state emit).
     *
     * Bypasses the
     * compile-time delay
     * — the rule has
     * already been parsed
     * and validated when
     * it was first applied,
     * so re-applying is
     * immediate.
     *
     * Returns true if
     * applied, false if
     * rate-limited or if
     * the controller is
     * mid-compile.
     */
    reApplyRule(rule: DslRule): boolean {
        // Defensive: if a
        // compile is already
        // running, don't pile
        // on a second one.
        if (this.state !== 'idle' && this.state !== 'applied') return false;
        if (!this.rateOk()) {
            this.rejectCount += 1;
            this.emit({ state: 'rejected', reason: 'rate limit', charge: 0, rule });
            return false;
        }
        // Bypass the
        // compile phase:
        // the rule was
        // already validated
        // when first applied.
        // Render the source
        // DSL from the rule
        // for the event
        // payload (mirrors
        // what `begin()`
        // does for the dsl
        // field).
        const dsl = ruleToSource(rule);
        this.activeRule = rule;
        this.applyNow(rule, dsl);
        return true;
    }

    private _lastTimer: any = null;

    private applyNow(rule: DslRule, dsl: string): void {
        this.lastApplies.push(performance.now());
        this.exec.apply(rule);
        this.state = 'shielded';
        this.charge = 1;
        // Round 134 —
        // push the
        // applied rule
        // onto the
        // ring-buffer
        // history. If
        // the buffer is
        // full, drop
        // the oldest
        // entry (FIFO).
        // The DslCodex
        // panel reads
        // this via
        // `getRuleHistory()`
        // so the player
        // sees the last
        // 5 rules, not
        // just the
        // most-recent.
        this.ruleHistory.push(rule);
        if (this.ruleHistory.length > HotReloadController.HISTORY_CAPACITY) {
            this.ruleHistory.shift();
        }
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
