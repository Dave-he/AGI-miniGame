/**
 * HotReloadController tests.
 */

import { HotReloadController, DEFAULT_HOT_RELOAD_CONFIG } from '../scene/HotReloadController';
import { DslExecutor, DslEventSink } from '../scene/DslExecutor';

class MockScene {
    spawnEntity() { /* noop */ }
    spawnFloatingText() { /* noop */ }
}

function makeController() {
    const sink: DslEventSink = { log: () => {} };
    const exec = new DslExecutor(new MockScene() as any, sink);
    const ctrl = new HotReloadController(exec, { ...DEFAULT_HOT_RELOAD_CONFIG, compileTimeMs: 5, shieldTimeMs: 5 });
    const events: any[] = [];
    ctrl.on(e => events.push(e));
    return { ctrl, exec, events };
}

describe('HotReloadController', () => {
    test('rejects unparseable DSL', () => {
        const { ctrl, events } = makeController();
        const accepted = ctrl.begin('this is not DSL');
        expect(accepted).toBe(false);
        expect(events.some(e => e.state === 'rejected')).toBe(true);
    });

    test('rejects rules with too many actions', () => {
        const { ctrl, events } = makeController();
        const actions = Array.from({ length: 8 }, (_, i) => `Apply(Damage, ${i})`).join(', ');
        const accepted = ctrl.begin(`On(Collide) -> ${actions}`);
        expect(accepted).toBe(false);
        expect(events.some(e => e.state === 'rejected' && e.reason === 'too many actions')).toBe(true);
    });

    test('rate limit rejects rapid-fire begin() calls', () => {
        const ctrl = new HotReloadController(
            new DslExecutor(new MockScene() as any, { log: () => {} }),
            { ...DEFAULT_HOT_RELOAD_CONFIG, compileTimeMs: 5, shieldTimeMs: 5, maxAppliesPerSec: 1 }
        );
        const a = ctrl.begin('On(Collide) -> Apply(Damage, 1)');
        const b = ctrl.begin('On(Collide) -> Apply(Damage, 1)');
        // The first is accepted (state transitions to 'compiling'), the
        // second one happens while the first is still in flight, so it
        // should be rejected by the state guard OR the rate limiter.
        expect(a).toBe(true);
        expect(b).toBe(false);
    });

    test('cancel stops an in-flight compile', () => {
        const { ctrl } = makeController();
        ctrl.begin('On(Collide) -> Apply(Damage, 5)');
        expect(ctrl.getState()).toBe('compiling');
        ctrl.cancel();
        expect(ctrl.getState()).toBe('idle');
    });

    // Round 135 — `reApplyRule` click-to-apply contract.
    // `reApplyRule(rule)` is the entry point the DslCodexPanel
    // history list uses when the player clicks a history row.

    test('reApplyRule_applies_a_rule_immediately (round 135)', () => {
        const { ctrl, events } = makeController();
        const ok = ctrl.reApplyRule({
            event: { kind: 'Collide' },
            actions: [{ kind: 'Damage', args: [5] }],
        });
        expect(ok).toBe(true);
        // The rule was applied synchronously (no compile phase).
        // The events stream should contain a 'shielded' or
        // 'applied' state for the rule.
        expect(events.some(e => e.state === 'shielded')).toBe(true);
    });

    test('reApplyRule_pushes_to_ruleHistory (round 135)', () => {
        const { ctrl } = makeController();
        ctrl.reApplyRule({
            event: { kind: 'Collide' },
            actions: [{ kind: 'Heal', args: [1] }],
        });
        // The
        // `getRuleHistory()`
        // ring
        // buffer
        // should
        // now
        // contain
        // the
        // re-applied
        // rule.
        const history = ctrl.getRuleHistory();
        expect(history.length).toBe(1);
        expect(history[0].event.kind).toBe('Collide');
    });

    test('reApplyRule_returns_false_during_compile (round 135)', () => {
        const { ctrl } = makeController();
        // Start
        // a
        // compile.
        ctrl.begin('On(Collide) -> Apply(Damage, 1)');
        expect(ctrl.getState()).toBe('compiling');
        // Re-applying
        // during
        // a
        // compile
        // is
        // rejected
        // (defensive
        // — don't
        // pile
        // on
        // a
        // second
        // apply).
        const ok = ctrl.reApplyRule({
            event: { kind: 'Collide' },
            actions: [{ kind: 'Damage', args: [1] }],
        });
        expect(ok).toBe(false);
    });

    test('reApplyRule_rate_limited_when_maxAppliesPerSec_exceeded (round 135)', () => {
        const ctrl = new HotReloadController(
            new DslExecutor(new MockScene() as any, { log: () => {} }),
            { ...DEFAULT_HOT_RELOAD_CONFIG, compileTimeMs: 5, shieldTimeMs: 5, maxAppliesPerSec: 1 }
        );
        // First
        // re-apply
        // succeeds.
        const a = ctrl.reApplyRule({
            event: { kind: 'Collide' },
            actions: [{ kind: 'Damage', args: [1] }],
        });
        expect(a).toBe(true);
        // Second
        // re-apply
        // (still
        // within
        // the
        // 1-second
        // rate-limit
        // window)
        // is
        // rejected.
        const b = ctrl.reApplyRule({
            event: { kind: 'Collide' },
            actions: [{ kind: 'Damage', args: [2] }],
        });
        expect(b).toBe(false);
    });

    // Round 169 — codegen
    // path: `applyGenerated`
    // marks each rule as
    // "generated" so the
    // DslCodexPanel can
    // badge it with 🤖.
    // `isGenerated(rule)`
    // is the public
    // read-side of the
    // marker; rules from
    // manual `begin(dsl)`
    // / `reApplyRule`
    // must NOT be flagged.

    test('applyGenerated_marks_rules_as_generated (round 169)', () => {
        const { ctrl } = makeController();
        const rules = [
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [5] }] },
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Heal' as const, args: [1] }] },
        ];
        ctrl.applyGenerated(rules);
        // Every
        // rule in
        // the
        // batch
        // should
        // be
        // marked
        // generated.
        for (const r of rules) {
            expect(ctrl.isGenerated(r)).toBe(true);
        }
    });

    test('isGenerated_returns_false_for_rules_outside_codegen (round 169)', () => {
        const { ctrl } = makeController();
        const codegenRule = { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [5] }] };
        const manualRule = { event: { kind: 'Collide' as const }, actions: [{ kind: 'Heal' as const, args: [1] }] };
        ctrl.applyGenerated([codegenRule]);
        // `manualRule` was
        // never fed to
        // `applyGenerated`,
        // so it must NOT
        // be flagged
        // (the marker is
        // opt-in, not
        // opt-out).
        expect(ctrl.isGenerated(codegenRule)).toBe(true);
        expect(ctrl.isGenerated(manualRule)).toBe(false);
    });

    test('reApplyRule_does_NOT_mark_rule_as_generated (round 169)', () => {
        const { ctrl } = makeController();
        const rule = { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [5] }] };
        // Manual
        // history-replay
        // path —
        // identical to
        // what
        // DslCodexPanel
        // calls when the
        // player clicks
        // a history
        // row. NOT a
        // codegen
        // emission.
        const ok = ctrl.reApplyRule(rule);
        expect(ok).toBe(true);
        expect(ctrl.isGenerated(rule)).toBe(false);
    });

    test('applyGenerated_pushes_to_ruleHistory_and_marks_each (round 169)', () => {
        const { ctrl } = makeController();
        const rules = [
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [1] }] },
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [2] }] },
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [3] }] },
        ];
        ctrl.applyGenerated(rules);
        const hist = ctrl.getRuleHistory();
        // Ring
        // buffer
        // contains
        // all
        // 3
        // rules
        // (under
        // HISTORY_CAPACITY=5).
        expect(hist.length).toBe(3);
        // Order
        // is
        // insertion
        // order
        // (FIFO).
        expect(hist).toEqual(rules);
        // Every
        // rule
        // in
        // history
        // is
        // flagged
        // generated.
        for (const r of hist) {
            expect(ctrl.isGenerated(r)).toBe(true);
        }
    });

    test('applyGenerated_marks_rule_even_if_exec_apply_throws (round 169)', () => {
        // If `exec.apply(rule)` throws
        // mid-loop, the marker must
        // still be set on the rule
        // being processed (so the
        // panel can show "this came
        // from codegen" instead of
        // silently hiding the source
        // on the failed one).
        //
        // Note: rules after the
        // throw are NOT marked
        // (the loop bails before
        // reaching them) — that's
        // acceptable because the
        // loop already exited via
        // the exception, so the
        // rules were never
        // processed in the first
        // place.
        const { ctrl } = makeController();
        const rules = [
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [1] }] },
            { event: { kind: 'Collide' as const }, actions: [{ kind: 'Damage' as const, args: [2] }] },
        ];
        // Patch exec.apply to throw
        // on the first rule only.
        const origApply = (ctrl as any).exec.apply.bind((ctrl as any).exec);
        let calls = 0;
        (ctrl as any).exec.apply = (r: any) => {
            calls += 1;
            if (calls === 1) throw new Error('simulated apply failure');
            return origApply(r);
        };
        try {
            ctrl.applyGenerated(rules);
        } catch (_e) {
            // We expect an exception
            // on the first rule.
        }
        // The first rule (the one
        // that was being processed
        // when the throw happened)
        // IS marked — the marker
        // is set BEFORE
        // `exec.apply(rule)`, so
        // the exception doesn't
        // undo it.
        expect(ctrl.isGenerated(rules[0])).toBe(true);
        // The second rule was never
        // reached, so it's NOT
        // marked.
        expect(ctrl.isGenerated(rules[1])).toBe(false);
    });
});
