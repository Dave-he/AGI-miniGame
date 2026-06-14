/**
 * AudioService tests — primarily exercise the NullAudioService since
 * the Web Audio API isn't available in jest's jsdom env without
 * mocks. The full WebAudioService has the same interface and the
 * same setMuted behavior.
 */

import { NullAudioService, WebAudioService } from '../audio/AudioService';
import { getBiomeAudio } from '../audio/BiomeAudio';

describe('AudioService', () => {
    test('NullAudioService.playCue is a no-op', () => {
        const a = new NullAudioService();
        expect(() => a.playCue('spawn')).not.toThrow();
        expect(() => a.playCue('epoch')).not.toThrow();
    });

    test('NullAudioService mute toggle', () => {
        const a = new NullAudioService();
        expect(a.isMuted()).toBe(false);
        a.setMuted(true);
        expect(a.isMuted()).toBe(true);
        a.setMuted(false);
        expect(a.isMuted()).toBe(false);
    });

    test('WebAudioService setMuted works (no AudioContext created yet)', () => {
        const a = new WebAudioService();
        a.setMuted(true);
        expect(a.isMuted()).toBe(true);
        a.setMuted(false);
        expect(a.isMuted()).toBe(false);
    });

    test('WebAudioService handles missing AudioContext gracefully', () => {
        const a = new WebAudioService();
        expect(() => a.playCue('spawn')).not.toThrow();
        expect(() => a.playCue('epoch')).not.toThrow();
    });

    // Round 61 — per-biome ambient loop.
    describe('setBiomeAmbient (round 61)', () => {
        test('NullAudioService tracks the active biome', () => {
            const a = new NullAudioService();
            expect(a.getActiveBiome()).toBeNull();
            a.setBiomeAmbient('cyberpunk', getBiomeAudio('cyberpunk'));
            expect(a.getActiveBiome()).toBe('cyberpunk');
            a.setBiomeAmbient('forest', getBiomeAudio('forest'));
            expect(a.getActiveBiome()).toBe('forest');
        });

        test('NullAudioService stopAmbient clears the active biome', () => {
            const a = new NullAudioService();
            a.setBiomeAmbient('ice', getBiomeAudio('ice'));
            expect(a.getActiveBiome()).toBe('ice');
            a.stopAmbient();
            expect(a.getActiveBiome()).toBeNull();
        });

        test('NullAudioService setBiomeAmbient is a no-op when no AudioContext is available', () => {
            // WebAudioService in jsdom has no AudioContext, so
            // setBiomeAmbient silently does nothing. This guards
            // the test-only crash path.
            const a = new WebAudioService();
            expect(() => a.setBiomeAmbient('desert', getBiomeAudio('desert'))).not.toThrow();
            expect(() => a.stopAmbient()).not.toThrow();
        });

        test('WebAudioService getActiveBiome is null in jsdom (no context)', () => {
            const a = new WebAudioService();
            expect(a.getActiveBiome()).toBeNull();
        });
    });
});
