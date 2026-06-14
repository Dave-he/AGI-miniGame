/**
 * BiomeAudio — round 61 per-biome ambient sound config.
 *
 * Mirrors `BiomeAtmosphere` (round 56-60 lighting) but for the
 * audio domain. Each of the 6 WfcBiomes gets a signature
 * ambient-loop character: base frequency, waveform, gain, and
 * fade-in/out times. `AudioService.setBiomeAmbient` consumes the
 * table and crossfades between biomes.
 *
 * The sound is procedural (synthesized in Web Audio) — no audio
 * files. Each biome has a 2-oscillator drone (root + fifth) that
 * loops indefinitely until the biome changes.
 *
 * The module is pure data + a single `getBiomeAudio` factory so
 * the lookup table can be unit-tested in jsdom without Web Audio.
 */

import type { BiomeId } from '../world/WfcBiomes';

export interface BiomeAudio {
    /**
     * Human-readable label for HUD logs and tests
     * ("neon hum", "wind through trees", etc).
     */
    label: string;
    /**
     * Base oscillator frequency in Hz (root of the drone).
     * Real-world ranges: 30-60 (sub-bass drone) to 200-400
     * (mid hum). Cyberpunk sits higher (synth), space sits lower
     * (vacuum rumble).
     */
    baseFreq: number;
    /**
     * Oscillator type — the timbre of the drone. Matches the
     * Web Audio OscillatorType union: 'sine' | 'square' |
     * 'sawtooth' | 'triangle'.
     */
    waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
    /**
     * Master gain multiplier for the ambient (0..1). The Audio
     * service still applies its own master gain on top; this is
     * a per-biome volume trim.
     */
    gain: number;
    /**
     * Fade-in time in seconds when the biome is entered. Short
     * for action biomes (cyberpunk 0.4s) so the audio transition
     * matches the visual snap.
     */
    fadeIn: number;
    /**
     * Fade-out time in seconds when leaving the biome. Longer
     * fades give a "tail" feel (dungeon 1.2s) so the player
     * notices the transition rather than feeling cut off.
     */
    fadeOut: number;
    /**
     * Whether to add a perfect-fifth overtone (root * 1.5) to
     * the drone. Most biomes use 2-oscillator stack; space
     * uses single-oscillator (vacuum) for a thinner feel.
     */
    withFifth: boolean;
}

const TABLE: Record<BiomeId, BiomeAudio> = {
    cyberpunk: {
        label:         'neon hum',
        baseFreq:      220,    // A3 — synth territory
        waveform:      'sawtooth',
        gain:          0.18,
        fadeIn:        0.4,    // quick snap to match the visual
        fadeOut:       0.6,
        withFifth:     true,
    },
    forest: {
        label:         'wind through trees',
        baseFreq:      110,    // A2 — low, organic
        waveform:      'sine',
        gain:          0.14,
        fadeIn:        1.5,    // slow organic fade
        fadeOut:       1.0,
        withFifth:     true,
    },
    desert: {
        label:         'wind over sand',
        baseFreq:      92,     // F#2 — sub-bass rumble
        waveform:      'triangle',
        gain:          0.16,
        fadeIn:        1.0,
        fadeOut:       0.8,
        withFifth:     true,
    },
    ice: {
        label:         'frozen crackle',
        baseFreq:      165,    // E3 — mid, brittle
        waveform:      'square',
        gain:          0.10,   // square wave is louder; lower gain
        fadeIn:        0.8,
        fadeOut:       1.2,
        withFifth:     false,  // brittle, single voice
    },
    space: {
        label:         'deep vacuum',
        baseFreq:      55,     // A1 — sub-bass
        waveform:      'sine',
        gain:          0.20,   // loud in the silence
        fadeIn:        2.0,    // very slow to match the void
        fadeOut:       2.0,
        withFifth:     false,  // single oscillator = thin
    },
    dungeon: {
        label:         'stone echo',
        baseFreq:      73,     // D2 — low, ominous
        waveform:      'triangle',
        gain:          0.12,
        fadeIn:        1.0,
        fadeOut:       1.5,    // long tail for the "echo" feel
        withFifth:     true,
    },
};

/**
 * The canonical 6 biome ids. The atmosphere / audio / scene
 * modules all agree on this list — keep them in sync.
 */
export const SUPPORTED_BIOMES: readonly BiomeId[] = [
    'cyberpunk', 'forest', 'desert', 'ice', 'space', 'dungeon',
];

/**
 * Look up the audio config for a biome. Unknown ids fall back
 * to the dungeon audio (the most "ambient" / least action-y of
 * the 6 — works as a safe default).
 */
export function getBiomeAudio(biome: string | BiomeId): BiomeAudio {
    if (biome && biome in TABLE) {
        return TABLE[biome as BiomeId];
    }
    return TABLE.dungeon;
}
