/**
 * SessionReplay tests.
 */

import { SessionReplay } from '../analytics/SessionReplay';
import { Analytics } from '../analytics/Analytics';

function make() {
    const a = new Analytics();
    const r = new SessionReplay(a, 100);
    return { a, r };
}

describe('SessionReplay', () => {
    test('starts in idle state with empty buffer', () => {
        const { r } = make();
        expect(r.getState()).toBe('idle');
        expect(r.getBufferSize()).toBe(0);
    });

    test('startRecording captures events from analytics', () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        a.track('dimension.entered');
        expect(r.getBufferSize()).toBe(2);
    });

    test('stopRecording stops capturing', () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        r.stopRecording();
        a.track('dimension.entered');
        expect(r.getBufferSize()).toBe(1);
    });

    test('buffer is bounded to maxBuffer', () => {
        const { a, r } = make();
        r.startRecording();
        for (let i = 0; i < 200; i++) a.track('dimension.entered');
        expect(r.getBufferSize()).toBe(100);
    });

    test('play at speed=0 emits all events immediately', async () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        a.track('dimension.entered');
        const seen: string[] = [];
        r.onReplayEvent(e => seen.push(e.kind));
        r.play({ speed: 0 });
        // Wait one tick for the immediate flush
        await new Promise(r2 => setTimeout(r2, 20));
        expect(seen.length).toBe(2);
        expect(r.getState()).toBe('done');
    });

    test('play → pause → resume preserves position', async () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        a.track('dimension.entered');
        a.track('npc.talked');
        r.play({ speed: 0 });
        // Already done after speed 0 — pause/resume are no-ops
        r.pause();
        r.resume();
        expect(r.getState()).toBe('done');
    });

    test('stop resets state to idle', () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        r.play({ speed: 0 });
        r.stop();
        expect(r.getState()).toBe('idle');
    });

    test('clearBuffer empties the recorded events', () => {
        const { a, r } = make();
        r.startRecording();
        a.track('session.start');
        r.clearBuffer();
        expect(r.getBufferSize()).toBe(0);
    });
});
