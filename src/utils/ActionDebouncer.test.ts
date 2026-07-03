// ---------------------------------------------------------------------------
// Round 108 — `ActionDebouncer` helper class test suite
// (helper-level tests, round-82 pattern).
//
// The class consolidates the 3 inline
// `lastXAt = 0` + `*_DEBOUNCE_MS = 500` + check-at-top
// + stamp-end-of-body patterns from round-104 (loadGame),
// round-106 (saveGame), and round-107 (rollWorldEvent).
// These tests pin the class API at the helper level so
// a refactor of the debounce logic (e.g. switching to a
// token-bucket, an async one-shot latch, or a different
// stamp position) would be caught here rather than only
// at the App-level main.test.ts.
//
// The 6 contracts pinned here are:
//
//   1. First call to `check()` always returns `true`
//      (no prior stamp, `lastFiredAt === 0`).
//   2. After `stamp()` is called, a subsequent `check()`
//      within the window returns `false` AND emits a
//      Chinese skip message via the injected `logFn`.
//   3. After `stamp()` is called, a subsequent `check()`
//      with `Date.now()` advanced past the window
//      returns `true`. (Time-based, not one-shot latch.)
//   4. The Chinese skip message format includes the
//      action name, the elapsed ms, the windowMs, and
//      the roundTag — exactly matching the inline
//      format from round-104/106/107 so a refactor
//      that drops any field would fail this test.
//   5. `msSinceLastFire` returns `Infinity` if `stamp()`
//      has never been called, otherwise the elapsed ms.
//   6. `windowSizeMs` returns the constructor-injected
//      window. A refactor that accidentally hard-codes
//      the window to 500ms (e.g. by losing the
//      constructor parameter) would fail this test.
//
// Uses the round-90/98 `(obj as unknown as { ... })`
// cast pattern for private field access. No real
// dependencies — just the ActionDebouncer class and
// `jest.fn()` for the log function.
//
// The App-level main.test.ts round-104/106/107 tests
// continue to pin the per-action contracts (the side
// effects like `save.restore` being called only once).
// These helper-level tests pin the class API at a
// finer granularity — the two-sided contract pattern
// from round-105 SceneManager.test.ts.
// ---------------------------------------------------------------------------

import { ActionDebouncer } from './ActionDebouncer';

describe('ActionDebouncer (round 108)', () => {
    test('first_check_returns_true (lastFiredAt === 0 bypasses the debounce window)', () => {
        // Contract 1: a fresh debouncer
        // (no prior stamp) must always
        // allow the first call. The
        // `lastFiredAt > 0` guard is
        // the asymmetry: lastFiredAt
        // starts at 0 and a fresh
        // stamp-untouched debouncer
        // is the "no prior fire"
        // baseline. A regression
        // that initializes
        // lastFiredAt to `Date.now()`
        // would silently delay the
        // first call by the full
        // debounce window.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 104', log);
        expect(d.check()).toBe(true);
    });

    test('check_after_stamp_within_window_returns_false_and_logs_chinese_skip (round 108)', () => {
        // Contract 2: a stamp-then-check
        // sequence within the window
        // must short-circuit AND emit
        // the Chinese skip message.
        // This is the headline
        // contract — the entire point
        // of the debouncer.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 104', log);
        d.stamp();
        // The next check() happens
        // synchronously, so
        // Date.now() returns the same
        // value (or 0-2ms later in
        // the test runtime). 0-2ms
        // is within the 500ms window.
        expect(d.check()).toBe(false);
        expect(log).toHaveBeenCalledTimes(1);
        const line = String(log.mock.calls[0]?.[0] ?? '');
        expect(line).toMatch(
            /\[orchestrator\] 距上次 loadGame 仅 \d+ms < 500ms 窗口.*round 104 防御/,
        );
    });

    test('check_after_stamp_outside_window_returns_true (debounce is time-based, not one-shot)', () => {
        // Contract 3: the debounce is
        // time-based. Once the window
        // passes, the next check
        // returns true. Mirrors the
        // round-104/106/107
        // after-window tests at the
        // App level.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'saveGame', 'round 106', log);
        d.stamp();
        // Advance Date.now() past the
        // 500ms window so the next
        // check() succeeds.
        const future = Date.now() + 500 + 100;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(future);
        expect(d.check()).toBe(true);
        nowSpy.mockRestore();
        expect(log).not.toHaveBeenCalled();
    });

    test('chinese_skip_message_includes_action_name_window_ms_and_round_tag (round 108)', () => {
        // Contract 4: the Chinese skip
        // message format must include
        // all 4 fields (actionName,
        // elapsedMs, windowMs, roundTag).
        // A refactor that drops any
        // field (e.g. omitting the
        // roundTag) would fail this
        // test. This pins the exact
        // message format from
        // round-104/106/107 so the
        // existing 9 main.test.ts
        // tests' regex assertions
        // continue to match.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'rollWorldEvent', 'round 107', log);
        d.stamp();
        d.check();
        const line = String(log.mock.calls[0]?.[0] ?? '');
        // 4 separate assertions, one
        // per field. If any field is
        // dropped, the corresponding
        // assertion fails.
        expect(line).toContain('距上次 rollWorldEvent');
        expect(line).toContain('仅');
        expect(line).toContain('< 500ms 窗口');
        expect(line).toContain('round 107 防御');
        // Belt-and-suspenders: the
        // elapsedMs is a positive
        // integer between stamps.
        // The synchronous stamp+check
        // pair makes this either 0 or
        // 1 (within 1ms).
        expect(line).toMatch(/仅 \d+ms/);
    });

    test('msSinceLastFire_returns_infinity_when_never_stamped_then_returns_elapsed_ms_after_stamp', () => {
        // Contract 5: the
        // `msSinceLastFire` getter
        // has two modes:
        //   - never-stamped: returns
        //     `Infinity` (the
        //     round-109+ DebugOverlay
        //     panel uses this to
        //     distinguish "no prior
        //     fire" from "X ms ago").
        //   - stamped: returns
        //     elapsed ms.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 104', log);
        expect(d.msSinceLastFire).toBe(Number.POSITIVE_INFINITY);
        d.stamp();
        // Synchronous check: the
        // stamp+getter pair happens
        // within 0-2ms, so the getter
        // returns 0 or 1.
        const since = d.msSinceLastFire;
        expect(since).toBeGreaterThanOrEqual(0);
        expect(since).toBeLessThan(50);
    });

    test('windowSizeMs_returns_constructor_value (not hard-coded 500)', () => {
        // Contract 6: the
        // `windowSizeMs` getter
        // returns the
        // constructor-injected
        // window. A refactor that
        // accidentally hard-codes
        // the window to 500ms
        // (e.g. by losing the
        // constructor parameter)
        // would fail this test
        // when a non-500 value
        // is passed in. This also
        // pins the future
        // round-109+ DebugOverlay
        // panel contract: the
        // panel reads
        // `debouncer.windowSizeMs`
        // to display the current
        // window.
        const log = jest.fn();
        const d500 = new ActionDebouncer(500, 'loadGame', 'round 104', log);
        const d1000 = new ActionDebouncer(1000, 'saveGame', 'round 106', log);
        const d250 = new ActionDebouncer(250, 'rollWorldEvent', 'round 107', log);
        expect(d500.windowSizeMs).toBe(500);
        expect(d1000.windowSizeMs).toBe(1000);
        expect(d250.windowSizeMs).toBe(250);
    });

    // ---------------------------------------------------------------
    // Round 111 — setWindowMs(ms) runtime setter tests.
    // The SettingsPanel "action debounce window" knob
    // (round 111) calls this method on all 4 App
    // debouncers via `app.applySettings()`. The setter
    // must:
    //   1. Update `windowSizeMs` immediately
    //   2. Take effect on the next `check()` call
    //      (a window-shrink must allow the next call
    //      even if `lastFiredAt` is recent)
    //   3. Clamp negative / NaN values to 0 (defensive
    //      against stale SettingsPanel config)
    // ---------------------------------------------------------------

    test('setWindowMs_updates_windowSizeMs_immediately (round 111)', () => {
        // Contract: the getter reflects the
        // new value synchronously after
        // setWindowMs. A regression that
        // requires a `stamp()` call to
        // propagate the new window would
        // fail this test.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 104', log);
        expect(d.windowSizeMs).toBe(500);
        d.setWindowMs(1000);
        expect(d.windowSizeMs).toBe(1000);
        d.setWindowMs(0);
        expect(d.windowSizeMs).toBe(0);
    });

    test('setWindowMs_shrink_allows_next_call_even_when_recently_stamped (round 111)', () => {
        // Contract: a window-shrink must
        // take effect on the next
        // `check()` call. A regression
        // that caches the old window in
        // a local variable inside
        // `check()` would fail this
        // test.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'saveGame', 'round 106', log);
        d.stamp();
        // Within the 500ms window —
        // the second check is debounced.
        expect(d.check()).toBe(false);
        // Shrink the window to 0 — the
        // next check is allowed
        // immediately, even though
        // `lastFiredAt` is recent.
        d.setWindowMs(0);
        expect(d.check()).toBe(true);
        // The window-shrink to 0 also
        // suppresses the next debounce
        // log line.
        expect(d.check()).toBe(true);
        expect(log).toHaveBeenCalledTimes(1); // only the first within-window check logged
    });

    test('setWindowMs_clamps_negative_and_nan_to_zero (round 111 defensive)', () => {
        // Defensive: a SettingsPanel
        // bug that passes a stale
        // config value (e.g. an
        // unparseable number) must
        // not silently break the
        // debounce contract. Negative
        // / NaN / Infinity are all
        // clamped to 0 (no debounce).
        // `Number.isFinite()` returns
        // false for Infinity, NaN, and
        // non-numbers — the safest
        // fallback is "no debounce"
        // (the user explicitly disabled
        // the debounce window).
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'rollWorldEvent', 'round 107', log);
        d.setWindowMs(-100);
        expect(d.windowSizeMs).toBe(0);
        d.setWindowMs(NaN);
        expect(d.windowSizeMs).toBe(0);
        d.setWindowMs(Infinity);
        expect(d.windowSizeMs).toBe(0);
        d.setWindowMs('not a number' as unknown as number);
        expect(d.windowSizeMs).toBe(0);
    });

    // ---------------------------------------------------------------
    // Round 124 — _fireFake(stampTime, checkTime)
    // test-only fake-fire helper.
    //
    // Replaces the awkward
    // `jest.spyOn(Date, 'now').mockReturnValue(future)`
    // pattern that round-108 + the App-level
    // round-104/106/107/109 after-window tests
    // had to use. The new hook:
    //   - sets `lastFiredAt = stampTime`
    //     explicitly (no Date.now() read)
    //   - runs the check logic at the
    //     caller-passed `checkTime`
    //   - returns the boolean result
    //
    // Properties pinned by the round-124
    // tests:
    //   1. With stampTime=0, checkTime=now:
    //      treated as never-stamped (the
    //      `lastFiredAt > 0` guard) — returns
    //      true.
    //   2. With stampTime just inside window,
    //      checkTime=stampTime+windowMs-1:
    //      returns false + emits Chinese log.
    //   3. With stampTime just outside window,
    //      checkTime=stampTime+windowMs:
    //      returns true (debounce is time-
    //      based, not one-shot).
    //   4. setWindowMs interacts correctly
    //      with _fireFake (a window-shrink
    //      to 0 allows the next fake-fire
    //      even when stamp is recent).
    //   5. Does NOT call `Date.now()`
    //      (defense: a regression that
    //      re-introduces Date.now() into
    //      _checkAt would break the
    //      deterministic-timestamp
    //      guarantee).
    // ---------------------------------------------------------------

    test('_fireFake_never_stamped_returns_true (round 124 stamp=0 bypass)', () => {
        // The `lastFiredAt > 0` guard
        // treats stampTime=0 the same as
        // "never stamped". A regression
        // that used `>=` instead of `>`
        // would silently delay the first
        // fake-fire by the full window.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 124', log);
        // stampTime=0 simulates
        // "never stamped". checkTime=1000
        // is just a random now.
        expect(d._fireFake(0, 1000)).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });

    test('_fireFake_within_window_returns_false_and_logs_chinese_skip (round 124)', () => {
        // The headline contract — the
        // fake-fire helper must produce
        // the same result as a real
        // stamp+check within the window.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'loadGame', 'round 124', log);
        // stamp at 1000, check at 1499
        // (499ms elapsed, < 500ms window)
        // → debounced.
        expect(d._fireFake(1000, 1499)).toBe(false);
        expect(log).toHaveBeenCalledTimes(1);
        const line = String(log.mock.calls[0]?.[0] ?? '');
        // The Chinese log line uses the
        // EXPLICIT `now` passed to
        // `_checkAt`, not Date.now().
        // So `now - lastFiredAt` should
        // be exactly 499ms (deterministic).
        expect(line).toContain('距上次 loadGame 仅 499ms');
        expect(line).toContain('< 500ms 窗口');
        expect(line).toContain('round 124 防御');
    });

    test('_fireFake_outside_window_returns_true (round 124 time-based)', () => {
        // After the window passes
        // (stampTime + windowMs ≤ checkTime)
        // the check is allowed. The
        // debounce is time-based, not a
        // one-shot latch.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'saveGame', 'round 124', log);
        // stamp at 1000, check at 1500
        // (exactly 500ms elapsed) →
        // allowed (the `<` check is
        // exclusive).
        expect(d._fireFake(1000, 1500)).toBe(true);
        expect(log).not.toHaveBeenCalled();
        // stamp at 1000, check at 1501
        // (501ms elapsed, > 500ms
        // window) → allowed.
        expect(d._fireFake(1000, 1501)).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });

    test('_fireFake_does_not_call_Date_now (round 124 deterministic timestamp guarantee)', () => {
        // Defense: a regression that
        // re-introduced `Date.now()`
        // into `_checkAt` would break
        // the deterministic-timestamp
        // guarantee. The test pins a
        // highly-fake "stamp + check"
        // pair that no real `Date.now()`
        // call could accidentally produce.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'rollWorldEvent', 'round 124', log);
        // Use timestamps from the year
        // 2030 — no real Date.now()
        // call could produce these
        // values during a 2026 test
        // run.
        const stampYear2030 = 1_900_000_000_000;
        const checkYear2030 = 1_900_000_500_000;
        // Spy on Date.now — the spy
        // is never invoked if the
        // fake helper is correctly
        // bypassing it.
        const nowSpy = jest.spyOn(Date, 'now');
        expect(d._fireFake(stampYear2030, checkYear2030)).toBe(true);
        expect(nowSpy).not.toHaveBeenCalled();
        nowSpy.mockRestore();
    });

    test('_fireFake_interacts_with_setWindowMs_shrink (round 124 round 111 + 124 integration)', () => {
        // The round-111 setWindowMs
        // shrink test used
        // `jest.spyOn(Date, 'now')` to
        // inject a now-after-shrink
        // timestamp. Round 124
        // replaces that with
        // `_fireFake` for clarity.
        const log = jest.fn();
        const d = new ActionDebouncer(500, 'saveGame', 'round 124', log);
        // Stamp at t=1000, check at
        // t=1100 (100ms elapsed, < 500ms
        // window) → debounced.
        expect(d._fireFake(1000, 1100)).toBe(false);
        expect(log).toHaveBeenCalledTimes(1);
        // Shrink the window to 0.
        d.setWindowMs(0);
        // Re-stamp + check at t=1200
        // (200ms after stamp, 0ms
        // window) → allowed (200 > 0).
        expect(d._fireFake(1000, 1200)).toBe(true);
        // The shrink suppressed the
        // 2nd log line.
        expect(log).toHaveBeenCalledTimes(1);
    });

    test('_fireFake_equivalent_to_stamp_plus_real_check (round 124 parity)', () => {
        // Parity test: a `_fireFake`
        // call with explicit timestamps
        // must produce the SAME result
        // as a real `stamp()` +
        // `check()` pair where
        // `Date.now()` returns the
        // fake's `checkTime`. This
        // pins the contract that
        // _fireFake is a deterministic
        // replacement for the
        // Date.now()-mocking pattern.
        //
        // Setup: stamp at time T1,
        // check at time T2 (where
        // T2 > T1, T2 - T1 = 600ms,
        // windowMs = 500). Both
        // paths return `true` (the
        // 600ms elapsed time exceeds
        // the 500ms window).
        const log1 = jest.fn();
        const log2 = jest.fn();
        const d1 = new ActionDebouncer(500, 'loadGame', 'round 124', log1);
        const d2 = new ActionDebouncer(500, 'loadGame', 'round 124', log2);
        const T1 = 1_000_000;
        const T2 = T1 + 600; // 600ms elapsed, > 500ms window.
        // d1: real stamp at T1, real
        // check at T2 (Date.now()
        // mocked to return T1 then
        // T2 via sequential
        // mockReturnValueOnce).
        const nowSpy = jest.spyOn(Date, 'now')
            .mockReturnValueOnce(T1)
            .mockReturnValueOnce(T2);
        d1.stamp();
        const result1 = d1.check();
        nowSpy.mockRestore();
        // d2: fake-fire with the
        // same T1 stamp + T2 check.
        const result2 = d2._fireFake(T1, T2);
        // Parity: both paths must
        // produce the same boolean.
        expect(result1).toBe(result2);
        // Both paths return `true`
        // because the 600ms elapsed
        // time exceeds the 500ms
        // window.
        expect(result1).toBe(true);
        expect(result2).toBe(true);
        // Neither path emitted a log
        // line (both checks were
        // allowed).
        expect(log1).not.toHaveBeenCalled();
        expect(log2).not.toHaveBeenCalled();
    });
});
