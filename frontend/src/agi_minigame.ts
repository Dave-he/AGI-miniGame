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

export { RuleCompiler } from './core/RuleSystem';
export type { CompiledRuleSet, ModuleRuleEffect, RuntimeRule, RuleType } from './core/RuleSystem';

export { EngineTelemetrySampler } from './core/EngineTelemetry';
export type { EngineTelemetry, TelemetrySignal } from './core/EngineTelemetry';

export { SceneDirector } from './core/SceneDirector';
export type { SceneDirectorIntent, SceneDirectorPlan } from './core/SceneDirector';

export { SceneWorldBuilder } from './core/SceneWorldBuilder';
export type { SceneLandmarkPlan, SceneSpawnPlan, SceneWorldPlan } from './core/SceneWorldBuilder';

export { SceneAestheticSystem } from './core/SceneAestheticSystem';
export type { AestheticBreakdown, SceneAestheticReport } from './core/SceneAestheticSystem';

export { SceneObjectiveSystem } from './core/SceneObjectiveSystem';
export type {
    SceneObjectiveCompletion,
    SceneObjectiveInput,
    SceneObjectiveKind,
    SceneObjectiveProgress,
    SceneObjectiveSession,
    SceneRewardPlan,
} from './core/SceneObjectiveSystem';

export { SceneLifecycleManager } from './core/SceneLifecycle';
export type {
    GeneratedSceneRecord,
    PlayerSceneProfile,
    SceneGenerationDirectives,
    SceneLifecycleMetrics,
    SceneLifecyclePolicy,
    SceneLifecycleStatus,
} from './core/SceneLifecycle';

export { Match3Atom, TowerDefenseAtom, CardAtom, TurnCombatAtom, ParkourAtom, SynthesisAtom, registerAllAtoms } from './atoms/index';
