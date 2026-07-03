import type { DimensionBlueprint } from './AiEngine';
import type { AestheticBreakdown } from './SceneAestheticSystem';

export type SceneLifecycleStatus = 'active' | 'gray' | 'retired';

export interface PlayerSceneProfile {
    playerId: string;
    level: number;
    preferredModules?: string[];
    avoidedModules?: string[];
    noveltyBias?: number;
    aestheticTaste?: {
        mood?: string;
        palette?: string[];
        density?: 'clean' | 'balanced' | 'dense';
    };
}

export interface SceneLifecyclePolicy {
    hotThreshold: number;
    grayThreshold: number;
    retireThreshold: number;
    inactivityMs: number;
    grayGraceMs: number;
    targetVisits: number;
    hotnessHalfLifeMs: number;
}

export interface SceneGenerationDirectives {
    preferredModules: string[];
    avoidedModules: string[];
    themeHint: string;
    difficultyBias: number;
    rewardMultiplier: number;
    aestheticTags: string[];
    lifecycleNotes: string[];
    reviveCandidates: string[];
    coolingScenes: string[];
}

export interface SceneLifecycleMetrics {
    visits: number;
    uniquePlayers: number;
    revisits: number;
    completions: number;
    failures: number;
    totalPlaySeconds: number;
    ratingTotal: number;
    ratingCount: number;
    aestheticScore: number;
    aestheticReports: number;
    readabilityScore: number;
    coherenceScore: number;
    contrastScore: number;
    noveltyScore: number;
    stabilityScore: number;
    hotnessScore: number;
    lastHotnessScore: number;
    telemetrySamples: number;
    totalPressureScore: number;
    totalActivityScore: number;
    peakEntityCount: number;
    totalCollisionCount: number;
}

export interface GeneratedSceneRecord {
    id: string;
    name: string;
    description: string;
    modules: string[];
    difficulty: number;
    themeHint: string;
    visualPrompt: string;
    story: string;
    ownerPlayerId: string;
    createdAt: number;
    updatedAt: number;
    lastVisitedAt: number | null;
    status: SceneLifecycleStatus;
    rollout: number;
    warning: string | null;
    lifecycleReason: string;
    contentHash: string;
    metrics: SceneLifecycleMetrics;
}

export interface SceneQuery {
    statuses?: SceneLifecycleStatus[];
    includeRetired?: boolean;
}

interface SceneLifecycleSnapshot {
    version: 1;
    policy: SceneLifecyclePolicy;
    scenes: GeneratedSceneRecord[];
    playerVisits: Array<[string, Array<[string, number]>]>;
}

const DEFAULT_POLICY: SceneLifecyclePolicy = {
    hotThreshold: 0.68,
    grayThreshold: 0.34,
    retireThreshold: 0.18,
    inactivityMs: 1000 * 60 * 60 * 24 * 7,
    grayGraceMs: 1000 * 60 * 60 * 24 * 3,
    targetVisits: 12,
    hotnessHalfLifeMs: 1000 * 60 * 60 * 24 * 2,
};

const MODULE_CATALOG = [
    'match3',
    'tower_defense',
    'card',
    'turn_combat',
    'parkour',
    'puzzle',
    'shooter',
    'synthesis',
];

export class SceneLifecycleManager {
    private policy: SceneLifecyclePolicy;
    private scenes: Map<string, GeneratedSceneRecord> = new Map();
    private playerVisits: Map<string, Map<string, number>> = new Map();

    constructor(policy: Partial<SceneLifecyclePolicy> = {}) {
        this.policy = { ...DEFAULT_POLICY, ...policy };
    }

    createScene(blueprint: DimensionBlueprint, profile: PlayerSceneProfile, now: number = Date.now()): GeneratedSceneRecord {
        const modules = [...blueprint.modules];
        const visualPrompt = blueprint.content?.prompt3DScene ?? `Generate a 3D scene for ${blueprint.name}`;
        const story = blueprint.content?.story ?? blueprint.description;
        const themeHint = typeof blueprint.theme === 'string' ? blueprint.theme : (blueprint.config?.themeHint ?? 'adaptive agi world');
        const aestheticScore = this.evaluateAesthetic(themeHint, modules, profile);

        const record: GeneratedSceneRecord = {
            id: blueprint.id,
            name: blueprint.name,
            description: blueprint.description,
            modules,
            difficulty: blueprint.difficulty,
            themeHint,
            visualPrompt,
            story,
            ownerPlayerId: profile.playerId,
            createdAt: now,
            updatedAt: now,
            lastVisitedAt: null,
            status: 'active',
            rollout: 1,
            warning: null,
            lifecycleReason: 'new_scene',
            contentHash: this.hashScene(blueprint.id, modules, themeHint),
            metrics: {
                visits: 0,
                uniquePlayers: 0,
                revisits: 0,
                completions: 0,
                failures: 0,
                totalPlaySeconds: 0,
                ratingTotal: 0,
                ratingCount: 0,
                aestheticScore,
                aestheticReports: 0,
                readabilityScore: aestheticScore,
                coherenceScore: aestheticScore,
                contrastScore: aestheticScore,
                noveltyScore: aestheticScore,
                stabilityScore: aestheticScore,
                hotnessScore: 0.5,
                lastHotnessScore: 0.5,
                telemetrySamples: 0,
                totalPressureScore: 0,
                totalActivityScore: 0,
                peakEntityCount: 0,
                totalCollisionCount: 0,
            },
        };

        this.scenes.set(record.id, record);
        return record;
    }

    recordVisit(sceneId: string, playerId: string, now: number = Date.now(), durationSecs: number = 0): GeneratedSceneRecord | null {
        const scene = this.scenes.get(sceneId);
        if (!scene) return null;

        let sceneVisits = this.playerVisits.get(sceneId);
        if (!sceneVisits) {
            sceneVisits = new Map();
            this.playerVisits.set(sceneId, sceneVisits);
        }

        const hadVisited = sceneVisits.has(playerId);
        if (hadVisited) {
            scene.metrics.revisits += 1;
        } else {
            scene.metrics.uniquePlayers += 1;
        }

        sceneVisits.set(playerId, now);
        scene.metrics.visits += 1;
        scene.metrics.totalPlaySeconds += Math.max(0, durationSecs);
        scene.lastVisitedAt = now;
        scene.updatedAt = now;

        if (scene.status !== 'active') {
            this.reopenScene(scene, now, hadVisited ? 'revisit_reopened' : 'player_reopened');
        } else {
            scene.metrics.hotnessScore = this.computeHotness(scene, now);
        }

        return scene;
    }

    recordPlayTime(sceneId: string, deltaSecs: number, now: number = Date.now()): void {
        const scene = this.scenes.get(sceneId);
        if (!scene) return;
        scene.metrics.totalPlaySeconds += Math.max(0, deltaSecs);
        scene.updatedAt = now;
    }

    recordCompletion(sceneId: string, completed: boolean, now: number = Date.now()): void {
        const scene = this.scenes.get(sceneId);
        if (!scene) return;
        if (completed) {
            scene.metrics.completions += 1;
        } else {
            scene.metrics.failures += 1;
        }
        scene.updatedAt = now;
        scene.metrics.hotnessScore = this.computeHotness(scene, now);
    }

    recordAestheticVote(sceneId: string, rating: number, now: number = Date.now()): void {
        const scene = this.scenes.get(sceneId);
        if (!scene) return;
        const normalized = Math.max(1, Math.min(5, rating));
        scene.metrics.ratingTotal += normalized;
        scene.metrics.ratingCount += 1;
        scene.metrics.aestheticScore = scene.metrics.ratingTotal / scene.metrics.ratingCount / 5;
        scene.updatedAt = now;
        scene.metrics.hotnessScore = this.computeHotness(scene, now);
    }

    recordAestheticReport(sceneId: string, report: AestheticBreakdown & { overallScore: number }, now: number = Date.now()): void {
        const scene = this.scenes.get(sceneId);
        if (!scene) return;

        const previousReports = scene.metrics.aestheticReports;
        const nextReports = previousReports + 1;
        scene.metrics.aestheticReports = nextReports;
        scene.metrics.readabilityScore = averageMetric(scene.metrics.readabilityScore, report.readabilityScore, previousReports);
        scene.metrics.coherenceScore = averageMetric(scene.metrics.coherenceScore, report.coherenceScore, previousReports);
        scene.metrics.contrastScore = averageMetric(scene.metrics.contrastScore, report.contrastScore, previousReports);
        scene.metrics.noveltyScore = averageMetric(scene.metrics.noveltyScore, report.noveltyScore, previousReports);
        scene.metrics.stabilityScore = averageMetric(scene.metrics.stabilityScore, report.stabilityScore, previousReports);
        scene.metrics.aestheticScore = averageMetric(scene.metrics.aestheticScore, report.overallScore, previousReports);
        scene.updatedAt = now;
        scene.metrics.hotnessScore = this.computeHotness(scene, now);
    }

    recordRuntimeTelemetry(
        sceneId: string,
        telemetry: { pressureScore: number; activityScore: number; entityCount: number; collisionCount: number },
        now: number = Date.now()
    ): void {
        const scene = this.scenes.get(sceneId);
        if (!scene) return;

        scene.metrics.telemetrySamples += 1;
        scene.metrics.totalPressureScore += Math.max(0, Math.min(1, telemetry.pressureScore));
        scene.metrics.totalActivityScore += Math.max(0, Math.min(1, telemetry.activityScore));
        scene.metrics.peakEntityCount = Math.max(scene.metrics.peakEntityCount, Math.max(0, telemetry.entityCount));
        scene.metrics.totalCollisionCount += Math.max(0, telemetry.collisionCount);
        scene.updatedAt = now;
    }

    tick(now: number = Date.now()): GeneratedSceneRecord[] {
        const changed: GeneratedSceneRecord[] = [];
        for (const scene of this.scenes.values()) {
            const before = scene.status;
            this.evaluateLifecycle(scene, now);
            if (scene.status !== before) {
                changed.push(scene);
            }
        }
        return changed;
    }

    buildGenerationDirectives(profile: PlayerSceneProfile, now: number = Date.now()): SceneGenerationDirectives {
        this.tick(now);

        const moduleHeat = this.calculateModuleHeat(now);
        const preferred = this.rankModulesForPlayer(profile, moduleHeat).slice(0, 4);
        const avoidedFromDecay = MODULE_CATALOG
            .filter(moduleId => (moduleHeat.get(moduleId) ?? 0) < this.policy.retireThreshold * 0.6)
            .slice(0, 2);
        const grayScenes = this.getScenes({ statuses: ['gray'] });
        const retiredScenes = this.getScenes({ statuses: ['retired'], includeRetired: true });
        const hotScene = this.getScenes({ statuses: ['active'] })
            .sort((a, b) => b.metrics.hotnessScore - a.metrics.hotnessScore)[0];

        const aestheticTags = this.planAestheticTags(profile, preferred);
        const themeHint = [
            profile.aestheticTaste?.mood ?? hotScene?.themeHint ?? 'neon adaptive city',
            aestheticTags.join(' '),
            preferred.join(' + '),
        ].join(', ');

        const playerLevelDifficulty = Math.min(0.25, Math.max(-0.1, (profile.level - 5) * 0.015));

        return {
            preferredModules: preferred,
            avoidedModules: [...new Set([...(profile.avoidedModules ?? []), ...avoidedFromDecay])],
            themeHint,
            difficultyBias: playerLevelDifficulty + ((profile.noveltyBias ?? 0.5) - 0.5) * 0.12,
            rewardMultiplier: grayScenes.length > 0 ? 1.12 : 1,
            aestheticTags,
            lifecycleNotes: [
                grayScenes.length > 0 ? `${grayScenes.length} scenes are in gray rollout` : 'no gray rollout pressure',
                retiredScenes.length > 0 ? `${retiredScenes.length} scenes can be revived by revisit` : 'no retired revisit candidates',
                `module heat: ${preferred.map(m => `${m}:${(moduleHeat.get(m) ?? 0).toFixed(2)}`).join(', ')}`,
            ],
            reviveCandidates: retiredScenes.slice(0, 3).map(scene => scene.id),
            coolingScenes: grayScenes.slice(0, 3).map(scene => scene.id),
        };
    }

    getScene(sceneId: string): GeneratedSceneRecord | null {
        return this.scenes.get(sceneId) ?? null;
    }

    getScenes(query: SceneQuery = {}): GeneratedSceneRecord[] {
        const statuses = query.statuses ? new Set(query.statuses) : null;
        return Array.from(this.scenes.values())
            .filter(scene => {
                if (statuses && !statuses.has(scene.status)) return false;
                if (!query.includeRetired && scene.status === 'retired') return false;
                return true;
            })
            .sort((a, b) => b.metrics.hotnessScore - a.metrics.hotnessScore);
    }

    getPolicy(): SceneLifecyclePolicy {
        return { ...this.policy };
    }

    saveToJSON(): string {
        const snapshot: SceneLifecycleSnapshot = {
            version: 1,
            policy: this.policy,
            scenes: Array.from(this.scenes.values()),
            playerVisits: Array.from(this.playerVisits.entries()).map(([sceneId, visits]) => [
                sceneId,
                Array.from(visits.entries()),
            ]),
        };

        return JSON.stringify(snapshot);
    }

    loadFromJSON(json: string): boolean {
        try {
            const snapshot = JSON.parse(json) as Partial<SceneLifecycleSnapshot>;
            if (snapshot.version !== 1 || !Array.isArray(snapshot.scenes)) {
                return false;
            }

            this.policy = { ...DEFAULT_POLICY, ...(snapshot.policy ?? {}) };
            this.scenes = new Map();
            for (const scene of snapshot.scenes) {
                if (!scene.id || !Array.isArray(scene.modules)) continue;
                const metrics = Object.assign({
                    visits: 0,
                    uniquePlayers: 0,
                    revisits: 0,
                    completions: 0,
                    failures: 0,
                    totalPlaySeconds: 0,
                    ratingTotal: 0,
                    ratingCount: 0,
                    aestheticScore: 0.5,
                    aestheticReports: 0,
                    readabilityScore: 0.5,
                    coherenceScore: 0.5,
                    contrastScore: 0.5,
                    noveltyScore: 0.5,
                    stabilityScore: 0.5,
                    hotnessScore: 0.5,
                    lastHotnessScore: 0.5,
                    telemetrySamples: 0,
                    totalPressureScore: 0,
                    totalActivityScore: 0,
                    peakEntityCount: 0,
                    totalCollisionCount: 0,
                }, scene.metrics ?? {});
                this.scenes.set(scene.id, {
                    ...scene,
                    status: this.normalizeStatus(scene.status),
                    metrics,
                });
            }

            this.playerVisits = new Map();
            for (const [sceneId, visits] of snapshot.playerVisits ?? []) {
                this.playerVisits.set(sceneId, new Map(visits));
            }

            return true;
        } catch (e) {
            console.warn('Failed to load SceneLifecycleManager from JSON:', e);
            return false;
        }
    }

    saveToStorage(key: string = 'agi_scene_lifecycle'): boolean {
        if (typeof localStorage === 'undefined') return false;
        try {
            localStorage.setItem(key, this.saveToJSON());
            return true;
        } catch (e) {
            console.warn('Failed to save scene lifecycle:', e);
            return false;
        }
    }

    loadFromStorage(key: string = 'agi_scene_lifecycle'): boolean {
        if (typeof localStorage === 'undefined') return false;
        try {
            const json = localStorage.getItem(key);
            return json ? this.loadFromJSON(json) : false;
        } catch (e) {
            console.warn('Failed to load scene lifecycle:', e);
            return false;
        }
    }

    private evaluateLifecycle(scene: GeneratedSceneRecord, now: number): void {
        scene.metrics.lastHotnessScore = scene.metrics.hotnessScore;
        scene.metrics.hotnessScore = this.computeHotness(scene, now);

        if (scene.status === 'retired') return;

        const lastActivity = scene.lastVisitedAt ?? scene.createdAt;
        const inactiveMs = now - lastActivity;

        if (scene.status === 'gray') {
            scene.rollout = Math.max(0.15, scene.rollout - 0.08);
            const grayAge = now - scene.updatedAt;

            if (scene.metrics.hotnessScore >= this.policy.hotThreshold) {
                this.activateScene(scene, now, 'hotness_recovered');
                return;
            }

            if (scene.metrics.hotnessScore <= this.policy.retireThreshold && grayAge >= this.policy.grayGraceMs) {
                scene.status = 'retired';
                scene.rollout = 0;
                scene.warning = `场景「${scene.name}」已淘汰；任意玩家复访会重新开启。`;
                scene.lifecycleReason = 'retired_by_decay';
                scene.updatedAt = now;
            }
            return;
        }

        if (scene.metrics.hotnessScore < this.policy.grayThreshold || inactiveMs >= this.policy.inactivityMs) {
            scene.status = 'gray';
            scene.rollout = 0.35;
            scene.warning = `场景「${scene.name}」热度走低，进入灰度；复访、完成或高评分会恢复。`;
            scene.lifecycleReason = inactiveMs >= this.policy.inactivityMs ? 'gray_by_inactivity' : 'gray_by_low_hotness';
            scene.updatedAt = now;
        }
    }

    private activateScene(scene: GeneratedSceneRecord, now: number, reason: string): void {
        scene.status = 'active';
        scene.rollout = 1;
        scene.warning = null;
        scene.lifecycleReason = reason;
        scene.updatedAt = now;
    }

    private reopenScene(scene: GeneratedSceneRecord, now: number, reason: string): void {
        this.activateScene(scene, now, reason);
        scene.metrics.hotnessScore = Math.max(this.policy.hotThreshold, this.computeHotness(scene, now));
    }

    private computeHotness(scene: GeneratedSceneRecord, now: number): number {
        const lastActivity = scene.lastVisitedAt ?? scene.createdAt;
        const ageMs = Math.max(0, now - lastActivity);
        const recency = Math.pow(0.5, ageMs / this.policy.hotnessHalfLifeMs);
        const utilization = Math.min(1, scene.metrics.visits / this.policy.targetVisits);
        const revisitRate = scene.metrics.visits > 0 ? scene.metrics.revisits / scene.metrics.visits : 0;
        const completionRate = scene.metrics.completions + scene.metrics.failures > 0
            ? scene.metrics.completions / (scene.metrics.completions + scene.metrics.failures)
            : 0.45;
        const playDepth = Math.min(1, scene.metrics.totalPlaySeconds / (this.policy.targetVisits * 90));
        const aesthetic = scene.metrics.aestheticScore;
        const runtimeActivity = scene.metrics.telemetrySamples > 0
            ? Math.min(1, scene.metrics.totalActivityScore / scene.metrics.telemetrySamples)
            : 0;

        const score =
            recency * 0.25 +
            utilization * 0.20 +
            revisitRate * 0.17 +
            completionRate * 0.13 +
            playDepth * 0.08 +
            runtimeActivity * 0.07 +
            aesthetic * 0.10;

        return Math.max(0, Math.min(1, score));
    }

    private calculateModuleHeat(now: number): Map<string, number> {
        const heat = new Map<string, number>();
        for (const moduleId of MODULE_CATALOG) {
            heat.set(moduleId, 0);
        }

        for (const scene of this.scenes.values()) {
            if (scene.status === 'retired') continue;
            const score = this.computeHotness(scene, now);
            for (const moduleId of scene.modules) {
                heat.set(moduleId, Math.max(heat.get(moduleId) ?? 0, score));
            }
        }

        return heat;
    }

    private rankModulesForPlayer(profile: PlayerSceneProfile, heat: Map<string, number>): string[] {
        const preferred = new Set(profile.preferredModules ?? []);
        const avoided = new Set(profile.avoidedModules ?? []);
        const novelty = profile.noveltyBias ?? 0.5;

        return MODULE_CATALOG
            .filter(moduleId => !avoided.has(moduleId))
            .sort((a, b) => {
                const scoreA = (heat.get(a) ?? 0) * 0.45 + (preferred.has(a) ? 0.4 : 0) + (1 - (heat.get(a) ?? 0)) * novelty * 0.15;
                const scoreB = (heat.get(b) ?? 0) * 0.45 + (preferred.has(b) ? 0.4 : 0) + (1 - (heat.get(b) ?? 0)) * novelty * 0.15;
                return scoreB - scoreA;
            });
    }

    private planAestheticTags(profile: PlayerSceneProfile, modules: string[]): string[] {
        const tags = new Set<string>();
        const hasAction = modules.some(id => ['parkour', 'shooter', 'turn_combat'].includes(id));
        const hasStrategy = modules.some(id => ['tower_defense', 'card', 'puzzle'].includes(id));
        const hasCraft = modules.includes('synthesis');

        tags.add(profile.aestheticTaste?.density === 'dense' ? 'layered skyline' : 'readable silhouettes');
        tags.add(hasAction && hasStrategy ? 'contrast rhythm' : 'coherent rhythm');
        tags.add(hasCraft ? 'collectible material language' : 'clear objective landmarks');
        tags.add(profile.aestheticTaste?.palette?.join(' ') ?? 'cyan amber magenta accents');

        return Array.from(tags);
    }

    private evaluateAesthetic(themeHint: string, modules: string[], profile: PlayerSceneProfile): number {
        const density = profile.aestheticTaste?.density ?? 'balanced';
        const moduleCountFit = modules.length >= 2 && modules.length <= 4 ? 0.22 : 0.08;
        const contrastFit = modules.some(id => ['parkour', 'shooter'].includes(id)) &&
            modules.some(id => ['tower_defense', 'card', 'puzzle', 'synthesis'].includes(id)) ? 0.22 : 0.12;
        const paletteFit = profile.aestheticTaste?.palette && profile.aestheticTaste.palette.length >= 2 ? 0.18 : 0.12;
        const moodFit = profile.aestheticTaste?.mood && themeHint.toLowerCase().includes(profile.aestheticTaste.mood.toLowerCase()) ? 0.16 : 0.10;
        const densityFit = density === 'balanced' ? 0.16 : 0.12;
        const noveltyFit = Math.min(0.16, (profile.noveltyBias ?? 0.5) * 0.16);

        return Math.max(0.1, Math.min(1, moduleCountFit + contrastFit + paletteFit + moodFit + densityFit + noveltyFit));
    }

    private hashScene(sceneId: string, modules: string[], themeHint: string): string {
        const source = `${sceneId}:${modules.join('|')}:${themeHint}`;
        let hash = 0;
        for (let i = 0; i < source.length; i++) {
            hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    }

    private normalizeStatus(status: string): SceneLifecycleStatus {
        if (status === 'gray' || status === 'retired') return status;
        return 'active';
    }
}

function averageMetric(previousAverage: number, nextValue: number, previousCount: number): number {
    const count = Math.max(0, previousCount);
    const value = Math.max(0, Math.min(1, Number.isFinite(nextValue) ? nextValue : 0));
    return (previousAverage * count + value) / (count + 1);
}
