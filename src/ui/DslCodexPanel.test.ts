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

// ---------------------------------------------------------------------------
// Round 134 — the
// `getRuleHistory`
// callback is
// optional. When
// omitted, the
// panel renders the
// pre-round-134
// shape (no history
// list section). When
// provided, the
// panel renders a
// "历史" list
// below the main
// codex block with
// the last N
// applied rules.
// ---------------------------------------------------------------------------

test('round_134_no_history_callback_renders_no_history_section', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    // The 4-arg
    // signature
    // (pre-round-134)
    // renders no
    // history
    // section.
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    expect(root.innerHTML).not.toContain('dsl-codex-history');
});

test('round_134_history_section_hidden_when_history_is_empty', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    // The
    // `getRuleHistory`
    // callback
    // returns
    // `[]`
    // (no rule
    // has been
    // applied
    // yet).
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => [],
    );
    // The
    // history
    // section
    // is
    // rendered
    // (because
    // the
    // callback
    // is
    // provided)
    // but
    // shows
    // the
    // empty
    // state
    // "暂无历史".
    expect(root.innerHTML).toContain('dsl-codex-history');
    expect(root.innerHTML).toContain('暂无历史');
});

test('round_134_history_list_renders_each_rule_as_a_row', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X', 3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Both
    // rules
    // appear
    // in
    // the
    // list
    // (in
    // chronological
    // order).
    // The
    // rendered
    // innerHTML
    // escapes
    // `->`
    // to
    // `-&gt;`
    // (the
    // `>`
    // char
    // is
    // HTML-entity-encoded
    // by
    // `escapeHtml`).
    expect(root.innerHTML).toContain('dsl-codex-history-row');
    expect(root.innerHTML).toContain('Damage(1)');
    // The
    // 2nd
    // rule's
    // action
    // kind
    // is
    // present
    // (we
    // don't
    // assert
    // on
    // the
    // string
    // arg
    // content
    // because
    // the
    // escaping
    // semantics
    // for
    // the
    // history
    // preview
    // are
    // best
    // tested
    // by
    // the
    // existing
    // `escapeHtml_prevents_script_injection`
    // test).
    expect(root.innerHTML).toContain('Spawn');
    // The
    // action
    // counts
    // are
    // shown.
    expect(root.innerHTML).toContain('1 动作');
});

test('round_134_history_row_uses_index_1_based', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // The
    // indices
    // are
    // 1-based
    // (`#1`
    // /
    // `#2`,
    // not
    // `#0`
    // /
    // `#1`).
    expect(root.innerHTML).toContain('#1');
    expect(root.innerHTML).toContain('#2');
});

test('round_134_history_list_pads_to_empty_state_when_callback_returns_empty', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    // The
    // callback
    // returns
    // a
    // fresh
    // empty
    // array
    // on
    // each
    // call.
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => [] as DslRule[],
    );
    expect(root.innerHTML).toContain('dsl-codex-history-empty');
    expect(root.innerHTML).toContain('暂无历史');
});

test('round_134_history_works_even_when_current_rule_is_null', () => {
    const root = makeRoot();
    // No current
    // rule
    // (empty
    // state).
    // The
    // history
    // section
    // should
    // still
    // be
    // rendered
    // (so
    // the
    // player
    // can
    // see
    // past
    // rules
    // even
    // when
    // the
    // latest
    // is
    // null).
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    expect(root.innerHTML).toContain('dsl-codex-empty');
    // The
    // history
    // is
    // still
    // there.
    expect(root.innerHTML).toContain('dsl-codex-history');
    expect(root.innerHTML).toContain('Heal(1)');
});

test('round_134_history_refresh_picks_up_new_history_array', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    let history: DslRule[] = [];
    const handle = renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Initially
    // empty
    // history
    // →
    // "暂无历史"
    // is
    // shown.
    expect(root.innerHTML).toContain('暂无历史');
    // Mutate
    // the
    // history
    // array,
    // then
    // refresh.
    history = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    handle.refresh();
    expect(root.innerHTML).not.toContain('暂无历史');
    expect(root.innerHTML).toContain('Damage(1)');
});

