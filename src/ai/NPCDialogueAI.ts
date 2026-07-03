/**
 * NPCDialogueAI — a tiny memory-driven dialogue engine.
 *
 * PRD §2.2.D: NPCs should be LLM-driven with memory, personality, and the
 * ability to converse freely. This module implements the **memory** and
 * **personality** parts in TypeScript; the actual LLM call is out of scope
 * but the prompt builder is included so a backend can drop in.
 */

import { Meme, combineMemes, compileFallback, parseDSL, DslRule } from '../dsl/MemeCompiler';

export type NPCPersonality = 'cheerful' | 'grumpy' | 'mysterious' | 'wise' | 'playful' | 'stoic';

export type DialogueTopic =
    | 'greeting' | 'trade' | 'quest' | 'lore' | 'farewell' | 'combat' | 'craft';

export interface MemoryEntry {
    /** Game-time (dimension ticks since session start) when this happened. */
    timestamp: number;
    /** What was discussed. */
    topic: DialogueTopic;
    /** What the player said (or did) — keeps it short. */
    playerUtterance: string;
    /** A short summary of how the NPC replied. */
    npcReplySummary: string;
}

export interface NPCProfile {
    id: string;
    name: string;
    personality: NPCPersonality;
    /** What the NPC trades / offers. */
    offers?: string[];
    /** Quest givers etc. */
    faction?: string;
    /**
     * Round 24 — optional theme archetype tag from the
     * `theme_to_scene` blueprint. Free-form string; the scene
     * generator picks from the canonical list (`robot`, `mage`,
     * `beast`, etc.) but consumers should treat it as opaque.
     */
    archetype?: string;
}

export interface DialogueLine {
    speaker: string;
    text: string;
    topic: DialogueTopic;
    /** Optional: a meme combination the NPC is "selling" to the player. */
    offeredMemes?: Meme[];
}

const PERSONALITY_OPENERS: Record<NPCPersonality, string[]> = {
    cheerful:  ['嘿！很高兴见到你！', '今天天气真好——我是说，在我的维度里。', '欢迎欢迎！'],
    grumpy:    ['……又来了。', '说吧，什么事。', '别挡我光线。'],
    mysterious:['你来得正是时候——也不对，任何时候都是时候。', '命运的丝线今天格外躁动。', '嘘……你听到了吗？'],
    wise:      ['坐下来，听我讲个故事。', '你问的这个问题，我年轻的时候也问过。', '答案在风中，也在你的脚下。'],
    playful:   ['猜猜我口袋里有什么？', '要不要玩个游戏？', '如果你能在 3 秒内笑，我就送你个礼物。'],
    stoic:     ['嗯。', '我在。', '说吧。'],
};

const TOPIC_FLAVOR: Record<DialogueTopic, Record<NPCPersonality, string[]>> = {
    greeting: {
        cheerful:  ['欢迎回来！', '见到你真好。'],
        grumpy:    ['你回来了。', '别浪费我时间。'],
        mysterious:['我们又相遇了——第三次了？', '你的影子今天格外长。'],
        wise:      ['坐下吧。', '让我看看你这些日子都学到了什么。'],
        playful:   ['来得好！', '我刚想到一个超棒的主意——先听你的！'],
        stoic:     ['来了。', '我注意到你。'],
    },
    trade: {
        cheerful:  ['我刚进了新货！', '你买不买都无所谓啦，但这些真的很好用。'],
        grumpy:    ['东西在这里。价格公道。', '少废话，多给钱。'],
        mysterious:['代价是……你的一个秘密。', '不，我不收金币。我要回忆。'],
        wise:      ['让我看看你的诚意。', '用得上的东西，从来都不便宜。'],
        playful:   ['卖你个超值的——只要你愿意玩一局猜谜。', '我卖的不是物品，是体验！'],
        stoic:     ['这是商品。', '你有多少？'],
    },
    quest: {
        cheerful:  ['我有个超棒的任务给你！', '有件事只有你能帮忙！'],
        grumpy:    ['做完了我就告诉你下一步。', '别让我失望。'],
        mysterious:['任务会自己找上你的。', '线索已经在你身边了——只要你肯看。'],
        wise:      ['每个任务都是一课。', '完成它，你将看到新的门。'],
        playful:   ['要不要当一次英雄？很好玩的！', '我有个游戏给你——赢了就送你大礼。'],
        stoic:     ['任务。去完成。', '需要你。'],
    },
    lore: {
        cheerful:  ['我来给你讲个故事吧！', '你听说过那个关于 [火] + [速度] 的传说吗？'],
        grumpy:    ['你没资格听。', '自己去找。'],
        mysterious:['真相藏在星图的第七象限。', '你愿意付出什么样的代价来知道？'],
        wise:      ['很久很久以前……', '宇宙的答案写在沙子上。'],
        playful:   ['从前有个……算了不剧透！', '你猜这个次元是怎么来的？'],
        stoic:     ['听着。', '记住这些。'],
    },
    farewell: {
        cheerful:  ['下次再来玩！', '我会想你的！'],
        grumpy:    ['走吧。', '别摔了。'],
        mysterious:['我们会在某个拐角再遇。', '影子会陪你走一段。'],
        wise:      ['愿你走得稳。', '回见。'],
        playful:   ['再见了——记得笑哦！', '下次带礼物来！'],
        stoic:     ['去吧。', '保重。'],
    },
    combat: {
        cheerful:  ['小心，对面来了！', '别怕，我们一起上！'],
        grumpy:    ['挡我者死。', '你来打还是我来？'],
        mysterious:['他们来了——不，他们一直都在。', '别看他们的眼睛。'],
        wise:      ['深呼吸，稳住阵脚。', '刀剑不是答案，但有时是问题的一部分。'],
        playful:   ['快快快，按那个按钮！', '打架？好啊好啊！'],
        stoic:     ['准备。', '动。'],
    },
    craft: {
        cheerful:  ['我把两个 [火] + [生命] 合成了一下，看看！', '来，我教你一招。'],
        grumpy:    ['别碰我的材料。', '照着做。'],
        mysterious:['这两个东西的「象」是相通的。', '把它们放在月圆之夜的祭坛上。'],
        wise:      ['先想清楚再动手。', '材料会告诉你它想去哪里。'],
        playful:   ['如果把它们倒过来会怎样？', '试试 [火] + [速度] 嘛！'],
        stoic:     ['合并。', '下一步。'],
    },
};

export class NPCDialogueAI {
    private rng: () => number;
    private npcMemory: Map<string, MemoryEntry[]> = new Map();
    private static MAX_HISTORY = 16;

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    /** Build the prompt the LLM will be given if a backend is wired in. */
    buildPrompt(profile: NPCProfile, topic: DialogueTopic, history: MemoryEntry[]): string {
        const recent = history.slice(-5).map(m =>
            `[t=${m.timestamp}] player: ${m.playerUtterance} — npc: ${m.npcReplySummary}`
        ).join('\n');
        return [
            `你是 ${profile.name}，一个${this.personalityDesc(profile.personality)}的 NPC。`,
            `当前话题：${topic}。`,
            `你的阵营：${profile.faction ?? '中立'}。`,
            `你愿意提供：${profile.offers?.join('、') ?? '无'}。`,
            `最近的对话：\n${recent || '（无）'}`,
            `请用 1-2 句中文回复，贴合你的性格。`,
        ].join('\n');
    }

    /** Deterministic offline reply (no LLM call). Uses personality + topic + memory. */
    reply(
        profile: NPCProfile,
        topic: DialogueTopic,
        playerUtterance: string,
        timestamp: number = Date.now(),
    ): DialogueLine {
        const history = this.npcMemory.get(profile.id) || [];

        // First-ever contact → use a topic-specific greeting.
        const isFirst = history.length === 0 && topic === 'greeting';
        const flavorSet = isFirst
            ? PERSONALITY_OPENERS[profile.personality]
            : TOPIC_FLAVOR[topic][profile.personality];

        const text = flavorSet[Math.floor(this.rng() * flavorSet.length)];

        // Occasionally the NPC offers a meme combination to the player.
        let offeredMemes: Meme[] | undefined;
        if (topic === 'trade' || topic === 'craft' || (topic === 'greeting' && this.rng() < 0.25)) {
            const pool: Meme[] = ['Fire', 'Speed', 'Life', 'Gravity', 'Shield', 'Time', 'Create'];
            const n = 1 + Math.floor(this.rng() * 2);
            offeredMemes = [];
            for (let i = 0; i < n; i++) {
                const pick = pool[Math.floor(this.rng() * pool.length)];
                if (!offeredMemes.includes(pick)) offeredMemes.push(pick);
            }
        }

        // Persist to memory.
        history.push({
            timestamp,
            topic,
            playerUtterance: playerUtterance.slice(0, 80),
            npcReplySummary: text.slice(0, 80),
        });
        if (history.length > NPCDialogueAI.MAX_HISTORY) history.shift();
        this.npcMemory.set(profile.id, history);

        return {
            speaker: profile.name,
            text,
            topic,
            offeredMemes,
        };
    }

    getHistory(npcId: string): MemoryEntry[] {
        return [...(this.npcMemory.get(npcId) || [])];
    }

    /**
     * Helper: take the memes an NPC offered and convert them into a
     * deterministic DSL rule via the offline compiler. Returns both the
     * natural-language prompt and the compiled rule.
     */
    offeredMemesToRule(offeredMemes: Meme[]): { prompt: ReturnType<typeof combineMemes>; rule: DslRule; dsl: string } {
        const prompt = combineMemes(offeredMemes);
        const rule = compileFallback(offeredMemes);
        const dsl = `On(${rule.event.kind}${rule.event.arg !== undefined ? `, ${rule.event.arg}` : ''}) -> ${rule.actions.map(a => `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`).join(', ')}`;
        // ensure round-trip
        parseDSL(dsl);
        return { prompt, rule, dsl };
    }

    private personalityDesc(p: NPCPersonality): string {
        switch (p) {
            case 'cheerful':  return '热情洋溢';
            case 'grumpy':    return '脾气暴躁';
            case 'mysterious':return '神秘莫测';
            case 'wise':      return '睿智沉稳';
            case 'playful':   return '调皮爱玩';
            case 'stoic':     return '冷峻寡言';
        }
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
