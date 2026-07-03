import { describe, expect, it } from '@jest/globals';
import { SceneDirector } from './SceneDirector';
import { SceneLifecycleManager } from './SceneLifecycle';
import type { DimensionBlueprint, GeneratedContent } from './AiEngine';
import type { PlayerSceneProfile } from './SceneLifecycle';
import type { TelemetrySignal } from './EngineTelemetry';

const second = 1000;

const calmTelemetry: TelemetrySignal = {
    pressureScore: 0.2,
    activityScore: 0.4,
    densityScore: 0.3,
    collisionScore: 0.1,
    velocityScore: 0.2,
};

const highPressureTelemetry: TelemetrySignal = {
    pressureScore: 0.9,
    activityScore: 0.8,
    densityScore: 0.9,
    collisionScore: 0.9,
    velocityScore: 0.7,
};

const baseProfile: PlayerSceneProfile = {
    playerId: 'player_director',
    level: 8,
    preferredModules: ['tower_defense', 'match3'],
    noveltyBias: 0.5,
    aestheticTaste: {
        mood: 'neon',
        palette: ['cyan', 'amber'],
        density: 'balanced',
    },
};

function content(modules: string[]): GeneratedContent {
    return {
        prompt3DScene: `Generate ${modules.join('+')} director scene`,
        uiStyle: 'director ui',
        story: 'director story',
        bgmPrompt: 'director bgm',
        npcConfig: [],
        visualTokens: ['readable silhouettes'],
        guardrails: ['director guardrail'],
    };
}

function blueprint(id: string, modules: string[], theme: string = 'neon director arena'): DimensionBlueprint {
    return {
        id,
        name: `Scene ${id}`,
        description: 'director scene',
        modules,
        difficulty: 4,
        objectives: [],
        rules: [],
        rewards: [],
        theme,
        content: content(modules),
        config: { themeHint: theme },
    };
}

function tinyPolicy() {
    return {
        hotThreshold: 0.68,
        grayThreshold: 0.34,
        retireThreshold: 0.18,
        inactivityMs: 10 * second,
        grayGraceMs: 5 * second,
        targetVisits: 4,
        hotnessHalfLifeMs: second,
    };
}

describe('SceneDirector', () => {
    it('creates different generation routes for different player profiles', () => {
        const manager = new SceneLifecycleManager(tinyPolicy());
        const director = new SceneDirector();
        const now = 1_000_000;

        const strategist = director.planForPlayer({
            ...baseProfile,
            playerId: 'strategist',
            preferredModules: ['tower_defense', 'card'],
            aestheticTaste: { mood: 'neon bastion', palette: ['cyan', 'gold'], density: 'balanced' },
        }, manager, calmTelemetry, now);
        const runner = director.planForPlayer({
            ...baseProfile,
            playerId: 'runner',
            preferredModules: ['parkour', 'shooter'],
            avoidedModules: ['tower_defense'],
            noveltyBias: 0.8,
            aestheticTaste: { mood: 'kinetic skyline', palette: ['lime', 'magenta'], density: 'clean' },
        }, manager, calmTelemetry, now);

        expect(strategist.generationDirectives.preferredModules[0]).toBe('tower_defense');
        expect(runner.generationDirectives.preferredModules[0]).toBe('parkour');
        expect(runner.generationDirectives.avoidedModules).toContain('tower_defense');
        expect(strategist.exposure.aestheticPromise).not.toBe(runner.exposure.aestheticPromise);
    });

    it('routes high runtime pressure into calmer scene generation', () => {
        const manager = new SceneLifecycleManager(tinyPolicy());
        const director = new SceneDirector();
        const plan = director.planForPlayer({
            ...baseProfile,
            preferredModules: ['shooter', 'parkour', 'tower_defense'],
        }, manager, highPressureTelemetry, 2_000_000);

        expect(plan.intent).toBe('cooldown');
        expect(plan.generationDirectives.preferredModules).toEqual(expect.arrayContaining(['match3', 'puzzle']));
        expect(plan.generationDirectives.avoidedModules).toEqual(expect.arrayContaining(['shooter', 'tower_defense', 'parkour']));
        expect(plan.generationDirectives.difficultyBias).toBeLessThanOrEqual(-0.08);
        expect(plan.warnings[0]).toContain('压力');
    });

    it('prioritizes gray scenes as rescue candidates before retirement', () => {
        const now = 3_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const director = new SceneDirector();
        const scene = manager.createScene(blueprint('cooling', ['tower_defense', 'match3']), baseProfile, now);

        manager.tick(now + 11 * second);
        const plan = director.planForPlayer(baseProfile, manager, calmTelemetry, now + 12 * second);

        expect(manager.getScene(scene.id)?.status).toBe('gray');
        expect(plan.intent).toBe('revisit');
        expect(plan.targetSceneId).toBe(scene.id);
        expect(plan.warnings[0]).toContain('灰度');
        expect(plan.exposure.consistencyChecks).toEqual(expect.arrayContaining(['数值一致性', '空间连续性']));
    });
});
