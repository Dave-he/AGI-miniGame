import type { GeneratedSceneRecord, PlayerSceneProfile } from './SceneLifecycle';

export interface SceneSpawnPlan {
    x: number;
    y: number;
    z: number;
    color: string;
    vx: number;
    vy: number;
    vz: number;
    entityType: number;
    role: 'anchor' | 'hazard' | 'objective' | 'defender';
}

export interface SceneLandmarkPlan {
    id: string;
    x: number;
    y: number;
    z: number;
    radius: number;
    height: number;
    color: string;
    kind: 'portal' | 'beacon' | 'archive' | 'arena';
}

export interface SceneWorldPlan {
    seed: number;
    palette: [string, string, string];
    backgroundLayers: string[];
    spawnPlans: SceneSpawnPlan[];
    landmarks: SceneLandmarkPlan[];
    memoryAnchors: Array<{ id: string; x: number; z: number; label: string }>;
    continuityKey: string;
    narrativeTags: string[];
}

const PALETTES: Array<[string, string, string]> = [
    ['#06111f', '#0e7490', '#f59e0b'],
    ['#090b18', '#7c3aed', '#22c55e'],
    ['#10140f', '#16a34a', '#f97316'],
    ['#15100b', '#dc2626', '#06b6d4'],
    ['#0d1020', '#2563eb', '#eab308'],
    ['#111827', '#db2777', '#84cc16'],
];

const MODULE_COLORS: Record<string, string> = {
    match3: '#22d3ee',
    tower_defense: '#22c55e',
    parkour: '#f97316',
    shooter: '#ef4444',
    synthesis: '#a3e635',
    card: '#a78bfa',
    turn_combat: '#facc15',
    puzzle: '#38bdf8',
};

const MODULE_ENTITY_TYPES: Record<string, number> = {
    tower_defense: 2,
    shooter: 1,
    turn_combat: 1,
};

export class SceneWorldBuilder {
    build(scene: GeneratedSceneRecord, profile: PlayerSceneProfile, boundsSize: number): SceneWorldPlan {
        const continuityKey = `${scene.contentHash}:${scene.ownerPlayerId}:${profile.playerId}`;
        const rng = new SeededRandom(hashString(continuityKey));
        const palette = PALETTES[Math.floor(rng.next() * PALETTES.length)];
        const usableBounds = boundsSize * 0.78;
        const memoryAnchors = this.buildAnchors(scene, rng, usableBounds);

        return {
            seed: rng.seed,
            palette,
            backgroundLayers: [
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 32px)',
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 32px)',
                `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 58%, ${palette[2]} 100%)`,
            ],
            spawnPlans: this.buildSpawns(scene, rng, memoryAnchors, boundsSize),
            landmarks: this.buildLandmarks(scene, rng, memoryAnchors),
            memoryAnchors,
            continuityKey,
            narrativeTags: this.buildNarrativeTags(scene, profile),
        };
    }

    private buildAnchors(
        scene: GeneratedSceneRecord,
        rng: SeededRandom,
        usableBounds: number
    ): Array<{ id: string; x: number; z: number; label: string }> {
        const count = Math.max(3, Math.min(6, scene.modules.length + 2));
        const anchors: Array<{ id: string; x: number; z: number; label: string }> = [];
        const radius = usableBounds / 2;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + rng.nextRange(-0.24, 0.24);
            const distance = radius * rng.nextRange(0.35, 0.95);
            const moduleId = scene.modules[i % scene.modules.length] ?? 'hub';
            anchors.push({
                id: `${scene.contentHash}_${moduleId}_${i}`,
                x: round(Math.cos(angle) * distance),
                z: round(Math.sin(angle) * distance),
                label: moduleId,
            });
        }

        return anchors;
    }

    private buildSpawns(
        scene: GeneratedSceneRecord,
        rng: SeededRandom,
        anchors: Array<{ id: string; x: number; z: number; label: string }>,
        boundsSize: number
    ): SceneSpawnPlan[] {
        const spawnPlans: SceneSpawnPlan[] = [];
        const groundY = -boundsSize / 2 + 34;

        for (const [index, anchor] of anchors.entries()) {
            const moduleId = anchor.label;
            const entityType = MODULE_ENTITY_TYPES[moduleId] ?? 0;
            const isStatic = entityType === 2;
            spawnPlans.push({
                x: anchor.x,
                y: isStatic ? groundY : groundY + rng.nextRange(40, 130),
                z: anchor.z,
                color: MODULE_COLORS[moduleId] ?? '#38bdf8',
                vx: isStatic ? 0 : rng.nextRange(-70, 70),
                vy: isStatic ? 0 : rng.nextRange(-95, -35),
                vz: isStatic ? 0 : rng.nextRange(-70, 70),
                entityType,
                role: entityType === 2 ? 'defender' : (index === 0 ? 'anchor' : 'hazard'),
            });
        }

        const objectiveCount = Math.max(1, Math.min(3, Math.round(scene.difficulty / 3)));
        for (let i = 0; i < objectiveCount; i++) {
            const anchor = anchors[(i + 1) % anchors.length];
            spawnPlans.push({
                x: round(anchor.x * 0.55 + rng.nextRange(-18, 18)),
                y: groundY + 75 + i * 24,
                z: round(anchor.z * 0.55 + rng.nextRange(-18, 18)),
                color: '#facc15',
                vx: rng.nextRange(-24, 24),
                vy: rng.nextRange(-20, 20),
                vz: rng.nextRange(-24, 24),
                entityType: 0,
                role: 'objective',
            });
        }

        return spawnPlans;
    }

    private buildLandmarks(
        scene: GeneratedSceneRecord,
        rng: SeededRandom,
        anchors: Array<{ id: string; x: number; z: number; label: string }>
    ): SceneLandmarkPlan[] {
        return anchors.map((anchor, index) => ({
            id: anchor.id,
            x: anchor.x,
            y: -175,
            z: anchor.z,
            radius: round(12 + rng.nextRange(0, 10)),
            height: round(70 + index * 8 + rng.nextRange(0, 50)),
            color: MODULE_COLORS[anchor.label] ?? '#38bdf8',
            kind: this.landmarkKind(anchor.label),
        }));
    }

    private landmarkKind(moduleId: string): SceneLandmarkPlan['kind'] {
        if (moduleId === 'synthesis' || moduleId === 'card') return 'archive';
        if (moduleId === 'parkour' || moduleId === 'shooter') return 'beacon';
        if (moduleId === 'tower_defense' || moduleId === 'turn_combat') return 'arena';
        return 'portal';
    }

    private buildNarrativeTags(scene: GeneratedSceneRecord, profile: PlayerSceneProfile): string[] {
        return [
            scene.status,
            profile.aestheticTaste?.density ?? 'balanced',
            ...scene.modules.slice(0, 4),
        ];
    }
}

class SeededRandom {
    seed: number;

    constructor(seed: number) {
        this.seed = seed >>> 0;
    }

    next(): number {
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return this.seed / 0x100000000;
    }

    nextRange(min: number, max: number): number {
        return min + (max - min) * this.next();
    }
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
