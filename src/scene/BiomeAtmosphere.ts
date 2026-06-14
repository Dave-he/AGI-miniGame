/**
 * BiomeAtmosphere — per-biome atmospheric tuning for the 3D scene.
 *
 * Round 56 — each of the 6 WfcBiomes (cyberpunk / forest / desert / ice /
 * space / dungeon) gets a corresponding atmosphere: a particle colour /
 * count / size / speed / drift triplet, plus a fog distance pair and a
 * directional-light tint. `SceneManager` reads this when a dimension is
 * entered to spawn ambient particles and adjust the fog to match the
 * biome's mood.
 *
 * The module is pure data + a single `getBiomeAtmosphere` factory; no
 * Three.js / WebGL dependencies so it stays unit-testable in jsdom.
 */

import type { BiomeId } from '../world/WfcBiomes';

export interface BiomeAtmosphere {
    /** Hex colour for the ambient particles (matches the biome's wallTint). */
    particleColor: string;
    /** Total ambient particles to spawn when the biome is entered. */
    particleCount: number;
    /** Per-particle size in world units. */
    particleSize: number;
    /** Base drift speed magnitude in world units / second. */
    particleSpeed: number;
    /**
     * Per-axis drift bias. `y` positive = particles float up, negative =
     * particles fall. `(0, 0, 0)` = pure random walk. Components are in
     * [-1, 1].
     */
    particleDrift: { x: number; y: number; z: number };
    /** Fog near distance in world units. Smaller = thicker fog. */
    fogNear: number;
    /** Fog far distance in world units. */
    fogFar: number;
    /** Optional hex tint for the directional light; falls back to white. */
    lightTint: string;
    /**
     * Round 59 — directional-light position in world units. Sets
     * the angle of the key light per biome (e.g. ice = high noon,
     * desert = low side, forest = angled through trees). The
     * position is fed directly to `THREE.DirectionalLight.position`.
     */
    dirLightPos: { x: number; y: number; z: number };
    /**
     * Round 59 — point-light position in world units. Sets where
     * the back-fill light lives per biome (e.g. dungeon = low /
     * behind, space = high / opposite side). The position is fed
     * directly to `THREE.PointLight.position`.
     */
    pointLightPos: { x: number; y: number; z: number };
}

const ATOMS: Record<BiomeId, BiomeAtmosphere> = {
    cyberpunk: {
        particleColor: '#ff66cc',
        particleCount: 90,
        particleSize: 0.18,
        particleSpeed: 1.4,
        particleDrift: { x: 0.2, y: 0.6, z: 0.0 },
        fogNear: 22,
        fogFar: 95,
        lightTint: '#ff66cc',
        // Cyberpunk: high key from the right (neon signs), low fill
        // from behind-left (street reflection).
        dirLightPos:   { x:  15, y: 25, z:  10 },
        pointLightPos: { x: -20, y:  8, z: -10 },
    },
    forest: {
        particleColor: '#90c290',
        particleCount: 60,
        particleSize: 0.22,
        particleSpeed: 0.5,
        particleDrift: { x: 0.0, y: 0.4, z: 0.0 },
        fogNear: 18,
        fogFar: 80,
        lightTint: '#a8d8a8',
        // Forest: low sunbeams slicing through canopy, high fill.
        dirLightPos:   { x:  10, y: 12, z:   6 },
        pointLightPos: { x: -12, y: 22, z:  -4 },
    },
    desert: {
        particleColor: '#ffd166',
        particleCount: 110,
        particleSize: 0.14,
        particleSpeed: 0.9,
        particleDrift: { x: 0.7, y: 0.1, z: 0.0 },
        fogNear: 35,
        fogFar: 140,
        lightTint: '#ffc870',
        // Desert: very low side sun (long shadows), low opposite
        // fill so dunes don't go pitch black on one side.
        dirLightPos:   { x:  24, y:  8, z:   2 },
        pointLightPos: { x: -18, y:  6, z:  -8 },
    },
    ice: {
        particleColor: '#ffffff',
        particleCount: 140,
        particleSize: 0.12,
        particleSpeed: 0.8,
        particleDrift: { x: 0.05, y: -0.9, z: 0.0 },
        fogNear: 14,
        fogFar: 65,
        lightTint: '#b0e0ff',
        // Ice: high noon (overhead) so the surface is evenly lit,
        // high opposite fill (sky reflection off snow).
        dirLightPos:   { x:   4, y: 32, z:   4 },
        pointLightPos: { x: -10, y: 24, z:  -4 },
    },
    space: {
        particleColor: '#ffffff',
        particleCount: 200,
        particleSize: 0.08,
        particleSpeed: 0.15,
        particleDrift: { x: 0.0, y: 0.0, z: 0.0 },
        fogNear: 60,
        fogFar: 200,
        lightTint: '#cce0ff',
        // Space: distant "star" key (far + high), opposite fill
        // simulating reflection off a planet / ship.
        dirLightPos:   { x:  28, y: 30, z: -18 },
        pointLightPos: { x: -22, y: 16, z:  12 },
    },
    dungeon: {
        particleColor: '#a06cd5',
        particleCount: 50,
        particleSize: 0.10,
        particleSpeed: 0.25,
        particleDrift: { x: 0.0, y: 0.15, z: 0.0 },
        fogNear: 12,
        fogFar: 55,
        lightTint: '#a8a0c8',
        // Dungeon: vertical "shaft of light from above" key, low
        // fill from behind (torch glow feel).
        dirLightPos:   { x:   2, y: 26, z:   4 },
        pointLightPos: { x: -10, y:  4, z:  -6 },
    },
};

/** The canonical list of biomes the atmosphere module knows about. */
export const SUPPORTED_BIOMES: readonly BiomeId[] = [
    'cyberpunk', 'forest', 'desert', 'ice', 'space', 'dungeon',
];

/**
 * Look up the atmosphere config for a biome. Unknown ids fall back to
 * the dungeon atmosphere so a misconfigured dimension still gets a
 * readable scene.
 */
export function getBiomeAtmosphere(biome: string | BiomeId): BiomeAtmosphere {
    if (biome && biome in ATOMS) {
        return ATOMS[biome as BiomeId];
    }
    return ATOMS.dungeon;
}
