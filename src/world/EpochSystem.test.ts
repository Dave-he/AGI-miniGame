/**
 * EpochSystem tests.
 */

import { EpochSystem, WorldRule } from '../world/EpochSystem';

function rule(name: string, params: Record<string, number | string>, kind: WorldRule['kind'] = 'modifier'): WorldRule {
    return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        description: name,
        kind,
        params,
        addedAt: Date.now(),
    };
}

describe('EpochSystem', () => {
    test('starts at epoch 1 with no rules', () => {
        const sys = new EpochSystem(1);
        expect(sys.epochNumber).toBe(1);
        expect(sys.activeRules.length).toBe(0);
        expect(sys.collapseCount).toBe(0);
    });

    test('addRule accumulates up to threshold then collapses', () => {
        const sys = new EpochSystem(1);
        for (let i = 0; i < 7; i++) {
            const r = sys.addRule(rule(`rule_${i}`, { x: i + 1 }));
            expect(r.collapsed).toBe(false);
        }
        const r = sys.addRule(rule('rule_7', { x: 8 }));
        expect(r.collapsed).toBe(true);
        expect(sys.epochNumber).toBe(2);
    });

    test('triggerCollapse produces relics and advances epoch', () => {
        const sys = new EpochSystem(1);
        sys.addRule(rule('fire_aura', { intensity: 5 }));
        sys.addRule(rule('shadow', { magnitude: 3 }, 'constraint'));
        const r = sys.triggerCollapse();
        expect(r.epoch).toBe(2);
        expect(r.newRelics.length).toBeGreaterThan(0);
        // The relic with bigger magnitude should be a buff
        const buff = r.newRelics.find(x => x.effect === 'buff');
        expect(buff).toBeDefined();
    });

    test('isAtThreshold flips one rule before the limit', () => {
        const sys = new EpochSystem(1);
        for (let i = 0; i < COLLAPSE_THRESHOLD - 1; i++) {
            sys.addRule(rule(`r${i}`, { x: 1 }));
        }
        expect(sys.isAtThreshold()).toBe(true);
    });

    test('relicMultiplier aggregates buffs and debuffs', () => {
        const sys = new EpochSystem(1);
        sys.addRule(rule('attack_up', { intensity: 10 }));
        sys.addRule(rule('def_down', { magnitude: 5 }, 'constraint'));
        const relics = sys.triggerCollapse().newRelics;
        expect(relics.length).toBeGreaterThan(0);
        const m = sys.relicMultiplier('damage');
        expect(m).toBeGreaterThan(1.0); // at least one buff
    });

    test('snapshot round-trip preserves state', () => {
        const sys = new EpochSystem(1);
        sys.addRule(rule('alpha', { x: 1 }));
        const snap = sys.snapshot();
        const restored = new EpochSystem(1);
        restored.load(snap);
        expect(restored.epochNumber).toBe(sys.epochNumber);
        expect(restored.activeRules.length).toBe(sys.activeRules.length);
    });
});

// Reach the constant from the test
const COLLAPSE_THRESHOLD = 8;
