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
        expect(out.sentences[3]).toMatch(/友好|善意/);
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
