/**
 * EngineAtomManifest — typed TS bindings for the cocos4-rust
 * `agi_minigame::atoms` registry.
 *
 * The cocos4-rust engine exposes its 6 gameplay atoms (match3,
 * tower_defense, card, turn_combat, parkour, synthesis) through an
 * `AtomRegistry`. The TS side keeps a *manifest* in sync with that
 * registry so the AIBridge can plan dimensions, load the right TS
 * implementation, and report metadata without a live binding.
 *
 * The manifest is the **type contract**: if the cocos4-rust atom
 * set changes (e.g. an atom is added or renamed), this file must be
 * updated. The unit tests assert the manifest is internally
 * consistent (unique ids, all atoms have a factory entry).
 */

export interface EngineAtomSpec {
    /** Stable id, mirrors `cocos4-rust/.../atoms/mod.rs`. */
    id: string;
    /** Display name. */
    name: string;
    /** Short description for the content generator. */
    description: string;
    /** Gameplay family: 'puzzle' | 'strategy' | 'action' | etc. */
    family: 'puzzle' | 'strategy' | 'card' | 'rpg' | 'action' | 'casual';
    /** Tags for the AI to filter / combine. */
    tags: string[];
}

export const ENGINE_ATOMS: readonly EngineAtomSpec[] = Object.freeze([
    { id: 'match3',        name: '三消',     family: 'puzzle',
      description: '交换、匹配、消除、连锁、得分、道具',
      tags: ['puzzle', 'casual', 'match3'] },
    { id: 'tower_defense', name: '塔防',     family: 'strategy',
      description: '放置、路径、怪物波次、攻击、升级、防御',
      tags: ['strategy', 'tower_defense'] },
    { id: 'card',          name: '卡牌',     family: 'card',
      description: '抽卡、出牌、费用、效果、结算、卡组',
      tags: ['card', 'strategy'] },
    { id: 'turn_combat',   name: '回合战斗', family: 'rpg',
      description: '行动条、普攻、技能、Buff、属性、站位',
      tags: ['rpg', 'combat'] },
    { id: 'parkour',       name: '跑酷',     family: 'action',
      description: '前进、跳跃、滑行、障碍物、收集、冲刺',
      tags: ['action', 'runner'] },
    { id: 'synthesis',     name: '合成',     family: 'casual',
      description: '合并、升级、产出、配方、解锁',
      tags: ['casual', 'crafting'] },
]);

export const ENGINE_ATOM_IDS: readonly string[] = ENGINE_ATOMS.map(a => a.id);

export const ENGINE_ATOM_INDEX: ReadonlyMap<string, EngineAtomSpec> =
    new Map(ENGINE_ATOMS.map(a => [a.id, a]));

/** Find an atom by id, or undefined. */
export function findEngineAtom(id: string): EngineAtomSpec | undefined {
    return ENGINE_ATOM_INDEX.get(id);
}

/** Return all atoms in a given family. */
export function atomsInFamily(family: EngineAtomSpec['family']): EngineAtomSpec[] {
    return ENGINE_ATOMS.filter(a => a.family === family);
}

/** Return all atoms that have *all* of the given tags. */
export function atomsWithAllTags(tags: string[]): EngineAtomSpec[] {
    return ENGINE_ATOMS.filter(a => tags.every(t => a.tags.includes(t)));
}

/** Return a list of (id, name) pairs for UI rendering. */
export function listEngineAtoms(): Array<{ id: string; name: string }> {
    return ENGINE_ATOMS.map(a => ({ id: a.id, name: a.name }));
}
