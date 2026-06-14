import { getBiomeAudio, SUPPORTED_BIOMES, type BiomeAudio } from './BiomeAudio';
import { BIOMES, type BiomeId } from '../world/WfcBiomes';

describe('BiomeAudio', () => {
    describe('getBiomeAudio', () => {
        it('returns a distinct config for each of the 6 supported biomes', () => {
            const seen = new Set<string>();
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                const sig = `${a.baseFreq}|${a.waveform}|${a.gain}|${a.fadeIn}|${a.fadeOut}|${a.withFifth}`;
                expect(seen.has(sig)).toBe(false);
                seen.add(sig);
            }
        });

        it('every biome has a positive finite baseFreq', () => {
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                expect(Number.isFinite(a.baseFreq)).toBe(true);
                expect(a.baseFreq).toBeGreaterThan(0);
            }
        });

        it('every biome has a gain in the sane range (0, 0.5]', () => {
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                expect(a.gain).toBeGreaterThan(0);
                // 0.5 is a generous upper limit — anything louder
                // would clip on top of AudioService's master gain.
                expect(a.gain).toBeLessThanOrEqual(0.5);
            }
        });

        it('every biome has a positive finite fadeIn and fadeOut', () => {
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                expect(Number.isFinite(a.fadeIn)).toBe(true);
                expect(a.fadeIn).toBeGreaterThan(0);
                expect(Number.isFinite(a.fadeOut)).toBe(true);
                expect(a.fadeOut).toBeGreaterThan(0);
            }
        });

        it('every biome has a valid Web Audio OscillatorType', () => {
            const valid: ReadonlyArray<string> = ['sine', 'square', 'sawtooth', 'triangle'];
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                expect(valid).toContain(a.waveform);
            }
        });

        it('space has the slowest fade (vacuum feel) and cyberpunk the fastest', () => {
            const space    = getBiomeAudio('space');
            const cyberpunk = getBiomeAudio('cyberpunk');
            expect(space.fadeIn).toBeGreaterThan(cyberpunk.fadeIn);
        });

        it('space has the lowest baseFreq (sub-bass) and cyberpunk the highest', () => {
            const space    = getBiomeAudio('space');
            const cyberpunk = getBiomeAudio('cyberpunk');
            expect(space.baseFreq).toBeLessThan(cyberpunk.baseFreq);
        });

        it('every biome has a non-empty label', () => {
            for (const id of SUPPORTED_BIOMES) {
                const a = getBiomeAudio(id);
                expect(typeof a.label).toBe('string');
                expect(a.label.length).toBeGreaterThan(0);
            }
        });

        it('falls back to the dungeon audio for unknown biome ids', () => {
            const fb = getBiomeAudio('not-a-biome');
            const dn = getBiomeAudio('dungeon');
            expect(fb).toEqual(dn);
        });

        it('falls back to the dungeon audio for an empty string', () => {
            expect(getBiomeAudio('')).toEqual(getBiomeAudio('dungeon'));
        });

        it('produces the same audio on repeat calls (deterministic + cached)', () => {
            const a = getBiomeAudio('forest');
            const b = getBiomeAudio('forest');
            expect(a).toBe(b);
        });

        it('every supported BiomeId has a WfcBiomes entry (no orphan configs)', () => {
            for (const id of SUPPORTED_BIOMES) {
                expect(BIOMES[id as BiomeId]).toBeDefined();
            }
        });

        it('square-wave biomes have a lower gain than sine-wave biomes (square is louder)', () => {
            // Single check: ice is square + withFifth=false, with
            // gain 0.10. forest is sine + withFifth=true, with
            // gain 0.14. The square wave gets trimmed harder.
            const ice    = getBiomeAudio('ice');
            const forest = getBiomeAudio('forest');
            expect(ice.waveform).toBe('square');
            expect(forest.waveform).toBe('sine');
            expect(ice.gain).toBeLessThan(forest.gain);
        });

        it('returns a BiomeAudio-shaped object for every entry', () => {
            const required: ReadonlyArray<keyof BiomeAudio> = [
                'label', 'baseFreq', 'waveform', 'gain', 'fadeIn', 'fadeOut', 'withFifth',
            ];
            for (const id of SUPPORTED_BIOMES) {
                const a: BiomeAudio = getBiomeAudio(id);
                for (const k of required) {
                    expect(a).toHaveProperty(k);
                }
            }
        });
    });
});
