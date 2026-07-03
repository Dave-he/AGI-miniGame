/**
 * MockAigcBackend — a deterministic stand-in for the AIGC services the
 * PRD §2.2.B calls out (Stable Diffusion / Midjourney / Suno / Udio).
 *
 * It accepts a prompt and returns a *realistic-looking* response object
 * (an image URL stub, a fake audio URL stub, structured BGM metadata,
 * or a lore text fragment). Calls are deterministic when a seed is
 * supplied, so the same prompt always produces the same response —
 * useful for tests and demos.
 *
 * When a real AIGC backend is wired in (e.g. via /api/ide/v1/text_to_image),
 * replace `callService` with a fetch. The rest of the code stays.
 */

export type AigcKind = 'image' | 'audio' | 'lore' | 'sprite';

export interface AigcResponse {
    kind: AigcKind;
    /** Stable id (e.g. a hash of prompt + seed) so the same prompt reuses the asset. */
    id: string;
    /** Stub URL — in mock mode this is a data: URL or a fake http URL. */
    url: string;
    /** Optional structured payload (bgm, palette, etc.). */
    meta?: Record<string, any>;
    /** Provider name (mock by default). */
    provider: 'mock' | 'sd' | 'midjourney' | 'suno' | 'udio' | 'llm';
    /** Generation latency in ms (simulated). */
    latencyMs: number;
}

export interface AigcCall {
    prompt: string;
    kind: AigcKind;
    seed?: number;
}

const HASH_CHARS = 'abcdef0123456789';
function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
}

function makeId(prompt: string, seed: number): string {
    return `${djb2(prompt)}_${(seed >>> 0).toString(16)}`;
}

const STYLE_PALETTES: Record<string, string[]> = {
    cyberpunk:  ['#FF006E', '#3A0CA3', '#4CC9F0', '#F72585'],
    fantasy:    ['#06D6A0', '#118AB2', '#FFD166', '#EF476F'],
    space:      ['#0B090A', '#660708', '#A4161A', '#BA181B'],
    underwater: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8'],
    desert:     ['#D4A373', '#FAEDCD', '#FEFAE0', '#DDA15E'],
    dungeon:    ['#1B263B', '#415A77', '#778DA9', '#E0E1DD'],
};

export class MockAigcBackend {
    private rng: () => number;
    /** In-memory cache: id → response. */
    private cache: Map<string, AigcResponse> = new Map();

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    async call(call: AigcCall): Promise<AigcResponse> {
        const seed = call.seed ?? Math.floor(this.rng() * 1e9);
        const id = makeId(call.prompt, seed);
        const cached = this.cache.get(id);
        if (cached) return cached;

        // Simulate 80–320ms latency.
        const latency = 80 + Math.floor(this.rng() * 240);
        await new Promise(r => setTimeout(r, latency));

        let resp: AigcResponse;
        switch (call.kind) {
            case 'image':  resp = this.genImage(call.prompt, id, seed); break;
            case 'sprite': resp = this.genSprite(call.prompt, id, seed); break;
            case 'audio':  resp = this.genAudio(call.prompt, id, seed); break;
            case 'lore':   resp = this.genLore(call.prompt, id, seed); break;
        }
        this.cache.set(id, resp);
        return resp;
    }

    private genImage(prompt: string, id: string, seed: number): AigcResponse {
        // Pick a style from the prompt; fall back to a random one.
        const style = Object.keys(STYLE_PALETTES).find(s => prompt.toLowerCase().includes(s))
            ?? Object.keys(STYLE_PALETTES)[seed % Object.keys(STYLE_PALETTES).length];
        const palette = STYLE_PALETTES[style];
        return {
            kind: 'image',
            id,
            url: `mock://aigc/image/${id}.png`,
            provider: 'sd',
            latencyMs: 0,
            meta: {
                style,
                palette,
                width: 1024,
                height: 768,
                seed,
                prompt: prompt.slice(0, 200),
            },
        };
    }

    private genSprite(prompt: string, id: string, seed: number): AigcResponse {
        const colors = ['#FF6B6B', '#4ECDC4', '#A06CD5', '#FFD166', '#06D6A0', '#EF476F'];
        return {
            kind: 'sprite',
            id,
            url: `mock://aigc/sprite/${id}.svg`,
            provider: 'midjourney',
            latencyMs: 0,
            meta: {
                primary: colors[seed % colors.length],
                secondary: colors[(seed + 1) % colors.length],
                prompt: prompt.slice(0, 120),
            },
        };
    }

    private genAudio(prompt: string, id: string, seed: number): AigcResponse {
        const moods = ['epic', 'mysterious', 'cheerful', 'tense', 'melancholic', 'pulse'];
        const bpm = 90 + (seed % 60);
        return {
            kind: 'audio',
            id,
            url: `mock://aigc/audio/${id}.mp3`,
            provider: 'suno',
            latencyMs: 0,
            meta: {
                bpm,
                mood: moods[seed % moods.length],
                durationSecs: 180,
                prompt: prompt.slice(0, 200),
            },
        };
    }

    private genLore(prompt: string, id: string, seed: number): AigcResponse {
        const openings = [
            '很久以前，', '在虚空的彼端，', '当第一道光划破混沌，',
            '在星图的第七象限，', '据说在远古纪元，',
        ];
        const middles = [
            '一位旅者拾起了一块发光的碎片，',
            '一个被遗忘的声音在维度之间回荡，',
            '规则本身发生了第一次弯折，',
            '众神的棋盘被打翻，',
            '时间的指针被轻轻拨动，',
        ];
        const endings = [
            '从此，「创世」与「毁灭」成为同一枚硬币的两面。',
            '而你——是唯一记得这一切的人。',
            '这段历史压缩成了一块发光的「历史遗迹」，等待下一次的苏醒。',
            '世界在那一刻迈过了临界点。',
            '所有的可能性，从这一刻开始叠加。',
        ];
        const open = openings[seed % openings.length];
        const mid = middles[(seed >> 3) % middles.length];
        const end = endings[(seed >> 6) % endings.length];
        return {
            kind: 'lore',
            id,
            url: `mock://aigc/lore/${id}.txt`,
            provider: 'llm',
            latencyMs: 0,
            meta: {
                text: open + mid + end,
                prompt: prompt.slice(0, 200),
            },
        };
    }

    private makeRng(seed: number): () => number {
        let s = seed % 233280;
        if (s <= 0) s += 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}
