/**
 * LLMClient tests.
 */

import { MockLLMClient, fallbackFor } from '../ai/LLMClient';
import { parseDSL } from '../dsl/MemeCompiler';

describe('MockLLMClient', () => {
    test('returns a valid DSL for a Fire meme', async () => {
        const c = new MockLLMClient(1);
        const r = await c.complete({
            system: 'You are an AGI',
            user: '玩家提供了以下模因碎片：Fire + Speed。',
            seed: 42,
        });
        expect(r.provider).toBe('mock');
        expect(r.latencyMs).toBeGreaterThanOrEqual(0);
        expect(r.dsl).toBeDefined();
        // The returned DSL must parse
        expect(() => parseDSL(r.dsl!)).not.toThrow();
        expect(r.rule).toBeDefined();
    });

    test('same seed → same response', async () => {
        const c = new MockLLMClient(1);
        const a = await c.complete({ system: 's', user: '碎片：Fire', seed: 99 });
        const b = await c.complete({ system: 's', user: '碎片：Fire', seed: 99 });
        expect(a.dsl).toBe(b.dsl);
    });

    test('different seeds → at least one different output across calls', async () => {
        const c = new MockLLMClient(1);
        const seen = new Set<string>();
        for (let s = 0; s < 10; s++) {
            const r = await c.complete({ system: 's', user: '碎片：Fire', seed: s });
            seen.add(r.dsl!);
        }
        expect(seen.size).toBeGreaterThan(1);
    });

    test('each meme has at least one template that returns a valid DSL', async () => {
        const memes = ['Fire', 'Speed', 'Life', 'Gravity', 'Shield', 'Time', 'Create'] as const;
        for (const m of memes) {
            const c = new MockLLMClient(1);
            const r = await c.complete({
                system: 's',
                user: `碎片：${m}`,
                seed: 7,
            });
            expect(() => parseDSL(r.dsl!)).not.toThrow();
        }
    });

    test('fallbackFor returns a parseable DSL', () => {
        const dsl = fallbackFor(['Fire', 'Speed']);
        expect(() => parseDSL(dsl)).not.toThrow();
    });
});
