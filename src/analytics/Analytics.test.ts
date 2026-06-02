/**
 * Analytics tests.
 */

import { Analytics } from '../analytics/Analytics';

describe('Analytics', () => {
    test('counter starts at 0', () => {
        const a = new Analytics();
        expect(a.count('session.start')).toBe(0);
    });

    test('track() bumps the matching counter', () => {
        const a = new Analytics();
        a.track('dimension.entered');
        a.track('dimension.entered');
        a.track('dimension.failed');
        expect(a.count('dimension.entered')).toBe(2);
        expect(a.count('dimension.failed')).toBe(1);
    });

    test('track() with payload keeps small values only', () => {
        const a = new Analytics();
        a.track('item.used', {
            itemId: 'potion',
            quantity: 1,
            huge: Array(100).fill('x'),
            nested: { a: 1, b: 2 },
            ok: true,
        });
        const snap = a.snapshot();
        const ev = snap.recent[0];
        expect(ev.data).toBeDefined();
        expect(ev.data!.itemId).toBe('potion');
        expect(ev.data!.quantity).toBe(1);
        // Nested objects and arrays are dropped
        expect(ev.data!.huge).toBeUndefined();
        expect(ev.data!.nested).toBeUndefined();
    });

    test('recent ring is bounded', () => {
        const a = new Analytics();
        for (let i = 0; i < 100; i++) a.track('session.start');
        expect(a.snapshot().recent.length).toBe(50);
    });

    test('onEvent listener receives every tracked event', () => {
        const a = new Analytics();
        const seen: string[] = [];
        a.onEvent(e => seen.push(e.kind));
        a.track('epoch.collapsed');
        a.track('npc.talked');
        expect(seen).toEqual(['epoch.collapsed', 'npc.talked']);
    });

    test('toJSON is parseable and includes all counters', () => {
        const a = new Analytics();
        a.track('dsl.applied');
        a.track('save.persisted');
        const json = a.toJSON();
        const obj = JSON.parse(json);
        expect(obj.counters['dsl.applied']).toBe(1);
        expect(obj.counters['save.persisted']).toBe(1);
        expect(typeof obj.uptimeSecs).toBe('number');
    });

    test('reset() clears counters and recent', () => {
        const a = new Analytics();
        a.track('item.dropped');
        expect(a.count('item.dropped')).toBe(1);
        a.reset();
        expect(a.count('item.dropped')).toBe(0);
        expect(a.snapshot().recent.length).toBe(0);
    });
});
