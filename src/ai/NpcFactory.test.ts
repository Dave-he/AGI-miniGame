/**
 * NpcFactory tests.
 */

import {
    NpcFactory,
    archetypeInitialMood,
    archetypeDefaultPersonality,
    archetypeDefaultFaction,
    archetypeInitialDisposition,
} from '../ai/NpcFactory';

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

describe('NpcFactory — round 27 archetype drives personality + faction', () => {
    test('archetype_default_personality is thematic per type', () => {
        expect(archetypeDefaultPersonality('robot')).toBe('stoic');
        expect(archetypeDefaultPersonality('mage')).toBe('wise');
        expect(archetypeDefaultPersonality('siren')).toBe('playful');
        expect(archetypeDefaultPersonality('skeleton')).toBe('grumpy');
        expect(archetypeDefaultPersonality('lich')).toBe('mysterious');
    });

    test('archetype_default_faction collapses 11 archetypes into 7 factions', () => {
        const seen = new Set([
            archetypeDefaultFaction('robot'),
            archetypeDefaultFaction('mage'),
            archetypeDefaultFaction('beast'),
            archetypeDefaultFaction('astronaut'),
            archetypeDefaultFaction('alien'),
            archetypeDefaultFaction('siren'),
            archetypeDefaultFaction('diver'),
            archetypeDefaultFaction('scorpion'),
            archetypeDefaultFaction('nomad'),
            archetypeDefaultFaction('skeleton'),
            archetypeDefaultFaction('lich'),
        ]);
        // 7 unique factions across 11 archetypes.
        expect(seen.size).toBe(7);
    });

    test('archetype_initial_mood clusters match expected labels', () => {
        // Hostile cluster
        expect(archetypeInitialMood('scorpion')).toBe('hostile');
        expect(archetypeInitialMood('skeleton')).toBe('hostile');
        expect(archetypeInitialMood('lich')).toBe('hostile');
        // Happy cluster
        expect(archetypeInitialMood('siren')).toBe('happy');
        // Uneasy cluster
        expect(archetypeInitialMood('beast')).toBe('uneasy');
        expect(archetypeInitialMood('alien')).toBe('uneasy');
        // Neutral cluster
        expect(archetypeInitialMood('robot')).toBe('neutral');
        expect(archetypeInitialMood('mage')).toBe('neutral');
        expect(archetypeInitialMood('diver')).toBe('neutral');
    });

    test('archetype_initial_disposition hostile cluster has fear >= 0.6', () => {
        for (const arch of ['scorpion', 'skeleton', 'lich']) {
            const d = archetypeInitialDisposition(arch);
            expect(d.fear).toBeGreaterThanOrEqual(0.6);
            expect(d.friendly).toBeLessThanOrEqual(0);
        }
    });

    test('generateRosterByArchetype uses archetype for personality + faction', () => {
        const f = new NpcFactory(7);
        // A fantasy theme with only 'mage' archetypes → all wise/秘银.
        const r = f.generateRosterByArchetype(['mage'], 4, 1);
        expect(r.length).toBe(4);
        for (const n of r) {
            expect(n.archetype).toBe('mage');
            expect(n.personality).toBe('wise');
            expect(n.faction).toBe('秘银评议会');
        }
        // A dungeon theme with 'skeleton' → all grumpy/暗巷.
        const r2 = f.generateRosterByArchetype(['skeleton'], 3, 1);
        for (const n of r2) {
            expect(n.personality).toBe('grumpy');
            expect(n.faction).toBe('暗巷商会');
        }
    });
});
