import { describe, expect, it } from '@jest/globals';
import { SceneAestheticSystem } from './SceneAestheticSystem';
import { SceneWorldBuilder } from './SceneWorldBuilder';
import { SceneLifecycleManager } from './SceneLifecycle';
import type { DimensionBlueprint, GeneratedContent } from './AiEngine';
import type { PlayerSceneProfile } from './SceneLifecycle';

const profile: PlayerSceneProfile = {
    playerId: 'aesthetic_player',
    level: 9,
    preferredModules: ['tower_defense', 'match3', 'parkour'],
    noveltyBias: 0.7,
    aestheticTaste: {
        mood: 'neon',
        palette: ['cyan', 'amber', 'magenta'],
        density: 'balanced',
    },
};

function content(modules: string[]): GeneratedContent {
    return {
        prompt3DScene: `Generate ${modules.join('+')} aesthetic scene`,
        uiStyle: 'aesthetic ui',
        story: 'aesthetic story',
        bgmPrompt: 'aesthetic bgm',
        npcConfig: [],
        visualTokens: ['readable silhouettes'],
        guardrails: ['aesthetic guardrail'],
    };
}

function blueprint(id: string, modules: string[], difficulty: number = 5): DimensionBlueprint {
    return {
        id,
        name: `Scene ${id}`,
        description: 'aesthetic scene',
        modules,
        difficulty,
        objectives: [],
        rules: [],
        rewards: [],
        theme: 'neon adaptive city',
        content: content(modules),
        config: { themeHint: 'neon adaptive city' },
    };
}

describe('SceneAestheticSystem', () => {
    it('scores readable, coherent generated worlds and emits strengths', () => {
        const lifecycle = new SceneLifecycleManager();
        const scene = lifecycle.createScene(blueprint('good', ['tower_defense', 'match3', 'parkour']), profile, 1_000);
        const worldPlan = new SceneWorldBuilder().build(scene, profile, 400);
        const report = new SceneAestheticSystem().evaluate(scene, profile, worldPlan);

        expect(report.overallScore).toBeGreaterThan(0.55);
        expect(report.ratingOutOfFive).toBeGreaterThanOrEqual(2.8);
        expect(report.strengths.length).toBeGreaterThan(0);
        expect(report.summary).toContain('readability');
    });

    it('records aesthetic reports into lifecycle hotness inputs', () => {
        const lifecycle = new SceneLifecycleManager();
        const scene = lifecycle.createScene(blueprint('tracked', ['tower_defense', 'match3', 'parkour']), profile, 2_000);
        const worldPlan = new SceneWorldBuilder().build(scene, profile, 400);
        const report = new SceneAestheticSystem().evaluate(scene, profile, worldPlan);

        lifecycle.recordAestheticReport(scene.id, report, 2_100);
        const updated = lifecycle.getScene(scene.id);

        expect(updated?.metrics.aestheticReports).toBe(1);
        expect(updated?.metrics.readabilityScore).toBeCloseTo(report.readabilityScore);
        expect(updated?.metrics.coherenceScore).toBeCloseTo(report.coherenceScore);
        expect(updated?.metrics.aestheticScore).toBeCloseTo(report.overallScore);
    });
});
