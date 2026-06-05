/**
 * NpcFactory — procedurally generates an NPC roster at runtime.
 *
 * The hardcoded 3-NPC list in main.ts is fine for a demo, but a real
 * AGI game should never have static characters. The factory samples
 * names from a name pool (Chinese-style and fantasy-style), picks a
 * random personality from the 6 NPCDialogueAI types, and assigns a
 * random faction.
 */

import type { NPCProfile } from './NPCDialogueAI';

const SURNAMES = ['玄', '云', '星', '月', '风', '霜', '雪', '火', '雷', '影', '光', '暮', '晨', '晓', '暮'];
const GIVEN_NAMES = ['真', '清', '岚', '澈', '遥', '鸿', '羽', '凌', '渊', '瑟', '笙', '歌', '弦', '砚', '槿'];
const TITLES = ['道长', '居士', '旅人', '匠人', '游商', '学者', '剑客', '医师', '灵师', '隐者', '少女', '少年', '贤者', '守望者'];
const FANTASY_PREFIXES = ['Ael', 'Mor', 'Vor', 'Syl', 'Kael', 'Lyr', 'Nyx', 'Eld', 'Rin', 'Zar'];
const FANTASY_SUFFIXES = ['wyn', 'drin', 'thas', 'aria', 'gon', 'ven', 'iel', 'oth', 'issa', 'ek'];

const PERSONALITIES: NPCProfile['personality'][] = [
    'cheerful', 'grumpy', 'mysterious', 'wise', 'playful', 'stoic',
];

const FACTIONS = [
    '隐者之塔',     '暗巷商会',     '无限次元城',  '苍穹骑士团',
    '秘银评议会',   '潮汐神殿',     '星陨教派',    '焰心旅团',
    '幽影议会',     '黎明守望者',   '中立游商',    '破碎者同盟',
];

const OFFER_POOL = [
    ['治愈药剂', '经验卷轴'],
    ['技能卷轴', '幸运符'],
    ['神秘宝箱钥匙', '记忆碎片'],
    ['火球术', '寒冰屏障'],
    ['重生十字', '净化之露'],
    ['稀有图纸', '锻造材料'],
    ['钓鱼竿', '野外口粮'],
    ['情报', '地图碎片'],
    ['召唤卷轴', '附魔石'],
    ['药剂配方', '采药工具'],
];

const FIRST_NAMES = [
    ...SURNAMES.flatMap(s => GIVEN_NAMES.map(g => s + g)),
    ...TITLES,
    ...FANTASY_PREFIXES.map((p, i) => p + FANTASY_SUFFIXES[i % FANTASY_SUFFIXES.length]),
];

function pick<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
    const out: T[] = [];
    const used = new Set<number>();
    while (out.length < n && used.size < arr.length) {
        const i = Math.floor(rng() * arr.length);
        if (!used.has(i)) {
            used.add(i);
            out.push(arr[i]);
        }
    }
    return out;
}

export interface NpcRosterOptions {
    count: number;
    seed: number;
    /** Force specific ids (for testing). */
    forceIds?: string[];
    /** Exclude these personality types. */
    excludePersonalities?: NPCProfile['personality'][];
}

export class NpcFactory {
    private rng: () => number;

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    generateRoster(opts: NpcRosterOptions): NPCProfile[] {
        const { count, seed, forceIds, excludePersonalities } = opts;
        // Re-seed for determinism when a seed is supplied.
        this.rng = this.makeRng(seed);

        const personalities = PERSONALITIES.filter(p => !excludePersonalities?.includes(p));
        const rosters: NPCProfile[] = [];
        for (let i = 0; i < count; i++) {
            const id = forceIds?.[i] ?? `npc_${(seed >>> 0).toString(16)}_${i}`;
            const name = pick(FIRST_NAMES, this.rng) + (this.rng() > 0.5 ? '·' + pick(TITLES, this.rng) : '');
            const personality = pick(personalities, this.rng);
            const faction = pick(FACTIONS, this.rng);
            const offers = pickN(OFFER_POOL.flat(), 2 + Math.floor(this.rng() * 2), this.rng);
            rosters.push({ id, name, personality, faction, offers });
        }
        return rosters;
    }

    /**
     * Round 24 — variant of `generateRoster` that tags each NPC with
     * a theme archetype from the `theme_to_scene` blueprint. The
     * archetypes cycle through the hint list in order (and wrap), so
     * a `['mage', 'beast']` hint + count 4 yields
     * `['mage', 'beast', 'mage', 'beast']`.
     *
     * Round 27 — the archetype now also *drives* the NPC's
     * personality and faction (via `archetype_default_personality`
     * and `archetype_default_faction`), not just the tag. So
     * `['mage']` consistently produces wise/mysterious mages in
     * the 秘银评议会 faction, etc. The randomness is reserved for
     * name + offers + minor personality twist only.
     *
     * Mirrors the engine side's `archetype_default_*` helpers (see
     * `cocos4-rust/src/agi_minigame/npc.rs`). Cross-layer contract
     * pinned by 5 jest tests in `NpcFactory.test.ts`.
     */
    generateRosterByArchetype(
        archetypes: readonly string[],
        count: number,
        seed: number,
    ): NPCProfile[] {
        if (archetypes.length === 0) {
            return this.generateRoster({ count, seed });
        }
        this.rng = this.makeRng(seed);
        const rosters: NPCProfile[] = [];
        for (let i = 0; i < count; i++) {
            const id = `npc_arch_${(seed >>> 0).toString(16)}_${i}`;
            const name = pick(FIRST_NAMES, this.rng)
                + (this.rng() > 0.5 ? '·' + pick(TITLES, this.rng) : '');
            const archetype = archetypes[i % archetypes.length];
            // Round 27 — derive personality + faction from archetype.
            const personality = archetypeDefaultPersonality(archetype);
            const faction = archetypeDefaultFaction(archetype);
            const offers = pickN(OFFER_POOL.flat(), 2 + Math.floor(this.rng() * 2), this.rng);
            rosters.push({ id, name, personality, faction, offers, archetype });
        }
        return rosters;
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

// ---------------------------------------------------------------------------
// Round 27 — archetype → NPC-default mappings.
//
// Mirrors `cocos4-rust/src/agi_minigame/npc.rs::archetype_*` 1:1 so
// the game-side `NpcFactory.generateRosterByArchetype` produces
// NPCs whose personality, faction, and initial disposition match
// the engine's canonical values. This is what closes the round-24
// "tags" → round-27 "tags actually do something" gap.
// ---------------------------------------------------------------------------

import type { NPCPersonality } from './NPCDialogueAI';
import type { NpcDisposition, NpcMood } from '../world/NpcMind';
import { defaultDisposition } from '../world/NpcMind';

/** Initial mood for a freshly-spawned NPC of the given archetype. */
export function archetypeInitialMood(arch: string): NpcMood {
    switch (arch) {
        case 'robot':
        case 'mage':
        case 'astronaut':
        case 'diver':
        case 'nomad':    return 'neutral';
        case 'lich':     return 'hostile';
        case 'beast':
        case 'alien':    return 'uneasy';
        case 'siren':    return 'happy';
        case 'scorpion':
        case 'skeleton': return 'hostile';
        default:         return 'neutral';
    }
}

/** Default personality for the given archetype. */
export function archetypeDefaultPersonality(arch: string): NPCPersonality {
    switch (arch) {
        case 'robot':
        case 'astronaut':
        case 'nomad':    return 'stoic';
        case 'mage':     return 'wise';
        case 'beast':
        case 'siren':    return 'playful';
        case 'alien':
        case 'lich':     return 'mysterious';
        case 'diver':    return 'cheerful';
        case 'scorpion':
        case 'skeleton': return 'grumpy';
        default:         return 'stoic';
    }
}

/** Default faction label for the given archetype. */
export function archetypeDefaultFaction(arch: string): string {
    switch (arch) {
        case 'robot':
        case 'astronaut': return '苍穹骑士团';
        case 'mage':      return '秘银评议会';
        case 'beast':     return '隐者之塔';
        case 'alien':     return '星陨教派';
        case 'siren':
        case 'diver':     return '潮汐神殿';
        case 'scorpion':
        case 'nomad':     return '焰心旅团';
        case 'skeleton':
        case 'lich':      return '暗巷商会';
        default:          return '无限次元城';
    }
}

/**
 * Initial disposition baseline. Picked so that
 * `NpcMind.mood()` round-trips to the same label as
 * `archetypeInitialMood(arch)`. Mirrors the engine helper.
 */
export function archetypeInitialDisposition(arch: string): NpcDisposition {
    const base = defaultDisposition();
    switch (arch) {
        case 'robot':
        case 'mage':
        case 'astronaut':
        case 'diver':
        case 'nomad':    return { ...base };
        case 'lich':     return { friendly: -0.5, fear: 0.7, trust: -0.5 };
        case 'beast':
        case 'alien':    return { friendly: 0.0, fear: 0.4, trust: -0.1 };
        case 'siren':    return { friendly: 0.5, fear: 0.0, trust: 0.3 };
        case 'scorpion':
        case 'skeleton': return { friendly: -0.5, fear: 0.7, trust: -0.4 };
        default:         return { ...base };
    }
}
