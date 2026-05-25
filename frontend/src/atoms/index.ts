import { AtomRegistry } from '../core/Atom';
import type { AtomMetadata } from '../core/Atom';
import { GameplayType } from '../core/GameplayType';
import { Match3Atom } from './Match3Atom';
import { TowerDefenseAtom } from './TowerDefenseAtom';
import { CardAtom } from './CardAtom';
import { TurnCombatAtom } from './TurnCombatAtom';
import { ParkourAtom } from './ParkourAtom';
import { SynthesisAtom } from './SynthesisAtom';

export { Match3Atom } from './Match3Atom';
export { TowerDefenseAtom } from './TowerDefenseAtom';
export { CardAtom } from './CardAtom';
export { TurnCombatAtom } from './TurnCombatAtom';
export { ParkourAtom } from './ParkourAtom';
export { SynthesisAtom } from './SynthesisAtom';

const ATOM_DEFINITIONS: { factory: () => Match3Atom | TowerDefenseAtom | CardAtom | TurnCombatAtom | ParkourAtom | SynthesisAtom; metadata: AtomMetadata }[] = [
    {
        factory: () => new Match3Atom(),
        metadata: {
            id: 'match3',
            name: '三消',
            version: 1,
            gameplayType: GameplayType.Match3,
            description: '经典三消玩法，交换宝石消除得分，连击获得额外加成',
            tags: ['休闲', '消除', '连击'],
        },
    },
    {
        factory: () => new TowerDefenseAtom(),
        metadata: {
            id: 'tower_defense',
            name: '塔防',
            version: 1,
            gameplayType: GameplayType.TowerDefense,
            description: '放置防御塔抵御敌人波次进攻，升级塔提升战力',
            tags: ['策略', '防御', '升级'],
        },
    },
    {
        factory: () => new CardAtom(),
        metadata: {
            id: 'card',
            name: '卡牌',
            version: 1,
            gameplayType: GameplayType.Card,
            description: '卡牌对战，合理使用能量出牌，击败敌人',
            tags: ['策略', '卡牌', '回合制'],
        },
    },
    {
        factory: () => new TurnCombatAtom(),
        metadata: {
            id: 'turn_combat',
            name: '回合战斗',
            version: 1,
            gameplayType: GameplayType.TurnCombat,
            description: '回合制战斗，攻击、技能、防御、等待，击败所有敌人',
            tags: ['战斗', '回合制', '策略'],
        },
    },
    {
        factory: () => new ParkourAtom(),
        metadata: {
            id: 'parkour',
            name: '跑酷',
            version: 1,
            gameplayType: GameplayType.Parkour,
            description: '三车道跑酷，跳跃躲避障碍，收集金币和道具',
            tags: ['动作', '跑酷', '反应'],
        },
    },
    {
        factory: () => new SynthesisAtom(),
        metadata: {
            id: 'synthesis',
            name: '合成',
            version: 1,
            gameplayType: GameplayType.Synthesis,
            description: '收集材料合成物品，发现新配方解锁更多合成路线',
            tags: ['合成', '收集', '探索'],
        },
    },
];

export function registerAllAtoms(registry: AtomRegistry): void {
    for (const def of ATOM_DEFINITIONS) {
        registry.register(def.metadata.id, def.metadata, def.factory);
    }
}
