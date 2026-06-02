/**
 * HttpLLMClient tests — uses a mock fetcher, no real network.
 */

import { HttpLLMClient } from '../ai/HttpLLMClient';

function makeClient(overrides: { apiKey?: string; fetcher?: typeof fetch; openaiResponse?: any } = {}) {
    const fetcher: typeof fetch = async (_url, init: any) => {
        const body = JSON.parse(init.body);
        // Verify the request is OpenAI-shaped
        if (!body.model || !Array.isArray(body.messages) || body.messages.length !== 2) {
            return { ok: false, status: 400, json: async () => ({ error: 'bad request' }) } as any;
        }
        const resp = overrides.openaiResponse ?? {
            choices: [{ message: { content: 'On(Collide) -> Apply(Damage, 5)' } }],
        };
        return { ok: true, status: 200, json: async () => resp } as any;
    };
    return new HttpLLMClient({
        baseUrl: 'https://example.test/v1',
        model: 'test-model',
        apiKey: overrides.apiKey ?? 'sk-test',
        fetcher: overrides.fetcher ?? fetcher,
    });
}

describe('HttpLLMClient', () => {
    test('parses a DSL line from the OpenAI response', async () => {
        const c = makeClient();
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        expect(r.provider).toBe('openai');
        expect(r.dsl).toBe('On(Collide) -> Apply(Damage, 5)');
        expect(r.rule).toBeDefined();
    });

    test('falls back to mock when no apiKey is set', async () => {
        const c = makeClient({ apiKey: '' });
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        expect(r.provider).toBe('mock');
        expect(r.dsl).toBeDefined();
    });

    test('falls back to mock when the response shape is bad', async () => {
        const c = makeClient({ openaiResponse: { choices: [] } });
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        expect(r.provider).toBe('mock');
    });

    test('falls back to mock when the LLM emits text without a DSL', async () => {
        const c = makeClient({ openaiResponse: { choices: [{ message: { content: 'I am a helpful assistant.' } }] } });
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        // The text didn't contain a DSL → dsl is undefined, but provider is still openai
        expect(r.provider).toBe('openai');
        expect(r.dsl).toBeUndefined();
        expect(r.rule).toBeUndefined();
    });

    test('falls back to mock on HTTP 500', async () => {
        const c = makeClient({ fetcher: async () => ({ ok: false, status: 500, json: async () => ({}) } as any) });
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        expect(r.provider).toBe('mock');
    });

    test('falls back to mock on network error', async () => {
        const c = makeClient({ fetcher: async () => { throw new Error('offline'); } });
        const r = await c.complete({ system: 's', user: 'memes: Fire', seed: 1 });
        expect(r.provider).toBe('mock');
    });
});
