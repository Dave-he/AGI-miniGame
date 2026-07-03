/**
 * CameraZoom — round 58 scroll-to-zoom helpers.
 *
 * The 3D camera's orbit radius is hardcoded at 28 in the tick
 * loop; this module exposes the pure math the scene needs to
 * support mouse-wheel zoom. Kept separate so the clamp / step
 * rules can be unit-tested in jsdom without Three.js.
 *
 * Contract:
 *   - `clampCamRadius(x)` returns x clamped to [CAM_RADIUS_MIN, CAM_RADIUS_MAX]
 *   - `stepCamRadius(current, direction)` returns current ± CAM_RADIUS_STEP
 *     (positive direction zooms OUT, negative zooms IN), clamped
 *   - The three constants are exported so the help overlay / a
 *     future HUD widget can read the same bounds the scene uses.
 */

export const CAM_RADIUS_MIN = 12;
export const CAM_RADIUS_MAX = 50;
export const CAM_RADIUS_STEP = 2;
export const CAM_RADIUS_DEFAULT = 28;

/**
 * Clamp a radius into the valid range. Returns a number — never
 * NaN, never outside the bounds. The input is coerced from
 * `unknown` to support callers that pass `parseFloat` results.
 */
export function clampCamRadius(x: number): number {
    if (!Number.isFinite(x)) return CAM_RADIUS_DEFAULT;
    if (x < CAM_RADIUS_MIN) return CAM_RADIUS_MIN;
    if (x > CAM_RADIUS_MAX) return CAM_RADIUS_MAX;
    return x;
}

/**
 * Move the radius by one wheel notch. `direction` is +1 (zoom
 * out / wheel down) or -1 (zoom in / wheel up). Any other sign is
 * treated as 0 (no-op). The result is clamped into the valid
 * range. This is a pure function — no state, no scene.
 */
export function stepCamRadius(current: number, direction: number): number {
    const dir = direction > 0 ? 1 : direction < 0 ? -1 : 0;
    if (dir === 0) return clampCamRadius(current);
    return clampCamRadius(current + dir * CAM_RADIUS_STEP);
}
