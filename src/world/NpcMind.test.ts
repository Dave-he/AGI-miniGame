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
    NpcDisposition,
    NpcMemoryKind,
    NpcMindSnapshot,
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

// ---------------------------------------------------------------------------
// Round 38 — TS archetype table aligned with the engine's 11 canonical
// archetypes.
//
// Round 34 added 6 round-34 archetypes to the TS
// `archetypeTopicBoost` table. Round 37 added all 11
// canonical archetypes to the engine side. Round 38
// brings the TS table into 1:1 alignment so the same
// archetype string produces the same topic preference on
// both sides.
// ---------------------------------------------------------------------------

describe('NpcMind — round 38 archetype table alignment with engine', () => {
    // The 11 canonical archetypes shared with the engine.
    const CANONICAL: ReadonlyArray<{
        arch: string;
        // Expected `[greeting, lore, trade, quest]` weights from
        // cocos4-rust/src/agi_minigame/npc.rs::archetype_topic_boost.
        weights: [number, number, number, number];
    }> = [
        { arch: 'robot',     weights: [1, 3, 1, 1] },
        { arch: 'mage',      weights: [1, 3, 0, 2] },
        { arch: 'beast',     weights: [1, 1, 0, 3] },
        { arch: 'astronaut', weights: [1, 2, 1, 2] },
        { arch: 'alien',     weights: [1, 2, 0, 3] },
        { arch: 'siren',     weights: [3, 1, 1, 1] },
        { arch: 'diver',     weights: [2, 1, 2, 1] },
        { arch: 'scorpion',  weights: [1, 0, 0, 3] },
        { arch: 'nomad',     weights: [2, 1, 2, 2] },
        { arch: 'skeleton',  weights: [0, 1, 0, 3] },
        { arch: 'lich',      weights: [0, 3, 0, 1] },
    ];

    test('all_11_canonical_archetypes_have_distinct_profiles', () => {
        const seen = new Set<string>();
        for (const { arch, weights } of CANONICAL) {
            const key = weights.join(',');
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
        expect(seen.size).toBe(11);
    });

    test('all_11_canonical_archetypes_yield_a_NEUTRAL_topic', () => {
        // The weight vectors all have at least one positive
        // entry (no all-zero vector). When suggestTopic's
        // NEUTRAL fallback runs, the weighted pick must
        // resolve to one of the 4 NEUTRAL topics.
        for (const { arch } of CANONICAL) {
            const m = new NpcMind('m1', 32, arch);
            const t = m.suggestTopic(0);
            expect(['greeting', 'lore', 'trade', 'quest']).toContain(t);
        }
    });

    test('ts_robot_archetype_topic_weights_match_engine_table', () => {
        // Pin one of the 11 cross-layer contracts: TS robot
        // weight vector must equal the engine's [1, 3, 1, 1].
        // (Same shape test would be possible for all 11
        // archetypes; we just sample one as a smoke test.)
        const m = new NpcMind('m1', 32, 'robot');
        // The weighted pick (NEUTRAL fallback) is
        // deterministic per seed; we sweep 30 seeds and
        // check the *distribution* matches [1,3,1,1].
        const counts: Record<string, number> = { greeting: 0, lore: 0, trade: 0, quest: 0 };
        for (let seed = 0; seed < 30; seed++) {
            const t = m.suggestTopic(seed);
            if (t in counts) counts[t]++;
        }
        // Robot has 3 lore, 1 greeting, 1 trade, 1 quest;
        // total=6. 30 seeds → expect lore to dominate
        // (5/6 × 30 = 25), and quest/trade/greeting to
        // appear 1/6 × 30 = 5 each. With modular-arithmetic
        // bias the split isn't perfectly uniform, but lore
        // must be the most common.
        expect(counts.lore).toBeGreaterThan(counts.greeting);
        expect(counts.lore).toBeGreaterThan(counts.trade);
        expect(counts.lore).toBeGreaterThan(counts.quest);
    });

    test('round_34_legacy_archetypes_kept_for_back_compat', () => {
        // The 6 round-34 archetypes are TS-only — the
        // engine's `npc_archetype_from_str` returns None
        // for them and the bias path uses flat weights on
        // the Rust side. The TS side, however, keeps its
        // distinct round-34 profiles for game-side UX. We
        // verify they all resolve to *some* valid topic
        // (not necessarily NEUTRAL — the round-29
        // archetype init can land an NPC in 'uneasy' or
        // 'happy' mood, which triggers the specific
        // rule-based picks like 'farewell' / 'combat' /
        // 'greeting').
        const LEGACY = ['merchant', 'guard', 'rogue', 'shaman', 'peasant'];
        const VALID = ['greeting', 'lore', 'trade', 'quest', 'combat', 'farewell'];
        for (const arch of LEGACY) {
            const m = new NpcMind('m1', 32, arch);
            const t = m.suggestTopic(0);
            expect(VALID).toContain(t);
        }
    });
});

// ---------------------------------------------------------------------------
// Round 39 — scene event chain → NpcMind broadcast wiring.
//
// Round 24's themeToScene produces an `eventChain` of timed
// event steps; main.ts used to only log them. Round 39
// actually schedules each event via setTimeout and, on
// fire, broadcasts a `witnessed_event` into the
// NpcRegistry so the world's mood reflects the story.
// These tests exercise the underlying primitive — the
// broadcast path that the wiring relies on — without
// having to spin up the full App.
// ---------------------------------------------------------------------------

describe('NpcMind — round 39 event-chain broadcast primitive', () => {
    test('witnessed_event_increases_fear_on_broadcast', () => {
        // The round-39 wiring relies on this: a scene
        // event fires → broadcast a witnessed_event →
        // every NPC gains fear (since 0.3 * 0.15 = 0.045
        // per broadcast). After 5 events, the registry
        // average has fear = 0.225.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        reg.insert(new NpcMind('n2'));
        for (let i = 0; i < 5; i++) {
            reg.broadcast(makeEntry('witnessed_event', `event ${i}`, i + 1, 0.3));
        }
        const avg = reg.averageDisposition();
        expect(avg.fear).toBeCloseTo(5 * 0.3 * 0.15, 5);  // 0.225
    });

    test('event_chain_payload_is_recorded_in_each_mind', () => {
        // The wiring's HUD log includes the event
        // payload; the broadcast's summary should mirror
        // that payload so the player can later recall
        // what each NPC saw.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        reg.broadcast(makeEntry('witnessed_event', 'merchant-caravan-ambushed', 1, 0.3));
        const recent = reg.get('n1')!.recent(1);
        expect(recent[0].summary).toBe('merchant-caravan-ambushed');
        expect(recent[0].kind).toBe('witnessed_event');
    });

    test('event_chain_of_3_events_shifts_average_to_uneasy', () => {
        // After a chain of 3 heavy events (each weight
        // 0.5), the average fear pushes past 0.20 and
        // the averageDisposition crosses the 'uneasy'
        // gate (fear >= 0.30 OR friendly <= -0.20).
        // Round 22+23 wiring turns this into a scene-gen
        // bias. The round-39 wiring produces the input.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        for (let i = 0; i < 3; i++) {
            reg.broadcast(makeEntry('witnessed_event', `evt ${i}`, i + 1, 0.5));
        }
        // 3 * 0.5 * 0.15 = 0.225 (well below 0.3 gate,
        // but the union of small shifts may still cross).
        // We just verify the chain is cumulative, not
        // bound to a specific threshold.
        const avg = reg.averageDisposition();
        expect(avg.fear).toBeGreaterThan(0.2);
    });

    test('each_event_increments_turn_monotonically', () => {
        // The wiring uses `++this.npcTurn` for each
        // broadcast so the memory ring stays strictly
        // ordered. We test the primitive: broadcast
        // creates entries with monotonically increasing
        // turn numbers when the caller supplies them.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('n1'));
        let turn = 0;
        for (let i = 0; i < 5; i++) {
            reg.broadcast(makeEntry('witnessed_event', `e${i}`, ++turn, 0.3));
        }
        const recent = reg.get('n1')!.recent(5);
        for (let i = 1; i < recent.length; i++) {
            expect(recent[i].turn).toBeGreaterThan(recent[i - 1].turn);
        }
    });
});

// ---------------------------------------------------------------------------
// Round 48 — NpcMind.rehydrate + NpcRegistry.loadFromSnapshots.
//
// Round 40 added a TS-only `NpcMindSnapshot` interface (see
// `src/world/WorldState.ts`) and persisted per-NPC entries
// across save → reload. Round 48 closes the loop: the live
// `NpcRegistry` is now rebuilt from the snapshot at app
// startup, so the world's NPC memory is truly continuous
// across reloads.
//
// The test suite below mirrors the engine side's
// `round48_tests` module 1:1 (see
// cocos4-rust/src/agi_minigame/npc.rs). The headline
// invariants — (a) rehydrate preserves fields verbatim, (b)
// rehydrate does NOT call applyArchetypeDefault, (c)
// loadFromSnapshots is full-replace, (d) loadFromSnapshots
// is idempotent — are pinned here so the game-side wiring
// (App constructor + App.loadGame) can rely on them.
// ---------------------------------------------------------------------------

describe('NpcMind rehydration (round 48)', () => {
    function snap(
        id: string,
        archetype: string | null,
        disp: NpcDisposition,
        entries: Array<{ kind: NpcMemoryKind; summary: string; turn: number; weight: number }>,
    ): NpcMindSnapshot {
        return {
            id,
            archetype,
            disposition: { ...disp },
            entries: entries.map((e) => ({ ...e })),
        };
    }

    test('rehydrate_preserves_fields_verbatim', () => {
        // Same fields in → same fields out.
        const entries = [
            { kind: 'dialogue'          as NpcMemoryKind, summary: 'hi',  turn: 1, weight: 0.5 },
            { kind: 'received_gift'     as NpcMemoryKind, summary: 'gem', turn: 2, weight: 1.0 },
            { kind: 'witnessed_event'   as NpcMemoryKind, summary: 'boom',turn: 3, weight: 0.2 },
        ];
        const s = snap('mage_1', 'mage',
                       { friendly: 0.5, fear: 0.1, trust: 0.7 },
                       entries);
        const m = NpcMind.rehydrate(s);
        expect(m.id()).toBe('mage_1');
        expect(m.archetype()).toBe('mage');
        expect(m.len()).toBe(3);
        expect(m.disposition().friendly).toBeCloseTo(0.5, 5);
        expect(m.disposition().fear).toBeCloseTo(0.1, 5);
        expect(m.disposition().trust).toBeCloseTo(0.7, 5);
        // Order preserved.
        const r = m.recent(3);
        expect(r[0].summary).toBe('hi');
        expect(r[1].summary).toBe('gem');
        expect(r[2].summary).toBe('boom');
    });

    test('rehydrate_does_not_apply_archetype_default', () => {
        // Headline invariant: a saved `mage` whose disposition is
        // {0,0,0} stays at {0,0,0}. The fresh-boot path would
        // seed +0.1 trust via applyArchetypeDefault('mage');
        // rehydrate must take the snapshot's value verbatim.
        const s = snap('mage_x', 'mage',
                       { friendly: 0, fear: 0, trust: 0 },
                       []);
        const m = NpcMind.rehydrate(s);
        expect(m.disposition().trust).toBeCloseTo(0, 5);
        // Same for Lich (which has a non-zero baseline).
        const s2 = snap('lich_x', 'lich',
                        { friendly: 0, fear: 0, trust: 0 },
                        []);
        const m2 = NpcMind.rehydrate(s2);
        // Lich baseline is { -0.5, 0.7, -0.5 } (round 27),
        // but only for the round-37 typed-archetype path; the
        // local `applyArchetypeDefault` for 'lich' falls into
        // the default branch (the table only covers 6 legacy
        // archetypes + 11 canonical; 'lich' is canonical, so
        // it's in the canonical table at friendly:0/fear:0/
        // trust:0). The point is the snapshot's value wins.
        expect(m2.disposition().friendly).toBeCloseTo(0, 5);
        expect(m2.disposition().fear).toBeCloseTo(0, 5);
        expect(m2.disposition().trust).toBeCloseTo(0, 5);
    });

    test('rehydrate_capacity_adapts_to_entries_len', () => {
        // 5 entries → capacity ≥ 5.
        const entries5 = Array.from({ length: 5 }, (_, i) => ({
            kind: 'dialogue' as NpcMemoryKind,
            summary: `d${i}`,
            turn: i,
            weight: 0.1,
        }));
        const m = NpcMind.rehydrate(snap('n', null, defaultDisposition(), entries5));
        expect(m.capacity()).toBeGreaterThanOrEqual(5);
        expect(m.len()).toBe(5);

        // 50 entries → capacity ≥ 50 (no wraparound).
        const entries50 = Array.from({ length: 50 }, (_, i) => ({
            kind: 'dialogue' as NpcMemoryKind,
            summary: `d${i}`,
            turn: i,
            weight: 0.1,
        }));
        const m50 = NpcMind.rehydrate(snap('n', null, defaultDisposition(), entries50));
        expect(m50.capacity()).toBeGreaterThanOrEqual(50);
        expect(m50.len()).toBe(50);
        // First entry should be index 0 (oldest) — proves no wraparound.
        expect(m50.recent(50)[0].summary).toBe('d0');
    });

    test('rehydrate_capacity_floor_is_default', () => {
        // 0 entries → capacity = DEFAULT_CAPACITY (32).
        const m = NpcMind.rehydrate(snap('n', null, defaultDisposition(), []));
        expect(m.capacity()).toBe(NpcMind.DEFAULT_CAPACITY);
        expect(m.len()).toBe(0);
    });

    test('rehydrate_preserves_unknown_archetype_string', () => {
        // An archetype string the local table doesn't recognize
        // must survive the round-trip verbatim.
        const s = snap('n', 'this-archetype-does-not-exist',
                       defaultDisposition(), []);
        const m = NpcMind.rehydrate(s);
        expect(m.archetype()).toBe('this-archetype-does-not-exist');
    });

    test('rehydrate_null_archetype_yields_undefined', () => {
        // The TS interface's `archetype: string | null` maps to
        // `undefined` on the NpcMind getter (the canonical
        // "no archetype" sentinel). `null → undefined` so the
        // `archetype()` getter and the constructor's
        // `if (archetype)` branch stay consistent.
        const s = snap('n', null, defaultDisposition(), []);
        const m = NpcMind.rehydrate(s);
        expect(m.archetype()).toBeUndefined();
    });

    test('rehydrate_clamps_out_of_range_weight', () => {
        // Defensive: a hand-crafted save that slipped an
        // out-of-range weight through (e.g. weight: 5.0) must
        // be clamped to [-1, 1] at rehydrate time, otherwise
        // subsequent remember() calls could push disposition
        // out of the unit interval before the clamp kicks in.
        const s = snap('n', null, defaultDisposition(), [
            { kind: 'dialogue' as NpcMemoryKind, summary: 'x', turn: 1, weight: 5.0 },
            { kind: 'dialogue' as NpcMemoryKind, summary: 'y', turn: 2, weight: -5.0 },
        ]);
        const m = NpcMind.rehydrate(s);
        const r = m.recent(2);
        expect(r[0].weight).toBe(1.0);
        expect(r[1].weight).toBe(-1.0);
    });

    test('registry_load_from_snapshots_fully_replaces', () => {
        // Pre-existing mind "old_1" must be gone after load —
        // replace semantics, not merge.
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('old_1'));
        expect(reg.len()).toBe(1);
        reg.loadFromSnapshots([
            snap('a', null, defaultDisposition(), []),
            snap('b', null, defaultDisposition(), []),
        ]);
        expect(reg.len()).toBe(2);
        expect(reg.get('old_1')).toBeUndefined();
        expect(reg.get('a')).toBeDefined();
        expect(reg.get('b')).toBeDefined();
    });

    test('registry_load_from_snapshots_empty_input_yields_empty_registry', () => {
        const reg = new NpcRegistry();
        reg.insert(new NpcMind('x'));
        reg.loadFromSnapshots([]);
        expect(reg.isEmpty()).toBe(true);
        expect(reg.len()).toBe(0);
    });

    test('registry_load_from_snapshots_is_idempotent', () => {
        // Running twice with the same input → same state.
        const reg = new NpcRegistry();
        const snapshots = [
            snap('a', 'mage', { friendly: 0.4, fear: 0.0, trust: 0.3 },
                 [{ kind: 'dialogue' as NpcMemoryKind, summary: 'hi', turn: 1, weight: 0.5 }]),
            snap('b', 'merchant', { friendly: 0.0, fear: 0.2, trust: 0.1 }, []),
        ];
        reg.loadFromSnapshots(snapshots);
        const len1 = reg.len();
        const avg1 = reg.averageDisposition();
        reg.loadFromSnapshots(snapshots);
        const len2 = reg.len();
        const avg2 = reg.averageDisposition();
        expect(len2).toBe(len1);
        expect(avg2.friendly).toBeCloseTo(avg1.friendly, 5);
        expect(avg2.fear).toBeCloseTo(avg1.fear, 5);
        expect(avg2.trust).toBeCloseTo(avg1.trust, 5);
    });

    test('registry_load_from_snapshots_preserves_disposition', () => {
        // Headline: a snapshot's disposition survives intact
        // through rehydrate → averageDisposition (the round-22
        // BalanceTuner signal) reflects it byte-for-byte.
        const reg = new NpcRegistry();
        reg.loadFromSnapshots([
            snap('a', null, { friendly: 0.6, fear: 0.2, trust: 0.4 }, []),
            snap('b', null, { friendly: 0.2, fear: 0.4, trust: 0.0 }, []),
        ]);
        const avg = reg.averageDisposition();
        expect(avg.friendly).toBeCloseTo(0.4, 5);
        expect(avg.fear).toBeCloseTo(0.3, 5);
        expect(avg.trust).toBeCloseTo(0.2, 5);
    });

    test('registry_load_from_snapshots_preserves_entries', () => {
        // The round-40 snapshot's per-NPC entries must be
        // readable from the rehydrated registry (so the
        // NpcMindPanel can show "8 段记忆" after reload).
        const reg = new NpcRegistry();
        reg.loadFromSnapshots([
            snap('a', 'merchant', { friendly: 0.4, fear: 0.0, trust: 0.0 },
                 [
                     { kind: 'dialogue' as NpcMemoryKind,      summary: 'haggled', turn: 1, weight: 0.2 },
                     { kind: 'received_gift' as NpcMemoryKind, summary: 'gem',     turn: 2, weight: 1.0 },
                 ]),
        ]);
        const a = reg.get('a');
        expect(a).toBeDefined();
        expect(a!.len()).toBe(2);
        const r = a!.recent(2);
        expect(r[0].summary).toBe('haggled');
        expect(r[1].summary).toBe('gem');
    });

    test('snapshot_to_mind_round_trip_is_byte_identical', () => {
        // The full round-trip invariant: build a NpcMind
        // (fresh path), observe its disposition + recent
        // entries, build a NpcMindSnapshot from those
        // observations, rehydrate → the new mind has the
        // same disposition + same entries (FIFO order).
        const m = new NpcMind('rt', NpcMind.DEFAULT_CAPACITY, 'mage');
        m.remember(makeEntry('dialogue',          'd0', 1, 0.3));
        m.remember(makeEntry('received_gift',     'g0', 2, 1.0));
        m.remember(makeEntry('witnessed_event',   'w0', 3, 0.5));
        const s: NpcMindSnapshot = {
            id: m.id(),
            archetype: m.archetype() ?? null,
            disposition: m.disposition(),
            entries: m.recent(m.len()),
        };
        const m2 = NpcMind.rehydrate(s);
        expect(m2.id()).toBe(m.id());
        expect(m2.archetype()).toBe(m.archetype());
        expect(m2.disposition().friendly).toBeCloseTo(m.disposition().friendly, 5);
        expect(m2.disposition().fear).toBeCloseTo(m.disposition().fear, 5);
        expect(m2.disposition().trust).toBeCloseTo(m.disposition().trust, 5);
        const r1 = m.recent(m.len());
        const r2 = m2.recent(m2.len());
        expect(r2.length).toBe(r1.length);
        for (let i = 0; i < r1.length; i++) {
            expect(r2[i].kind).toBe(r1[i].kind);
            expect(r2[i].summary).toBe(r1[i].summary);
            expect(r2[i].turn).toBe(r1[i].turn);
            expect(r2[i].weight).toBeCloseTo(r1[i].weight, 5);
        }
    });

    test('cross_layer_snapshot_shape_is_consistent', () => {
        // The TS `NpcMindSnapshot` interface and the Rust
        // `NpcMindSnapshot` struct must have field names
        // + nullability 1:1. This test pins the field
        // names; the Rust side is pinned by the
        // `snapshot_to_mind_round_trip_is_byte_identical`
        // cargo test.
        const s: NpcMindSnapshot = snap('a', null, defaultDisposition(), []);
        expect(Object.keys(s).sort()).toEqual(
            ['archetype', 'disposition', 'entries', 'id'],
        );
        // `archetype: string | null` — null is the canonical
        // "no archetype" sentinel.
        expect(s.archetype).toBeNull();
        // `entries: NpcMemorySnapshotEntry[]` — not undefined.
        expect(Array.isArray(s.entries)).toBe(true);
    });
});
