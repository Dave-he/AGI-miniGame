import { describe, expect, it } from '@jest/globals';
import { SceneLifecycleManager } from './SceneLifecycle';
import type { DimensionBlueprint, GeneratedContent } from './AiEngine';
import type { PlayerSceneProfile } from './SceneLifecycle';

const second = 1000;

const baseProfile: PlayerSceneProfile = {
    playerId: 'player_a',
    level: 8,
    preferredModules: ['tower_defense', 'match3'],
    noveltyBias: 0.6,
    aestheticTaste: {
        mood: 'neon',
        palette: ['cyan', 'amber'],
        density: 'balanced',
    },
};

function content(modules: string[]): GeneratedContent {
    return {
        prompt3DScene: `Generate ${modules.join('+')} test scene`,
        uiStyle: 'test ui',
        story: 'test story',
        bgmPrompt: 'test bgm',
        npcConfig: [],
        visualTokens: ['readable silhouettes'],
        guardrails: ['test guardrail'],
    };
}

function blueprint(id: string, modules: string[], theme: string = 'neon test arena'): DimensionBlueprint {
    return {
        id,
        name: `Scene ${id}`,
        description: 'test scene',
        modules,
        difficulty: 3,
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

describe('SceneLifecycleManager', () => {
    it('keeps high-performing scenes active', () => {
        const now = 1_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const scene = manager.createScene(blueprint('hot', ['tower_defense', 'match3']), baseProfile, now);

        for (let i = 0; i < 6; i++) {
            manager.recordVisit(scene.id, `player_${i}`, now + second, 140);
        }
        manager.recordCompletion(scene.id, true, now + second);
        manager.recordAestheticVote(scene.id, 5, now + second);

        manager.tick(now + 2 * second);

        expect(manager.getScene(scene.id)?.status).toBe('active');
        expect(manager.getScene(scene.id)?.warning).toBeNull();
    });

    it('feeds runtime telemetry into scene heat', () => {
        const now = 1_500_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const scene = manager.createScene(blueprint('telemetry_hot', ['shooter', 'tower_defense']), baseProfile, now);

        manager.recordVisit(scene.id, 'player_runtime', now + second, 30);
        for (let i = 0; i < 6; i++) {
            manager.recordRuntimeTelemetry(scene.id, {
                pressureScore: 0.6,
                activityScore: 0.9,
                entityCount: 18,
                collisionCount: 3,
            }, now + second + i * 100);
        }
        manager.tick(now + 2 * second);

        const updated = manager.getScene(scene.id);
        expect(updated?.metrics.telemetrySamples).toBe(6);
        expect(updated?.metrics.peakEntityCount).toBe(18);
        expect(updated?.metrics.totalCollisionCount).toBe(18);
        expect(updated?.metrics.hotnessScore).toBeGreaterThan(0.34);
    });

    it('grays low-heat scenes before retiring them', () => {
        const now = 2_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const scene = manager.createScene(blueprint('cold', ['puzzle', 'card']), baseProfile, now);

        const grayChanges = manager.tick(now + 11 * second);
        const grayScene = manager.getScene(scene.id);

        expect(grayChanges.map(s => s.id)).toContain(scene.id);
        expect(grayScene?.status).toBe('gray');
        expect(grayScene?.rollout).toBeLessThan(1);
        expect(grayScene?.warning).toContain('进入灰度');

        manager.tick(now + 17 * second);

        const retiredScene = manager.getScene(scene.id);
        expect(retiredScene?.status).toBe('retired');
        expect(retiredScene?.rollout).toBe(0);
        expect(retiredScene?.warning).toContain('已淘汰');
    });

    it('reopens retired scenes when any player revisits', () => {
        const now = 3_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const scene = manager.createScene(blueprint('revisit', ['parkour', 'synthesis']), baseProfile, now);

        manager.tick(now + 11 * second);
        manager.tick(now + 17 * second);
        expect(manager.getScene(scene.id)?.status).toBe('retired');

        manager.recordVisit(scene.id, 'returning_player', now + 18 * second, 60);

        const reopened = manager.getScene(scene.id);
        expect(reopened?.status).toBe('active');
        expect(reopened?.rollout).toBe(1);
        expect(reopened?.warning).toBeNull();
        expect(reopened?.lifecycleReason).toBe('player_reopened');
    });

    it('uses player preference and avoidance when planning generation', () => {
        const now = 4_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const towerScene = manager.createScene(blueprint('tower_hot', ['tower_defense', 'card']), baseProfile, now);

        for (let i = 0; i < 5; i++) {
            manager.recordVisit(towerScene.id, `player_${i}`, now + second, 120);
        }
        manager.recordCompletion(towerScene.id, true, now + second);
        manager.recordAestheticVote(towerScene.id, 5, now + second);

        const towerFan = manager.buildGenerationDirectives({
            ...baseProfile,
            playerId: 'tower_fan',
            preferredModules: ['tower_defense'],
        }, now + 2 * second);
        const actionFan = manager.buildGenerationDirectives({
            ...baseProfile,
            playerId: 'action_fan',
            preferredModules: ['parkour'],
            avoidedModules: ['tower_defense'],
        }, now + 2 * second);

        expect(towerFan.preferredModules[0]).toBe('tower_defense');
        expect(actionFan.preferredModules).not.toContain('tower_defense');
        expect(actionFan.avoidedModules).toContain('tower_defense');
        expect(actionFan.themeHint).toContain('parkour');
    });

    it('persists generated scene pools and visit memory', () => {
        const now = 5_000_000;
        const manager = new SceneLifecycleManager(tinyPolicy());
        const scene = manager.createScene(blueprint('persisted', ['match3', 'synthesis']), baseProfile, now);

        manager.recordVisit(scene.id, baseProfile.playerId, now + second, 90);
        const json = manager.saveToJSON();

        const restored = new SceneLifecycleManager();
        expect(restored.loadFromJSON(json)).toBe(true);

        const restoredScene = restored.getScene(scene.id);
        expect(restoredScene?.metrics.visits).toBe(1);
        expect(restoredScene?.metrics.uniquePlayers).toBe(1);

        restored.recordVisit(scene.id, baseProfile.playerId, now + 2 * second, 30);
        expect(restored.getScene(scene.id)?.metrics.revisits).toBe(1);
    });
});
