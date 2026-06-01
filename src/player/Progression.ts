/**
 * Progression system — XP, level, talent points.
 *
 * PRD §2.3 (统一成长): 玩家的等级、天赋、装备全服通用，成长体系
 * 反哺所有的玩法。本模块只关心等级与 XP；天赋树与装备留待后续。
 */

export interface ProgressionSnapshot {
    level: number;
    xp: number;
    xpToNext: number;
    totalXp: number;
    talentPoints: number;
    /** Unlocked talent ids by id. */
    talents: string[];
}

export interface TalentDef {
    id: string;
    name: string;
    description: string;
    cost: number;
    /** Optional prerequisite talent ids. */
    requires?: string[];
}

export const XP_PER_LEVEL = (level: number): number => Math.floor(50 + level * 25 + level * level * 5);

export const TALENT_LIBRARY: TalentDef[] = [
    { id: 'power_strike',  name: '强力一击',     description: '造成的伤害 +10%',     cost: 1 },
    { id: 'iron_skin',     name: '钢铁之肤',     description: '受到的伤害 -10%',     cost: 1 },
    { id: 'swift_foot',    name: '迅捷步伐',     description: '移动速度 +15%',       cost: 1 },
    { id: 'lucky_charm',   name: '幸运护符',     description: '掉落概率 +20%',       cost: 2 },
    { id: 'second_wind',   name: '二次呼吸',     description: '生命回复速度 +50%',   cost: 1, requires: ['iron_skin'] },
    { id: 'arcane_master', name: '奥术宗师',     description: '技能伤害 +20%',       cost: 2, requires: ['power_strike'] },
    { id: 'economist',     name: '理财专家',     description: '金币获取 +30%',       cost: 2 },
    { id: 'magnet_eye',    name: '磁石之眼',     description: '拾取半径翻倍',        cost: 1 },
];

export class Progression {
    public level: number = 1;
    public xp: number = 0;
    public totalXp: number = 0;
    public talentPoints: number = 0;
    public talents: Set<string> = new Set();

    /** Add XP; returns the number of level-ups that occurred. */
    addXp(amount: number): { levelsGained: number; newLevel: number } {
        if (amount <= 0) return { levelsGained: 0, newLevel: this.level };
        this.xp += amount;
        this.totalXp += amount;
        let levels = 0;
        while (this.xp >= XP_PER_LEVEL(this.level)) {
            this.xp -= XP_PER_LEVEL(this.level);
            this.level += 1;
            this.talentPoints += 1;
            levels += 1;
        }
        return { levelsGained: levels, newLevel: this.level };
    }

    /** Spend a talent point to learn a talent. */
    learnTalent(talentId: string): { ok: boolean; reason?: string } {
        const def = TALENT_LIBRARY.find(t => t.id === talentId);
        if (!def) return { ok: false, reason: 'unknown talent' };
        if (this.talents.has(talentId)) return { ok: false, reason: 'already learned' };
        if (this.talentPoints < def.cost) return { ok: false, reason: 'not enough points' };
        if (def.requires && !def.requires.every(r => this.talents.has(r))) {
            return { ok: false, reason: 'missing prerequisites' };
        }
        this.talentPoints -= def.cost;
        this.talents.add(talentId);
        return { ok: true };
    }

    snapshot(): ProgressionSnapshot {
        return {
            level: this.level,
            xp: this.xp,
            xpToNext: XP_PER_LEVEL(this.level),
            totalXp: this.totalXp,
            talentPoints: this.talentPoints,
            talents: [...this.talents],
        };
    }

    /** Returns multiplier for the named effect (1.0 = no change). */
    talentMultiplier(effect: 'damage' | 'defense' | 'speed' | 'gold' | 'drop' | 'heal' | 'skill'): number {
        const map: Record<typeof effect, string> = {
            damage: 'power_strike',
            defense: 'iron_skin',
            speed: 'swift_foot',
            gold: 'economist',
            drop: 'lucky_charm',
            heal: 'second_wind',
            skill: 'arcane_master',
        };
        if (!this.talents.has(map[effect])) return 1.0;
        switch (effect) {
            case 'damage':  return 1.10;
            case 'defense': return 0.90;
            case 'speed':   return 1.15;
            case 'gold':    return 1.30;
            case 'drop':    return 1.20;
            case 'heal':    return 1.50;
            case 'skill':   return 1.20;
        }
    }
}
