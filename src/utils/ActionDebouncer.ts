/**
 * Round 108 — Time-based debounce helper.
 *
 * Consolidates the 3 inline `lastXAt = 0` +
 * `*_DEBOUNCE_MS = 500` + check-at-top +
 * stamp-end-of-body patterns from:
 *   - round-104 `loadGame`
 *   - round-106 `saveGame`
 *   - round-107 `rollWorldEvent`
 *
 * The class is intentionally minimal. It provides:
 *
 *   - `check()`: returns `true` if the action should
 *     run (i.e. the debounce window has passed OR this
 *     is the first call). Returns `false` if the call
 *     was short-circuited by the debounce; in that case
 *     a Chinese-localized log line is also emitted via
 *     the injected `logFn` so the player can see WHY
 *     their second tap was ignored (vs. the keyboard
 *     breaking).
 *
 *   - `stamp()`: records the current time as the last
 *     fire time. The CALLER decides WHEN to call it.
 *     The class deliberately does not enforce a single
 *     stamp position because both positions have valid
 *     use cases:
 *
 *     - stamp-at-end (loadGame, saveGame): "a failure
 *       mid-body still counts as completed so the user
 *       can't spam-retry past a broken action." (See
 *       round-104 JSDoc on `lastLoadAt`.)
 *
 *     - stamp-at-start (rollWorldEvent): "even a no-op
 *       early-return counts as called once so the user
 *       can't spam-trigger the action's side-effect log
 *       flood." (See round-107 JSDoc on `lastEventAt`
 *       — `if (!evt) return;` would skip the stamp if
 *       placed at end.)
 *
 *   - `msSinceLastFire`: debug accessor. Returns
 *     `Infinity` if `stamp()` has never been called,
 *     otherwise the milliseconds elapsed since the
 *     last stamp. Used by the round-109+ DebugOverlay
 *     panel (see Round 108+ candidates).
 *
 *   - `windowSizeMs`: debug accessor. Returns the
 *     constructor-injected window. Used by the
 *     round-109+ DebugOverlay panel and by the
 *     round-108 main.test.ts that needs to advance
 *     `Date.now()` past the window.
 *
 * The 500ms default window matches the human-double-
 * click tuning (200-300ms) + telemetry/visual margin
 * (50ms + 150ms slack) from round-104. All 3 current
 * debounced actions use the same window. A future
 * round-109+ could expose this as a single debug knob
 * (`settings.actionDebounceMs`) if QA needs to dial
 * it down to 0ms for the "I really want to save
 * twice" workflow.
 */
export class ActionDebouncer {
    private lastFiredAt = 0;
    /**
     * Round 108 — constructor. The `actionName` is the
     * human-readable action label (e.g. "loadGame",
     * "saveGame", "rollWorldEvent"). The `roundTag` is
     * the round number that introduced the debounce
     * (e.g. "round 104", "round 106", "round 107"). The
     * `logFn` is injected so this class doesn't depend
     * on the App's HUD; tests can pass a `jest.fn()`.
     * The `windowMs` is the debounce window.
     */
    constructor(
        private windowMs: number,
        private readonly actionName: string,
        private readonly roundTag: string,
        private readonly logFn: (line: string) => void,
    ) {}

    /**
     * Round 108 — check whether the action should run.
     * Returns `true` if the call is allowed, `false` if
     * it was debounced. Side effect: emits a Chinese-
     * localized log line on debounce.
     *
     * Round 124 — delegates to `_checkAt(Date.now())`
     * so the test-only `_fireFake(stampTime, checkTime)`
     * helper can call `_checkAt` directly with a
     * caller-passed `now`, avoiding the awkward
     * `jest.spyOn(Date, 'now').mockReturnValue(...)`
     * pattern.
     */
    check(): boolean {
        return this._checkAt(Date.now());
    }

    /**
     * Round 108 — record the current time as the last
     * fire time. The caller decides WHEN to call this
     * (loadGame/saveGame stamp at END of body;
     * rollWorldEvent stamps at BEGINNING of body).
     */
    stamp(): void {
        this.lastFiredAt = Date.now();
    }

    /**
     * Round 108 — debug accessor. Returns `Infinity`
     * if `stamp()` has never been called, otherwise
     * the milliseconds elapsed since the last stamp.
     */
    get msSinceLastFire(): number {
        if (this.lastFiredAt === 0) return Number.POSITIVE_INFINITY;
        return Date.now() - this.lastFiredAt;
    }

    /**
     * Round 108 — debug accessor. Returns the
     * constructor-injected window in milliseconds.
     * Used by the round-128 DebugOverlay panel
     * and by main.test.ts to advance `Date.now()`
     * past the debounce window in the
     * `after_window_runs_both` test.
     */
    get windowSizeMs(): number {
        return this.windowMs;
    }

    /**
     * Round 128 — debug accessor. Returns the
     * constructor-injected action name
     * (e.g. "loadGame", "saveGame",
     * "rollWorldEvent", "enterAtom"). Used
     * by the DebugOverlay panel to label each
     * debouncer row.
     */
    get actionLabel(): string {
        return this.actionName;
    }

    /**
     * Round 128 — debug accessor. Returns the
     * constructor-injected round tag
     * (e.g. "round 104", "round 106",
     * "round 107", "round 109"). Used by the
     * DebugOverlay panel to show which round
     * introduced the debounce.
     */
    get debounceRound(): string {
        return this.roundTag;
    }

    /**
     * Round 111 — runtime window setter. Mutates the
     * debounce window in-place. The next `check()` call
     * will use the new value. The previous stamp's
     * `lastFiredAt` is NOT reset, so a window-shrink
     * (e.g. 500ms → 0ms) can immediately allow the
     * next call (the prior stamp is older than the
     * 0ms window, so `now - lastFiredAt >= windowMs`
     * evaluates to true on the next check). The
     * 4th use case: the SettingsPanel "action
     * debounce window" knob calls this on all 4
     * App debouncers via `app.applySettings()`.
     *
     * Non-finite values (NaN, Infinity) and negative
     * values are clamped to 0 (no debounce). This is
     * defensive: a SettingsPanel bug that passes a
     * stale config value shouldn't silently break the
     * debounce contract. `Number.isFinite()` returns
     * false for Infinity, NaN, and non-numbers, so
     * the clamp is the safest fallback.
     */
    setWindowMs(ms: number): void {
        if (Number.isFinite(ms) && ms >= 0) {
            this.windowMs = ms;
        } else {
            this.windowMs = 0;
        }
    }

    /**
     * Round 124 — test-only fake-fire helper.
     *
     * Replaces the awkward
     * `jest.spyOn(Date, 'now').mockReturnValue(future)`
     * pattern that the round-108 helper-level tests +
     * the round-104/106/107/109 App-level after-window
     * tests had to use. The pattern leaks `Date.now`
     * globally (every other test in the same suite
     * sees the mocked value until `nowSpy.mockRestore()`
     * is called), is fragile (a test that forgets to
     * restore corrupts every subsequent test), and
     * is verbose (3 lines per use).
     *
     * `_fireFake(stampTime, checkTime)` does the same
     * thing in 1 line, locally:
     *
     *   1. Sets `lastFiredAt = stampTime` (the fake
     *      stamp). Note: this BYPASSES the real
     *      `Date.now()` — the debouncer's `lastFiredAt`
     *      is whatever the caller passes.
     *   2. Runs `_checkAt(checkTime)` (the private
     *      check-with-explicit-now helper extracted
     *      from `check()` below) which uses the
     *      caller-passed `checkTime` instead of
     *      `Date.now()`. Returns the boolean result
     *      (true = allowed, false = debounced).
     *
     * The `_` prefix + `as unknown as { _fireFake: ... }`
     * cast pattern (round-90/98) keeps this method
     * "App-private" — production code never calls it,
     * tests opt in via the cast.
     *
     * Returns: the boolean result of the fake check
     * (true = would allow, false = would debounce).
     */
    _fireFake(stampTime: number, checkTime: number): boolean {
        this.lastFiredAt = stampTime;
        return this._checkAt(checkTime);
    }

    /**
     * Round 124 — private check-with-explicit-now
     * helper. The production `check()` method now
     * delegates here, passing `Date.now()`. The test-
     * only `_fireFake` calls this directly with a
     * caller-passed `now` so the test can pin the
     * check time without mocking `Date.now` globally.
     */
    private _checkAt(now: number): boolean {
        if (this.lastFiredAt > 0 && now - this.lastFiredAt < this.windowMs) {
            this.logFn(
                `[orchestrator] 距上次 ${this.actionName} 仅 ${now - this.lastFiredAt}ms`
                + ` < ${this.windowMs}ms 窗口，跳过本次调用 (${this.roundTag} 防御)`,
            );
            return false;
        }
        return true;
    }
}
