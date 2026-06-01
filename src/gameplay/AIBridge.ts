/**
 * AIBridge — typed bridge between the game-layer AIEngine and the
 * engine-side AtomRegistry.
 *
 * On the TypeScript side we don't have a live binding into the Rust
 * `AtomRegistry` (no WASM build wired into the Vite app yet), so the
 * bridge uses a TS manifest that mirrors `cocos4-rust/.../agi_minigame/atoms`.
 * When the WASM binding is added, swap `loadFromManifest` for a call into
 * `wasm_exports.atom_registry_ids()` and the rest of the file stays
 * unchanged.
 *
 * Responsibilities:
 *   - Read the available atom ids (engine-side gameplay modules)
 *   - Feed them to AIEngine.gameplayAI.suggest() so the suggestion is
 *     bounded by what the engine actually supports
 *   - Convert the chosen combo into a list of GameplayModule factories
 *     the GameplayManager can load
 */

import { GameplayManager, GameplayModule, Match3Module, TowerModule, CardModule, ParkourModule, PuzzleModule } from './GameplayManager';
import { AIEngine, GameplayCombinerAI } from '../ai/AIEngine';
import { WorldState } from '../world/WorldState';

export interface AtomManifestEntry {
    id: string;
    name: string;
    description: string;
    gameplayType: string;
}

/**
 * Mirror of `cocos4-rust/src/agi_minigame/atoms/mod.rs`. Kept in sync
 * manually; once WASM bindings land, replace with a live call.
 */
export const ATOM_MANIFEST: AtomManifestEntry[] = [
    { id: 'match3',        name: '三消',     description: '交换、匹配、消除、连锁、得分、道具', gameplayType: 'puzzle' },
    { id: 'tower_defense', name: '塔防',     description: '放置、路径、怪物波次、攻击、升级、防御', gameplayType: 'strategy' },
    { id: 'card',          name: '卡牌',     description: '抽卡、出牌、费用、效果、结算、卡组', gameplayType: 'card' },
    { id: 'turn_combat',   name: '回合战斗', description: '行动条、普攻、技能、Buff、属性、站位', gameplayType: 'rpg' },
    { id: 'parkour',       name: '跑酷',     description: '前进、跳跃、滑行、障碍物、收集、冲刺', gameplayType: 'action' },
    { id: 'puzzle',        name: '解谜',     description: '移动、推理、限制步数、目标状态', gameplayType: 'puzzle' },
    { id: 'synthesis',     name: '合成',     description: '合并、升级、产出、配方、解锁', gameplayType: 'casual' },
    { id: 'shooting',      name: '射击',     description: '瞄准、弹道、击毁、得分、连击', gameplayType: 'action' },
];

export interface BridgeConfig {
    playerLevel: number;
    recentLossCount?: number;
    minAtoms?: number;
    maxAtoms?: number;
}

export interface BridgeResult {
    suggestion: ReturnType<GameplayCombinerAI['suggest']>;
    atomIds: string[];
    blueprint: ReturnType<AIEngine['generateDimension']>;
    modules: GameplayModule[];
}

export class AIBridge {
    private ai: AIEngine;
    private gameplay: GameplayManager;
    private worldState: WorldState;

    constructor(ai: AIEngine, gameplay: GameplayManager, worldState: WorldState) {
        this.ai = ai;
        this.gameplay = gameplay;
        this.worldState = worldState;
        this.installDefaultModules();
    }

    /** Register TS-side factories for the atoms that have a TS implementation. */
    private installDefaultModules(): void {
        this.gameplay.registerModule('match3',        () => new Match3Module());
        this.gameplay.registerModule('tower_defense', () => new TowerModule());
        this.gameplay.registerModule('card',          () => new CardModule());
        this.gameplay.registerModule('parkour',       () => new ParkourModule());
        this.gameplay.registerModule('puzzle',        () => new PuzzleModule());
    }

    /**
     * Plan a new dimension: ask the AI which combination to use, then
     * resolve the suggested primary+secondary atom ids against the engine
     * manifest and load the corresponding TS gameplay modules.
     */
    async planAndLoad(cfg: BridgeConfig): Promise<BridgeResult> {
        // 1. Ask the AI which atom ids fit this player's level/stage.
        const suggestion = this.ai.gameplayAI.suggest(cfg.playerLevel, cfg.recentLossCount ?? 0);

        // 2. Build the GenerationConfig (filters + counts) from the suggestion.
        const generationCfg = this.ai.gameplayAI.toGenerationConfig(
            cfg.playerLevel,
            cfg.recentLossCount ?? 0,
            {
                minAtoms: cfg.minAtoms ?? 2,
                maxAtoms: cfg.maxAtoms ?? 4,
                rewardMultiplier: 1.0,
                difficultyRange: [0.3, 0.8],
            },
        );

        // 3. Constrain preferredTypes to what the engine actually provides.
        const availableIds = new Set(ATOM_MANIFEST.map(a => a.id));
        const filteredPreferred = generationCfg.preferredTypes.filter(id => availableIds.has(id));
        const finalCfg = { ...generationCfg, preferredTypes: filteredPreferred };

        // 4. Generate the dimension blueprint.
        const blueprint = this.ai.generateDimension(finalCfg);

        // 5. Load the corresponding TS gameplay modules (or stand-ins).
        const chosenAtoms = blueprint.atomIds;
        await this.gameplay.loadGameplay(chosenAtoms);

        // 6. Mirror the dimension on the WorldState so reward accounting works.
        this.worldState.setActiveDimension(blueprint.id, chosenAtoms);

        const modules: GameplayModule[] = chosenAtoms
            .map(id => this.gameplay.getModule(id))
            .filter((m): m is GameplayModule => !!m);

        return { suggestion, atomIds: chosenAtoms, blueprint, modules };
    }

    /** Sync the WorldState (player + economy + dimension history) after a run. */
    recordRunCompletion(
        score: number,
        rewards: { itemId: string; quantity: number }[],
        durationSecs: number,
    ): void {
        if (!this.ai) return;
        const dim = this.worldState.activeDimension;
        if (!dim) return;
        this.worldState.recordDimensionComplete(dim.dimensionId, score, rewards);
        this.ai.recordSession({
            dimensionId: dim.dimensionId,
            difficulty: 0.5,
            playerLevel: this.worldState.player.level,
            score,
            durationSecs,
            completed: true,
        });
    }

    /** Currently-available atom ids (from the engine manifest). */
    availableAtomIds(): string[] {
        return ATOM_MANIFEST.map(a => a.id);
    }
}
