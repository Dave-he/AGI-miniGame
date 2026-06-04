/**
 * NarrationEngine tests.
 */

import { NarrationEngine } from '../narration/NarrationEngine';
import { AIEngine } from '../ai/AIEngine';

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
