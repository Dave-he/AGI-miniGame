/**
 * EndlessMode tests.
 */

import { EndlessMode } from '../world/EndlessMode';

function make(maxSteps: number = 0) {
    let enterCount = 0;
    let diff = 0.5;
    const m = new EndlessMode({
        enterNext: () => { enterCount += 1; },
        getDifficulty: () => diff,
    }, { maxSteps, minIntervalSecs: 0 });
    return { m, getEnterCount: () => enterCount, setDifficulty: (d: number) => { diff = d; } };
}

describe('EndlessMode', () => {
    test('starts disabled', () => {
        const { m } = make();
        expect(m.isEnabled()).toBe(false);
    });

    test('enable → onComplete → enterNext is called once', async () => {
        const { m, getEnterCount } = make();
        m.enable();
        const ok = await m.onComplete();
        expect(ok).toBe(true);
        expect(getEnterCount()).toBe(1);
    });

    test('onComplete is a no-op when disabled', async () => {
        const { m, getEnterCount } = make();
        const ok = await m.onComplete();
        expect(ok).toBe(false);
        expect(getEnterCount()).toBe(0);
    });

    test('respects maxSteps', async () => {
        const { m, getEnterCount } = make(3);
        m.enable();
        await m.onComplete();
        await m.onComplete();
        await m.onComplete();
        // The 4th call should refuse.
        const ok4 = await m.onComplete();
        expect(ok4).toBe(false);
        expect(getEnterCount()).toBe(3);
        expect(m.getStepCount()).toBe(3);
    });

    test('pause suspends the chain', async () => {
        const { m, getEnterCount } = make();
        m.enable();
        m.pause();
        const ok = await m.onComplete();
        expect(ok).toBe(false);
        expect(getEnterCount()).toBe(0);
        m.resume();
        const ok2 = await m.onComplete();
        expect(ok2).toBe(true);
    });

    test('projectNextDifficulty rises with stepCount', () => {
        const { m, setDifficulty } = make();
        setDifficulty(1); // Lv ~1
        m.enable();
        // 0 → 0.35, 10 → 0.55, etc. We just assert monotonicity.
        const a = m.projectNextDifficulty();
        m.enable();
        // simulate stepCount increment via reflection
        (m as any).stepCount = 10;
        const b = m.projectNextDifficulty();
        expect(b).toBeGreaterThan(a);
    });
});
