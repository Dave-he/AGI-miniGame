/**
 * DebugOverlay tests.
 */

import { renderDebugOverlay, type DebugOverlayDebouncerInfo } from './DebugOverlay';
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
});
