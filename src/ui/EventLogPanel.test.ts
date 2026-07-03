/**
 * EventLogPanel — round-132 panel-level tests.
 *
 * Mirrors the round-118
 * AchievementsPanel test
 * pattern: drive
 * `renderEventLogPanel` directly
 * with a stub `Analytics`
 * instance and assert the
 * rendered HTML for each
 * scenario.
 */

import { renderEventLogPanel } from './EventLogPanel';
import { Analytics } from '../analytics/Analytics';

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'event-log-root';
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.getElementById('event-log-root')?.remove();
});

test('renders_empty_state_when_no_events', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    const handle = renderEventLogPanel(root, analytics);
    // Empty state line is shown.
    expect(root.innerHTML).toContain('event-log-empty');
    expect(root.innerHTML).toContain('暂无事件');
    expect(handle.refresh).toBeDefined();
});

test('renders_event_count_in_stats_row', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('session.start');
    analytics.track('dimension.entered');
    analytics.track('tutorial.step');
    renderEventLogPanel(root, analytics);
    // 3 events; the count
    // appears inside the
    // .event-log-stats row.
    expect(root.innerHTML).toContain('event-log-stats');
    // The "事件 3" cell is
    // rendered.
    expect(root.innerHTML).toMatch(/事件 <b>3<\/b>/);
});

test('renders_each_event_kind_as_a_row', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('dimension.entered');
    analytics.track('dimension.completed');
    analytics.track('item.used');
    renderEventLogPanel(root, analytics);
    // 3 kinds should each
    // appear in a
    // .event-log-kind span.
    expect(root.innerHTML).toContain('dimension.entered');
    expect(root.innerHTML).toContain('dimension.completed');
    expect(root.innerHTML).toContain('item.used');
});

test('renders_most_recent_first', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('dimension.entered');
    analytics.track('tutorial.step');
    analytics.track('npc.talked');
    renderEventLogPanel(root, analytics);
    const html = root.innerHTML;
    const npcPos = html.indexOf('>npc.talked<');
    const dimPos = html.indexOf('>dimension.entered<');
    // npc.talked was tracked
    // last → appears before
    // dimension.entered in
    // the rendered list.
    expect(npcPos).toBeGreaterThan(-1);
    expect(dimPos).toBeGreaterThan(-1);
    expect(npcPos).toBeLessThan(dimPos);
});

test('renders_data_payload_preview', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('dsl.applied', { rule: 'combo-2x', score: 100 });
    renderEventLogPanel(root, analytics);
    // The data preview
    // contains the JSON
    // representation of the
    // payload, rendered in a
    // .event-log-data span.
    expect(root.innerHTML).toContain('event-log-data');
    // "combo-2x" appears
    // (JSON.stringify keeps
    // the string value).
    expect(root.innerHTML).toContain('combo-2x');
});

test('escapeHtml_prevents_script_injection', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('feedback.submitted', { html: '<script>alert(1)</script>' });
    renderEventLogPanel(root, analytics);
    // The kind + data preview
    // is HTML-escaped.
    // The actual security
    // property we care about:
    // no <script> element was
    // created in the rendered
    // DOM tree.
    expect(root.querySelector('script')).toBeNull();
    // The data span's
    // textContent contains
    // the raw payload text
    // (unescaped), proving
    // the escape was at the
    // HTML-attribute level.
    const dataSpan = root.querySelector('.event-log-data');
    expect(dataSpan?.textContent).toContain('<script>alert(1)</script>');
});

test('refresh_re_reads_analytics_recent', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    analytics.track('dimension.entered');
    const handle = renderEventLogPanel(root, analytics);
    expect(root.innerHTML).toMatch(/事件 <b>1<\/b>/);
    // Mutate the analytics
    // after the initial
    // render, then refresh —
    // the new event should
    // appear.
    analytics.track('dimension.completed');
    handle.refresh();
    expect(root.innerHTML).toMatch(/事件 <b>2<\/b>/);
    expect(root.innerHTML).toContain('dimension.completed');
});

test('panel_class_wrapper_in_html', () => {
    const root = makeRoot();
    const analytics = new Analytics();
    renderEventLogPanel(root, analytics);
    // The outer wrapper has
    // class `event-log-panel`
    // (mirrors the round-118
    // `.achievements-panel`
    // and round-119
    // `.biome-library-panel`
    // patterns).
    expect(root.innerHTML).toContain('class="event-log-panel"');
});
