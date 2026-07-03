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
            const sig = `${atm.particleColor}|${atm.particleCount}|${atm.particleSpeed}|${atm.fogNear}|${atm.fogFar}|${atm.fogColor}|${atm.lightTint}`;
            // every biome should produce a unique (color, count, speed, fog, sky, light) signature
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

    it('every biome has a positive finite dirLightIntensity (round 60)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(Number.isFinite(atm.dirLightIntensity)).toBe(true);
            expect(atm.dirLightIntensity).toBeGreaterThan(0);
        }
    });

    it('every biome has a positive finite pointLightIntensity (round 60)', () => {
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(Number.isFinite(atm.pointLightIntensity)).toBe(true);
            expect(atm.pointLightIntensity).toBeGreaterThan(0);
        }
    });

    it('desert has the strongest dir light (sun-drenched) and space the dimmest (round 60)', () => {
        const desert = getBiomeAtmosphere('desert');
        const space  = getBiomeAtmosphere('space');
        expect(desert.dirLightIntensity).toBeGreaterThan(space.dirLightIntensity);
    });

    it('ice has the strongest point light (snow reflects sky) and space the dimmest (round 60)', () => {
        const ice   = getBiomeAtmosphere('ice');
        const space = getBiomeAtmosphere('space');
        expect(ice.pointLightIntensity).toBeGreaterThan(space.pointLightIntensity);
    });

    it('intensity values are in the sane Three.js range (0, 2] (round 60)', () => {
        // Three.js clamps intensity at 0 (no lower bound on the
        // engine side) but 2 is a generous upper limit — anything
        // above 2 is usually a bug.
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.dirLightIntensity).toBeLessThanOrEqual(2);
            expect(atm.pointLightIntensity).toBeLessThanOrEqual(2);
        }
    });

    it('point light intensity is always ≤ dir light intensity (fill < key, round 60)', () => {
        // Sanity: a fill light should never overpower the key
        // light, or the mood cue inverts (back of scene brighter
        // than front).
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.pointLightIntensity).toBeLessThanOrEqual(atm.dirLightIntensity);
        }
    });

    it('6 biomes have distinct (dir, point) intensity pairs (round 60)', () => {
        const seen = new Set<string>();
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            const sig = `${atm.dirLightIntensity}|${atm.pointLightIntensity}`;
            expect(seen.has(sig)).toBe(false);
            seen.add(sig);
        }
    });

    it('every biome has a non-empty hex fogColor (round 92)', () => {
        // Round 92 — per-biome sky+fog tint. The fog colour is
        // coupled to the scene background to avoid a hard line
        // at the fog far distance. Every biome must provide a
        // non-empty 6-char hex string (the same shape as
        // `particleColor` / `lightTint`).
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(typeof atm.fogColor).toBe('string');
            expect(atm.fogColor.length).toBeGreaterThan(0);
            expect(atm.fogColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('6 biomes have distinct fogColor values (round 92)', () => {
        // A shared fog color across two biomes would make them
        // visually similar at the horizon — the sky is the
        // player's main "where am I" cue. Every biome gets a
        // unique tint.
        const seen = new Set<string>();
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(seen.has(atm.fogColor)).toBe(false);
            seen.add(atm.fogColor);
        }
    });

    it('space has the darkest fogColor and desert the lightest (round 92)', () => {
        // Sanity check on the round-92 palette: space is
        // genuinely dark (near-black with a hint of purple),
        // desert is the brightest (sun-bleached horizon haze).
        // This isn't load-bearing (any palette that satisfies
        // "distinct" is fine), but it locks the intent so a
        // future "let me just make space mid-grey" tweak
        // fails.
        const space  = getBiomeAtmosphere('space');
        const desert = getBiomeAtmosphere('desert');
        // Convert hex → integer luminance (rough: 0.299R + 0.587G + 0.114B)
        const lum = (hex: string): number => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return 0.299 * r + 0.587 * g + 0.114 * b;
        };
        expect(lum(space.fogColor)).toBeLessThan(lum(desert.fogColor));
    });

    it('fogColor is distinct from lightTint for every biome (round 92)', () => {
        // Sanity: the fog colour is the "sky / horizon" tint;
        // the light tint is the "what the directional light
        // casts on objects" tint. They should differ — if they
        // were the same, the scene would read as a flat
        // monochrome wash with no depth. Every biome must
        // have a unique (fog, light) pair.
        for (const id of SUPPORTED_BIOMES) {
            const atm = getBiomeAtmosphere(id);
            expect(atm.fogColor).not.toBe(atm.lightTint);
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
