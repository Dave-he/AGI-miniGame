import type { GeneratedSceneRecord, PlayerSceneProfile, SceneGenerationDirectives, SceneLifecycleManager } from './SceneLifecycle';
import type { TelemetrySignal } from './EngineTelemetry';

export type SceneDirectorIntent = 'continue' | 'generate' | 'revisit' | 'rescue' | 'cooldown';

export interface SceneDirectorPlan {
    playerId: string;
    intent: SceneDirectorIntent;
    headline: string;
    actionLabel: string;
    targetSceneId: string | null;
    recommendedScenes: GeneratedSceneRecord[];
    generationDirectives: SceneGenerationDirectives;
    reasonCodes: string[];
    warnings: string[];
    exposure: {
        originLabel: string;
        consistencyChecks: string[];
        aestheticPromise: string;
    };
}

const CALM_MODULES = ['match3', 'puzzle', 'synthesis', 'card'];
const PRESSURE_MODULES = ['shooter', 'tower_defense', 'parkour', 'turn_combat'];

export class SceneDirector {
    planForPlayer(
        profile: PlayerSceneProfile,
        lifecycle: SceneLifecycleManager,
        telemetry: TelemetrySignal,
        now: number = Date.now()
    ): SceneDirectorPlan {
        const baseDirectives = lifecycle.buildGenerationDirectives(profile, now);
        const generationDirectives = this.adjustDirectivesForRuntime(baseDirectives, telemetry);
        const recommendedScenes = this.recommendScenes(profile, lifecycle, telemetry, now, 3);
        const coolingScenes = lifecycle.getScenes({ statuses: ['gray'] });
        const retiredScenes = lifecycle.getScenes({ statuses: ['retired'], includeRetired: true });
        const target = recommendedScenes[0] ?? null;
        const reasonCodes: string[] = [
            telemetry.pressureScore >= 0.72 ? 'runtime_pressure_high' : 'runtime_pressure_ok',
            generationDirectives.lifecycleNotes[0] ?? 'lifecycle_stable',
        ];
        const warnings: string[] = [];

        let intent: SceneDirectorIntent = 'generate';
        let headline = '为当前玩家生成新场景';
        let actionLabel = '生成个性场景';
        let targetSceneId: string | null = null;

        if (telemetry.pressureScore >= 0.82) {
            intent = 'cooldown';
            headline = '运行压力偏高，下一幕降低密度并强化可读性';
            actionLabel = '生成降压场景';
            warnings.push('当前碰撞或速度压力较高，新场景将避开高压玩法组合。');
            reasonCodes.push('prefer_calm_modules');
        } else if (target && target.status === 'gray') {
            intent = (profile.noveltyBias ?? 0.5) >= 0.7 ? 'rescue' : 'revisit';
            headline = `场景「${target.name}」即将淘汰，建议复访救场`;
            actionLabel = '复访灰度场景';
            targetSceneId = target.id;
            warnings.push(target.warning ?? '灰度场景需要复访、完成或高评分来恢复。');
            reasonCodes.push('gray_revisit_candidate');
        } else if (target && target.status === 'retired') {
            intent = 'revisit';
            headline = `已淘汰场景「${target.name}」可被复访重新开启`;
            actionLabel = '复访淘汰场景';
            targetSceneId = target.id;
            warnings.push(target.warning ?? '淘汰场景被任意玩家复访后会重新开启。');
            reasonCodes.push('retired_reopen_candidate');
        } else if (target && target.metrics.hotnessScore >= lifecycle.getPolicy().hotThreshold) {
            intent = 'continue';
            headline = `继续加热热门场景「${target.name}」`;
            actionLabel = '生成同系变体';
            targetSceneId = target.id;
            reasonCodes.push('hot_scene_variant');
        } else if (coolingScenes.length > 0 || retiredScenes.length > 0) {
            reasonCodes.push('scene_pool_has_decay_pressure');
        }

        return {
            playerId: profile.playerId,
            intent,
            headline,
            actionLabel,
            targetSceneId,
            recommendedScenes,
            generationDirectives,
            reasonCodes,
            warnings,
            exposure: {
                originLabel: 'AGI 策展生成',
                consistencyChecks: ['数值一致性', '空间连续性', '规则可读性'],
                aestheticPromise: this.describeAestheticPromise(profile, generationDirectives),
            },
        };
    }

    recommendScenes(
        profile: PlayerSceneProfile,
        lifecycle: SceneLifecycleManager,
        telemetry: TelemetrySignal,
        now: number = Date.now(),
        limit: number = 3
    ): GeneratedSceneRecord[] {
        lifecycle.tick(now);

        return lifecycle.getScenes({ includeRetired: true })
            .map(scene => ({
                scene,
                score: this.scoreScene(scene, profile, telemetry),
            }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(entry => entry.scene);
    }

    scoreScene(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, telemetry: TelemetrySignal): number {
        const preferred = new Set(profile.preferredModules ?? []);
        const avoided = new Set(profile.avoidedModules ?? []);
        const moduleMatches = scene.modules.filter(moduleId => preferred.has(moduleId)).length;
        const avoidedMatches = scene.modules.filter(moduleId => avoided.has(moduleId)).length;
        const preferenceScore = scene.modules.length > 0 ? moduleMatches / scene.modules.length : 0;
        const novelty = profile.noveltyBias ?? 0.5;
        const noveltyScore = (1 - scene.metrics.hotnessScore) * novelty;
        const pressurePenalty = telemetry.pressureScore >= 0.75 && scene.modules.some(moduleId => PRESSURE_MODULES.includes(moduleId))
            ? 0.22
            : 0;
        const revisitNeed = scene.status === 'gray' ? 0.24 : (scene.status === 'retired' ? 0.16 : 0);
        const statusPenalty = scene.status === 'retired' && novelty < 0.35 ? 0.12 : 0;

        return Math.max(
            0,
            scene.metrics.hotnessScore * 0.36 +
            preferenceScore * 0.26 +
            scene.metrics.aestheticScore * 0.14 +
            noveltyScore * 0.12 +
            revisitNeed -
            avoidedMatches * 0.30 -
            pressurePenalty -
            statusPenalty
        );
    }

    private adjustDirectivesForRuntime(
        directives: SceneGenerationDirectives,
        telemetry: TelemetrySignal
    ): SceneGenerationDirectives {
        if (telemetry.pressureScore < 0.72) {
            return directives;
        }

        const preferredModules = [
            ...directives.preferredModules.filter(moduleId => CALM_MODULES.includes(moduleId)),
            ...CALM_MODULES.filter(moduleId => !directives.avoidedModules.includes(moduleId)),
        ].slice(0, 4);
        const avoidedModules = [...new Set([...directives.avoidedModules, ...PRESSURE_MODULES])];

        return {
            ...directives,
            preferredModules,
            avoidedModules,
            difficultyBias: Math.min(directives.difficultyBias, -0.08),
            rewardMultiplier: Math.max(directives.rewardMultiplier, 1.08),
            aestheticTags: [...new Set([...directives.aestheticTags, 'low clutter readability', 'rest space landmarks'])],
            lifecycleNotes: [
                ...directives.lifecycleNotes,
                `runtime pressure ${telemetry.pressureScore.toFixed(2)}: calm module routing`,
            ],
        };
    }

    private describeAestheticPromise(profile: PlayerSceneProfile, directives: SceneGenerationDirectives): string {
        const palette = profile.aestheticTaste?.palette?.join(' / ') ?? 'cyan / amber / magenta';
        const density = profile.aestheticTaste?.density ?? 'balanced';
        const tags = directives.aestheticTags.slice(0, 2).join(', ');
        return `${density} density, ${palette}, ${tags}`;
    }
}
