import type { AtomRegistry } from './Atom';
import type { GameplayType } from './GameplayType';

export interface GenerationConfig {
    seed: number;
    difficulty: number;
    gameplayTypes?: string[];
    playerLevel: number;
    themeHint?: string;
    preferences?: string[];
}

export interface DimensionBlueprint {
    id: string;
    name: string;
    description: string;
    modules: string[]; // 玩法组合模块列表 (如: ['tower_defense', 'match3'])
    difficulty: number;
    objectives: any[];
    rules: any[];
    rewards: any[];
    theme: any;
    content: GeneratedContent; // AI生成的美术/模型/文案/音乐
    config: Record<string, any>;
}

export interface GeneratedContent {
    prompt3DScene: string; // 世界模型生成的3D场景提示词
    uiStyle: string;
    story: string;
    bgmPrompt: string;
    npcConfig: any[];
}

// ---------------------------------------------------------------------------
// A. 玩法组合 AI
// ---------------------------------------------------------------------------
export class GameplayCombinerAI {
    generateCombination(config: GenerationConfig): string[] {
        // 模拟 LLM 根据玩家偏好、等级动态生成玩法组合
        if (config.playerLevel < 5) {
            return ['parkour', 'merge']; // 新手：跑酷+合成
        } else if (config.playerLevel < 15) {
            return ['tower_defense', 'card', 'puzzle']; // 中期：塔防+卡牌+解谜
        } else {
            return ['turn_based', 'rpg', 'shooter']; // 后期：回合+养成+射击
        }
    }
}

// ---------------------------------------------------------------------------
// B. 内容生成 AI (AIGC)
// ---------------------------------------------------------------------------
export class ContentGeneratorAI {
    async generateContent(themeHint: string, modules: string[]): Promise<GeneratedContent> {
        // 模拟调用 SD / LLM / Suno 生成对应资源
        const theme = themeHint || "cyberpunk neon city";
        return {
            prompt3DScene: `Generate a 3D world model for ${theme}, blending elements of ${modules.join(' and ')}, high quality, unreal engine 5 style`,
            uiStyle: `${theme} style UI with glassmorphism`,
            story: `You enter the dimension of ${theme}, where the rules of ${modules.join(', ')} govern reality...`,
            bgmPrompt: `Epic dynamic soundtrack for ${theme} with fast pacing suitable for ${modules[0]}`,
            npcConfig: [
                { id: "npc_01", name: "Guide", memory: [], personality: "helpful and mysterious" }
            ]
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
        const difficulty = this.balanceAI.suggestDifficulty(config.playerLevel);
        const modules = this.gameplayAI.generateCombination(config);
        const content = await this.contentAI.generateContent(config.themeHint || 'random', modules);

        return {
            id: `dim_${Date.now()}`,
            name: `Dimension [${modules.join('+')}]`,
            description: content.story,
            modules,
            difficulty,
            objectives: [],
            rules: [],
            rewards: [],
            theme: config.themeHint,
            content,
            config: { ...config }
        };
    }
}
