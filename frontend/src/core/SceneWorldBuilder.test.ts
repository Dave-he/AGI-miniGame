import { describe, expect, it } from '@jest/globals';
import { SceneWorldBuilder } from './SceneWorldBuilder';
import type { GeneratedSceneRecord, PlayerSceneProfile } from './SceneLifecycle';

const profile: PlayerSceneProfile = {
    playerId: 'player_world',
    level: 8,
    preferredModules: ['tower_defense', 'match3'],
    noveltyBias: 0.6,
    aestheticTaste: {
        mood: 'neon',
        palette: ['cyan', 'amber'],
        density: 'balanced',
    },
};

function scene(id: string, ownerPlayerId: string = 'player_world'): GeneratedSceneRecord {
    return {
        id,
        name: `Scene ${id}`,
        description: 'world builder scene',
        modules: ['tower_defense', 'match3', 'parkour'],
        difficulty: 6,
        themeHint: 'neon skyline',
        visualPrompt: 'neon skyline world',
        story: 'world builder story',
        ownerPlayerId,
        createdAt: 1,
        updatedAt: 1,
        lastVisitedAt: null,
        status: 'active',
        rollout: 1,
        warning: null,
        lifecycleReason: 'new_scene',
        contentHash: `hash_${id}`,
        metrics: {
            visits: 0,
            uniquePlayers: 0,
            revisits: 0,
            completions: 0,
            failures: 0,
            totalPlaySeconds: 0,
            ratingTotal: 0,
            ratingCount: 0,
            aestheticScore: 0.8,
            aestheticReports: 0,
            readabilityScore: 0.8,
            coherenceScore: 0.8,
            contrastScore: 0.8,
            noveltyScore: 0.8,
            stabilityScore: 0.8,
            hotnessScore: 0.5,
            lastHotnessScore: 0.5,
            telemetrySamples: 0,
            totalPressureScore: 0,
            totalActivityScore: 0,
            peakEntityCount: 0,
            totalCollisionCount: 0,
        },
    };
}

describe('SceneWorldBuilder', () => {
    it('builds deterministic spatial anchors for the same generated scene and player', () => {
        const builder = new SceneWorldBuilder();
        const first = builder.build(scene('stable'), profile, 400);
        const second = builder.build(scene('stable'), profile, 400);

        expect(first.continuityKey).toBe(second.continuityKey);
        expect(first.memoryAnchors).toEqual(second.memoryAnchors);
        expect(first.spawnPlans).toEqual(second.spawnPlans);
        expect(first.landmarks).toEqual(second.landmarks);
    });

    it('separates player-specific scene worlds through continuity keys', () => {
        const builder = new SceneWorldBuilder();
        const runner = builder.build(scene('stable', 'player_runner'), { ...profile, playerId: 'player_runner' }, 400);
        const curator = builder.build(scene('stable', 'player_curator'), { ...profile, playerId: 'player_curator' }, 400);

        expect(runner.continuityKey).not.toBe(curator.continuityKey);
        expect(runner.memoryAnchors).not.toEqual(curator.memoryAnchors);
    });

    it('emits gameplay-readable landmarks and bounded spawn plans', () => {
        const builder = new SceneWorldBuilder();
        const plan = builder.build(scene('readable'), profile, 400);

        expect(plan.backgroundLayers).toHaveLength(3);
        expect(plan.landmarks.length).toBeGreaterThanOrEqual(3);
        expect(plan.spawnPlans.some(spawn => spawn.entityType === 2)).toBe(true);
        expect(plan.spawnPlans.some(spawn => spawn.role === 'objective')).toBe(true);
        for (const spawn of plan.spawnPlans) {
            expect(Math.abs(spawn.x)).toBeLessThanOrEqual(200);
            expect(Math.abs(spawn.z)).toBeLessThanOrEqual(200);
        }
    });
});
