/**
 * GameplayCombinerAI — selects a combination of gameplay atoms based on
 * player level, history, and PRD-defined "stage" preferences.
 *
 * Stage rules (from PRD §2.2.A):
 *   - Novice  (level 1-4):  parkour + synthesis (simple, easy to learn)
 *   - Mid     (level 5-14): tower + card + puzzle (strategy)
 *   - Late    (level 15+):  turn_combat + synthesis + shooting (heavy, multi-dim)
 */

export type GameplayStage = 'novice' | 'mid' | 'late';

export interface CombinationSuggestion {
    stage: GameplayStage;
    primary: string[];
    secondary: string[];
    excluded: string[];
    rationale: string;
}

const STAGE_ATOMS: Record<GameplayStage, { primary: string[]; secondary: string[] }> = {
    novice:  { primary: ['parkour', 'synthesis'],  secondary: ['match3'] },
    mid:     { primary: ['tower_defense', 'card', 'puzzle'], secondary: ['synthesis'] },
    late:    { primary: ['turn_combat', 'synthesis', 'shooting'], secondary: ['card', 'tower_defense'] },
};

const STAGE_RATIONALE: Record<GameplayStage, string> = {
    novice:  '新手阶段：以低门槛、即时反馈的玩法为主，让玩家快速熟悉操作。',
    mid:     '中期阶段：强化策略与闯关体验，引入塔防、卡牌与解谜的组合。',
    late:    '后期阶段：多维度深度体验，融合回合、合成与射击等高复杂度玩法。',
};

export class GameplayCombinerAI {
    private history: CombinationSuggestion[] = [];

    classifyStage(playerLevel: number): GameplayStage {
        if (playerLevel <= 4) return 'novice';
        if (playerLevel <= 14) return 'mid';
        return 'late';
    }

    suggest(playerLevel: number, recentLossCount: number = 0): CombinationSuggestion {
        const stage = this.classifyStage(playerLevel);
        const def = STAGE_ATOMS[stage];

        // If the player has been losing a lot, exclude the heaviest atom
        // and add an easier one. This is the "balance AI handshake".
        const excluded: string[] = [];
        if (recentLossCount >= 3) {
            excluded.push('shooting');
        }

        const suggestion: CombinationSuggestion = {
            stage,
            primary: [...def.primary],
            secondary: [...def.secondary],
            excluded,
            rationale: STAGE_RATIONALE[stage] +
                (excluded.length ? '（已根据近期战况自动规避高难度玩法）' : ''),
        };

        this.history.push(suggestion);
        if (this.history.length > 50) this.history.shift();
        return suggestion;
    }

    /** Merge the suggestion into a GenerationConfig that DimensionGenerator can consume. */
    toGenerationConfig(
        playerLevel: number,
        recentLossCount: number = 0,
        base: { minAtoms: number; maxAtoms: number; rewardMultiplier: number; difficultyRange: [number, number] },
    ) {
        const s = this.suggest(playerLevel, recentLossCount);
        return {
            minAtoms: base.minAtoms,
            maxAtoms: base.maxAtoms,
            difficultyRange: base.difficultyRange,
            playerLevel,
            preferredTypes: [...s.primary, ...s.secondary],
            excludedTypes: s.excluded,
            rewardMultiplier: base.rewardMultiplier,
        };
    }

    getHistory(): CombinationSuggestion[] {
        return [...this.history];
    }
}
