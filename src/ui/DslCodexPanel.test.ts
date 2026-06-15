/**
 * DslCodexPanel — round-133 panel-level tests.
 *
 * Mirrors the round-118
 * AchievementsPanel / round-132
 * EventLogPanel test pattern:
 * drive `renderDslCodexPanel`
 * directly with a stub
 * `getCurrentRule` /
 * `getLastOutcome` callback
 * pair and assert the
 * rendered HTML for each
 * scenario.
 */

import { renderDslCodexPanel } from './DslCodexPanel';
import type { DslRule } from '../dsl/MemeCompiler';

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'dsl-codex-root';
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.getElementById('dsl-codex-root')?.remove();
});

test('renders_empty_state_when_no_rule_yet', () => {
    const root = makeRoot();
    const handle = renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
    );
    // Empty state line is shown.
    expect(root.innerHTML).toContain('dsl-codex-empty');
    expect(root.innerHTML).toContain('暂无 DSL');
    expect(handle.refresh).toBeDefined();
});

test('renders_rule_source_dsl', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Damage', args: [10] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // The source DSL
    // renders in the
    // .dsl-codex-source
    // block.
    expect(root.innerHTML).toContain('dsl-codex-source');
    expect(root.innerHTML).toContain('On(Collide)');
    expect(root.innerHTML).toContain('Damage(10)');
});

test('renders_event_with_arg', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Timer', arg: 5 },
        actions: [{ kind: 'Spawn', args: ['Fireball', 3] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // The event row
    // shows Timer + 5.
    expect(root.innerHTML).toContain('事件');
    expect(root.innerHTML).toContain('Timer');
    expect(root.innerHTML).toContain('5');
});

test('renders_multiple_actions', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'PlayerHit' },
        actions: [
            { kind: 'Damage', args: [5] },
            { kind: 'Heal', args: [3] },
            { kind: 'Spawn', args: ['Sparkle'] },
        ],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // 3 actions → 3 rows
    // (动作 1, 动作 2,
    // 动作 3).
    expect(root.innerHTML).toContain('动作 1');
    expect(root.innerHTML).toContain('动作 2');
    expect(root.innerHTML).toContain('动作 3');
    // Each kind + arg
    // appears.
    expect(root.innerHTML).toContain('Damage(5)');
    expect(root.innerHTML).toContain('Heal(3)');
    expect(root.innerHTML).toContain('Spawn(');
    expect(root.innerHTML).toContain('Sparkle');
});

test('renders_accepted_status_badge', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Spawn' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // The 状态 badge
    // shows "已接受".
    expect(root.innerHTML).toContain('dsl-codex-status-accepted');
    expect(root.innerHTML).toContain('已接受');
});

test('renders_rejected_status_badge', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Damage', args: [1] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'rejected');
    // The status badge
    // shows "被拒绝"
    // (round-48 frequency-
    // limit / format-error
    // rejection).
    expect(root.innerHTML).toContain('dsl-codex-status-rejected');
    expect(root.innerHTML).toContain('被拒绝');
});

test('no_status_badge_when_outcome_is_none', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Damage', args: [1] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'none');
    // No status badge is
    // rendered when the
    // outcome is 'none'
    // (no hot-reload has
    // been attempted).
    expect(root.innerHTML).not.toContain('dsl-codex-status');
});

test('escapeHtml_prevents_script_injection', () => {
    const root = makeRoot();
    // The DslRule contains
    // a string arg with
    // a `<script>` tag —
    // the panel escapes
    // it before rendering.
    const rule: DslRule = {
        event: { kind: 'Spawn' },
        actions: [{ kind: 'Spawn', args: ['<script>alert(1)</script>'] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // No `<script>`
    // element is created
    // in the rendered DOM
    // tree.
    expect(root.querySelector('script')).toBeNull();
    // The arg value is
    // HTML-escaped (the
    // angle brackets are
    // encoded). We target
    // the action row's
    // value span (the 2nd
    // `.dsl-codex-value` in
    // the DOM) — the 1st
    // is the event row
    // ('Spawn' alone, no
    // arg).
    const valueSpans = root.querySelectorAll('.dsl-codex-value');
    expect(valueSpans.length).toBeGreaterThanOrEqual(2);
    const actionValue = valueSpans[1];
    expect(actionValue.textContent).toContain('<script>alert(1)</script>');
    // The full DOM
    // contains the
    // escaped form
    // (`&lt;script&gt;`)
    // — the unescaped
    // raw `<script>`
    // string only
    // appears in the
    // textContent (which
    // jsdom decodes the
    // entities back to
    // their literal
    // characters for
    // textContent).
    expect(root.innerHTML).toContain('&lt;script&gt;');
    expect(root.innerHTML).not.toContain('<script>alert(1)</script>');
});

test('refresh_re_reads_current_rule', () => {
    const root = makeRoot();
    let current: DslRule | null = null;
    let outcome: 'accepted' | 'rejected' | 'none' = 'none';
    const handle = renderDslCodexPanel(
        root,
        () => current,
        () => outcome,
    );
    // Initial state: no rule.
    expect(root.innerHTML).toContain('dsl-codex-empty');
    // Mutate the rule
    // after initial
    // render, then
    // refresh — the new
    // rule should appear.
    current = {
        event: { kind: 'Timer', arg: 10 },
        actions: [{ kind: 'Damage', args: [5] }],
    };
    outcome = 'accepted';
    handle.refresh();
    expect(root.innerHTML).not.toContain('dsl-codex-empty');
    expect(root.innerHTML).toContain('On(Timer, 10)');
    expect(root.innerHTML).toContain('Damage(5)');
});

test('panel_class_wrapper_in_html', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    // The outer wrapper
    // has class
    // `dsl-codex-panel`
    // (mirrors the
    // round-118
    // `.achievements-panel`
    // and round-132
    // `.event-log-panel`
    // patterns).
    expect(root.innerHTML).toContain('class="dsl-codex-panel"');
});
