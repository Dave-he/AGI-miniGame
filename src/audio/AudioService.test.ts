/**
 * AudioService tests — primarily exercise the NullAudioService since
 * the Web Audio API isn't available in jest's jsdom env without
 * mocks. The full WebAudioService has the same interface and the
 * same setMuted behavior.
 */

import { NullAudioService, WebAudioService } from '../audio/AudioService';

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
});
