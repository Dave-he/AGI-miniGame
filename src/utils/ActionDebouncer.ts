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
        private readonly windowMs: number,
        private readonly actionName: string,
        private readonly roundTag: string,
        private readonly logFn: (line: string) => void,
    ) {}

    /**
     * Round 108 — check whether the action should run.
     * Returns `true` if the call is allowed, `false` if
     * it was debounced. Side effect: emits a Chinese-
     * localized log line on debounce.
     */
    check(): boolean {
        const now = Date.now();
        if (this.lastFiredAt > 0 && now - this.lastFiredAt < this.windowMs) {
            this.logFn(
                `[orchestrator] 距上次 ${this.actionName} 仅 ${now - this.lastFiredAt}ms`
                + ` < ${this.windowMs}ms 窗口，跳过本次调用 (${this.roundTag} 防御)`,
            );
            return false;
        }
        return true;
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
     * Used by the round-109+ DebugOverlay panel
     * and by main.test.ts to advance `Date.now()`
     * past the debounce window in the
     * `after_window_runs_both` test.
     */
    get windowSizeMs(): number {
        return this.windowMs;
    }
}
