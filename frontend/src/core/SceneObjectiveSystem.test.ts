import { describe, expect, it } from '@jest/globals';
import { SceneAestheticSystem } from './SceneAestheticSystem';
import { SceneObjectiveSystem } from './SceneObjectiveSystem';
import { SceneWorldBuilder } from './SceneWorldBuilder';
import { SceneLifecycleManager } from './SceneLifecycle';
import { UnifiedWorldState } from './WorldState';
import type { DimensionBlueprint, GeneratedContent } from './AiEngine';
import type { PlayerSceneProfile } from './SceneLifecycle';
import type { EngineTelemetry, TelemetrySignal } from './EngineTelemetry';

const profile: PlayerSceneProfile = {
    playerId: 'objective_player',
    level: 8,
    preferredModules: ['parkour', 'match3'],
    noveltyBias: 0.6,
    aestheticTaste: {
        mood: 'neon',
        palette: ['cyan', 'amber'],
        density: 'balanced',
    },
};

const telemetry: EngineTelemetry = {
    frame_count: 60,
    total_elapsed_secs: 1,
    last_dt: 0.1,
    bounds_size: 400,
    entity_count: 12,
    dynamic_entity_count: 8,
    static_entity_count: 4,
    last_collision_count: 2,
    total_collision_count: 12,
    last_removed_count: 0,
    total_removed_count: 0,
    total_spawned_count: 12,
    average_speed: 80,
    max_speed: 140,
};

const signal: TelemetrySignal = {
    pressureScore: 0.42,
    activityScore: 0.55,
    densityScore: 0.4,
    collisionScore: 0.2,
    velocityScore: 0.3,
};

function content(modules: string[]): GeneratedContent {
    return {
        prompt3DScene: `Generate ${modules.join('+')} objective scene`,
        uiStyle: 'objective ui',
        story: 'objective story',
        bgmPrompt: 'objective bgm',
        npcConfig: [],
        visualTokens: ['readable silhouettes'],
        guardrails: ['objective guardrail'],
    };
}

function blueprint(id: string): DimensionBlueprint {
    const modules = ['parkour', 'match3', 'synthesis'];
    return {
        id,
        name: `Scene ${id}`,
        description: 'objective scene',
        modules,
        difficulty: 4,
        objectives: [],
        rules: [],
        rewards: [],
        theme: 'neon objective city',
        content: content(modules),
        config: { themeHint: 'neon objective city' },
    };
}

describe('SceneObjectiveSystem', () => {
    it('progresses generated scene objectives from runtime telemetry and score', () => {
        const lifecycle = new SceneLifecycleManager();
        const scene = lifecycle.createScene(blueprint('runtime'), profile, 1_000);
        const worldPlan = new SceneWorldBuilder().build(scene, profile, 400);
        const aesthetic = new SceneAestheticSystem().evaluate(scene, profile, worldPlan);
        const system = new SceneObjectiveSystem();
        const session = system.createSession(scene, worldPlan, aesthetic, 1, 1_000);

        for (let i = 0; i < 10; i++) {
            system.update(session, { dt: 1, score: 160, telemetry, signal });
        }

        expect(session.completed).toBe(true);
        expect(session.objectives.find(objective => objective.id === 'survive_time')?.completed).toBe(true);
        expect(session.objectives.find(objective => objective.id === 'anchor_stability')?.completed).toBe(true);
        expect(session.objectives.find(objective => objective.id === 'pressure_control')?.current).toBeGreaterThan(0);
    });

    it('settles completion once through unified wallet, experience, and progression', () => {
        const lifecycle = new SceneLifecycleManager();
        const scene = lifecycle.createScene(blueprint('settle'), profile, 2_000);
        const worldPlan = new SceneWorldBuilder().build(scene, profile, 400);
        const aesthetic = new SceneAestheticSystem().evaluate(scene, profile, worldPlan);
        const system = new SceneObjectiveSystem();
        const session = system.createSession(scene, worldPlan, aesthetic, 1.2, 2_000);
        const worldState = new UnifiedWorldState(profile.playerId);

        for (let i = 0; i < 10; i++) {
            system.update(session, { dt: 1, score: 180, telemetry, signal });
        }
        const completion = system.settle(session, worldState);
        const secondSettle = system.settle(session, worldState);

        expect(completion).not.toBeNull();
        expect(secondSettle).toBeNull();
        expect(worldState.wallet.getBalance('gold')).toBe(completion?.rewards.gold);
        expect(worldState.wallet.getBalance('token')).toBe(completion?.rewards.token);
        expect(worldState.player.experience).toBeGreaterThan(0);
        expect(worldState.progression.dimensionsCompleted).toContain(scene.id);
    });
});
