/**
 * NpcMind.test.ts — TS-side mirror tests of cocos4-rust agi_minigame::npc.
 *
 * These tests intentionally mirror the Rust suite (`src/agi_minigame/npc.rs`
 * `#[cfg(test)] mod tests`) so any divergence between engine and game
 * layer surfaces immediately. When you change one, change both.
 */

import {
    NpcMind,
    NpcRegistry,
    defaultDisposition,
    makeEntry,
    NpcMemoryEntry,
} from './NpcMind';

const entry = (
    kind: NpcMemoryEntry['kind'],
    summary: string,
    turn: number,
    weight: number,
): NpcMemoryEntry => makeEntry(kind, summary, turn, weight);

describe('NpcMind', () => {
    test('new mind is empty and has default disposition', () => {
        const m = new NpcMind('npc_0');
        expect(m.id()).toBe('npc_0');
        expect(m.isEmpty()).toBe(true);
        expect(m.len()).toBe(0);
        expect(m.capacity()).toBe(NpcMind.DEFAULT_CAPACITY);
        expect(m.disposition()).toEqual(defaultDisposition());
        expect(m.mood()).toBe('neutral');
    });

    test('capacity wrap drops the oldest', () => {
        const m = new NpcMind('npc_0', 3);
        for (let i = 0; i < 5; i++) {
            m.remember(entry('dialogue', `d${i}`, i, 0.1));
        }
        expect(m.len()).toBe(3);
        const recent = m.recent(3);
        expect(recent.map(e => e.summary)).toEqual(['d2', 'd3', 'd4']);
    });

    test('zero capacity is a black hole', () => {
        const m = new NpcMind('npc_0', 0);
        m.remember(entry('dialogue', 'x', 0, 1.0));
        expect(m.len()).toBe(0);
        expect(m.disposition()).toEqual(defaultDisposition());
    });

    test('disposition clamps to unit interval', () => {
        const m = new NpcMind('npc_0');
        for (let i = 0; i < 50; i++) {
            m.remember(entry('received_gift', 'gift', i, 1.0));
        }
        const d = m.disposition();
        expect(d.friendly).toBeLessThanOrEqual(1.0);
        expect(d.friendly).toBeGreaterThanOrEqual(0.99);
        expect(d.trust).toBeLessThanOrEqual(1.0);
        expect(d.trust).toBeGreaterThanOrEqual(0.99);
        for (let i = 0; i < 50; i++) {
            m.remember(entry('hostility', 'hit', i, 1.0));
        }
        const d2 = m.disposition();
        expect(d2.friendly).toBeGreaterThanOrEqual(-1.0);
        expect(d2.fear).toBeLessThanOrEqual(1.0);
    });

    test('entry weight is clamped at construction', () => {
        expect(makeEntry('dialogue', 'x', 0, 2.5).weight).toBe(1.0);
        expect(makeEntry('dialogue', 'x', 0, -2.5).weight).toBe(-1.0);
    });

    test('recallByKind filters in insertion order', () => {
        const m = new NpcMind('npc_0');
        m.remember(entry('dialogue', 'a', 0, 0.1));
        m.remember(entry('received_gift', 'gift', 1, 0.5));
        m.remember(entry('dialogue', 'b', 2, 0.1));
        m.remember(entry('witnessed_event', 'w', 3, 0.1));
        const dialogues = m.recallByKind('dialogue');
        expect(dialogues.map(e => e.summary)).toEqual(['a', 'b']);
        expect(m.recallByKind('hostility')).toHaveLength(0);
    });

    test('mood thresholds match disposition', () => {
        const m = new NpcMind('npc_0');
        expect(m.mood()).toBe('neutral');
        // Two gifts → friendly cap +0.40+0.40 → 0.80, trust 0.60 → happy
        m.remember(entry('received_gift', 'gift', 0, 1.0));
        m.remember(entry('received_gift', 'gift', 1, 1.0));
        expect(m.mood()).toBe('happy');

        const m2 = new NpcMind('npc_1');
        for (let i = 0; i < 3; i++) {
            m2.remember(entry('hostility', 'hit', i, 1.0));
        }
        expect(m2.mood()).toBe('hostile');

        const m3 = new NpcMind('npc_2');
        m3.remember(entry('witnessed_event', 'earthquake', 0, 1.0)); // +0.15 fear
        m3.remember(entry('witnessed_event', 'fire', 1, 1.0));       // +0.30 fear
        expect(m3.mood()).toBe('uneasy');
    });

    test('suggestTopic routes by mood and last kind', () => {
        const happy = new NpcMind('happy');
        happy.remember(entry('received_gift', 'gift', 0, 1.0));
        happy.remember(entry('received_gift', 'gift', 1, 1.0));
        expect(happy.suggestTopic(0)).toBe('trade');

        const hostile = new NpcMind('hostile');
        for (let i = 0; i < 3; i++) hostile.remember(entry('hostility', 'hit', i, 1.0));
        expect(hostile.suggestTopic(0)).toBe('combat');

        const uneasy = new NpcMind('uneasy');
        uneasy.remember(entry('witnessed_event', 'boom', 0, 1.0));
        uneasy.remember(entry('witnessed_event', 'fire', 1, 1.0));
        expect(uneasy.suggestTopic(0)).toBe('lore');

        const neutral = new NpcMind('neutral');
        expect(neutral.suggestTopic(0)).toBe('greeting'); // seed 0, len 0 → idx 0
    });

    test('manual shift clamps', () => {
        const m = new NpcMind('npc_0');
        m.shiftDisposition(2.0, -3.0, 5.0);
        expect(m.disposition()).toEqual({ friendly: 1.0, fear: -1.0, trust: 1.0 });
    });

    test('clear resets everything', () => {
        const m = new NpcMind('npc_0');
        m.remember(entry('received_gift', 'g', 0, 1.0));
        expect(m.disposition().friendly).toBeGreaterThan(0);
        m.clear();
        expect(m.isEmpty()).toBe(true);
        expect(m.disposition()).toEqual(defaultDisposition());
    });
});

describe('NpcRegistry', () => {
    test('insert replaces same id', () => {
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('a', 8));
        reg.insert(new NpcMind('b', 8));
        expect(reg.len()).toBe(2);
        reg.insert(new NpcMind('a', 4));
        expect(reg.len()).toBe(2);
        expect(reg.get('a')!.capacity()).toBe(4);
    });

    test('broadcast records in every mind', () => {
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('a'));
        reg.insert(new NpcMind('b'));
        reg.insert(new NpcMind('c'));
        reg.broadcast(entry('heard_about_dimension', 'Neon Cascade', 0, 0.5));
        for (const id of ['a', 'b', 'c']) {
            const m = reg.get(id)!;
            expect(m.len()).toBe(1);
            expect(m.recent(1)[0].summary).toBe('Neon Cascade');
            expect(m.disposition().trust).toBeGreaterThan(0);
        }
    });

    test('averageDisposition aggregates', () => {
        const reg = new NpcRegistry();
        expect(reg.averageDisposition()).toEqual(defaultDisposition());
        const a = new NpcMind('a');
        a.shiftDisposition(1.0, 0.0, 0.0);
        const b = new NpcMind('b');
        b.shiftDisposition(-1.0, 0.5, 0.0);
        reg.insert(a);
        reg.insert(b);
        const avg = reg.averageDisposition();
        expect(Math.abs(avg.friendly - 0.0)).toBeLessThan(1e-6);
        expect(Math.abs(avg.fear - 0.25)).toBeLessThan(1e-6);
        expect(avg.trust).toBe(0);
    });

    test('recent(0) returns empty', () => {
        const m = new NpcMind('npc_0');
        m.remember(entry('dialogue', 'x', 0, 0.1));
        expect(m.recent(0)).toEqual([]);
    });
});
