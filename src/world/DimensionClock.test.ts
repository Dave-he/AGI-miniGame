/**
 * DimensionClock tests.
 */

import { DimensionClock } from '../world/DimensionClock';

describe('DimensionClock', () => {
    test('starts in running state with full remaining time', () => {
        const c = new DimensionClock({ totalSecs: 60 });
        expect(c.getOutcome()).toBe('running');
        expect(c.remainingSecs()).toBe(60);
    });

    test('progress increases as time elapses', async () => {
        const c = new DimensionClock({ totalSecs: 60, tickMs: 10 });
        c.start();
        await new Promise(r => setTimeout(r, 50));
        const p1 = c.progress();
        c.cancel();
        expect(p1).toBeGreaterThan(0);
    });

    test('complete() transitions outcome to completed', () => {
        const c = new DimensionClock({ totalSecs: 60 });
        c.start();
        c.complete();
        expect(c.getOutcome()).toBe('completed');
    });

    test('cancel() transitions to cancelled', () => {
        const c = new DimensionClock({ totalSecs: 60 });
        c.start();
        c.cancel();
        expect(c.getOutcome()).toBe('cancelled');
    });

    test('pause + resume preserves elapsed time', async () => {
        const c = new DimensionClock({ totalSecs: 60, tickMs: 10 });
        c.start();
        await new Promise(r => setTimeout(r, 30));
        c.pause();
        const atPause = c.elapsedSecs();
        await new Promise(r => setTimeout(r, 50));
        const afterWait = c.elapsedSecs();
        c.resume();
        // During pause elapsed should not have advanced
        expect(afterWait - atPause).toBeLessThan(0.05);
    });

    test('emits a tick event on start', () => {
        const c = new DimensionClock({ totalSecs: 60 });
        const events: any[] = [];
        c.on(e => events.push(e));
        c.start();
        expect(events.length).toBe(1);
        expect(events[0].remainingSecs).toBe(60);
    });
});
