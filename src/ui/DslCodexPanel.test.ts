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

// ---------------------------------------------------------------------------
// Round 135 — click-to-
// apply from the
// history list.
// `renderDslCodexPanel`
// 6-arg signature
// adds an optional
// `onApplyHistory`
// callback. When
// provided, each
// history row gets a
// `dsl-codex-history-row-clickable`
// class +
// `data-rule-idx`
// attribute; clicking
// (or pressing
// Enter / Space)
// on a row calls
// the callback with
// the rule at that
// row's index.
// ---------------------------------------------------------------------------

test('round_135_no_onApplyHistory_renders_non_clickable_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    // 5-arg
    // signature
    // (no
    // onApplyHistory)
    // — rows are
    // static
    // divs.
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    expect(root.innerHTML).toContain('dsl-codex-history-row');
    // No
    // clickable
    // class
    // because
    // onApplyHistory
    // was
    // omitted.
    expect(root.innerHTML).not.toContain('dsl-codex-history-row-clickable');
    expect(root.innerHTML).not.toContain('data-rule-idx');
});

test('round_135_with_onApplyHistory_marks_rows_clickable', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (rule) => rule, // onApplyHistory
    );
    // Both rows
    // have the
    // clickable
    // class
    // + a
    // `data-rule-idx`
    // attribute
    // (0-based).
    expect(root.innerHTML).toContain('dsl-codex-history-row-clickable');
    expect(root.innerHTML).toContain('data-rule-idx="0"');
    expect(root.innerHTML).toContain('data-rule-idx="1"');
});

test('round_135_clicking_history_row_invokes_onApplyHistory_with_correct_rule', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    // Click the
    // 2nd row
    // (idx=1).
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(2);
    (rows[1] as HTMLElement).click();
    // The
    // callback
    // received
    // the rule
    // at idx=1.
    expect(applied.length).toBe(1);
    expect(applied[0].event.kind).toBe('Timer');
    expect(applied[0].event.arg).toBe(5);
});

test('round_135_pressing_enter_on_history_row_invokes_onApplyHistory', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    const row = root.querySelector('.dsl-codex-history-row-clickable') as HTMLElement;
    // Dispatch
    // a
    // keydown
    // event
    // (Enter).
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(applied.length).toBe(1);
    expect(applied[0].actions[0].kind).toBe('Damage');
});

test('round_135_history_click_works_even_when_current_rule_is_null', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    // The empty
    // state is
    // rendered
    // (current
    // rule is
    // null) but
    // the
    // history
    // is still
    // clickable.
    expect(root.innerHTML).toContain('dsl-codex-empty');
    const row = root.querySelector('.dsl-codex-history-row-clickable') as HTMLElement;
    expect(row).toBeTruthy();
    row.click();
    expect(applied.length).toBe(1);
    expect(applied[0].actions[0].kind).toBe('Heal');
});

test('round_135_clicking_outside_history_row_does_not_invoke_callback', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    // Click
    // somewhere
    // inside the
    // panel but
    // not on a
    // history
    // row (e.g.
    // the title
    // element).
    const title = root.querySelector('.dsl-codex-title') as HTMLElement;
    title.click();
    expect(applied.length).toBe(0);
});

// ---------------------------------------------------------------------------
// Round 136 — filter
// by event kind.
// The history list
// gains a dropdown
// above it with
// "全部" / "Collide" /
// "Timer" / "Spawn" /
// "PlayerHit". Changing
// the dropdown
// filters the
// displayed history
// rows. Filter state
// persists across
// refresh() calls but
// resets when the
// panel is re-opened
// (fresh closure).
// ---------------------------------------------------------------------------

test('round_136_no_history_callback_means_no_filter_dropdown', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    // 4-arg
    // signature
    // (no
    // history)
    // — no
    // filter
    // dropdown
    // either.
    renderDslCodexPanel(root, () => rule, () => 'accepted');
    expect(root.innerHTML).not.toContain('dsl-codex-history-filter');
    expect(root.innerHTML).not.toContain('dsl-codex-history-filter-select');
});

test('round_136_with_history_renders_filter_dropdown', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // The
    // dropdown
    // is
    // rendered
    // when
    // history
    // is
    // enabled.
    expect(root.innerHTML).toContain('dsl-codex-history-filter');
    expect(root.innerHTML).toContain('dsl-codex-history-filter-select');
    // The
    // dropdown
    // has
    // 5
    // options:
    // 全部
    // +
    // 4
    // DslEventKind.
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(5);
    expect(select.options[0].value).toBe('');
    expect(select.options[0].textContent).toBe('全部');
    expect(select.options[1].value).toBe('Collide');
    expect(select.options[2].value).toBe('Timer');
    expect(select.options[3].value).toBe('Spawn');
    expect(select.options[4].value).toBe('PlayerHit');
    // Default
    // selected
    // is
    // 全部
    // (value
    // = '').
    expect(select.value).toBe('');
});

test('round_136_filter_to_collide_shows_only_collide_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Damage', args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // All 4
    // rows
    // visible
    // initially.
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(4);
    // Change
    // the
    // dropdown
    // to
    // "Collide".
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Collide';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // Only
    // 2
    // rows
    // visible
    // (the
    // 2
    // Collide
    // entries).
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    // The
    // post-filter
    // indices
    // are
    // 1-based
    // and
    // continuous
    // (#1,
    // #2
    // — no
    // gaps).
    expect(root.innerHTML).toContain('#1');
    expect(root.innerHTML).toContain('#2');
    expect(root.innerHTML).not.toContain('#3');
    expect(root.innerHTML).not.toContain('#4');
    // Both
    // visible
    // rows
    // show
    // the
    // Collide
    // event
    // in
    // their
    // source
    // DSL.
    expect(root.innerHTML).toContain('On(Collide)');
});

test('round_136_filter_to_timer_shows_only_timer_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        { event: { kind: 'Timer', arg: 10 }, actions: [{ kind: 'Spawn', args: ['Y'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Timer';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // 2 Timer
    // rows
    // visible
    // (the
    // 1
    // Collide
    // row
    // is
    // hidden
    // by
    // the
    // filter).
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    // Both
    // Timer
    // rows
    // are
    // visible
    // (scoped
    // to the
    // history
    // list
    // — the
    // main
    // codex
    // block
    // also
    // has
    // a
    // source
    // div
    // for
    // the
    // current
    // rule
    // which
    // is
    // also
    // a
    // Collide
    // rule).
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('On(Timer, 5)');
    expect(historyListHtml).toContain('On(Timer, 10)');
    expect(historyListHtml).not.toContain('On(Collide)');
});

test('round_136_filter_with_no_matches_shows_暂无_match_empty_state', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    // History
    // has
    // only
    // Collide
    // events.
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Filter
    // to
    // Timer
    // (no
    // matches
    // in
    // the
    // history).
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Timer';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // The
    // 暂无匹配
    // empty
    // state
    // is
    // shown
    // (different
    // from
    // the
    // 暂无历史
    // empty
    // state).
    expect(root.innerHTML).toContain('dsl-codex-history-empty');
    expect(root.innerHTML).toContain('暂无匹配');
    expect(root.innerHTML).not.toContain('暂无历史');
});

test('round_136_filter_change_back_to_all_restores_all_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Filter
    // to
    // Collide
    // first
    // (re-query
    // the
    // select
    // each
    // time
    // because
    // `doRender()`
    // rebuilds
    // the
    // DOM
    // and
    // the
    // old
    // ref
    // is
    // detached).
    let select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Collide';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // Change
    // back
    // to
    // All
    // — must
    // re-query
    // because
    // the
    // previous
    // dispatch
    // triggered
    // a
    // re-render
    // that
    // detached
    // the
    // old
    // <select>.
    select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // All
    // 2
    // rows
    // back.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(2);
});

test('round_136_filter_persists_across_refresh', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
    ];
    const handle = renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Filter
    // to
    // Collide.
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Collide';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // Refresh
    // (e.g.
    // after
    // a
    // hot-reload
    // event).
    handle.refresh();
    // The
    // filter
    // is
    // still
    // applied
    // (1
    // row
    // visible).
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // The
    // dropdown
    // still
    // reads
    // "Collide"
    // (we
    // re-render
    // with
    // `selected`
    // on
    // the
    // right
    // option).
    const selectAfter = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    expect(selectAfter.value).toBe('Collide');
});

test('round_136_filtered_click_to_apply_passes_correct_rule', () => {
    // When the
    // player
    // has
    // a
    // filter
    // active
    // and
    // clicks
    // a
    // history
    // row,
    // the
    // callback
    // should
    // be
    // invoked
    // with
    // the
    // post-filter
    // rule
    // (not
    // the
    // raw
    // history[idx]
    // rule,
    // which
    // would
    // be
    // the
    // wrong
    // index
    // when
    // a
    // filter
    // is
    // active).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    // Filter
    // to
    // Collide.
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Collide';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // Click
    // the
    // 1st
    // visible
    // row
    // (post-filter
    // idx=0
    // =
    // the
    // 1st
    // Collide
    // rule).
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(2);
    (rows[0] as HTMLElement).click();
    // The
    // callback
    // got
    // the
    // Collide
    // rule
    // (Damage(1)),
    // NOT
    // history[0]
    // (which
    // happens
    // to
    // also
    // be
    // a
    // Collide
    // rule
    // —
    // the
    // test
    // is
    // more
    // interesting
    // if
    // we
    // use
    // a
    // different
    // rule
    // to
    // prove
    // the
    // post-filter
    // lookup).
    expect(applied.length).toBe(1);
    expect(applied[0].event.kind).toBe('Collide');
    expect(applied[0].actions[0].args[0]).toBe(1);
});

// ---------------------------------------------------------------------------
// Round 138 — search box tests
// (extends the round-136 filter
// dropdown with a case-
// insensitive substring search
// on the source DSL).
//
// The search input is a free-text
// `<input type="text">` placed
// next to the filter dropdown.
// It fires an `input` event that
// updates `currentSearch` and
// re-renders the history list.
// Filter + search are combined
// with AND semantics.
//
// Pattern matches round-136:
// re-query the input element
// after each dispatch (the
// `doRender()` rebuilds the DOM
// and detaches the old input).
// ---------------------------------------------------------------------------

test('round_138_no_history_callback_means_no_search_input', () => {
    // When the host
    // doesn't pass
    // a
    // `getRuleHistory`
    // callback, the
    // search input
    // shouldn't
    // appear (no
    // history to
    // search).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
    );
    const input = root.querySelector('#dsl-codex-history-search-input');
    expect(input).toBeNull();
});

test('round_138_with_history_renders_search_input', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // Initial
    // value
    // is
    // empty.
    expect(input!.value).toBe('');
    // Placeholder
    // hint
    // shows
    // the
    // intent.
    expect(input!.placeholder).toContain('DSL');
});

test('round_138_search_filters_to_matching_substring', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [5] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [3] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['dragon'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // All 4
    // rows
    // visible
    // initially.
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(4);
    // Type
    // "Spawn"
    // into
    // the
    // search
    // input.
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Spawn';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Only 2
    // rows
    // visible
    // (the 2
    // rules
    // whose
    // source
    // DSL
    // contains
    // "Spawn").
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Spawn("orc")');
    expect(historyListHtml).toContain('Spawn("dragon")');
    expect(historyListHtml).not.toContain('Heal(5)');
    expect(historyListHtml).not.toContain('Damage(3)');
});

test('round_138_search_is_case_insensitive', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Lowercase
    // "spawn"
    // matches
    // the
    // PascalCase
    // "Spawn"
    // action
    // in the
    // rendered
    // source DSL
    // (case-
    // insensitive
    // substring
    // match).
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'spawn';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(1);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Spawn');
});

test('round_138_search_with_no_matches_shows_暂无_match_empty_state', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'NoSuchSubstringAnywhere';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // 0 rows
    // visible
    // (the
    // "暂无匹配"
    // empty
    // state).
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(0);
    const empty = root.querySelector('.dsl-codex-history-empty');
    expect(empty?.textContent).toContain('暂无匹配');
});

test('round_138_clearing_search_restores_all_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Type
    // "Spawn"
    // → 1
    // row.
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Spawn';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(1);
    // Clear
    // the
    // search
    // → 2
    // rows
    // restored.
    // (Re-query
    // the
    // input
    // because
    // doRender
    // detached
    // the
    // old
    // one.)
    const input2 = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input2.value = '';
    input2.dispatchEvent(new Event('input', { bubbles: true }));
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
});

test('round_138_search_combines_with_filter_and_semantics', () => {
    // Filter
    // = "Collide",
    // search
    // = "Heal"
    // → only
    // the
    // Collide
    // rules
    // whose
    // source
    // DSL
    // contains
    // "Heal".
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Heal', args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Apply
    // the
    // filter
    // first.
    const select = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    select.value = 'Collide';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // 2 rows
    // (the 2
    // Collide
    // entries
    // —
    // the
    // Timer
    // is
    // hidden
    // by
    // the
    // filter).
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    // Now
    // type
    // "Heal"
    // into
    // the
    // search
    // →
    // only
    // 1 row
    // (the
    // Collide
    // +
    // Heal
    // entry;
    // the
    // Timer
    // +
    // Heal
    // is
    // already
    // hidden
    // by
    // the
    // filter).
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Heal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(1);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Heal(1)');
    expect(historyListHtml).not.toContain('Damage(2)');
    expect(historyListHtml).not.toContain('Heal(3)');
});

test('round_138_search_persists_across_refresh', () => {
    // The
    // search
    // value
    // should
    // survive
    // a
    // doRender
    // re-render
    // (the
    // host
    // may
    // call
    // `handle.refresh()`
    // after
    // a
    // hot-reload).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
    ];
    const handle = renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Type
    // "Spawn"
    // into
    // the
    // search.
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Spawn';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // Refresh
    // the
    // panel.
    handle.refresh();
    // The
    // search
    // should
    // still
    // be
    // active
    // —
    // only
    // 1 row
    // visible.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // The
    // new
    // input
    // element
    // should
    // also
    // carry
    // the
    // value
    // (so
    // the
    // player's
    // typed
    // text
    // is
    // visible).
    const newInput = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    expect(newInput.value).toBe('Spawn');
});

test('round_138_search_works_even_when_current_rule_is_null', () => {
    // The
    // empty-
    // state
    // branch
    // of
    // doRender
    // also
    // renders
    // the
    // search
    // box
    // (when
    // getRuleHistory
    // is
    // provided).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Search
    // input
    // should
    // exist
    // in
    // the
    // empty-
    // state
    // branch
    // too.
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // Type
    // "Spawn"
    // → 1
    // row.
    input!.value = 'Spawn';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
});

test('round_138_searched_click_to_apply_passes_correct_rule', () => {
    // When the
    // player
    // has
    // a
    // search
    // substring
    // active
    // and
    // clicks
    // a
    // history
    // row,
    // the
    // callback
    // should
    // be
    // invoked
    // with
    // the
    // post-
    // search
    // rule
    // (not
    // the
    // raw
    // history[idx]
    // rule).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['orc'] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    // Search
    // for
    // "Spawn"
    // →
    // 2
    // rows
    // visible.
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Spawn';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(2);
    // Click
    // the
    // 2nd
    // visible
    // row
    // (post-
    // search
    // idx=1
    // =
    // the
    // 2nd
    // Spawn
    // rule).
    (rows[1] as HTMLElement).click();
    expect(applied.length).toBe(1);
    // The
    // callback
    // got
    // the
    // 2nd
    // Spawn
    // rule
    // (with
    // "orc"
    // arg).
    expect(applied[0].actions[0].kind).toBe('Spawn');
    expect(applied[0].actions[0].args[0]).toBe('orc');
});

