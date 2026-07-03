/**
 * MockAigcBackend tests.
 */

import { MockAigcBackend } from '../ai/MockAigcBackend';

describe('MockAigcBackend', () => {
    test('image response carries a palette for the inferred style', async () => {
        const a = new MockAigcBackend(1);
        const r = await a.call({ prompt: 'cyberpunk neon city', kind: 'image', seed: 42 });
        expect(r.kind).toBe('image');
        expect(r.url).toMatch(/^mock:\/\/aigc\/image\//);
        expect(r.meta?.style).toBe('cyberpunk');
        expect(Array.isArray(r.meta?.palette)).toBe(true);
    });

    test('audio response carries bpm + mood', async () => {
        const a = new MockAigcBackend(1);
        const r = await a.call({ prompt: 'epic BGM for tower defense', kind: 'audio', seed: 7 });
        expect(r.meta?.bpm).toBeGreaterThanOrEqual(90);
        expect(r.meta?.mood).toBeTruthy();
    });

    test('lore response is a non-empty Chinese sentence', async () => {
        const a = new MockAigcBackend(1);
        const r = await a.call({ prompt: 'ancient legend', kind: 'lore', seed: 99 });
        expect((r.meta?.text as string).length).toBeGreaterThan(10);
        // The mock text contains CJK characters.
        expect(/[一-龥]/.test(r.meta?.text as string)).toBe(true);
    });

    test('cache: same prompt + seed returns the same id', async () => {
        const a = new MockAigcBackend(1);
        const r1 = await a.call({ prompt: 'hello', kind: 'image', seed: 1 });
        const r2 = await a.call({ prompt: 'hello', kind: 'image', seed: 1 });
        expect(r1.id).toBe(r2.id);
    });

    test('different seeds produce different ids', async () => {
        const a = new MockAigcBackend(1);
        const r1 = await a.call({ prompt: 'hello', kind: 'image', seed: 1 });
        const r2 = await a.call({ prompt: 'hello', kind: 'image', seed: 2 });
        expect(r1.id).not.toBe(r2.id);
    });
});
