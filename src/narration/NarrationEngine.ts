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
 * Round 53b — the **average-mood 4th-sentence path** now uses the
 * same FNV-1a 32-bit hash as the Rust engine's
 * `cocos4-rust/src/agi_minigame/narration.rs::fnv1a`. This way the
 * WASM and TS paths produce byte-identical sentences for the same
 * `(blueprint_id, branch)` — no more "WASM-fallback divergence" the
 * player could observe across a reload. The **individual-NPC
 * 4th-sentence path** (round 33, most-extreme-NPC wins) stays on
 * `djb2` because the WASM helper doesn't model the individual
 * context yet; that unification is a round-54 follow-up.
 *
 * **Constraint**: `blueprint_id` must be ASCII (the standard
 * `dim_<digits>` or `r<N>-<tag>-<n>` format from `Date.now()` /
 * `stableSeedFromSnapshot`). Non-ASCII ids produce different hash
 * values in TS (`charCodeAt` returns UTF-16 code units) vs Rust
 * (`as_bytes` returns UTF-8 bytes) and the WASM/TS paths would
 * pick different pool entries.
 *
 * The class is engine-agnostic: it returns a `Narration` object
 * which the App logs to the HUD or pipes to the audio service.
 */

import type { DimensionBlueprint } from '../ai/AIEngine';
import { callMood4thSentenceFor, type SceneGenWasmModule } from '../ai/SceneGenWasm';
import type { NpcDisposition, NpcRegistry } from '../world/NpcMind';

export interface Narration {
    dimensionId: string;
    sentences: string[];
    /**
     * Round 25 — which mood branch (if any) supplied the 4th
     * sentence. When the 4th was picked from a *registry*
     * source (round 33) and the registry disagreed with the
     * average, this field still records the registry's
     * individual branch.
     */
    moodBranch?: 'fear' | 'friendly' | 'hostile' | 'neutral';
    /**
     * Round 33 — when the 4th was sourced from a most-extreme
     * individual NPC (not the average), the NPC's id is
     * recorded here so the HUD can show "守夜的士兵说：…"
     * with a specific speaker.
     */
    speakerId?: string;
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

/**
 * Round 33 — individual-NPC 4th-sentence pool. Picked when the
 * most-extreme NPC in the registry disagrees with the average
 * mood. Sentences are first-person ("a soldier said: ...") so
 * the player feels a specific speaker rather than a chorus.
 */
const MOOD_4TH_INDIVIDUAL: Record<'fear' | 'friendly' | 'hostile', string[]> = {
    fear: [
        '守夜的士兵瑟缩着说："别……别往前走了。"',
        '一个孩子拉了拉你的衣角：里面好黑，我们逃吧。',
        '老奶奶颤抖着说：我已经听见尖叫了。',
    ],
    friendly: [
        '老猎人拍拍你的肩：上次的伤还疼吗？',
        '村姑笑着塞给你一枚护符：带着它，会顺利的。',
        '守门人朝你点头：你的剑我替你磨过了。',
    ],
    hostile: [
        '一个男人挡在路中央："你来错地方了。"',
        '一个老人啐了一口：滚回你来的地方。',
        '哨兵低声威胁：再走一步，我不客气了。',
    ],
};

export function moodBranch(mood: NpcDisposition): 'fear' | 'friendly' | 'hostile' | 'neutral' {
    if (mood.fear > 0.5) return 'fear';
    if (mood.friendly > 0.5 && mood.trust > 0.3) return 'friendly';
    if (mood.friendly < -0.3) return 'hostile';
    return 'neutral';
}

/**
 * Round 33 — find the most extreme NPC in a registry. The
 * "extremeness" score is the maximum of (fear, |friendly|,
 * |trust|), which lets a single terrified or hostile NPC
 * dominate the chorus even when the average is lukewarm.
 *
 * Returns null if the registry is empty.
 */
export function mostExtremeNpc(reg: NpcRegistry): {
    id: string;
    disposition: NpcDisposition;
    score: number;
    branch: 'fear' | 'friendly' | 'hostile' | 'neutral';
} | null {
    let best: { id: string; disposition: NpcDisposition; score: number; branch: 'fear' | 'friendly' | 'hostile' | 'neutral' } | null = null;
    for (const m of reg.iter()) {
        const d = m.disposition();
        const score = Math.max(d.fear, Math.abs(d.friendly), Math.abs(d.trust));
        if (best === null || score > best.score) {
            best = { id: m.id(), disposition: d, score, branch: moodBranch(d) };
        }
    }
    return best;
}

export class NarrationEngine {
    /**
     * Round 51 — WASM bridge for the 4th-sentence pick. Null means
     * the loader failed and the TS djb2-based pick takes over.
     * Wired by `App.setSceneGenWasm` after `loadSceneGenWasm`
     * resolves.
     */
    private wasmMod: SceneGenWasmModule | null = null;

    /**
     * Round 51 — source tag for the most recent 4th-sentence pick,
     * surfaced via `getLastSentenceSource()`. `main.ts` reads it
     * after `narrate` returns and logs `[4th] WASM 真出` vs
     * `[4th] WASM 兜底→ TS 镜像`. `null` when no 4th-sentence was
     * picked (no mood, neutral branch, or the individual-NPC path
     * took the slot).
     */
    private lastSentenceSource: 'wasm' | 'ts-fallback' | null = null;

    /**
     * Round 51 — inject the loaded WASM bridge. Called by
     * `App.setSceneGenWasm` after `loadSceneGenWasm` resolves.
     */
    setSceneGenWasm(mod: SceneGenWasmModule | null): void {
        this.wasmMod = mod;
    }

    /**
     * Round 51 — read the source tag from the most recent
     * 4th-sentence pick, used by `main.ts` for the HUD log line.
     */
    getLastSentenceSource(): 'wasm' | 'ts-fallback' | null {
        return this.lastSentenceSource;
    }

    /**
     * Generate a 3-sentence intro for a dimension. When `mood` is
     * supplied, an optional 4th sentence is appended from the
     * mood-keyed pool (round 25). When `npcRegistry` is also
     * supplied, the 4th sentence is sourced from the most
     * extreme individual NPC (round 33) — a single terrified or
     * hostile NPC dominates the chorus.
     *
     * Round 51 — WASM-aware 4th-sentence pick. Round 53b — the
     * TS fallback uses the same FNV-1a hash as the WASM helper
     * for the average-mood path; the individual-NPC path stays
     * on `djb2` (WASM helper doesn't model individual contexts
     * yet). `main.ts` reads `lastSentenceSource` to log
     * `[4th] WASM 真出` vs `[4th] WASM 兜底→ TS 镜像`.
     */
    narrate(blueprint: DimensionBlueprint, mood?: NpcDisposition, npcRegistry?: NpcRegistry): Narration {
        const rng = this.makeRng(this.djb2(blueprint.id));
        const theme = (blueprint.theme as any).visualStyle ?? '未名之境';
        const opener = this.pick(OPENERS, rng).replace(/%s/g, theme);
        const moodSentence = this.pick(MOODS, rng);
        const call = this.pick(CALLS, rng);
        const sentences: string[] = [opener, moodSentence + '。', call + '。'];

        // Round 33 — when a registry is provided, the most extreme
        // individual NPC takes the 4th-sentence slot. Its branch
        // wins over the average's. We require a non-neutral
        // branch (so the silent majority doesn't get a fake
        // speaker). Round 51 — the individual path stays on TS
        // djb2 (the WASM `mood_4th_sentence_for` doesn't model
        // individual-NPC contexts); only the average-mood path
        // goes through the WASM bridge.
        //
        // TODO round-54: align with WASM fnv1a once
        // `most_extreme_npc(reg)` is mirrored in Rust so the WASM
        // helper can take an `(extreme_npc_id, branch)` context.
        // Until then the individual path stays on `djb2` —
        // the 3/3/3 individual pool is small enough that the
        // cross-language hash divergence is a known trade-off.
        const extreme = npcRegistry ? mostExtremeNpc(npcRegistry) : null;
        let branch: Narration['moodBranch'];
        let speakerId: string | undefined;
        if (extreme && extreme.branch !== 'neutral' && extreme.score > 0.3) {
            branch = extreme.branch;
            speakerId = extreme.id;
            const pool = MOOD_4TH_INDIVIDUAL[branch];
            const rng2 = this.makeRng(this.djb2(blueprint.id + '|ind|' + branch));
            sentences.push(this.pick(pool, rng2));
            this.lastSentenceSource = null;
        } else if (mood) {
            branch = moodBranch(mood);
            if (branch !== 'neutral') {
                // Round 51 — try WASM first; on null result (no
                // module, error JSON, or unexpected shape), fall
                // back to the existing TS-based pick.
                //
                // Round 53b — the TS fallback path now uses the
                // same FNV-1a 32-bit hash as the Rust
                // `mood_4th_sentence_for` helper, so the WASM
                // and TS paths produce byte-identical sentences
                // for the same `(blueprint_id, branch)`. The
                // pool size (4 / 5 / 4 for fear / friendly /
                // hostile) is what the mod is taken against;
                // the branch tag itself goes into the pool
                // lookup, not the hash key.
                const branchNumeric = branch === 'fear' ? 0 : branch === 'friendly' ? 1 : 2;
                const wasmSentence = callMood4thSentenceFor(this.wasmMod, branchNumeric, blueprint.id);
                if (wasmSentence !== null) {
                    sentences.push(wasmSentence);
                    this.lastSentenceSource = 'wasm';
                } else {
                    const pool = MOOD_4TH[branch];
                    const branchRng = this.makeRng(this.fnv1a(blueprint.id));
                    sentences.push(this.pick(pool, branchRng));
                    this.lastSentenceSource = 'ts-fallback';
                }
            } else {
                this.lastSentenceSource = null;
            }
        } else {
            this.lastSentenceSource = null;
        }
        return { dimensionId: blueprint.id, sentences, moodBranch: branch, speakerId };
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

    /**
     * Round 53b — FNV-1a 32-bit hash. Byte-for-byte equivalent to
     * the Rust implementation in
     * `cocos4-rust/src/agi_minigame/narration.rs::fnv1a` for ASCII
     * inputs (the standard `dim_<digits>` or `r<N>-<tag>-<n>`
     * format). The constants 2166136261 (offset basis) and
     * 16777619 (prime) are the canonical FNV-1a 32-bit values
     * (RFC 9923 / FNV reference implementation).
     *
     * Used by the **average-mood 4th-sentence path** so the WASM
     * bridge and the TS fallback produce identical sentences for
     * the same `(blueprint_id, branch)`. The individual-NPC path
     * (round 33) still uses `djb2` because the WASM helper
     * doesn't model the individual context yet (round-54 follow-up).
     */
    private fnv1a(s: string): number {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
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
