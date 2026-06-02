/**
 * HttpLLMClient — OpenAI-compatible LLM client with graceful fallback.
 *
 * Real wire format is OpenAI's `POST /v1/chat/completions`:
 *   request:  { model, messages: [...], temperature, seed }
 *   response: { choices: [{ message: { content: "..." } }] }
 *
 * The client extracts the first message content, runs the LLMClient
 * DSL pass (extract rule from text + parse + validate), and returns
 * the structured `LlmCompletionResponse`. If the HTTP call fails, or
 * the response can't be parsed, or no `apiKey` is configured, the
 * client falls back to MockLLMClient so the game keeps working.
 */

import { LLMClient, LlmCompletionRequest, LlmCompletionResponse } from './LLMClient';
import { MockLLMClient } from './LLMClient';
import { parseDSL, DslRule } from '../dsl/MemeCompiler';

export interface HttpLLMConfig {
    /** OpenAI-compatible endpoint, e.g. "https://api.openai.com/v1" or a local proxy. */
    baseUrl: string;
    /** Model name, e.g. "gpt-4o-mini" or "claude-3-haiku-20240307". */
    model: string;
    /** API key. If empty, the client falls back to MockLLMClient. */
    apiKey: string;
    /** Optional system prompt override. */
    systemOverride?: string;
    /** Request timeout in ms (default 15000). */
    timeoutMs?: number;
    /** fetch override (for tests / proxies). */
    fetcher?: typeof fetch;
}

export class HttpLLMClient implements LLMClient {
    private cfg: HttpLLMConfig;
    private fallback: MockLLMClient;

    constructor(cfg: HttpLLMConfig) {
        this.cfg = { timeoutMs: 15_000, ...cfg };
        this.fallback = new MockLLMClient();
    }

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
        if (!this.cfg.apiKey) {
            return this.fallback.complete(req);
        }
        const start = Date.now();
        try {
            const text = await this.callOnce(req);
            const rule = this.tryParseRule(text);
            return {
                text,
                rule: rule ?? undefined,
                dsl: rule ? this.formatDsl(rule) : undefined,
                latencyMs: Date.now() - start,
                provider: 'openai',
            };
        } catch (e) {
            // Network / parse failure: degrade to mock.
            return this.fallback.complete(req);
        }
    }

    private async callOnce(req: LlmCompletionRequest): Promise<string> {
        const f = this.cfg.fetcher ?? fetch;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs!);
        try {
            const res = await f(`${this.cfg.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.cfg.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.cfg.model,
                    messages: [
                        { role: 'system', content: this.cfg.systemOverride ?? req.system },
                        { role: 'user',   content: req.user },
                    ],
                    temperature: req.temperature ?? 0.7,
                    seed: req.seed,
                }),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json: any = await res.json();
            const text = json?.choices?.[0]?.message?.content;
            if (typeof text !== 'string') throw new Error('missing content');
            return text;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Best-effort: extract a DSL line from the LLM text. Looks for a line
     * starting with `On(` and ending at the last `)`. If found, parses. */
    private tryParseRule(text: string): DslRule | null {
        // The LLM is expected to return a single DSL line. Strip code
        // fences and try to find the line.
        const stripped = text.replace(/```[a-z]*\n?/g, '').trim();
        const line = stripped.split('\n').map(l => l.trim()).find(l => l.startsWith('On(') && l.includes('->'));
        if (!line) return null;
        try {
            return parseDSL(line);
        } catch {
            return null;
        }
    }

    private formatDsl(rule: DslRule): string {
        const ev = `On(${rule.event.kind}${rule.event.arg !== undefined ? `, ${rule.event.arg}` : ''})`;
        const acts = rule.actions.map(a =>
            `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`
        ).join(', ');
        return `${ev} -> ${acts}`;
    }
}
