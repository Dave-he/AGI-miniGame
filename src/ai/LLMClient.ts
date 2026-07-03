/**
 * LLMClient — interface for talking to a large-language model that
 * converts meme combinations into DSL rules.
 *
 * The default `MockLLMClient` is a deterministic stand-in. Its job is
 * to produce *realistic, varied* DSL outputs (not just the same
 * `compileFallback` for every input) so the game feels alive during
 * development. When a real backend is wired in (OpenAI / Anthropic /
 * local Llama), subclass `LLMClient` and override `complete()` —
 * the rest of the codebase (HotReloadController, App loop) stays
 * unchanged.
 */

import { Meme, DslRule, parseDSL, compileFallback } from '../dsl/MemeCompiler';

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmCompletionRequest {
    /** System prompt that fixes the LLM's role + output format. */
    system: string;
    /** The player's meme combination in human-readable form. */
    user: string;
    /** RNG seed (so the same memes always produce the same response). */
    seed: number;
    /** Optional temperature in [0, 2]. Default 0.7. */
    temperature?: number;
}

export interface LlmCompletionResponse {
    /** The model's natural-language reply (may be empty for tool calls). */
    text: string;
    /** Optional structured payload (DSL rule, function call, etc). */
    rule?: DslRule;
    /** Raw DSL line — convenience for callers that just want a string. */
    dsl?: string;
    /** Latency in ms. */
    latencyMs: number;
    /** Provider identifier. */
    provider: 'mock' | 'openai' | 'anthropic' | 'local';
}

export interface LLMClient {
    complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

/**
 * Deterministic mock that picks from a pool of 6 themed templates
 * based on the dominant meme + seed. Each template maps to a known
 * good DSL rule. The output is *varied* (different seeds → different
 * rules) but reproducible.
 */
export class MockLLMClient implements LLMClient {
    private rng: () => number;
    /** Pluggable latency simulator (default 200–500 ms). */
    public latency: () => number = () => 200 + Math.floor(Math.random() * 300);

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
        const start = Date.now();
        // Simulate network latency
        await new Promise<void>(r => setTimeout(r, this.latency()));

        // Extract the meme names from the user prompt. The user prompt
        // format is "玩家提供了以下模因碎片：Fire + Speed + Create。"
        const memeNames = this.extractMemes(req.user);
        const dominant = memeNames[0] ?? 'Fire';

        // Re-seed for this request so the same input always gives the
        // same output. Mix the request's seed with the dominant meme.
        const localRng = this.makeRng(req.seed + this.djb2(dominant));

        // Pick a template from a pool keyed by dominant meme.
        const templates = TEMPLATES[dominant] ?? TEMPLATES.Fire;
        const tpl = templates[Math.floor(localRng() * templates.length)];

        // Optionally vary a numeric arg by ±20%.
        const vary = (base: number) => Math.max(1, Math.round(base * (0.8 + localRng() * 0.4)));

        const line = tpl.build(vary);
        const rule = parseDSL(line);

        return {
            text: tpl.reasoning,
            rule,
            dsl: line,
            latencyMs: Date.now() - start,
            provider: 'mock',
        };
    }

    private extractMemes(user: string): Meme[] {
        const known: Meme[] = ['Fire', 'Speed', 'Life', 'Gravity', 'Shield', 'Time', 'Create'];
        return known.filter(m => user.includes(m));
    }

    private djb2(s: string): number {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return h >>> 0;
    }

    private makeRng(seed: number): () => number {
        let s = (seed | 0) % 233280;
        if (s <= 0) s += 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}

interface Template {
    reasoning: string;
    /** Receives a "vary" function and returns the DSL line. */
    build: (vary: (base: number) => number) => string;
}

const TEMPLATES: Record<string, Template[]> = {
    Fire: [
        { reasoning: '火焰碎片最多，AGI 选择点燃整个次元。',
          build: vary => `On(Timer, ${vary(2)}) -> Apply(Spawn, "Fireball", ${vary(8)})` },
        { reasoning: '火焰 + 连续触发，每秒喷发火球。',
          build: vary => `On(Timer, 1) -> Apply(Spawn, "Fireball", 3), Apply(Damage, ${vary(6)})` },
        { reasoning: '全屏灼烧，玩家短暂获得灼热护盾。',
          build: vary => `On(Collide) -> Apply(Heal, ${vary(10)}), Apply(Spawn, "Ember", ${vary(5)})` },
    ],
    Speed: [
        { reasoning: '速度碎片让一切加速，缩短技能冷却。',
          build: vary => `On(Timer, ${vary(1)}) -> Apply(Spawn, "Haste", ${vary(4)})` },
        { reasoning: '闪避者：玩家获得多次瞬移的机会。',
          build: vary => `On(PlayerHit, ${vary(3)}) -> Apply(Spawn, "Blink", ${vary(2)})` },
    ],
    Life: [
        { reasoning: '生命碎片 → 持续回血。',
          build: vary => `On(Timer, ${vary(3)}) -> Apply(Heal, ${vary(15)})` },
        { reasoning: '受击时触发回血。',
          build: vary => `On(PlayerHit) -> Apply(Heal, ${vary(8)})` },
    ],
    Gravity: [
        { reasoning: '重力反转：所有目标被向上拉。',
          build: vary => `On(Timer, ${vary(2)}) -> Apply(Spawn, "GravityWell", ${vary(1)})` },
        { reasoning: '玩家被击中时重力增加 50%。',
          build: vary => `On(PlayerHit) -> Apply(Spawn, "Heavy", ${vary(1)})` },
    ],
    Shield: [
        { reasoning: '玩家被击中时获得临时护盾。',
          build: vary => `On(PlayerHit) -> Apply(Spawn, "Shield", ${vary(2)})` },
        { reasoning: '护盾碎片让所有碰撞都反弹。',
          build: vary => `On(Collide) -> Apply(Spawn, "Aegis", ${vary(1)})` },
    ],
    Time: [
        { reasoning: '时间膨胀：技能冷却减半。',
          build: vary => `On(Timer, ${vary(2)}) -> Apply(Spawn, "Slow", ${vary(3)})` },
        { reasoning: '玩家获得一次「重来过」。',
          build: vary => `On(PlayerHit) -> Apply(Heal, ${vary(20)})` },
    ],
    Create: [
        { reasoning: '创世碎片召唤随机实体。',
          build: vary => `On(Spawn) -> Apply(Spawn, "Sprite", ${vary(5)})` },
        { reasoning: '玩家被击中时召唤小精灵。',
          build: vary => `On(PlayerHit) -> Apply(Spawn, "Familiar", ${vary(2)})` },
    ],
};

/** Convenience: fallback for when LLM is unavailable. */
export function fallbackFor(memes: Meme[]): string {
    const rule = compileFallback(memes);
    const dsl = `On(${rule.event.kind}${rule.event.arg !== undefined ? `, ${rule.event.arg}` : ''}) -> ${rule.actions.map(a => `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`).join(', ')}`;
    return dsl;
}
