export interface GenerationConfig {
    minAtoms: number;
    maxAtoms: number;
    difficultyRange: [number, number];
    playerLevel: number;
    preferredTypes: string[];
    excludedTypes: string[];
    rewardMultiplier: number;
}

export interface DimensionBlueprint {
    id: string;
    name: string;
    description: string;
    atomIds: string[];
    atomWeights: Record<string, number>;
    difficulty: number;
    rules: GeneratedRule[];
    rewards: GeneratedReward[];
    theme: DimensionTheme;
    timeLimitSecs: number | null;
    objectives: Objective[];
}

export interface GeneratedRule {
    ruleId: string;
    name: string;
    description: string;
    ruleType: 'modifier' | 'constraint' | 'trigger' | 'transformation';
    params: Record<string, any>;
}

export interface GeneratedReward {
    itemId: string;
    baseQuantity: number;
    scalingFactor: number;
}

export interface DimensionTheme {
    name: string;
    visualStyle: string;
    musicMood: string;
    colorPalette: string[];
}

export interface Objective {
    id: string;
    description: string;
    objectiveType: 'score' | 'time' | 'collect' | 'defeat' | 'survive' | string;
    targetValue: number;
    isOptional: boolean;
}

export interface SessionResult {
    dimensionId: string;
    difficulty: number;
    playerLevel: number;
    score: number;
    durationSecs: number;
    completed: boolean;
}

// Re-export the 4 AI brains so consumers can pick whichever they need.
export { GameplayCombinerAI, CombinationSuggestion, GameplayStage } from './GameplayCombinerAI';
export { ContentGeneratorAI, ThemeContent, VisualStyle, MusicMood } from './ContentGeneratorAI';
export { SmartWorldAI, WorldEventDraft, WorldEventKind } from './SmartWorldAI';

export class DimensionGenerator {
    private rng: () => number;
    private adjectives: string[];
    private nouns: string[];
    private themes: string[];

    constructor(seed: number) {
        this.rng = this.createSeededRandom(seed);
        this.adjectives = [
            '混沌', '永恒', '幻影', '量子', '虚空', '烈焰', '冰霜',
            '雷霆', '暗影', '光辉', '深渊', '星辰', '时空', '命运',
        ];
        this.nouns = [
            '迷宫', '战场', '神殿', '深渊', '花园', '塔楼', '竞技场',
            '秘境', '次元', '试炼', '回廊', '领域', '裂隙', '梦境',
        ];
        this.themes = [
            '赛博朋克', '奇幻森林', '海底世界', '太空站', '古墓',
            '浮空城', '熔岩地带', '冰原', '沙漠绿洲', '暗黑地牢',
        ];
    }

    generate(config: GenerationConfig): DimensionBlueprint {
        const availableAtoms = this.getDefaultAtoms();
        const numAtoms = Math.floor(
            this.rng() * (config.maxAtoms - config.minAtoms + 1)
        ) + config.minAtoms;

        const selectedAtoms = this.selectRandomAtoms(availableAtoms, numAtoms);
        const difficulty = this.rng() * (config.difficultyRange[1] - config.difficultyRange[0]) + config.difficultyRange[0];
        const atomWeights = this.generateWeights(selectedAtoms);
        const rules = this.generateRules(selectedAtoms, difficulty);
        const rewards = this.generateRewards(selectedAtoms, difficulty, config.rewardMultiplier);
        const theme = this.generateTheme();
        const name = this.generateName();
        const objectives = this.generateObjectives(selectedAtoms, difficulty);

        return {
            id: `dim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name,
            description: `在${theme.name}中挑战${selectedAtoms.length}种玩法的组合`,
            atomIds: selectedAtoms,
            atomWeights,
            difficulty,
            rules,
            rewards,
            theme,
            timeLimitSecs: difficulty > 0.7 ? 180 : null,
            objectives,
        };
    }

    private getDefaultAtoms(): string[] {
        return [
            'match3',
            'tower_defense',
            'card',
            'turn_combat',
            'parkour',
            'puzzle',
            'shooting',
            'synthesis',
        ];
    }

    private selectRandomAtoms(available: string[], count: number): string[] {
        const shuffled = [...available].sort(() => this.rng() - 0.5);
        return shuffled.slice(0, count);
    }

    private generateWeights(atoms: string[]): Record<string, number> {
        const weights: Record<string, number> = {};
        const total = atoms.length;
        for (const atom of atoms) {
            weights[atom] = (0.5 + this.rng() * 0.5) / total;
        }
        return weights;
    }

    private generateRules(_atoms: string[], difficulty: number): GeneratedRule[] {
        const templates: Array<{ id: string; name: string; desc: string; type: GeneratedRule['ruleType'] }> = [
            { id: 'speed_boost', name: '加速', desc: '行动速度提升', type: 'modifier' },
            { id: 'double_score', name: '双倍得分', desc: '得分翻倍', type: 'modifier' },
            { id: 'resource_drain', name: '资源消耗', desc: '资源持续消耗', type: 'constraint' },
            { id: 'chain_bonus', name: '连锁奖励', desc: '连续操作获得额外奖励', type: 'trigger' },
            { id: 'time_pressure', name: '时间压力', desc: '倒计时加速', type: 'constraint' },
        ];

        const numRules = Math.min(
            Math.floor(1 + difficulty * 3),
            templates.length
        );

        const shuffled = templates.sort(() => this.rng() - 0.5);
        return shuffled.slice(0, numRules).map(t => ({
            ruleId: t.id,
            name: t.name,
            description: t.desc,
            ruleType: t.type,
            params: { intensity: difficulty },
        }));
    }

    private generateRewards(_atoms: string[], difficulty: number, multiplier: number): GeneratedReward[] {
        const baseGold = Math.floor(50 * difficulty * multiplier);
        const baseGem = Math.max(1, Math.floor(5 * difficulty * multiplier));

        const rewards: GeneratedReward[] = [
            { itemId: 'gold', baseQuantity: baseGold, scalingFactor: 1.0 + difficulty },
            { itemId: 'gem', baseQuantity: baseGem, scalingFactor: 0.5 + difficulty },
        ];

        if (difficulty > 0.6) {
            rewards.push({
                itemId: 'rare_chest',
                baseQuantity: 1,
                scalingFactor: difficulty,
            });
        }

        return rewards;
    }

    private generateTheme(): DimensionTheme {
        const adjIdx = Math.floor(this.rng() * this.adjectives.length);
        const themeIdx = Math.floor(this.rng() * this.themes.length);

        return {
            name: `${this.adjectives[adjIdx]}·${this.themes[themeIdx]}`,
            visualStyle: this.themes[themeIdx],
            musicMood: this.rng() > 0.5 ? 'epic' : 'mysterious',
            colorPalette: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
        };
    }

    private generateName(): string {
        const adjIdx = Math.floor(this.rng() * this.adjectives.length);
        const nounIdx = Math.floor(this.rng() * this.nouns.length);
        return `${this.adjectives[adjIdx]}${this.nouns[nounIdx]}`;
    }

    private generateObjectives(atoms: string[], difficulty: number): Objective[] {
        const objectives: Objective[] = [
            {
                id: 'main_score',
                description: `达到${Math.floor(1000 * difficulty)}分`,
                objectiveType: 'score',
                targetValue: Math.floor(1000 * difficulty),
                isOptional: false,
            },
        ];

        if (atoms.length > 1) {
            objectives.push({
                id: 'combo_master',
                description: '完成3次组合连击',
                objectiveType: 'combo',
                targetValue: 3,
                isOptional: true,
            });
        }

        return objectives;
    }

    private createSeededRandom(seed: number): () => number {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}

export class BalanceTuner {
    private targetWinRate: number = 0.6;
    private history: SessionResult[] = [];

    recordResult(result: SessionResult): void {
        this.history.push(result);
    }

    suggestDifficulty(playerLevel: number): number {
        const recent = this.history
            .slice(-20)
            .filter(d => Math.abs(d.playerLevel - playerLevel) <= 2);

        if (recent.length === 0) {
            return 0.3 + playerLevel * 0.05;
        }

        const winRate = recent.filter(d => d.completed).length / recent.length;

        let adjustment = 0;
        if (winRate > this.targetWinRate + 0.1) {
            adjustment = 0.1;
        } else if (winRate < this.targetWinRate - 0.1) {
            adjustment = -0.1;
        }

        const base = 0.3 + playerLevel * 0.05;
        return Math.max(0.1, Math.min(1.0, base + adjustment));
    }
}

import { GameplayCombinerAI } from './GameplayCombinerAI';
import { ContentGeneratorAI } from './ContentGeneratorAI';
import { SmartWorldAI } from './SmartWorldAI';

export class AIEngine {
    /** A — 玩法组合 AI: pick the right combo of gameplay atoms for this player. */
    public gameplayAI: GameplayCombinerAI;
    /** B — 内容生成 AI: produce theme name, art prompt, BGM prompt, intro lore. */
    public contentAI: ContentGeneratorAI;
    /** C — 平衡 AI: tune difficulty from historical win/loss data. */
    public tuner: BalanceTuner;
    /** D — 智能 NPC / 世界 AI: roll transient world events and NPC dialogue. */
    public worldAI: SmartWorldAI;

    /** Internal generator of dimension blueprints (combines the 4 AIs' output). */
    private generator: DimensionGenerator;

    constructor(seed: number) {
        this.gameplayAI = new GameplayCombinerAI();
        this.contentAI = new ContentGeneratorAI(seed);
        this.tuner = new BalanceTuner();
        this.worldAI = new SmartWorldAI(seed);
        this.generator = new DimensionGenerator(seed);
    }

    generateDimension(config: GenerationConfig): DimensionBlueprint {
        // 1) Balance AI hands us a suggested difficulty band.
        const suggested = this.tuner.suggestDifficulty(config.playerLevel);
        const adjustedConfig: GenerationConfig = {
            ...config,
            difficultyRange: [
                Math.max(0.1, suggested - 0.1),
                Math.min(1.0, suggested + 0.1),
            ],
        };

        // 2) DimensionGenerator emits the structural blueprint.
        const blueprint = this.generator.generate(adjustedConfig);

        // 3) Content AI enriches the theme with lore / art / music prompts.
        const stage = this.gameplayAI.classifyStage(config.playerLevel);
        const theme = this.contentAI.generate(stage, blueprint.atomIds, blueprint.difficulty);
        blueprint.name = theme.themeName;
        blueprint.description = theme.introLore;
        blueprint.theme = {
            name: theme.themeName,
            visualStyle: theme.visualStyle,
            musicMood: theme.musicMood,
            colorPalette: theme.colorPalette,
        };

        return blueprint;
    }

    recordSession(result: SessionResult): void {
        this.tuner.recordResult(result);
    }

    suggestDifficulty(playerLevel: number): number {
        return this.tuner.suggestDifficulty(playerLevel);
    }
}
