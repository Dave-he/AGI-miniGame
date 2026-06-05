/**
 * NarrationEngine — deterministic 3-sentence story intros for new
 * dimensions, with an optional mood-driven 4th sentence.
 *
 * The engine is seeded from the dimension's id so the *same*
 * dimension always gets the same intro. Sentences are picked from
 * a small pool so we get some variety between dimensions, but no
 * randomness within a single dimension.
 *
 * Round 25 — when a `NpcDisposition` is supplied (typically from
 * `NpcRegistry.averageDisposition()`), the engine appends a 4th
 * sentence picked from a mood-keyed pool. The branch order is
 * identical to `mood_palette` and `BalanceTuner.mood_bias` so the
 * narrative signal aligns with the difficulty and visual signals.
 *
 * The class is engine-agnostic: it returns a `Narration` object
 * which the App logs to the HUD or pipes to the audio service.
 */

import type { DimensionBlueprint } from '../ai/AIEngine';
import type { NpcDisposition } from '../world/NpcMind';

export interface Narration {
    dimensionId: string;
    sentences: string[];
    /** Round 25 — which mood branch (if any) supplied the 4th sentence. */
    moodBranch?: 'fear' | 'friendly' | 'hostile' | 'neutral';
}

const OPENERS = [
    '次元裂隙在%s撕开一道裂口。',
    '你踏入了%s——一片被时间遗忘的角落。',
    '当%s的边界逐渐模糊，规则开始重写。',
    '%s中沉睡的造物感应到你的接近。',
    '一阵寒意将你卷入%s的深处。',
];

const MOODS = [
    '这里弥漫着不安的静谧',
    '远方回响着远古的回声',
    '空气中漂浮着破碎的梦',
    '大地在你脚下微微颤动',
    '你感觉到时间在加速',
];

const CALLS = [
    '每一个规则都可能改写你存在的根基',
    '每一次碰撞都重塑了世界的边界',
    '你的脚步将决定这个次元的命运',
    '那里等待着的，是更深的真实',
    '你的选择是这个世界唯一的常数',
];

/**
 * Round 25 — mood-driven 4th-sentence pool. Each branch has 4-5
 * alternatives picked deterministically by the dimension id. Branch
 * order matches the Rust `narration::mood_branch` exactly. Round
 * 30 expanded the pools so re-visits of the same dim get
 * different 4th sentences.
 */
const MOOD_4TH: Record<'fear' | 'friendly' | 'hostile', string[]> = {
    fear: [
        '空气本身在退避，仿佛这里有过太多恐惧。',
        '远处有什么东西在低声警告你停下脚步。',
        '脚下的地板似乎在颤抖，不是风。',
        '阴影里残留的尖叫还没有完全散去。',
    ],
    friendly: [
        '当地的居民说，这里对旅人尚算友好。',
        '守门人朝你点了点头，似乎记得上次的英勇。',
        '空气里飘着淡淡的节日气息，像是在欢迎。',
        '村口的风铃响了三下，节奏恰好。',
        '你听见远处有人在哼着熟悉的小调。',
    ],
    hostile: [
        '他们不会原谅你上次带来的麻烦。',
        '哨兵把手按在剑柄上，眼神很冷。',
        '上一次的伤痕写在每一张脸上。',
        '你听见身后有人在啐口水。',
    ],
};

export function moodBranch(mood: NpcDisposition): 'fear' | 'friendly' | 'hostile' | 'neutral' {
    if (mood.fear > 0.5) return 'fear';
    if (mood.friendly > 0.5 && mood.trust > 0.3) return 'friendly';
    if (mood.friendly < -0.3) return 'hostile';
    return 'neutral';
}

export class NarrationEngine {
    /**
     * Generate a 3-sentence intro for a dimension. When `mood` is
     * supplied, an optional 4th sentence is appended from the
     * mood-keyed pool (round 25).
     */
    narrate(blueprint: DimensionBlueprint, mood?: NpcDisposition): Narration {
        const rng = this.makeRng(this.djb2(blueprint.id));
        const theme = (blueprint.theme as any).visualStyle ?? '未名之境';
        const opener = this.pick(OPENERS, rng).replace(/%s/g, theme);
        const moodSentence = this.pick(MOODS, rng);
        const call = this.pick(CALLS, rng);
        const sentences: string[] = [opener, moodSentence + '。', call + '。'];

        let branch: Narration['moodBranch'];
        if (mood) {
            branch = moodBranch(mood);
            if (branch !== 'neutral') {
                const pool = MOOD_4TH[branch];
                // Re-seed with id + branch index for stable 4th-sentence pick.
                const branchRng = this.makeRng(this.djb2(blueprint.id + '|' + branch));
                sentences.push(this.pick(pool, branchRng));
            }
        }
        return { dimensionId: blueprint.id, sentences, moodBranch: branch };
    }

    /** Format a Narration as a single block of text (for the HUD log). */
    format(n: Narration): string {
        return n.sentences.map(s => `[${n.dimensionId}] ${s}`).join(' ');
    }

    private pick<T>(arr: T[], rng: () => number): T {
        return arr[Math.floor(rng() * arr.length)];
    }

    private djb2(s: string): number {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return h >>> 0;
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
