/**
 * DebugOverlay tests.
 */

import { renderDebugOverlay, type DebugOverlayDebouncerInfo, type DebugOverlayExtraStats } from './DebugOverlay';
import { ActionDebouncer } from '../utils/ActionDebouncer';

function makeDebouncer(
    actionName: string,
    roundTag: string,
    windowMs: number,
    logFn: (line: string) => void = () => undefined,
): ActionDebouncer {
    return new ActionDebouncer(windowMs, actionName, roundTag, logFn);
}

describe('DebugOverlay', () => {
    test('renders_outer_panel_wrapper_with_title (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb, chineseLabel: '读取存档' },
        ];
        const handle = renderDebugOverlay(root, infos);
        expect(root.querySelector('.debug-overlay-panel')).toBeTruthy();
        expect(root.querySelector('.debug-overlay-title')?.textContent).toContain('4 个防抖器');
        handle.refresh();
    });

    test('renders_exactly_one_row_per_debouncer (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const debouncers = [
            makeDebouncer('loadGame',       'round 104', 500),
            makeDebouncer('saveGame',       'round 106', 500),
            makeDebouncer('rollWorldEvent', 'round 107', 500),
            makeDebouncer('enterAtom',      'round 109', 500),
        ];
        const infos: DebugOverlayDebouncerInfo[] = debouncers.map((d, i) => ({
            debouncer: d,
            chineseLabel: ['读取存档', '保存游戏', '世界事件', '进入 atom'][i],
        }));
        renderDebugOverlay(root, infos);
        const rows = root.querySelectorAll('.debug-overlay-row');
        expect(rows.length).toBe(4);
    });

    test('renders_chinese_label_action_round_and_window (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('saveGame', 'round 106', 1000);
        renderDebugOverlay(root, [
            { debouncer: deb, chineseLabel: '保存游戏' },
        ]);
        const row = root.querySelector('.debug-overlay-row')!;
        expect(row.querySelector('.debug-overlay-action')?.textContent).toBe('保存游戏');
        expect(row.querySelector('.debug-overlay-name')?.textContent).toBe('saveGame');
        expect(row.querySelector('.debug-overlay-round')?.textContent).toBe('round 106');
        expect(row.querySelector('.debug-overlay-window')?.textContent).toBe('1000ms');
    });

    test('renders_infinity_marker_when_debouncer_never_stamped (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        // Never call stamp() — msSinceLastFire is Infinity.
        renderDebugOverlay(root, [
            { debouncer: deb, chineseLabel: '读取存档' },
        ]);
        const since = root.querySelector('.debug-overlay-since')?.textContent;
        expect(since).toContain('∞');
        // Status should be "可触发" (open) since never stamped.
        const status = root.querySelector('.debug-overlay-status');
        expect(status?.textContent).toBe('可触发');
        expect(status?.classList.contains('is-open')).toBe(true);
    });

    test('renders_debouncing_status_when_within_window_after_stamp (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        deb.stamp();
        renderDebugOverlay(root, [
            { debouncer: deb, chineseLabel: '读取存档' },
        ]);
        const since = root.querySelector('.debug-overlay-since')?.textContent;
        expect(since).toMatch(/^\d+ms$/);
        // Within window → "屏蔽中"
        const status = root.querySelector('.debug-overlay-status');
        expect(status?.textContent).toBe('屏蔽中');
        expect(status?.classList.contains('is-debouncing')).toBe(true);
    });

    test('escapeHtml_prevents_script_injection_in_action_label (round 128 security)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('<script>alert(1)</script>', 'round 104', 500);
        renderDebugOverlay(root, [
            { debouncer: deb, chineseLabel: '<img src=x onerror=alert(1)>' },
        ]);
        // The escaped text should be in the row, not a parsed <script> tag.
        expect(root.querySelectorAll('script').length).toBe(0);
        expect(root.querySelectorAll('img').length).toBe(0);
    });

    test('refresh_re_renders_panel_with_updated_state (round 128)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const handle = renderDebugOverlay(root, [
            { debouncer: deb, chineseLabel: '读取存档' },
        ]);
        // Initial render — never stamped.
        expect(root.querySelector('.debug-overlay-status')?.textContent).toBe('可触发');
        // Stamp + refresh — now debouncing.
        deb.stamp();
        handle.refresh();
        expect(root.querySelector('.debug-overlay-status')?.textContent).toBe('屏蔽中');
    });

    test('renders_4_rows_with_correct_chinese_labels (round 128 e2e)', () => {
        // E2E: 4 rows with the canonical Chinese labels
        // matching the round-128 main.ts wiring.
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const debouncers = [
            makeDebouncer('loadGame',       'round 104', 500),
            makeDebouncer('saveGame',       'round 106', 500),
            makeDebouncer('rollWorldEvent', 'round 107', 500),
            makeDebouncer('enterAtom',      'round 109', 500),
        ];
        const expectedLabels = ['读取存档', '保存游戏', '世界事件', '进入 atom'];
        const expectedRoundTags = ['round 104', 'round 106', 'round 107', 'round 109'];
        const infos: DebugOverlayDebouncerInfo[] = debouncers.map((d, i) => ({
            debouncer: d,
            chineseLabel: expectedLabels[i],
        }));
        renderDebugOverlay(root, infos);
        const rows = Array.from(root.querySelectorAll('.debug-overlay-row'));
        expect(rows.length).toBe(4);
        rows.forEach((row, i) => {
            expect(row.querySelector('.debug-overlay-action')?.textContent).toBe(expectedLabels[i]);
            expect(row.querySelector('.debug-overlay-round')?.textContent).toBe(expectedRoundTags[i]);
        });
    });

    // ---------------------------------------------------------------
    // Round 130 — optional `extras` session-stats
    // section. When passed, the panel renders
    // player level + current biome + session
    // duration + last action label/ago. When
    // omitted, the section is absent (preserves
    // the round-128 minimal layout).
    // ---------------------------------------------------------------

    test('extras_omitted_means_no_session_stats_section (round 130 opt-in)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }]);
        // The .debug-overlay-extras wrapper should NOT
        // be rendered when `extras` is undefined.
        expect(root.querySelector('.debug-overlay-extras')).toBeNull();
        // The 4 debouncer rows should still render.
        expect(root.querySelectorAll('.debug-overlay-row').length).toBe(1);
    });

    test('extras_renders_player_level_as_lv_n (round 130)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const extras: DebugOverlayExtraStats = {
            playerLevel: 7,
            currentBiome: 'cyberpunk',
            sessionStartedAt: Date.now() - 60_000,
        };
        renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }], extras);
        const values = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        expect(values).toContain('Lv 7');
    });

    test('extras_renders_current_biome_id_or_em_dash_for_null (round 130)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        // null biome (pre-first-visit) → em-dash.
        renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }], {
            playerLevel: 1,
            currentBiome: null,
            sessionStartedAt: Date.now() - 100,
        });
        const values = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        // The biome cell renders em-dash for null.
        expect(values).toContain('—');
    });

    test('extras_renders_session_duration_as_min_sec (round 130)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        // 90s = 1m 30s
        const startedAt = Date.now() - 90_000;
        renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }], {
            playerLevel: 1,
            currentBiome: 'ice',
            sessionStartedAt: startedAt,
        });
        const values = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        // Allow a 1-2s drift in the exact seconds count
        // (test ran for some time between startedAt and now).
        const sessionCell = values.find(v => v && /^\d+m \d+s$/.test(v));
        expect(sessionCell).toBeTruthy();
        // First char should be '1' (1m elapsed for 90s).
        expect(sessionCell![0]).toBe('1');
    });

    test('extras_renders_last_action_as_em_dash_when_no_debouncer_fired (round 130)', () => {
        // Without a stamp() on any debouncer, msSinceLastFire
        // is Infinity for all of them → pickLastAction returns
        // null → both "last action" cells show em-dash.
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb1 = makeDebouncer('loadGame',       'round 104', 500);
        const deb2 = makeDebouncer('saveGame',       'round 106', 500);
        renderDebugOverlay(root, [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存游戏' },
        ], {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now() - 30_000,
        });
        const values = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        // Em-dash appears at least twice (last action + last action ago).
        expect(values.filter(v => v === '—').length).toBeGreaterThanOrEqual(2);
    });

    test('extras_derives_last_action_from_most_recently_fired_debouncer (round 130)', () => {
        // Stamp 2 debouncers at different times. The most
        // recently fired one (smallest msSinceLastFire)
        // wins the "last action" cell.
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb1 = makeDebouncer('loadGame', 'round 104', 500);
        const deb2 = makeDebouncer('enterAtom', 'round 109', 500);
        // Stamp deb1 first (longer ago) + deb2 second (more recent).
        deb1.stamp();
        // Tiny gap to ensure deb2's stamp is strictly newer.
        const delay = (ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } };
        delay(10);
        deb2.stamp();
        renderDebugOverlay(root, [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '进入 atom' },
        ], {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now() - 30_000,
        });
        const values = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        // enterAtom (deb2) is the most recent → "enterAtom" appears in the
        // "last action" cell.
        expect(values).toContain('enterAtom');
    });

    test('refresh_re_renders_extras_with_updated_session_duration (round 130)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const startedAt = Date.now() - 5_000;
        const handle = renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }], {
            playerLevel: 3,
            currentBiome: 'desert',
            sessionStartedAt: startedAt,
        });
        const initialValues = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        expect(initialValues).toContain('Lv 3');
        expect(initialValues).toContain('desert');
        // Refresh — the section should still be there.
        handle.refresh();
        const refreshedValues = Array.from(root.querySelectorAll('.debug-overlay-extras-value')).map(n => n.textContent);
        expect(refreshedValues).toContain('Lv 3');
        expect(refreshedValues).toContain('desert');
    });

    test('extras_escapeHtml_prevents_script_injection_in_biome_id (round 130 security)', () => {
        document.body.innerHTML = '<div id="d"></div>';
        const root = document.getElementById('d')!;
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        renderDebugOverlay(root, [{ debouncer: deb, chineseLabel: '读取存档' }], {
            playerLevel: 1,
            currentBiome: '<script>alert(1)</script>',
            sessionStartedAt: Date.now() - 100,
        });
        // No <script> or <img> element should be created.
        expect(root.querySelectorAll('script').length).toBe(0);
        expect(root.querySelectorAll('img').length).toBe(0);
    });
});

// ============================================================================
// Round 145 — 3-column derived-summary footer (节奏 / 已用 / 拦截).
// PURELY DERIVED from the debouncers (no new host API). The 3 stats
// answer "is the panel healthy?" in a single glance:
//   - 节奏 (tempo): the most-recently-fired debouncer's label + ago
//   - 已用 (used): N/M debouncers that have fired at least once
//   - 拦截 (blocked): N/M debouncers currently in "屏蔽中" state
// The footer is only rendered when `extras` is provided (mirrors the
// existing extras-section guard).
// ============================================================================

describe('DebugOverlay round 145 summary footer', () => {
    function makeRoot(): HTMLElement {
        document.body.innerHTML = '<div id="d"></div>';
        return document.getElementById('d')!;
    }

    test('renders_3_column_summary_footer_when_extras_provided', () => {
        // Headline test: when extras is provided, the footer
        // is rendered with 3 cells (节奏 / 已用 / 拦截) +
        // 2 separators between them.
        const root = makeRoot();
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb, chineseLabel: '读取存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now() - 60_000,
        };
        renderDebugOverlay(root, infos, extras);
        const footer = root.querySelector('.debug-overlay-extras-summary');
        expect(footer).not.toBeNull();
        const cells = footer!.querySelectorAll('.debug-overlay-extras-summary-cell');
        expect(cells.length).toBe(3);
        const seps = footer!.querySelectorAll('.debug-overlay-extras-summary-sep');
        expect(seps.length).toBe(2);
    });

    test('summary_footer_labels_are_节奏_已用_拦截', () => {
        // The 3 cells are labelled 节奏 / 已用 / 拦截
        // (rhythm / used / blocked).
        const root = makeRoot();
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb, chineseLabel: '读取存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now() - 60_000,
        };
        renderDebugOverlay(root, infos, extras);
        const labels = root.querySelectorAll('.debug-overlay-extras-summary-label');
        expect(labels[0]?.textContent).toBe('节奏');
        expect(labels[1]?.textContent).toBe('已用');
        expect(labels[2]?.textContent).toBe('拦截');
    });

    test('used_count_is_zero_when_no_debouncer_has_fired', () => {
        // When every debouncer is fresh (never stamped),
        // `usedCount` is 0 and the cell renders "0/N".
        const root = makeRoot();
        const deb1 = makeDebouncer('loadGame', 'round 104', 500);
        const deb2 = makeDebouncer('saveGame', 'round 106', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now(),
        };
        renderDebugOverlay(root, infos, extras);
        const values = root.querySelectorAll('.debug-overlay-extras-summary-value');
        expect(values[1]?.textContent).toBe('0/2'); // 已用: 0/2
        expect(values[2]?.textContent).toBe('0/2'); // 拦截: 0/2
    });

    test('used_count_reflects_how_many_debouncers_have_fired', () => {
        // Stamp 2 of 4 debouncers; usedCount = 2, totalCount = 4.
        const root = makeRoot();
        const deb1 = makeDebouncer('loadGame',       'round 104', 500);
        const deb2 = makeDebouncer('saveGame',       'round 106', 500);
        const deb3 = makeDebouncer('rollWorldEvent', 'round 107', 500);
        const deb4 = makeDebouncer('enterAtom',      'round 109', 500);
        deb1.stamp(); // simulates fire (lastFiredAt = now)
        deb2.stamp();
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存存档' },
            { debouncer: deb3, chineseLabel: '世界事件' },
            { debouncer: deb4, chineseLabel: '进入原子' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now(),
        };
        renderDebugOverlay(root, infos, extras);
        const values = root.querySelectorAll('.debug-overlay-extras-summary-value');
        expect(values[1]?.textContent).toBe('2/4'); // 已用: 2/4
    });

    test('blocked_count_reflects_debouncers_in_shielding_state', () => {
        // Stamp deb1 (it will be in the 50s window) → blocked.
        // deb2 is never stamped → not blocked.
        const root = makeRoot();
        const deb1 = makeDebouncer('loadGame', 'round 104', 50_000); // 50s window
        const deb2 = makeDebouncer('saveGame', 'round 106', 500);
        deb1.stamp(); // stamps (lastFiredAt = now; msSinceLastFire = ~0 < 50s window)
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now(),
        };
        renderDebugOverlay(root, infos, extras);
        const values = root.querySelectorAll('.debug-overlay-extras-summary-value');
        expect(values[1]?.textContent).toBe('1/2'); // 已用: 1/2
        expect(values[2]?.textContent).toBe('1/2'); // 拦截: 1/2 (deb1 is shielding)
    });

    test('tempo_cell_shows_most_recent_debouncer_label_and_ago', () => {
        // The "节奏" cell shows the most-recently-fired debouncer's
        // label + ago, derived from the same `pickLastAction`
        // source as the round-130 "最后动作" cells.
        const root = makeRoot();
        const deb1 = makeDebouncer('loadGame', 'round 104', 50_000);
        const deb2 = makeDebouncer('saveGame', 'round 106', 50_000);
        deb2.stamp(); // deb2 fires (most recent)
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now(),
        };
        renderDebugOverlay(root, infos, extras);
        const tempoCell = root.querySelectorAll('.debug-overlay-extras-summary-cell')[0];
        const tempoValue = tempoCell.querySelector('.debug-overlay-extras-summary-value');
        // deb2's label is "saveGame"; ago is "0s 前" (just stamped).
        expect(tempoValue?.textContent).toContain('saveGame');
        expect(tempoValue?.textContent).toContain(' 前');
    });

    test('tempo_cell_shows_em_dash_when_no_debouncer_has_fired', () => {
        // When every debouncer is fresh, the tempo cell shows "—"
        // (mirrors the round-130 "最后动作" fallback).
        const root = makeRoot();
        const deb1 = makeDebouncer('loadGame', 'round 104', 500);
        const deb2 = makeDebouncer('saveGame', 'round 106', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb1, chineseLabel: '读取存档' },
            { debouncer: deb2, chineseLabel: '保存存档' },
        ];
        const extras: DebugOverlayExtraStats = {
            playerLevel: 1,
            currentBiome: 'forest',
            sessionStartedAt: Date.now(),
        };
        renderDebugOverlay(root, infos, extras);
        const tempoCell = root.querySelectorAll('.debug-overlay-extras-summary-cell')[0];
        const tempoValue = tempoCell.querySelector('.debug-overlay-extras-summary-value');
        expect(tempoValue?.textContent).toBe('—');
    });

    test('summary_footer_not_rendered_when_extras_omitted', () => {
        // The footer is part of the extras section; when extras
        // is omitted, the footer is also omitted (mirrors the
        // existing extras-section guard).
        const root = makeRoot();
        const deb = makeDebouncer('loadGame', 'round 104', 500);
        const infos: DebugOverlayDebouncerInfo[] = [
            { debouncer: deb, chineseLabel: '读取存档' },
        ];
        renderDebugOverlay(root, infos); // no extras
        expect(root.querySelector('.debug-overlay-extras-summary')).toBeNull();
        // And the original debouncer grid is still rendered.
        expect(root.querySelector('.debug-overlay-row')).not.toBeNull();
    });
});
