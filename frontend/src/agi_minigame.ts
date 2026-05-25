export { AtomPhase, Atom, AtomRegistry, AtomRunner } from './core/Atom';
export type { AtomContext, AtomMetadata } from './core/Atom';

export { CurrencyType, Currency, Transaction, Wallet, Inventory } from './core/Economy';
export type { TransactionEntry, InventoryItem } from './core/Economy';

export { GameplayType, gameplayTypeFromName, allGameplayTypes } from './core/GameplayType';

export { PlayerProfile, PlayerProgression, SharedWorld, UnifiedWorldState } from './core/WorldState';
export type { PlayerStats, WorldEvent, GameplayRecord } from './core/WorldState';

export { 
    BalanceTunerAI, 
    AiEngine 
} from './core/AiEngine';
export type { 
    GenerationConfig, 
    DimensionBlueprint, 
    GeneratedContent 
} from './core/AiEngine';

export { DimensionState, DimensionObjective, DimensionConfig, Dimension, DimensionRunner } from './core/Dimension';

export { GameplayManager } from './core/GameplayManager';
export type { GameplayModule, ModuleConfig } from './core/GameplayManager';

export { Match3Atom, TowerDefenseAtom, CardAtom, TurnCombatAtom, ParkourAtom, SynthesisAtom, registerAllAtoms } from './atoms/index';
