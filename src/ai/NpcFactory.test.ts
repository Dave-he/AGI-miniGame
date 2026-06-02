/**
 * NpcFactory tests.
 */

import { NpcFactory } from '../ai/NpcFactory';

describe('NpcFactory', () => {
    test('produces a roster of the requested size', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({ count: 5, seed: 1 });
        expect(r.length).toBe(5);
    });

    test('ids are unique within a roster', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({ count: 12, seed: 1 });
        const ids = new Set(r.map(n => n.id));
        expect(ids.size).toBe(r.length);
    });

    test('names are non-empty', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({ count: 5, seed: 1 });
        for (const n of r) expect(n.name.length).toBeGreaterThan(0);
    });

    test('all 6 personalities can appear', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({ count: 24, seed: 1 });
        const found = new Set(r.map(n => n.personality));
        expect(found.size).toBe(6);
    });

    test('forceIds overrides the auto-generated ids', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({ count: 2, seed: 1, forceIds: ['alpha', 'beta'] });
        expect(r[0].id).toBe('alpha');
        expect(r[1].id).toBe('beta');
    });

    test('same seed produces identical rosters', () => {
        const f1 = new NpcFactory(7);
        const f2 = new NpcFactory(7);
        const r1 = f1.generateRoster({ count: 5, seed: 99 });
        const r2 = f2.generateRoster({ count: 5, seed: 99 });
        expect(r1.map(n => n.name)).toEqual(r2.map(n => n.name));
        expect(r1.map(n => n.personality)).toEqual(r2.map(n => n.personality));
    });

    test('excludePersonalities narrows the pool', () => {
        const f = new NpcFactory(7);
        const r = f.generateRoster({
            count: 30, seed: 1,
            excludePersonalities: ['grumpy', 'stoic'],
        });
        for (const n of r) {
            expect(n.personality).not.toBe('grumpy');
            expect(n.personality).not.toBe('stoic');
        }
    });
});
