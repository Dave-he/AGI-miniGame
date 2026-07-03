/**
 * StatsPanel tests.
 */

import { renderStatsPanel } from '../ui/StatsPanel';
import { Analytics } from '../analytics/Analytics';

function make() {
    document.body.innerHTML = '<div id="stats"></div>';
    const root = document.getElementById('stats')!;
    const a = new Analytics();
    const h = renderStatsPanel(root, a);
    return { root, a, h };
}

describe('StatsPanel', () => {
    test('renders an empty state with no events', () => {
        const { root } = make();
        expect(root.querySelector('.stats-empty')).toBeTruthy();
    });

    test('counters appear after track()', () => {
        const { root, a, h } = make();
        a.track('dsl.applied');
        a.track('dsl.applied');
        a.track('dimension.entered');
        h.refresh();
        const text = root.textContent ?? '';
        expect(text).toContain('dsl.applied');
        expect(text).toContain('dimension.entered');
    });

    test('uptime is formatted mm:ss', () => {
        const { root } = make();
        const uptime = root.querySelector('.stats-uptime')!;
        expect(uptime.textContent).toMatch(/uptime \d{2}:\d{2}/);
    });

    test('recent events render newest-first', () => {
        const { root, a, h } = make();
        a.track('session.start');
        a.track('dimension.entered');
        a.track('dsl.applied');
        h.refresh();
        const evs = Array.from(root.querySelectorAll('.stats-event')).map(e => e.textContent ?? '');
        expect(evs.length).toBe(3);
        // Newest first
        expect(evs[0]).toContain('dsl.applied');
        expect(evs[2]).toContain('session.start');
    });

    test('top-N counter truncation', () => {
        const { root, a, h } = make();
        for (let i = 0; i < 20; i++) a.track('dimension.entered');
        a.track('dsl.applied');
        h.refresh();
        // Only the top counter should be in the rendered counters
        expect(root.textContent).toContain('dimension.entered');
    });
});
