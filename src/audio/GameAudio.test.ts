/**
 * GameAudio tests.
 */

import { GameAudio } from '../audio/GameAudio';
import { NullAudioService } from '../audio/AudioService';

describe('GameAudio', () => {
    test('fire(event) calls playCue via the underlying service', () => {
        let called = '';
        const svc = {
            playCue(c: any) { called = c; },
            setMuted() {},
            isMuted() { return false; },
        };
        const a = new GameAudio(svc as any);
        a.fire('dsl.applied');
        expect(called).toBe('spawn');
        a.fire('epoch.collapsed');
        expect(called).toBe('epoch');
    });

    test('fireHotReload maps state to game events', () => {
        let called = '';
        const svc = { playCue(c: any) { called = c; }, setMuted() {}, isMuted() { return false; } };
        const a = new GameAudio(svc as any);
        a.fireHotReload('applied');
        expect(called).toBe('spawn');
        a.fireHotReload('rejected');
        expect(called).toBe('damage');
        a.fireHotReload('compiling');
        // compiling fires nothing
        expect(called).toBe('damage');
    });

    test('mute toggle', () => {
        const svc = new NullAudioService();
        const a = new GameAudio(svc);
        a.setMuted(true);
        expect(a.isMuted()).toBe(true);
        a.setMuted(false);
        expect(a.isMuted()).toBe(false);
    });

    test('unknown event is a no-op', () => {
        const svc = new NullAudioService();
        const a = new GameAudio(svc);
        expect(() => a.fire('totally.not.an.event' as any)).not.toThrow();
    });
});
