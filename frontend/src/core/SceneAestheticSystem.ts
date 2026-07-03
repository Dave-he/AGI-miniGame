import type { GeneratedSceneRecord, PlayerSceneProfile } from './SceneLifecycle';
import type { SceneWorldPlan } from './SceneWorldBuilder';

export interface AestheticBreakdown {
    readabilityScore: number;
    coherenceScore: number;
    contrastScore: number;
    noveltyScore: number;
    stabilityScore: number;
}

export interface SceneAestheticReport extends AestheticBreakdown {
    overallScore: number;
    ratingOutOfFive: number;
    label: string;
    summary: string;
    strengths: string[];
    warnings: string[];
}

export class SceneAestheticSystem {
    evaluate(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, worldPlan: SceneWorldPlan): SceneAestheticReport {
        const readabilityScore = this.readability(scene, profile, worldPlan);
        const coherenceScore = this.coherence(scene, profile, worldPlan);
        const contrastScore = this.contrast(worldPlan);
        const noveltyScore = this.novelty(scene, profile, worldPlan);
        const stabilityScore = this.stability(worldPlan);
        const overallScore = clamp01(
            readabilityScore * 0.28 +
            coherenceScore * 0.24 +
            contrastScore * 0.17 +
            noveltyScore * 0.14 +
            stabilityScore * 0.17
        );
        const warnings = this.buildWarnings({ readabilityScore, coherenceScore, contrastScore, noveltyScore, stabilityScore });
        const strengths = this.buildStrengths({ readabilityScore, coherenceScore, contrastScore, noveltyScore, stabilityScore });

        return {
            readabilityScore,
            coherenceScore,
            contrastScore,
            noveltyScore,
            stabilityScore,
            overallScore,
            ratingOutOfFive: Math.max(1, Math.round(overallScore * 50) / 10),
            label: overallScore >= 0.78 ? '高审美' : (overallScore >= 0.58 ? '可读审美' : '待打磨'),
            summary: `readability ${(readabilityScore * 100).toFixed(0)} / coherence ${(coherenceScore * 100).toFixed(0)} / stability ${(stabilityScore * 100).toFixed(0)}`,
            strengths,
            warnings,
        };
    }

    private readability(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, worldPlan: SceneWorldPlan): number {
        const density = profile.aestheticTaste?.density ?? 'balanced';
        const spawnCount = worldPlan.spawnPlans.length;
        const landmarkCount = worldPlan.landmarks.length;
        const hasObjectives = worldPlan.spawnPlans.some(spawn => spawn.role === 'objective');
        const hasHazards = worldPlan.spawnPlans.some(spawn => spawn.role === 'hazard');
        const idealSpawnCount = density === 'clean' ? 7 : (density === 'dense' ? 14 : 10);
        const densityFit = 1 - Math.min(1, Math.abs(spawnCount - idealSpawnCount) / idealSpawnCount);
        const landmarkFit = clamp01(landmarkCount / Math.max(3, Math.min(6, scene.modules.length + 2)));
        const roleCoverage = (hasObjectives ? 0.34 : 0) + (hasHazards ? 0.22 : 0) + (landmarkCount >= 3 ? 0.24 : 0) + (scene.modules.length <= 4 ? 0.20 : 0.08);

        return clamp01(densityFit * 0.42 + landmarkFit * 0.24 + roleCoverage * 0.34);
    }

    private coherence(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, worldPlan: SceneWorldPlan): number {
        const paletteHits = (profile.aestheticTaste?.palette ?? [])
            .filter(color => worldPlan.palette.join(' ').toLowerCase().includes(color.toLowerCase()))
            .length;
        const paletteFit = profile.aestheticTaste?.palette?.length
            ? Math.min(1, paletteHits / profile.aestheticTaste.palette.length + 0.35)
            : 0.62;
        const anchorLabels = new Set(worldPlan.memoryAnchors.map(anchor => anchor.label));
        const moduleCoverage = scene.modules.length > 0
            ? scene.modules.filter(moduleId => anchorLabels.has(moduleId)).length / scene.modules.length
            : 0.5;
        const mood = profile.aestheticTaste?.mood?.toLowerCase() ?? '';
        const moodFit = mood && scene.themeHint.toLowerCase().includes(mood.split(' ')[0]) ? 1 : 0.62;

        return clamp01(paletteFit * 0.30 + moduleCoverage * 0.46 + moodFit * 0.24);
    }

    private contrast(worldPlan: SceneWorldPlan): number {
        const [a, b, c] = worldPlan.palette.map(hexToRgb);
        const paletteDistance = (colorDistance(a, b) + colorDistance(b, c) + colorDistance(a, c)) / 3;
        const landmarkColors = new Set(worldPlan.landmarks.map(landmark => landmark.color));
        const colorVariety = clamp01(landmarkColors.size / Math.max(3, worldPlan.landmarks.length));

        return clamp01((paletteDistance / 255) * 0.62 + colorVariety * 0.38);
    }

    private novelty(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, worldPlan: SceneWorldPlan): number {
        const moduleVariety = clamp01(new Set(scene.modules).size / 4);
        const noveltyBias = profile.noveltyBias ?? 0.5;
        const spatialVariety = clamp01(new Set(worldPlan.memoryAnchors.map(anchor => `${Math.round(anchor.x / 20)}:${Math.round(anchor.z / 20)}`)).size / worldPlan.memoryAnchors.length);

        return clamp01(moduleVariety * 0.40 + noveltyBias * 0.30 + spatialVariety * 0.30);
    }

    private stability(worldPlan: SceneWorldPlan): number {
        const anchors = worldPlan.memoryAnchors;
        if (anchors.length === 0) return 0;

        const uniqueAnchors = new Set(anchors.map(anchor => `${anchor.x}:${anchor.z}`)).size / anchors.length;
        const avgDistance = anchors.reduce((sum, anchor) => sum + Math.sqrt(anchor.x * anchor.x + anchor.z * anchor.z), 0) / anchors.length;
        const spreadFit = clamp01(avgDistance / 140);
        const continuity = worldPlan.continuityKey.length > 8 ? 1 : 0.5;

        return clamp01(uniqueAnchors * 0.42 + spreadFit * 0.28 + continuity * 0.30);
    }

    private buildWarnings(breakdown: AestheticBreakdown): string[] {
        const warnings: string[] = [];
        if (breakdown.readabilityScore < 0.56) warnings.push('玩法目标可读性偏弱');
        if (breakdown.coherenceScore < 0.56) warnings.push('审美偏好与场景主题匹配不足');
        if (breakdown.contrastScore < 0.42) warnings.push('色彩和地标对比不足');
        if (breakdown.stabilityScore < 0.62) warnings.push('空间锚点稳定性不足');
        return warnings;
    }

    private buildStrengths(breakdown: AestheticBreakdown): string[] {
        const strengths: string[] = [];
        if (breakdown.readabilityScore >= 0.72) strengths.push('目标清晰');
        if (breakdown.coherenceScore >= 0.72) strengths.push('主题统一');
        if (breakdown.contrastScore >= 0.62) strengths.push('视觉层次明确');
        if (breakdown.noveltyScore >= 0.68) strengths.push('新鲜感较高');
        if (breakdown.stabilityScore >= 0.74) strengths.push('空间记忆稳定');
        return strengths.length > 0 ? strengths : ['结构可用'];
    }
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}
