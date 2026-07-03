import {
    clampCamRadius,
    stepCamRadius,
    CAM_RADIUS_MIN,
    CAM_RADIUS_MAX,
    CAM_RADIUS_STEP,
    CAM_RADIUS_DEFAULT,
} from './CameraZoom';

describe('CameraZoom', () => {
    describe('clampCamRadius', () => {
        it('returns the value unchanged when inside the range', () => {
            expect(clampCamRadius(20)).toBe(20);
            expect(clampCamRadius(28)).toBe(28);
            expect(clampCamRadius(40)).toBe(40);
        });

        it('clamps below the minimum', () => {
            expect(clampCamRadius(0)).toBe(CAM_RADIUS_MIN);
            expect(clampCamRadius(5)).toBe(CAM_RADIUS_MIN);
            expect(clampCamRadius(-100)).toBe(CAM_RADIUS_MIN);
        });

        it('clamps above the maximum', () => {
            expect(clampCamRadius(60)).toBe(CAM_RADIUS_MAX);
            expect(clampCamRadius(100)).toBe(CAM_RADIUS_MAX);
            expect(clampCamRadius(99999)).toBe(CAM_RADIUS_MAX);
        });

        it('returns CAM_RADIUS_DEFAULT for non-finite inputs (NaN / Infinity)', () => {
            expect(clampCamRadius(NaN)).toBe(CAM_RADIUS_DEFAULT);
            expect(clampCamRadius(Infinity)).toBe(CAM_RADIUS_DEFAULT);
            expect(clampCamRadius(-Infinity)).toBe(CAM_RADIUS_DEFAULT);
        });

        it('returns CAM_RADIUS_DEFAULT for undefined / null / string (best-effort)', () => {
            // Not strictly required by the type signature, but the
            // function must not throw on weird input.
            expect(clampCamRadius(undefined as unknown as number)).toBe(CAM_RADIUS_DEFAULT);
            expect(clampCamRadius(null as unknown as number)).toBe(CAM_RADIUS_DEFAULT);
            expect(clampCamRadius('20' as unknown as number)).toBe(CAM_RADIUS_DEFAULT);
        });

        it('includes both bounds in the valid range', () => {
            expect(clampCamRadius(CAM_RADIUS_MIN)).toBe(CAM_RADIUS_MIN);
            expect(clampCamRadius(CAM_RADIUS_MAX)).toBe(CAM_RADIUS_MAX);
        });
    });

    describe('stepCamRadius', () => {
        it('zooms out (+1) by exactly one step', () => {
            expect(stepCamRadius(28, 1)).toBe(28 + CAM_RADIUS_STEP);
            expect(stepCamRadius(30, 1)).toBe(30 + CAM_RADIUS_STEP);
        });

        it('zooms in (-1) by exactly one step', () => {
            expect(stepCamRadius(28, -1)).toBe(28 - CAM_RADIUS_STEP);
            expect(stepCamRadius(30, -1)).toBe(30 - CAM_RADIUS_STEP);
        });

        it('treats direction 0 as a no-op (still clamps)', () => {
            expect(stepCamRadius(28, 0)).toBe(28);
        });

        it('treats any positive direction (incl. 0.1) as zoom out', () => {
            expect(stepCamRadius(28, 0.1)).toBe(28 + CAM_RADIUS_STEP);
        });

        it('clamps at the minimum when stepping further in', () => {
            expect(stepCamRadius(CAM_RADIUS_MIN, -1)).toBe(CAM_RADIUS_MIN);
            expect(stepCamRadius(CAM_RADIUS_MIN - 1, -1)).toBe(CAM_RADIUS_MIN);
        });

        it('clamps at the maximum when stepping further out', () => {
            expect(stepCamRadius(CAM_RADIUS_MAX, 1)).toBe(CAM_RADIUS_MAX);
            expect(stepCamRadius(CAM_RADIUS_MAX + 1, 1)).toBe(CAM_RADIUS_MAX);
        });

        it('sign of direction is what counts (large values truncated to ±1)', () => {
            expect(stepCamRadius(28, 100)).toBe(28 + CAM_RADIUS_STEP);
            expect(stepCamRadius(28, -100)).toBe(28 - CAM_RADIUS_STEP);
        });
    });

    describe('constants', () => {
        it('CAM_RADIUS_DEFAULT (28) is inside [MIN, MAX]', () => {
            expect(CAM_RADIUS_DEFAULT).toBeGreaterThanOrEqual(CAM_RADIUS_MIN);
            expect(CAM_RADIUS_DEFAULT).toBeLessThanOrEqual(CAM_RADIUS_MAX);
        });

        it('CAM_RADIUS_STEP is a positive integer', () => {
            expect(CAM_RADIUS_STEP).toBeGreaterThan(0);
            expect(Number.isInteger(CAM_RADIUS_STEP)).toBe(true);
        });

        it('MIN < MAX', () => {
            expect(CAM_RADIUS_MIN).toBeLessThan(CAM_RADIUS_MAX);
        });
    });
});
