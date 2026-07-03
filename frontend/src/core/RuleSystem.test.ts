import { describe, expect, it } from '@jest/globals';
import { AiEngine } from './AiEngine';
import { RuleCompiler } from './RuleSystem';
import type { DimensionBlueprint, GeneratedContent, GeneratedRule } from './AiEngine';

function content(): GeneratedContent {
    return {
        prompt3DScene: 'Generate test scene',
        uiStyle: 'test ui',
        story: 'test story',
        bgmPrompt: 'test bgm',
        npcConfig: [],
        visualTokens: [],
        guardrails: [],
    };
}

function blueprint(rules: GeneratedRule[]): DimensionBlueprint {
    return {
        id: 'rules_test',
        name: 'Rules Test',
        description: 'rules test',
        modules: ['parkour', 'tower_defense', 'match3'],
        difficulty: 6,
        objectives: [],
        rules,
        rewards: [],
        theme: 'neon test',
        content: content(),
        config: {},
    };
}

describe('RuleCompiler', () => {
    it('compiles AGI rules into module-specific runtime effects', () => {
        const compiled = RuleCompiler.compile(blueprint([
            {
                ruleId: 'speed_boost',
                name: '速度涌动',
                description: '动作玩法节奏提升',
                ruleType: 'modifier',
                targetModules: ['parkour'],
                params: { intensity: 1 },
            },
            {
                ruleId: 'chain_bonus',
                name: '跨玩法连锁',
                description: '组合得分加成',
                ruleType: 'trigger',
                targetModules: ['parkour', 'match3'],
                params: { intensity: 0.8 },
            },
            {
                ruleId: 'dense_spawns',
                name: '密集刷怪',
                description: '刷怪密度提升',
                ruleType: 'constraint',
                targetModules: ['tower_defense'],
                params: { intensity: 0.5 },
            },
        ]));

        expect(compiled.activeRules).toHaveLength(3);
        expect(compiled.moduleEffects.parkour.speedMultiplier).toBeGreaterThan(1);
        expect(compiled.moduleEffects.parkour.scoreMultiplier).toBeGreaterThan(1);
        expect(compiled.moduleEffects.tower_defense.spawnRateMultiplier).toBeGreaterThan(1);
        expect(compiled.moduleEffects.match3.scoreMultiplier).toBeGreaterThan(1);
        expect(compiled.moduleEffects.match3.speedMultiplier).toBe(1);
    });

    it('applies compiled rules to module configs without dropping existing params', () => {
        const compiled = RuleCompiler.compile(blueprint([
            {
                ruleId: 'double_score',
                name: '双倍得分',
                description: '得分倍率提升',
                ruleType: 'modifier',
                targetModules: ['match3'],
                params: { intensity: 1 },
            },
        ]));

        const config = RuleCompiler.applyToModuleConfig('match3', {
            difficulty: 5,
            customParams: { rows: 8, cols: 8 },
        }, compiled);

        expect(config.customParams.rows).toBe(8);
        expect(config.customParams.scoreMultiplier).toBeGreaterThan(1.9);
        expect(config.customParams.activeRuleTags).toContain('double_score');
    });

    it('generates fallback rules when a restored scene has no saved rules', () => {
        const compiled = RuleCompiler.compile(blueprint([]));

        expect(compiled.activeRules.length).toBeGreaterThan(0);
        expect(compiled.summary.join(' ')).toContain('审美聚焦');
    });
});

describe('AiEngine generated rules', () => {
    it('creates executable rules for generated dimensions', async () => {
        const engine = new AiEngine();
        const dimension = await engine.generateDimension({
            seed: 42,
            difficulty: 5,
            gameplayTypes: ['parkour', 'tower_defense', 'match3'],
            playerLevel: 10,
            playerId: 'rules_player',
            lifecycleDirectives: {
                preferredModules: ['parkour', 'tower_defense', 'match3'],
                avoidedModules: [],
                themeHint: 'neon rule city',
                difficultyBias: 0.2,
                rewardMultiplier: 1,
                aestheticTags: ['readable silhouettes'],
                lifecycleNotes: ['test'],
                reviveCandidates: [],
                coolingScenes: ['gray_scene'],
            },
        });

        expect(dimension.rules.length).toBeGreaterThanOrEqual(3);
        expect(dimension.rules.map(rule => rule.ruleId)).toContain('revival_bonus');

        const compiled = RuleCompiler.compile(dimension);
        expect(compiled.moduleEffects.parkour.speedMultiplier).toBeGreaterThan(1);
        expect(compiled.summary.length).toBe(dimension.rules.length);
    });
});
