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
});
