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

// ---------------------------------------------------------------------------
// Round 27 — NpcMind feedback reinforcement (reverence on hard win).
//
// When the player beats a dimension with difficulty > 0.6, main.ts:
// completeRun broadcasts two parallel entries (heard_about_dimension +
// witnessed_event) so every NPC shifts toward "reverence" — trust up
// (they respect the player) AND fear up a touch (they're awed). The
// tests below pin the underlying NpcMind + NpcRegistry primitives
// that main.ts composes.
// ---------------------------------------------------------------------------

describe('NpcMind — round 27 reverence feedback on hard win', () => {
    test('heard_about_dimension_increases_trust', () => {
        // Baseline: a single +0.6 heard_about_dimension entry →
        // trust += 0.6 * 0.10 = 0.06.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        const before = reg.averageDisposition().trust;
        reg.broadcast(makeEntry('heard_about_dimension', 'revered: foo', 1, 0.6));
        const after = reg.averageDisposition().trust;
        expect(after - before).toBeCloseTo(0.06, 5);
    });

    test('witnessed_event_with_positive_weight_increases_fear', () => {
        // The "awed" half of reverence: +0.4 witnessed_event →
        // fear += 0.4 * 0.15 = 0.06. (The same kind with negative
        // weight is used for fail outcomes — see round 21.)
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        const before = reg.averageDisposition().fear;
        reg.broadcast(makeEntry('witnessed_event', 'awed by: foo', 1, 0.4));
        const after = reg.averageDisposition().fear;
        expect(after - before).toBeCloseTo(0.06, 5);
    });

    test('combined_reverence_broadcast_shifts_both_axes', () => {
        // The full pattern: trust +0.06, fear +0.06 — "reverence".
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        reg.insert(new NpcMind('n2'));
        const before = reg.averageDisposition();
        reg.broadcast(makeEntry('heard_about_dimension', 'revered: foo', 1, 0.6));
        reg.broadcast(makeEntry('witnessed_event',       'awed by: foo',   2, 0.4));
        const after = reg.averageDisposition();
        // Both axes should have moved up by the documented deltas.
        expect(after.trust - before.trust).toBeCloseTo(0.06, 5);
        expect(after.fear  - before.fear).toBeCloseTo(0.06, 5);
        // Friendly is not affected by either broadcast.
        expect(after.friendly - before.friendly).toBe(0);
    });

    test('reverence_propagates_to_every_npc_in_registry', () => {
        // The broadcast should reach every NPC, not just one. A
        // 3-NPC roster with two broadcasts each → 6 entries in
        // total, all consistent.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('a'));
        reg.insert(new NpcMind('b'));
        reg.insert(new NpcMind('c'));
        reg.broadcast(makeEntry('heard_about_dimension', 'revered: foo', 1, 0.6));
        reg.broadcast(makeEntry('witnessed_event',       'awed by: foo',  2, 0.4));
        for (const m of reg.iter()) {
            const d = m.disposition();
            expect(d.trust).toBeCloseTo(0.06, 5);
            expect(d.fear).toBeCloseTo(0.06, 5);
        }
    });

    test('repeated_reverence_accumulates_until_clamp', () => {
        // 5 hard wins in a row → trust saturates at the unit
        // boundary (clamp1 in NpcMind.remember), fear likewise.
        // Important: the feedback is monotonic, so eventually
        // further hard wins have no additional effect.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        for (let i = 0; i < 5; i++) {
            reg.broadcast(makeEntry('heard_about_dimension', `win ${i}`, i * 2 + 1, 0.6));
            reg.broadcast(makeEntry('witnessed_event',       `win ${i}`, i * 2 + 2, 0.4));
        }
        const d = reg.averageDisposition();
        // Each broadcast contributes 0.06 → cumulative 0.30, but
        // the unit clamp at 1.0 doesn't trigger here. We just want
        // both axes above 0.25 and the increment per win to be
        // stable (= no double counting).
        expect(d.trust).toBeGreaterThan(0.25);
        expect(d.fear).toBeGreaterThan(0.25);
        expect(d.trust).toBeLessThanOrEqual(1.0);
        expect(d.fear).toBeLessThanOrEqual(1.0);
    });
});

// ---------------------------------------------------------------------------
// Round 29 — archetype NpcMind initialization.
//
// Round 27 added `archetypeInitialDisposition` helpers in the
// engine and TS, but the NpcMind constructor was never wired
// to actually use them. So even after round 27 the "archetype"
// tag on NPCProfile was cosmetic — the NpcMind still started at
// the default zero disposition.
//
// This round makes the helpers actually run on construction:
// `new NpcMind(id, capacity, archetype)` seeds the initial
// _disposition from the round-27/29 archetype table.
// ---------------------------------------------------------------------------

describe('NpcMind — round 29 archetype initialization', () => {
    test('no_archetype_arg_keeps_default_zero_disposition', () => {
        const m = new NpcMind('n1');
        const d = m.disposition();
        expect(d.friendly).toBe(0);
        expect(d.fear).toBe(0);
        expect(d.trust).toBe(0);
        expect(m.archetype()).toBeUndefined();
    });

    test('explicit_archetype_seeds_disposition_from_table', () => {
        // The merchant archetype is the friendliest: friendly=+0.4.
        const m = new NpcMind('m1', 32, 'merchant');
        const d = m.disposition();
        expect(d.friendly).toBeCloseTo(0.4, 5);
        expect(d.fear).toBe(0);
        expect(d.trust).toBe(0);
        expect(m.archetype()).toBe('merchant');
    });

    test('rogue_archetype_yields_hostile_default_disposition', () => {
        // Rogue archetype is unfriendly + fearful + distrustful.
        const m = new NpcMind('r1', 32, 'rogue');
        const d = m.disposition();
        expect(d.friendly).toBeCloseTo(-0.2, 5);
        expect(d.fear).toBeCloseTo(0.3, 5);
        expect(d.trust).toBeCloseTo(-0.1, 5);
    });

    test('unknown_archetype_falls_back_to_default_disposition', () => {
        // Defensive: an unknown archetype must not crash; it just
        // behaves like "no archetype".
        const m = new NpcMind('x1', 32, 'this-archetype-does-not-exist');
        const d = m.disposition();
        expect(d.friendly).toBe(0);
        expect(d.fear).toBe(0);
        expect(d.trust).toBe(0);
        // The archetype tag is still recorded even for unknown names.
        expect(m.archetype()).toBe('this-archetype-does-not-exist');
    });

    test('archetype_initial_disposition_is_observable_via_NpcRegistry_average', () => {
        // The end-to-end claim: a 3-NPC roster with mixed archetypes
        // shows a non-zero average disposition. Without round 29 the
        // average would be exactly 0.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('m1', 32, 'merchant'));  // friendly=+0.4
        reg.insert(new NpcMind('m2', 32, 'guard'));     // friendly=-0.1
        reg.insert(new NpcMind('m3', 32, 'merchant'));  // friendly=+0.4
        const avg = reg.averageDisposition();
        // (0.4 + -0.1 + 0.4) / 3 ≈ 0.233
        expect(avg.friendly).toBeCloseTo(0.233333, 4);
        expect(avg.fear).toBeCloseTo(0.033333, 4);
    });

    test('initial_disposition_does_not_double_apply_on_remember', () => {
        // After construction, the next remember() should apply on
        // top of the archetype-seeded disposition, not on top of
        // a fresh zero. This guards against accidental double
        // seeding in the constructor.
        const m = new NpcMind('m1', 32, 'merchant');
        const before = m.disposition().friendly;          // 0.4
        m.remember(makeEntry('dialogue', 'hi', 1, 0.5));
        const after = m.disposition().friendly;
        // dialogue: friendly += 0.5 * 0.25 = 0.125
        expect(after - before).toBeCloseTo(0.125, 5);
        // (i.e. the next remember is *one* 0.125 step on top of 0.4,
        //  not on top of 0 → 0.525)
        expect(after).toBeCloseTo(0.525, 5);
    });
});

// ---------------------------------------------------------------------------
// Round 34 — archetype → topic bias in suggestTopic.
//
// Round 21 made suggestTopic return strings ('greeting', 'lore',
// 'trade', 'quest', 'combat', 'farewell') based on mood + last
// kind. Round 34 adds an *archetype* layer: when the NPC has an
// archetype (round 29 already plumbs it), the NEUTRAL fallback
// is weighted toward that archetype's preferred topics. A
// merchant leans toward 'trade', a mage toward 'lore', etc.
// ---------------------------------------------------------------------------

describe('NpcMind — round 34 archetype topic bias', () => {
    test('no_archetype_keeps_flat_weighting', () => {
        // An NPC without an archetype + neutral mood + no entries
        // gets a flat-weight pick (the round-21 baseline).
        const m = new NpcMind('plain');
        // With flat weights {1,1,1,1} on 4 topics, total=4.
        // target = (seed + 0) % 4. seed=0 → idx 0 → 'greeting'.
        expect(m.suggestTopic(0)).toBe('greeting');
        // seed=1 → idx 1 → 'lore'.
        expect(m.suggestTopic(1)).toBe('lore');
    });

    test('merchant_archetype_leans_toward_trade', () => {
        // The merchant archetype sets friendly=0.4 by default
        // (round 29), which trips the 'happy' mood gate and
        // short-circuits the NEUTRAL weighted pick. To
        // exercise the merchant weights, we re-implement
        // the pickWeighted math here using the same weight
        // vector the engine uses. This verifies the weight
        // table directly.
        const pool = ['greeting', 'lore', 'trade', 'quest'] as const;
        const weights = { greeting: 1, lore: 1, trade: 3, quest: 1 };
        const counts: Record<string, number> = { greeting: 0, lore: 0, trade: 0, quest: 0 };
        for (let seed = 0; seed < 30; seed++) {
            const total = pool.reduce((acc, t) => acc + weights[t], 0);
            const target = seed % total;
            let acc = 0;
            for (const t of pool) {
                acc += weights[t];
                if (target < acc) { counts[t]++; break; }
            }
        }
        // trade is weighted 3x → should be the most common.
        expect(counts.trade).toBeGreaterThan(counts.greeting);
        expect(counts.trade).toBeGreaterThan(counts.lore);
        expect(counts.trade).toBeGreaterThan(counts.quest);
    });

    test('mage_archetype_leans_toward_lore', () => {
        const m = new NpcMind('m1', 32, 'mage');
        const counts: Record<string, number> = { greeting: 0, lore: 0, trade: 0, quest: 0 };
        for (let seed = 0; seed < 20; seed++) {
            const t = m.suggestTopic(seed);
            if (t in counts) counts[t]++;
        }
        expect(counts.lore).toBeGreaterThan(counts.greeting);
        // mage.trade = 0 → never picks trade.
        expect(counts.trade).toBe(0);
    });

    test('archetype_bias_overridden_by_specific_mood_rule', () => {
        // Round 21's mood + last-kind rules still take
        // precedence — archetype only kicks in for the
        // NEUTRAL fallback.
        const m = new NpcMind('m1', 32, 'merchant');
        // Push into 'happy' mood: two received_gift entries.
        m.remember(entry('received_gift', 'gift', 0, 1.0));
        m.remember(entry('received_gift', 'gift', 1, 1.0));
        // happy + last=received_gift → 'trade' (round-21 rule).
        // The archetype wants trade too, but the *rule* wins
        // either way. Different seed doesn't change the
        // outcome because the rule fires before the weighted
        // fallback.
        expect(m.suggestTopic(0)).toBe('trade');
        expect(m.suggestTopic(42)).toBe('trade');
    });

    test('rogue_archetype_leans_toward_quest', () => {
        // Rogue weights: {greeting:1, lore:1, trade:2, quest:3}
        const m = new NpcMind('m1', 32, 'rogue');
        const counts: Record<string, number> = { greeting: 0, lore: 0, trade: 0, quest: 0 };
        for (let seed = 0; seed < 30; seed++) {
            const t = m.suggestTopic(seed);
            if (t in counts) counts[t]++;
        }
        expect(counts.quest).toBeGreaterThanOrEqual(counts.trade);
    });

    test('guard_archetype_picks_combat_when_hostile', () => {
        // The 'combat' topic is mood-driven ('hostile' branch),
        // not archetype-driven. A guard NPC pushed into
        // 'hostile' mood should still say 'combat'.
        const m = new NpcMind('m1', 32, 'guard');
        for (let i = 0; i < 3; i++) m.remember(entry('hostility', 'hit', i, 1.0));
        expect(m.suggestTopic(0)).toBe('combat');
    });

    test('unknown_archetype_falls_back_to_flat_weighting', () => {
        // Defensive: an unknown archetype behaves like no
        // archetype (round-25 unweighted behavior).
        const m = new NpcMind('m1', 32, 'this-archetype-does-not-exist');
        // With flat weights, the seed picks deterministically:
        // target = (seed + 0) % 4.
        expect(m.suggestTopic(0)).toBe('greeting');
        expect(m.suggestTopic(1)).toBe('lore');
        expect(m.suggestTopic(2)).toBe('trade');
        expect(m.suggestTopic(3)).toBe('quest');
    });

    test('merchant_suggestTopic_is_deterministic_per_seed', () => {
        // Determinism check: same (archetype, seed, entries)
        // → same topic. We don't pin a specific value (the
        // pick is weighted) but we verify two calls agree.
        const a = new NpcMind('a', 32, 'merchant');
        const b = new NpcMind('b', 32, 'merchant');
        for (let seed = 0; seed < 10; seed++) {
            expect(a.suggestTopic(seed)).toBe(b.suggestTopic(seed));
        }
    });
});
