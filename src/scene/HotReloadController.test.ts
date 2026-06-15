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
});
