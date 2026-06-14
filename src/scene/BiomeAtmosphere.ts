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
