import type { AtomRegistry } from './Atom';
import type { GameplayType } from './GameplayType';
import type { SceneGenerationDirectives } from './SceneLifecycle';

export interface GenerationConfig {
    seed: number;
    difficulty: number;
    gameplayTypes?: string[];
    playerLevel: number;
    playerId?: string;
    themeHint?: string;
    preferences?: string[];
    lifecycleDirectives?: SceneGenerationDirectives;
}

export interface DimensionBlueprint {
    id: string;
    name: string;
    description: string;
    modules: string[]; // 玩法组合模块列表 (如: ['tower_defense', 'match3'])
    difficulty: number;
    objectives: any[];
    rules: GeneratedRule[];
    rewards: any[];
    theme: any;
    content: GeneratedContent; // AI生成的美术/模型/文案/音乐
    config: Record<string, any>;
    personalization?: {
        playerId?: string;
        lifecycleNotes: string[];
        aestheticTags: string[];
        generatedAt: number;
    };
}

export interface GeneratedRule {
    ruleId: string;
    name: string;
    description: string;
    ruleType: 'modifier' | 'constraint' | 'trigger' | 'transformation';
    targetModules: string[];
    params: Record<string, any>;
}

export interface GeneratedContent {
    prompt3DScene: string; // 世界模型生成的3D场景提示词
    uiStyle: string;
    story: string;
    bgmPrompt: string;
    npcConfig: any[];
    visualTokens: string[];
    guardrails: string[];
}

// ---------------------------------------------------------------------------
// A. 玩法组合 AI
// ---------------------------------------------------------------------------
export class GameplayCombinerAI {
    generateCombination(config: GenerationConfig): string[] {
        if (config.gameplayTypes && config.gameplayTypes.length > 0) {
            return config.gameplayTypes.slice(0, 4);
        }

        if (config.lifecycleDirectives?.preferredModules.length) {
            return config.lifecycleDirectives.preferredModules
                .filter(moduleId => !config.lifecycleDirectives?.avoidedModules.includes(moduleId))
                .slice(0, 4);
        }

        // 模拟 LLM 根据玩家偏好、等级动态生成玩法组合
        if (config.playerLevel < 5) {
            return ['parkour', 'synthesis']; // 新手：跑酷+合成
        } else if (config.playerLevel < 15) {
            return ['tower_defense', 'card', 'puzzle']; // 中期：塔防+卡牌+解谜
        } else {
            return ['turn_combat', 'synthesis', 'shooter']; // 后期：回合+养成+射击
        }
    }
}

// ---------------------------------------------------------------------------
// B. 内容生成 AI (AIGC)
// ---------------------------------------------------------------------------
export class ContentGeneratorAI {
    async generateContent(themeHint: string, modules: string[], directives?: SceneGenerationDirectives): Promise<GeneratedContent> {
        // 模拟调用 SD / LLM / Suno 生成对应资源
        const theme = themeHint || "cyberpunk neon city";
        const visualTokens = directives?.aestheticTags ?? ['readable silhouettes', 'high contrast landmarks'];
        return {
            prompt3DScene: `Generate a 3D world model for ${theme}, blending elements of ${modules.join(' and ')}, ${visualTokens.join(', ')}, high quality, game-ready style`,
            uiStyle: `${theme} style UI with glassmorphism`,
            story: `You enter the dimension of ${theme}, where the rules of ${modules.join(', ')} govern reality. Scene lifecycle signals: ${(directives?.lifecycleNotes ?? []).join(' | ')}`,
            bgmPrompt: `Epic dynamic soundtrack for ${theme} with fast pacing suitable for ${modules[0]}`,
            npcConfig: [
                { id: "npc_01", name: "Guide", memory: [], personality: "helpful and mysterious" }
            ],
            visualTokens,
            guardrails: [
                'Do not generate illegal, infringing, or personally sensitive content.',
                'Keep generated scenes readable for gameplay and avoid visual clutter over active objectives.',
                'Preserve module affordances so players can infer rules from scene layout.',
                'Maintain numerical consistency between rewards, score changes, and visible rule feedback.',
                'Maintain spatial continuity so revisited areas and landmarks remain recognizable.',
            ],
        };
    }
}

// ---------------------------------------------------------------------------
// C. 平衡 AI
// ---------------------------------------------------------------------------
export class BalanceTunerAI {
    private history: { difficulty: number; score: number; winRate: number }[] = [];

    recordSession(data: { difficulty: number; score: number; winRate: number }) {
        this.history.push(data);
    }

    suggestDifficulty(playerLevel: number): number {
        // 动态调参，防止无敌组合或卡死
        if (this.history.length === 0) return 1;
        const last = this.history[this.history.length - 1];
        if (last.winRate > 0.8) return Math.min(10, last.difficulty + 1);
        if (last.winRate < 0.2) return Math.max(1, last.difficulty - 1);
        return last.difficulty;
    }
}

// ---------------------------------------------------------------------------
// D. 智能 NPC / 世界 AI
// ---------------------------------------------------------------------------
export class SmartWorldAI {
    private weatherState: string = "clear";
    private events: string[] = [];

    updateWorldState() {
        // 模拟世界动态推演
        const weatherOpts = ["clear", "rain", "neon_storm", "fog"];
        this.weatherState = weatherOpts[Math.floor(Math.random() * weatherOpts.length)];
        this.events.push(`A new temporal rift opened due to weather: ${this.weatherState}`);
    }

    interactWithNPC(npcId: string, playerInput: string): string {
        // 模拟 LLM 驱动的自由对话
        return `[NPC ${npcId}]: I remember you. The weather is ${this.weatherState}. You said "${playerInput}". Let's explore the new dimension!`;
    }
}

// ---------------------------------------------------------------------------
// 超级大脑总控 (Super Brain)
// ---------------------------------------------------------------------------
export class AiEngine {
    public gameplayAI: GameplayCombinerAI;
    public contentAI: ContentGeneratorAI;
    public balanceAI: BalanceTunerAI;
    public worldAI: SmartWorldAI;

    constructor() {
        this.gameplayAI = new GameplayCombinerAI();
        this.contentAI = new ContentGeneratorAI();
        this.balanceAI = new BalanceTunerAI();
        this.worldAI = new SmartWorldAI();
    }

    async generateDimension(config: GenerationConfig): Promise<DimensionBlueprint> {
        const difficulty = Math.max(
            1,
            Math.min(10, this.balanceAI.suggestDifficulty(config.playerLevel) + (config.lifecycleDirectives?.difficultyBias ?? 0) * 10)
        );
        const modules = this.gameplayAI.generateCombination(config);
        const themeHint = config.lifecycleDirectives?.themeHint ?? config.themeHint ?? 'random';
        const content = await this.contentAI.generateContent(themeHint, modules, config.lifecycleDirectives);
        const rules = this.generateRules(modules, difficulty, config.lifecycleDirectives);

        return {
            id: `dim_${Date.now()}_${Math.abs(config.seed).toString(36)}`,
            name: `Dimension [${modules.join('+')}]`,
            description: content.story,
            modules,
            difficulty,
            objectives: [],
            rules,
            rewards: [],
            theme: themeHint,
            content,
            config: { ...config, themeHint },
            personalization: {
                playerId: config.playerId,
                lifecycleNotes: config.lifecycleDirectives?.lifecycleNotes ?? [],
                aestheticTags: config.lifecycleDirectives?.aestheticTags ?? [],
                generatedAt: Date.now(),
            },
        };
    }

    private generateRules(modules: string[], difficulty: number, directives?: SceneGenerationDirectives): GeneratedRule[] {
        const intensity = Math.max(0.1, Math.min(1, difficulty / 10));
        const rules: GeneratedRule[] = [
            {
                ruleId: 'aesthetic_focus',
                name: '审美聚焦',
                description: '强化清晰轮廓、目标地标和玩法可读性',
                ruleType: 'transformation',
                targetModules: [...modules],
                params: {
                    intensity: 0.55 + intensity * 0.2,
                    tags: directives?.aestheticTags ?? [],
                },
            },
        ];

        if (modules.includes('parkour') || modules.includes('shooter')) {
            rules.push({
                ruleId: 'speed_boost',
                name: '速度涌动',
                description: '动作玩法节奏和移动速度提升',
                ruleType: 'modifier',
                targetModules: modules.filter(moduleId => ['parkour', 'shooter'].includes(moduleId)),
                params: { intensity },
            });
        }

        if (modules.includes('tower_defense') || modules.includes('shooter')) {
            rules.push({
                ruleId: 'dense_spawns',
                name: '密集刷怪',
                description: '提高敌人和障碍生成密度',
                ruleType: 'constraint',
                targetModules: modules.filter(moduleId => ['tower_defense', 'shooter', 'parkour'].includes(moduleId)),
                params: { intensity: Math.min(1, intensity + 0.1) },
            });
        }

        if (modules.length >= 3) {
            rules.push({
                ruleId: 'chain_bonus',
                name: '跨玩法连锁',
                description: '多个玩法模块同时存在时获得连锁得分加成',
                ruleType: 'trigger',
                targetModules: [...modules],
                params: { intensity: Math.min(1, intensity + 0.2) },
            });
        }

        if ((directives?.coolingScenes.length ?? 0) > 0 || (directives?.reviveCandidates.length ?? 0) > 0) {
            rules.push({
                ruleId: 'revival_bonus',
                name: '复苏奖励',
                description: '灰度或复访场景给予额外收益和视觉强调',
                ruleType: 'modifier',
                targetModules: [...modules],
                params: {
                    intensity: 0.45,
                    coolingScenes: directives?.coolingScenes ?? [],
                    reviveCandidates: directives?.reviveCandidates ?? [],
                },
            });
        }

        return rules;
    }
}
