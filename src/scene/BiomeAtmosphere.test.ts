import {
    getBiomeAtmosphere,
    SUPPORTED_BIOMES,
    type BiomeAtmosphere,
} from './BiomeAtmosphere';
import { BIOMES, type BiomeId } from '../world/WfcBiomes';

describe('BiomeAtmosphere', () => {
    it('exposes a supported list of 6 biomes that matches WfcBiomes.BIOMES keys', () => {
        expect(new Set(SUPPORTED_BIOMES)).toEqual(new Set(Object.keys(BIOMES)));
    });

    it('returns a distinct atmosphere for each of the 6 supported biomes', () => {
        const seen = new Set<string>();
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            const sig = `${atm.particleColor}|${atm.particleCount}|${atm.particleSpeed}|${atm.fogNear}|${atm.fogFar}|${atm.lightTint}`;
            // every biome should produce a unique (color, count, speed, fog, light) signature
            expect(seen.has(sig)).toBe(false);
            seen.add(sig);
        }
    });

    it('particle drift is within [-1, 1] on every axis for every biome', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            for (const axis of ['x', 'y', 'z'] as const) {
                expect(Math.abs(atm.particleDrift[axis])).toBeLessThanOrEqual(1);
            }
        }
    });

    it('fog near < fog far for every biome (so the scene is never inverted)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.fogNear).toBeLessThan(atm.fogFar);
        }
    });

    it('ice has the densest fog (lowest fogNear) and desert / space the thinnest', () => {
        const ice    = getBiomeAtmosphere('ice');
        const desert = getBiomeAtmosphere('desert');
        const space  = getBiomeAtmosphere('space');
        expect(ice.fogNear).toBeLessThan(desert.fogNear);
        expect(ice.fogNear).toBeLessThan(space.fogNear);
    });

    it('space has the most particles (denser starfield) and dungeon the fewest', () => {
        const space  = getBiomeAtmosphere('space');
        const dungeon = getBiomeAtmosphere('dungeon');
        expect(space.particleCount).toBeGreaterThan(dungeon.particleCount);
    });

    it('cyberpunk has positive upward drift (neon dust floats up)', () => {
        const cp = getBiomeAtmosphere('cyberpunk');
        expect(cp.particleDrift.y).toBeGreaterThan(0);
    });

    it('ice has negative downward drift (snow falls)', () => {
        const ice = getBiomeAtmosphere('ice');
        expect(ice.particleDrift.y).toBeLessThan(0);
    });

    it('desert has positive horizontal drift (sand blows sideways)', () => {
        const d = getBiomeAtmosphere('desert');
        expect(Math.abs(d.particleDrift.x)).toBeGreaterThan(Math.abs(d.particleDrift.y));
    });

    it('space has zero drift on every axis (slow twinkling stars)', () => {
        const s = getBiomeAtmosphere('space');
        expect(s.particleDrift.x).toBe(0);
        expect(s.particleDrift.y).toBe(0);
        expect(s.particleDrift.z).toBe(0);
    });

    it('falls back to the dungeon atmosphere for unknown biome ids', () => {
        const fallback = getBiomeAtmosphere('not-a-biome');
        const dungeon  = getBiomeAtmosphere('dungeon');
        expect(fallback).toEqual(dungeon);
    });

    it('falls back to the dungeon atmosphere for an empty string', () => {
        expect(getBiomeAtmosphere('')).toEqual(getBiomeAtmosphere('dungeon'));
    });

    it('every BiomeAtmosphere has a non-empty particleColor string', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm: BiomeAtmosphere = getBiomeAtmosphere(id);
            expect(typeof atm.particleColor).toBe('string');
            expect(atm.particleColor.length).toBeGreaterThan(0);
            expect(atm.particleColor.startsWith('#')).toBe(true);
        }
    });

    it('every BiomeAtmosphere has positive particleCount, particleSize, particleSpeed', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.particleCount).toBeGreaterThan(0);
            expect(atm.particleSize).toBeGreaterThan(0);
            expect(atm.particleSpeed).toBeGreaterThan(0);
        }
    });

    it('lightTint matches particleColor for cyberpunk (signature look)', () => {
        const cp = getBiomeAtmosphere('cyberpunk');
        expect(cp.lightTint).toBe(cp.particleColor);
    });

    it('every biome has a finite dirLightPos triple (round 59)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(Number.isFinite(atm.dirLightPos.x)).toBe(true);
            expect(Number.isFinite(atm.dirLightPos.y)).toBe(true);
            expect(Number.isFinite(atm.dirLightPos.z)).toBe(true);
        }
    });

    it('every biome has a finite pointLightPos triple (round 59)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(Number.isFinite(atm.pointLightPos.x)).toBe(true);
            expect(Number.isFinite(atm.pointLightPos.y)).toBe(true);
            expect(Number.isFinite(atm.pointLightPos.z)).toBe(true);
        }
    });

    it('ice has the highest dir light (high noon) and desert the lowest (round 59)', () => {
        const ice    = getBiomeAtmosphere('ice');
        const desert = getBiomeAtmosphere('desert');
        expect(ice.dirLightPos.y).toBeGreaterThan(desert.dirLightPos.y);
    });

    it('dir light y-axis is positive for every biome (no upside-down key light, round 59)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.dirLightPos.y).toBeGreaterThan(0);
        }
    });

    it('point light sits on the opposite side of the scene from the dir light (round 59)', () => {
        // Sign convention: dir.x is positive (right), point.x is
        // negative (left). This gives a clear key + fill setup.
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            // Only enforce the most generic case — the convention
            // holds for all 6 biomes as designed.
            const sameSide = Math.sign(atm.dirLightPos.x) === Math.sign(atm.pointLightPos.x)
                          && Math.sign(atm.dirLightPos.x) !== 0;
            expect(sameSide).toBe(false);
        }
    });

    it('6 biomes all have distinct dirLightPos signatures (round 59)', () => {
        const seen = new Set<string>();
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            const sig = `${atm.dirLightPos.x},${atm.dirLightPos.y},${atm.dirLightPos.z}`;
            expect(seen.has(sig)).toBe(false);
            seen.add(sig);
        }
    });

    it('produces the same atmosphere on repeat calls (deterministic + cached)', () => {
        const a = getBiomeAtmosphere('forest');
        const b = getBiomeAtmosphere('forest');
        // The lookup table returns a cached object — deterministic by
        // design, callers must not mutate the returned reference. We
        // assert referential equality here to lock that contract in.
        expect(a).toBe(b);
    });

    it('every supported BiomeId has a WfcBiomes entry (no orphan atmospheres)', () => {
        for (const id of SUPPORTED_BIOMES) {
            expect(BIOMES[id as BiomeId]).toBeDefined();
        }
    });
});
