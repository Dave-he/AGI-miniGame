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
});
