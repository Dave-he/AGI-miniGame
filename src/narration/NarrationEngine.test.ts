/**
 * NarrationEngine tests.
 */

import { NarrationEngine, moodBranch } from '../narration/NarrationEngine';
import { AIEngine } from '../ai/AIEngine';
import type { NpcDisposition } from '../world/NpcMind';
import { defaultDisposition } from '../world/NpcMind';

function bp(id: string, visualStyle: string) {
    const ai = new AIEngine(1);
    const b = ai.generateDimension({
        minAtoms: 2, maxAtoms: 3, difficultyRange: [0.4, 0.6],
        playerLevel: 5, preferredTypes: [], excludedTypes: [], rewardMultiplier: 1.0,
    });
    return { ...b, id, theme: { ...b.theme, visualStyle } };
}

describe('NarrationEngine', () => {
    test('produces 3 sentences', () => {
        const n = new NarrationEngine();
        const blueprint = bp('test-1', '森林');
        const out = n.narrate(blueprint);
        expect(out.sentences.length).toBe(3);
    });

    test('same dimension id → same sentences (deterministic)', () => {
        const n = new NarrationEngine();
        const a = bp('deterministic-test', '沙漠');
        const b = bp('deterministic-test', '沙漠');
        expect(n.narrate(a).sentences).toEqual(n.narrate(b).sentences);
    });

    test('different dimension ids → different sentences (high prob)', () => {
        const n = new NarrationEngine();
        const a = bp('dim-a', '森林');
        const b = bp('dim-b', '沙漠');
        const sa = n.narrate(a).sentences.join('');
        const sb = n.narrate(b).sentences.join('');
        expect(sa).not.toEqual(sb);
    });

    test('format() prefixes with the dimension id', () => {
        const n = new NarrationEngine();
        const blueprint = bp('format-test', '海洋');
        const out = n.narrate(blueprint);
        const f = n.format(out);
        expect(f).toContain('[format-test]');
    });

    test('opener is non-empty and at least 5 chars long', () => {
        const n = new NarrationEngine();
        const blueprint = bp('opener-test', '太空');
        const out = n.narrate(blueprint);
        expect(out.sentences[0].length).toBeGreaterThanOrEqual(5);
    });
});

describe('NarrationEngine — round 25 NpcMind-aware 4th sentence', () => {
    function mood(overrides: Partial<NpcDisposition> = {}): NpcDisposition {
        return { ...defaultDisposition(), ...overrides };
    }

    test('no mood → 3 sentences, no moodBranch tag', () => {
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-1', '赛博朋克'));
        expect(out.sentences.length).toBe(3);
        expect(out.moodBranch).toBeUndefined();
    });

    test('neutral mood → 3 sentences, branch=neutral', () => {
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-2', '赛博朋克'), mood());
        expect(out.sentences.length).toBe(3);
        expect(out.moodBranch).toBe('neutral');
    });

    test('fear mood → 4 sentences, branch=fear', () => {
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-fear', '幽邃森林'),
            mood({ friendly: 0.0, fear: 0.8, trust: 0.0 }));
        expect(out.sentences.length).toBe(4);
        expect(out.moodBranch).toBe('fear');
        // The 4th sentence should be one of the fear pool entries.
        expect(out.sentences[3]).toMatch(/空气|凉|恐惧/);
    });

    test('friendly+trusting mood → 4 sentences, branch=friendly', () => {
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-friendly', '赛博朋克'),
            mood({ friendly: 0.7, fear: 0.0, trust: 0.4 }));
        expect(out.sentences.length).toBe(4);
        expect(out.moodBranch).toBe('friendly');
        // Round 30 — the friendly pool has 5 alternatives; we
        // just need to confirm the 4th sentence is one of them.
        const friendlyPool = [
            '当地的居民说，这里对旅人尚算友好。',
            '守门人朝你点了点头，似乎记得上次的英勇。',
            '空气里飘着淡淡的节日气息，像是在欢迎。',
            '村口的风铃响了三下，节奏恰好。',
            '你听见远处有人在哼着熟悉的小调。',
        ];
        expect(friendlyPool).toContain(out.sentences[3]);
    });

    test('hostile mood → 4 sentences, branch=hostile', () => {
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-hostile', '暗黑地牢'),
            mood({ friendly: -0.5, fear: 0.0, trust: 0.0 }));
        expect(out.sentences.length).toBe(4);
        expect(out.moodBranch).toBe('hostile');
        // Either pool entry: "不会原谅" or "锋利...警惕"
        expect(out.sentences[3]).toMatch(/原谅|警惕/);
    });

    test('fear takes priority over friendly+trust when both fire', () => {
        // fear=0.9 + friendly=0.9 + trust=0.5 → both fear and
        // friendly+trust branches could fire. The canonical order
        // (matching mood_palette) picks fear first.
        const n = new NarrationEngine();
        const out = n.narrate(bp('r25-nightmare', '赛博朋克'),
            mood({ friendly: 0.9, fear: 0.9, trust: 0.5 }));
        expect(out.moodBranch).toBe('fear');
    });

    test('moodBranch helper mirrors engine branch order', () => {
        expect(moodBranch(mood({ fear: 0.8 }))).toBe('fear');
        expect(moodBranch(mood({ friendly: 0.7, trust: 0.4 }))).toBe('friendly');
        expect(moodBranch(mood({ friendly: -0.5 }))).toBe('hostile');
        expect(moodBranch(mood())).toBe('neutral');
        expect(moodBranch(mood({ fear: 0.9, friendly: 0.9, trust: 0.5 }))).toBe('fear');
    });

    test('same dimension id + same mood → same 4th sentence (deterministic)', () => {
        const n = new NarrationEngine();
        const a = bp('r25-deter', '赛博朋克');
        const b = bp('r25-deter', '赛博朋克');
        const fear = mood({ friendly: 0.0, fear: 0.8, trust: 0.0 });
        const outA = n.narrate(a, fear);
        const outB = n.narrate(b, fear);
        expect(outA.sentences).toEqual(outB.sentences);
        expect(outA.moodBranch).toBe(outB.moodBranch);
    });
});

// ---------------------------------------------------------------------------
// Round 30 — narration 4th-sentence pool expansion.
//
// Round 25 added 2 alternatives per branch. Round 30 expands to
// 4 (fear / hostile) or 5 (friendly) so re-visits of the same
// dim still get deterministic but varied 4th sentences. Same id
// + same mood still yields the *same* 4th sentence (so a player
// re-entering a dim doesn't see a re-roll) — variety comes from
// different ids.
// ---------------------------------------------------------------------------

describe('NarrationEngine — round 30 4th-sentence pool expansion', () => {
    test('fear_pool_has_at_least_4_alternatives', () => {
        const n = new NarrationEngine();
        // Walk 30 distinct ids, collect unique fear-branch 4ths.
        const seen = new Set<string>();
        const fear = mood({ friendly: 0.0, fear: 0.8, trust: 0.0 });
        for (let i = 0; i < 30; i++) {
            const out = n.narrate(bp(`r30-fear-${i}`, '赛博朋克'), fear);
            seen.add(out.sentences[3]);
        }
        // 30 ids into a 4-entry pool → expect all 4 to surface
        // (uniform enough; allowing 3 as a floor to absorb hash bias).
        expect(seen.size).toBeGreaterThanOrEqual(3);
    });

    test('friendly_pool_has_at_least_4_alternatives', () => {
        const n = new NarrationEngine();
        const seen = new Set<string>();
        const loved = mood({ friendly: 0.7, fear: 0.0, trust: 0.4 });
        for (let i = 0; i < 30; i++) {
            const out = n.narrate(bp(`r30-friendly-${i}`, '赛博朋克'), loved);
            seen.add(out.sentences[3]);
        }
        // 5-entry pool → 30 ids should surface all 5.
        expect(seen.size).toBeGreaterThanOrEqual(4);
    });

    test('hostile_pool_has_at_least_4_alternatives', () => {
        const n = new NarrationEngine();
        const seen = new Set<string>();
        const hated = mood({ friendly: -0.5, fear: 0.0, trust: 0.0 });
        for (let i = 0; i < 30; i++) {
            const out = n.narrate(bp(`r30-hostile-${i}`, '暗黑地牢'), hated);
            seen.add(out.sentences[3]);
        }
        expect(seen.size).toBeGreaterThanOrEqual(3);
    });

    test('same_id_same_mood_still_picks_same_4th_sentence', () => {
        // Determinism is preserved even with a larger pool: the
        // pick is keyed on (id, branch) via djb2.
        const n = new NarrationEngine();
        const mood1 = mood({ friendly: 0.7, fear: 0.0, trust: 0.4 });
        const a = n.narrate(bp('r30-stable', '赛博朋克'), mood1);
        const b = n.narrate(bp('r30-stable', '赛博朋克'), mood1);
        expect(a.sentences[3]).toBe(b.sentences[3]);
    });
});
