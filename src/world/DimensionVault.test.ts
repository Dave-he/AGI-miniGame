/**
 * DimensionVault tests — mirror of the cocos4-rust
 * `agi_minigame::vault::round20_tests` suite.
 */

import { DimensionVault } from './DimensionVault';
import type { DimensionBlueprint } from '../ai/AIEngine';

function makeBlueprint(id: string, theme: string, atoms: string[] = ['match3']): DimensionBlueprint {
    return {
        id,
        name: `${id} name`,
        description: `${id} desc`,
        atomIds: atoms,
        atomWeights: {},
        difficulty: 0.5,
        rules: [],
        rewards: [],
        theme: {
            name: theme,
            visualStyle: `${theme}-style`,
            musicMood: 'neutral',
            colorPalette: ['#000'],
        },
        timeLimitSecs: 60,
        objectives: [],
    };
}

describe('DimensionVault', () => {
    test('new vault is empty', () => {
        const v = new DimensionVault();
        expect(v.len()).toBe(0);
        expect(v.isEmpty()).toBe(true);
        expect(v.getCapacity()).toBe(64);
        expect(v.recent(5)).toEqual([]);
        expect(v.stats().totalVisits).toBe(0);
        expect(v.stats().completionRate).toBe(0);
    });

    test('record then recent returns visits in chronological order', () => {
        const v = new DimensionVault(4);
        const a = makeBlueprint('a', 't1');
        const b = makeBlueprint('b', 't2');
        v.record(a, 'completed', 100);
        v.record(b, 'failed', 200);
        const recent = v.recent(2);
        expect(recent).toHaveLength(2);
        expect(recent[0].blueprintId).toBe('a');
        expect(recent[1].blueprintId).toBe('b');
    });

    test('ring drops oldest when full', () => {
        const v = new DimensionVault(2);
        const a = makeBlueprint('a', 't');
        const b = makeBlueprint('b', 't');
        const c = makeBlueprint('c', 't');
        v.record(a, 'completed', 1);
        v.record(b, 'completed', 2);
        v.record(c, 'completed', 3);
        expect(v.len()).toBe(2);
        const recent = v.recent(10);
        expect(recent[0].blueprintId).toBe('b');
        expect(recent[1].blueprintId).toBe('c');
    });

    test('capacity zero is a black hole', () => {
        const v = new DimensionVault(0);
        v.record(makeBlueprint('a', 't'), 'completed', 1);
        expect(v.isEmpty()).toBe(true);
        expect(v.recent(1)).toEqual([]);
    });

    test('lastOutcomeFor returns the most recent match', () => {
        const v = new DimensionVault();
        const a = makeBlueprint('a', 't');
        v.record(a, 'failed', 1);
        v.record(a, 'completed', 2);
        expect(v.lastOutcomeFor('a')).toBe('completed');
        expect(v.lastOutcomeFor('nope')).toBeNull();
    });

    test('stats counts distinct themes and outcomes', () => {
        const v = new DimensionVault();
        v.record(makeBlueprint('a', 'ice'), 'completed', 1);
        v.record(makeBlueprint('b', 'fire'), 'failed', 2);
        v.record(makeBlueprint('a', 'ice'), 'abandoned', 3);
        const s = v.stats();
        expect(s.totalVisits).toBe(3);
        expect(s.distinctBlueprints).toBe(2);
        expect(s.distinctThemes).toBe(2);
        expect(s.completed).toBe(1);
        expect(s.failed).toBe(1);
        expect(s.abandoned).toBe(1);
        expect(s.completionRate).toBeCloseTo(1 / 3, 5);
    });

    test('suggestNext returns null for empty candidates', () => {
        const v = new DimensionVault();
        expect(v.suggestNext([], 2, 0)).toBeNull();
    });

    test('suggestNext picks a fresh blueprint when possible', () => {
        const v = new DimensionVault();
        v.record(makeBlueprint('a', 't'), 'completed', 1);
        const pool = [
            makeBlueprint('a', 't'),
            makeBlueprint('b', 't'),
            makeBlueprint('c', 't'),
        ];
        const pick = v.suggestNext(pool, 1, 0);
        expect(pick).not.toBeNull();
        expect(pick!.id === 'b' || pick!.id === 'c').toBe(true);
    });

    test('suggestNext picks least recent when all seen', () => {
        const v = new DimensionVault(4);
        v.record(makeBlueprint('a', 't'), 'completed', 1);
        v.record(makeBlueprint('b', 't'), 'completed', 2);
        v.record(makeBlueprint('a', 't'), 'completed', 3);
        // "a" was visited at t=3 (most recent); "b" was visited at t=2.
        // "b" should be chosen because its last visit is older.
        const pick = v.suggestNext(
            [makeBlueprint('a', 't'), makeBlueprint('b', 't')],
            4, 0,
        );
        expect(pick).not.toBeNull();
        expect(pick!.id).toBe('b');
    });

    test('suggestNext handles completely unseen candidates', () => {
        const v = new DimensionVault();
        const pool = [makeBlueprint('a', 't'), makeBlueprint('b', 't')];
        const pick = v.suggestNext(pool, 4, 0);
        expect(pick).not.toBeNull();
        expect(['a', 'b']).toContain(pick!.id);
    });

    test('clear resets entries but keeps capacity', () => {
        const v = new DimensionVault(8);
        v.record(makeBlueprint('a', 't'), 'completed', 1);
        v.clear();
        expect(v.isEmpty()).toBe(true);
        expect(v.getCapacity()).toBe(8);
    });

    test('recentThemes returns themes newest first', () => {
        const v = new DimensionVault();
        v.record(makeBlueprint('a', 'ice'), 'completed', 1);
        v.record(makeBlueprint('b', 'fire'), 'failed', 2);
        v.record(makeBlueprint('c', 'ice'), 'completed', 3);
        expect(v.recentThemes(2)).toEqual(['ice', 'fire']);
    });

    test('default timestamp is the current time', () => {
        const v = new DimensionVault();
        const before = Date.now();
        v.record(makeBlueprint('a', 't'), 'completed');
        const after = Date.now();
        const e = v.recent(1)[0];
        expect(e.timestampMs).toBeGreaterThanOrEqual(before);
        expect(e.timestampMs).toBeLessThanOrEqual(after);
    });

    test('snapshot returns a defensive copy', () => {
        const v = new DimensionVault();
        v.record(makeBlueprint('a', 't'), 'completed', 1);
        const snap = v.snapshot();
        snap.pop();
        expect(v.len()).toBe(1);
    });
});
