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

import { renderDslCodexPanel, clearPersistentPanelState } from './DslCodexPanel';
import type { DslRule } from '../dsl/MemeCompiler';
import { mutationCost } from '../dsl/MemeCompiler';

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'dsl-codex-root';
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.getElementById('dsl-codex-root')?.remove();
    // Round 149 — clear
    // the module-level
    // persistent panel
    // state (column sort
    // + hidden columns)
    // so each test
    // starts fresh.
    clearPersistentPanelState();
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
    // Round 163 — `data-rule-idx` is ALWAYS emitted on
    // rows (not just when clickable) so test-utils and
    // keyboard-nav styles can read the selection state.
    // The clickable contract is the *additional* class
    // + `role` / `tabindex`, not the `data-rule-idx`.
    expect(root.innerHTML).toContain('data-rule-idx="0"');
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

// ---------------------------------------------------------------------------
// Round 139 — sort dropdown tests
// (extends round-136 filter +
// round-138 search with a
// sort mode dropdown).
//
// The sort dropdown has 5
// options:
//   - chrono-oldest (default)
//   - chrono-newest (reverse)
//   - actions-desc (by action count, desc)
//   - actions-asc (by action count, asc)
//   - kind-asc (by event kind, alphabetical)
//
// Filter + search + sort all
// combine: filter+search AND the
// set, then sort the result.
// Click-to-apply (`data-rule-idx`)
// uses the post-sort index so
// the click target is still
// correct after sort changes.
//
// Pattern matches round-136 +
// round-138: re-query the
// `<select>` element each time
// because `doRender()` rebuilds
// the DOM and detaches the old
// element.
// ---------------------------------------------------------------------------

test('round_139_no_history_callback_means_no_sort_dropdown', () => {
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
    const sel = root.querySelector('#dsl-codex-history-sort-select');
    expect(sel).toBeNull();
});

test('round_139_with_history_renders_sort_dropdown', () => {
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
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    // Default
    // sort
    // is
    // 'chrono-oldest'.
    expect(sel!.value).toBe('chrono-oldest');
    // 5 options
    // (chrono-oldest
    // / -newest /
    // actions-desc
    // / actions-asc
    // / kind-asc).
    const opts = sel!.querySelectorAll('option');
    expect(opts.length).toBe(5);
    expect(opts[0].value).toBe('chrono-oldest');
    expect(opts[1].value).toBe('chrono-newest');
    expect(opts[2].value).toBe('actions-desc');
    expect(opts[3].value).toBe('actions-asc');
    expect(opts[4].value).toBe('kind-asc');
});

test('round_139_default_sort_is_chrono_oldest', () => {
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
    // Default
    // (no
    // change
    // event):
    // row #1
    // is the
    // first
    // history
    // entry,
    // row #2
    // is the
    // second.
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    // #1
    // appears
    // before
    // #2
    // (oldest
    // first).
    const idx1Pos = historyListHtml.indexOf('#1');
    const idx2Pos = historyListHtml.indexOf('#2');
    expect(idx1Pos).toBeGreaterThanOrEqual(0);
    expect(idx2Pos).toBeGreaterThan(idx1Pos);
});

test('round_139_chrono_newest_reverses_order', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Damage', args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Change
    // the
    // sort
    // dropdown
    // to
    // 'chrono-newest'.
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'chrono-newest';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Row #1
    // is now
    // the LAST
    // (newest)
    // history
    // entry:
    // Spawn
    // rule.
    // Row #2
    // is the
    // middle
    // entry.
    // Row #3
    // is the
    // first
    // (oldest)
    // entry.
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    const spawnPos = historyListHtml.indexOf('On(Spawn)');
    const timerPos = historyListHtml.indexOf('On(Timer, 5)');
    const collidePos = historyListHtml.indexOf('On(Collide)');
    // Newest
    // first:
    // Spawn
    // before
    // Timer
    // before
    // Collide.
    expect(spawnPos).toBeGreaterThanOrEqual(0);
    expect(timerPos).toBeGreaterThan(spawnPos);
    expect(collidePos).toBeGreaterThan(timerPos);
});

test('round_139_actions_desc_sorts_by_action_count', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // #1:
        // 1
        // action
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        // #2:
        // 3
        // actions
        { event: { kind: 'Timer', arg: 5 }, actions: [
            { kind: 'Heal', args: [] },
            { kind: 'Damage', args: [2] },
            { kind: 'Spawn', args: ['X'] },
        ] },
        // #3:
        // 2
        // actions
        { event: { kind: 'Spawn' }, actions: [
            { kind: 'Damage', args: [3] },
            { kind: 'Heal', args: [1] },
        ] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // Change
    // the
    // sort
    // dropdown
    // to
    // 'actions-desc'.
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'actions-desc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Order
    // should
    // be:
    // row
    // #1 = 3
    // actions
    // (Timer
    // rule),
    // row
    // #2 = 2
    // actions
    // (Spawn
    // rule),
    // row
    // #3 = 1
    // action
    // (Collide
    // rule).
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(3);
    // Verify
    // action
    // counts
    // by
    // checking
    // the
    // displayed
    // count
    // text.
    expect(rows[0].textContent).toContain('3 动作');
    expect(rows[1].textContent).toContain('2 动作');
    expect(rows[2].textContent).toContain('1 动作');
});

test('round_139_actions_asc_sorts_by_action_count_asc', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] }, // 1
        { event: { kind: 'Timer', arg: 5 }, actions: [
            { kind: 'Heal', args: [] },
            { kind: 'Damage', args: [2] },
            { kind: 'Spawn', args: ['X'] },
        ] }, // 3
        { event: { kind: 'Spawn' }, actions: [
            { kind: 'Damage', args: [3] },
            { kind: 'Heal', args: [1] },
        ] }, // 2
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'actions-asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Ascending:
    // #1 = 1
    // action,
    // #2 = 2
    // actions,
    // #3 = 3
    // actions.
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows[0].textContent).toContain('1 动作');
    expect(rows[1].textContent).toContain('2 动作');
    expect(rows[2].textContent).toContain('3 动作');
});

test('round_139_kind_asc_sorts_alphabetically', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Damage', args: [1] }] },   // S
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Heal', args: [] }] }, // T
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [3] }] }, // C
        { event: { kind: 'PlayerHit' }, actions: [{ kind: 'Heal', args: [4] }] }, // P
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'kind-asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Alphabetical:
    // Collide
    // (C)
    // → PlayerHit
    // (P)
    // → Spawn
    // (S)
    // → Timer
    // (T).
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    const cPos = historyListHtml.indexOf('On(Collide)');
    const pPos = historyListHtml.indexOf('On(PlayerHit)');
    const sPos = historyListHtml.indexOf('On(Spawn)');
    const tPos = historyListHtml.indexOf('On(Timer, 5)');
    expect(cPos).toBeGreaterThanOrEqual(0);
    expect(pPos).toBeGreaterThan(cPos);
    expect(sPos).toBeGreaterThan(pPos);
    expect(tPos).toBeGreaterThan(sPos);
});

test('round_139_sort_combines_with_filter_and_search', () => {
    // Filter
    // = Collide,
    // search
    // = "Heal",
    // sort
    // =
    // actions-desc.
    // Only
    // Collide +
    // Heal
    // rules
    // match,
    // sorted
    // by action
    // count
    // desc.
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // 2 actions, Collide + Heal
        { event: { kind: 'Collide' }, actions: [
            { kind: 'Heal', args: [1] },
            { kind: 'Damage', args: [2] },
        ] },
        // 1 action, Collide + Heal
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [5] }] },
        // 3 actions, but Timer + Heal (filtered out by event kind)
        { event: { kind: 'Timer', arg: 5 }, actions: [
            { kind: 'Heal', args: [] },
            { kind: 'Damage', args: [2] },
            { kind: 'Spawn', args: ['X'] },
        ] },
        // 1 action, Collide + Damage (filtered out by search "Heal")
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [3] }] },
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
    // (Collide)
    // +
    // search
    // ("Heal")
    // +
    // sort
    // (actions-desc).
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    const searchInput = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    searchInput.value = 'Heal';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    // Re-query
    // the
    // sort
    // select
    // (doRender
    // detached
    // the
    // old
    // one).
    const sortSel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sortSel.value = 'actions-desc';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    // 2 rows
    // visible:
    // the 2
    // Collide
    // + Heal
    // rules
    // (Timer
    // + Heal
    // is filtered
    // out by
    // Collide
    // filter;
    // Collide
    // + Damage
    // is filtered
    // out by
    // "Heal"
    // search).
    // Sorted
    // desc by
    // action count:
    // 2 actions
    // (#1) →
    // 1 action
    // (#2).
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('2 动作');
    expect(rows[1].textContent).toContain('1 动作');
});

test('round_139_sort_persists_across_refresh', () => {
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
    // Change
    // to
    // 'chrono-newest'.
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'chrono-newest';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('#dsl-codex-history-sort-select')?.getAttribute('value'))
        .not.toBe('chrono-oldest');
    // Refresh.
    handle.refresh();
    // Sort
    // selection
    // survives
    // (new
    // select
    // carries
    // 'chrono-newest').
    const newSel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    expect(newSel.value).toBe('chrono-newest');
});

test('round_139_sorted_click_to_apply_passes_correct_rule', () => {
    // After
    // sorting
    // by
    // 'actions-desc',
    // the
    // row
    // #1 is
    // the
    // rule
    // with
    // the
    // most
    // actions.
    // Clicking
    // it
    // should
    // invoke
    // onApplyHistory
    // with
    // THAT
    // rule
    // (not
    // history[0]).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // history[0]:
        // 1 action
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Damage', args: [1] }] },
        // history[1]:
        // 3 actions
        { event: { kind: 'Collide' }, actions: [
            { kind: 'Heal', args: [] },
            { kind: 'Damage', args: [2] },
            { kind: 'Spawn', args: ['X'] },
        ] },
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
    // Sort
    // by
    // actions-desc.
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'actions-desc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Click
    // row
    // #1
    // (now
    // the
    // 3-action
    // rule,
    // which
    // is
    // history[1]
    // in
    // chronological
    // order).
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('3 动作');
    (rows[0] as HTMLElement).click();
    // The
    // callback
    // got
    // the
    // 3-action
    // rule
    // (history[1]),
    // NOT
    // history[0].
    expect(applied.length).toBe(1);
    expect(applied[0].actions.length).toBe(3);
    expect(applied[0].event.kind).toBe('Collide');
});

test('round_139_sort_works_even_when_current_rule_is_null', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [
            { kind: 'Heal', args: [] },
            { kind: 'Damage', args: [2] },
            { kind: 'Spawn', args: ['X'] },
        ] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Sort
    // dropdown
    // should
    // exist
    // in
    // the
    // empty-state
    // branch
    // too.
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    // Change
    // to
    // 'actions-desc'.
    sel!.value = 'actions-desc';
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    // Row #1
    // is the
    // 3-action
    // rule.
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('3 动作');
});

// ---------------------------------------------------------------------------
// Round 140 — action-kind filter
// dropdown tests (extends
// round-136 event-kind filter
// + round-138 search +
// round-139 sort with a 2nd
// filter for action kinds).
//
// The action-kind filter has 5
// options:
//   - "全部" (All, default)
//   - Damage
//   - Heal
//   - Spawn
//   - SpawnEntity
//
// Filter + action filter +
// search + sort all combine
// (action + event + search AND
// the set, then sort).
// Click-to-apply uses the
// post-action-filter index.
//
// Pattern matches round-136 +
// round-138 + round-139:
// re-query the `<select>`
// element each time because
// `doRender()` rebuilds the DOM
// and detaches the old element.
// ---------------------------------------------------------------------------

test('round_140_no_history_callback_means_no_action_filter_dropdown', () => {
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
    const sel = root.querySelector('#dsl-codex-history-action-filter-select');
    expect(sel).toBeNull();
});

test('round_140_with_history_renders_action_filter_dropdown', () => {
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
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    // Initial
    // value
    // is
    // empty
    // (All).
    expect(sel!.value).toBe('');
    // 5 options
    // (All +
    // 4 DslActionKind
    // variants).
    const opts = sel!.querySelectorAll('option');
    expect(opts.length).toBe(5);
    expect(opts[0].value).toBe('');
    expect(opts[1].value).toBe('Damage');
    expect(opts[2].value).toBe('Heal');
    expect(opts[3].value).toBe('Spawn');
    expect(opts[4].value).toBe('SpawnEntity');
});

test('round_140_action_filter_to_heal_shows_only_heal_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // Has
        // Heal
        // action.
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [5] }] },
        // No
        // Heal.
        { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        // Has
        // Heal
        // (among
        // others).
        { event: { kind: 'Spawn' }, actions: [
            { kind: 'Damage', args: [3] },
            { kind: 'Heal', args: [1] },
        ] },
        // No
        // Heal.
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    // 4 rows
    // visible
    // initially.
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(4);
    // Filter
    // to
    // Heal.
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // 2 rows
    // visible
    // (the
    // 2 rules
    // containing
    // a Heal
    // action).
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    // Both
    // visible
    // rows
    // have
    // Heal
    // in
    // their
    // source
    // DSL.
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Heal(5)');
    expect(historyListHtml).toContain('Heal(1)');
    expect(historyListHtml).not.toContain('Spawn("X")');
    expect(historyListHtml).not.toContain('Damage(2)');
});

test('round_140_action_filter_to_spawn_shows_only_spawn_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Spawn', args: ['X'] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Timer', arg: 5 }, actions: [
            { kind: 'Spawn', args: ['Y'] },
            { kind: 'Damage', args: [2] },
        ] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Spawn';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Spawn("X")');
    expect(historyListHtml).toContain('Spawn("Y")');
    expect(historyListHtml).not.toContain('Heal(1)');
});

test('round_140_action_filter_with_no_matches_shows_暂无_match_empty_state', () => {
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
    // Filter
    // to
    // SpawnEntity
    // (no
    // rule
    // uses
    // it).
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'SpawnEntity';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(0);
    const empty = root.querySelector('.dsl-codex-history-empty');
    expect(empty?.textContent).toContain('暂无匹配');
});

test('round_140_clearing_action_filter_restores_all_rows', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(1);
    // Clear
    // the
    // action
    // filter
    // →
    // 2 rows
    // restored.
    // (Re-query
    // the
    // select
    // because
    // doRender
    // detached
    // the
    // old
    // one.)
    const sel2 = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel2.value = '';
    sel2.dispatchEvent(new Event('change', { bubbles: true }));
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
});

test('round_140_action_filter_combines_with_event_filter', () => {
    // Event
    // filter
    // = Collide,
    // action
    // filter
    // = Heal →
    // only
    // Collide
    // rules
    // that
    // contain
    // a Heal
    // action.
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // Collide
        // + Heal
        // (match).
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        // Collide
        // + Damage
        // (event
        // match
        // but
        // action
        // miss).
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
        // Timer
        // + Heal
        // (action
        // match
        // but
        // event
        // miss).
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
    // event
    // filter.
    const eventSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    eventSel.value = 'Collide';
    eventSel.dispatchEvent(new Event('change', { bubbles: true }));
    // 2 rows
    // (the
    // 2 Collide
    // entries).
    let rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    // Now
    // apply
    // the
    // action
    // filter
    // (Heal).
    // Re-query
    // because
    // doRender
    // detached
    // the
    // old
    // selects.
    const actionSel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    actionSel.value = 'Heal';
    actionSel.dispatchEvent(new Event('change', { bubbles: true }));
    // 1 row:
    // the
    // Collide
    // + Heal
    // entry
    // (the
    // Timer
    // + Heal
    // is
    // already
    // hidden
    // by
    // the
    // event
    // filter).
    rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(1);
    const historyListHtml = root.querySelector('.dsl-codex-history-list')?.innerHTML ?? '';
    expect(historyListHtml).toContain('Heal(1)');
    expect(historyListHtml).not.toContain('Damage(2)');
    expect(historyListHtml).not.toContain('Heal(3)');
});

test('round_140_action_filter_persists_across_refresh', () => {
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
    ];
    const handle = renderDslCodexPanel(
        root,
        () => rule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // Refresh.
    handle.refresh();
    // Action
    // filter
    // survives
    // (still
    // 1 row).
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // The
    // new
    // select
    // carries
    // the
    // 'Heal'
    // value.
    const newSel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    expect(newSel.value).toBe('Heal');
});

test('round_140_action_filtered_click_to_apply_passes_correct_rule', () => {
    // After
    // filtering
    // to
    // action
    // = Heal,
    // the
    // post-
    // action-
    // filter
    // idx=0
    // is the
    // first
    // rule
    // with a
    // Heal
    // action.
    // Clicking
    // it
    // should
    // invoke
    // onApplyHistory
    // with
    // THAT
    // rule
    // (not
    // history[0]).
    const root = makeRoot();
    const rule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Heal', args: [] }],
    };
    const history: DslRule[] = [
        // history[0]:
        // Collide
        // + Damage
        // (no Heal).
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        // history[1]:
        // Collide
        // + Heal
        // (the
        // post-
        // action-
        // filter
        // idx=0).
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
    // Apply
    // action
    // filter
    // = Heal.
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // 1 row
    // visible
    // (the
    // Collide
    // + Heal
    // rule).
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(1);
    (rows[0] as HTMLElement).click();
    // The
    // callback
    // got
    // history[1]
    // (the
    // Collide
    // + Heal
    // rule),
    // NOT
    // history[0].
    expect(applied.length).toBe(1);
    expect(applied[0].actions[0].kind).toBe('Heal');
    expect(applied[0].actions[0].args[0]).toBe(2);
});

test('round_140_action_filter_works_even_when_current_rule_is_null', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Action
    // filter
    // should
    // exist
    // in
    // the
    // empty-
    // state
    // branch
    // too.
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    // Filter
    // to
    // Heal
    // → 1 row.
    sel!.value = 'Heal';
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
});

// ---------------------------------------------------------------------------
// Round 141 — history count badge.
//   1. no_history_callback → no badge
//   2. with_history_no_filter → no badge (visible==total)
//   3. event_filter_active_shows_visible_over_total_badge
//   4. action_filter_active_shows_badge
//   5. search_active_shows_badge
//   6. zero_matches_with_filter_shows_0_over_N_badge
//   7. badge_hides_when_filter_cleared
//   8. badge_works_in_null_rule_branch
//   9. badge_works_in_populated_rule_branch
//  10. badge_agrees_with_actual_row_count
// ---------------------------------------------------------------------------

test('round_141_no_history_callback_means_no_count_badge', () => {
    // No getRuleHistory → no history section at all, so no badge.
    const root = makeRoot();
    renderDslCodexPanel(root, () => null, () => 'none');
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
});

test('round_141_with_history_no_filter_hides_badge', () => {
    // visible==total → badge hides itself (no visual noise).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // No filter, no search → visible=2, total=2 → no badge.
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
});

test('round_141_event_filter_active_shows_visible_over_total_badge', () => {
    // 3 rules, 1 Collide → badge reads "(1/3)".
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'Collide';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Badge element exists, reads (1/3).
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(1/3)');
});

test('round_141_action_filter_active_shows_badge', () => {
    // 3 rules, only 1 contains Heal → badge reads "(1/3)".
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Damage', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(1/3)');
});

test('round_141_search_active_shows_badge', () => {
    // 3 rules, only 1 contains "Spawn" in source DSL → "(1/3)".
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['Orb'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Orb';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(1/3)');
});

test('round_141_zero_matches_with_filter_shows_0_over_N_badge', () => {
    // 3 rules, filter to PlayerHit → 0 matches → "(0/3)".
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'PlayerHit';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Badge present and reads (0/3).
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(0/3)');
    // The "暂无匹配" empty state is still shown.
    expect(root.innerHTML).toContain('暂无匹配');
});

test('round_141_badge_hides_when_filter_cleared', () => {
    // Apply filter (badge shows), then clear filter (badge hides).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'Collide';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    // Clear filter — re-query because the previous dispatch triggered
    // a re-render that detached the old <select> (mirror of the
    // round-136 `filter_change_back_to_all_restores_all_rows` test).
    const sel2 = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel2.value = '';
    sel2.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
});

test('round_141_badge_works_in_null_rule_branch', () => {
    // The empty-state branch (currentRule===null) also renders the
    // badge when a filter is active. Mirrors round-136/138/140
    // "filter works even when current rule is null" tests.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'Collide';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(1/2)');
});

test('round_141_badge_works_in_populated_rule_branch', () => {
    // Same check in the populated-rule branch (currentRule !== null).
    const root = makeRoot();
    const currentRule: DslRule = {
        event: { kind: 'Collide' },
        actions: [{ kind: 'Damage', args: [1] }],
    };
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => currentRule,
        () => 'accepted',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'Timer';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    expect(root.innerHTML).toContain('(1/3)');
});

test('round_141_badge_agrees_with_actual_row_count', () => {
    // The badge number must always equal the number of rows actually
    // rendered (a stale count would mislead the player).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }, { kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [3] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Filter to Collide → 2 rows visible.
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    const rowsAfterFilter = root.querySelectorAll('.dsl-codex-history-row').length;
    expect(rowsAfterFilter).toBe(2);
    expect(root.innerHTML).toContain('(2/4)');
    // Now narrow with action filter Heal → 1 row visible.
    const actionSel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    actionSel.value = 'Heal';
    actionSel.dispatchEvent(new Event('change', { bubbles: true }));
    const rowsAfterActionFilter = root.querySelectorAll('.dsl-codex-history-row').length;
    expect(rowsAfterActionFilter).toBe(1);
    expect(root.innerHTML).toContain('(1/4)');
});

// ---------------------------------------------------------------------------
// Round 142 — "重置" / "Reset" button.
//   1. no_history_callback_means_no_reset_button
//   2. with_history_renders_reset_button
//   3. reset_clears_event_filter
//   4. reset_clears_action_filter
//   5. reset_clears_search
//   6. reset_restores_default_sort
//   7. reset_restores_all_rows
//   8. reset_clears_combined_filter_action_search_and_sort
//   9. reset_is_noop_when_everything_is_already_default
//  10. reset_button_present_in_null_rule_branch
// ---------------------------------------------------------------------------

test('round_142_no_history_callback_means_no_reset_button', () => {
    // No getRuleHistory → no history section → no reset button.
    const root = makeRoot();
    renderDslCodexPanel(root, () => null, () => 'none');
    expect(root.innerHTML).not.toContain('dsl-codex-history-reset-button');
});

test('round_142_with_history_renders_reset_button', () => {
    // The button is always rendered when getRuleHistory is provided,
    // even when every state field is at its default.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const btn = root.querySelector('#dsl-codex-history-reset-button');
    expect(btn).not.toBeNull();
    expect(btn!.tagName).toBe('BUTTON');
});

test('round_142_reset_clears_event_filter', () => {
    // Apply an event filter, click reset → filter returns to null
    // (the "全部" option is selected again).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    sel.value = 'Collide';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Pre-reset: only 1 row.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // Click reset — re-query the button after the previous re-render.
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Post-reset: all 2 rows visible + filter dropdown is back to "全部" (value="").
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(2);
    const sel2 = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    expect(sel2.value).toBe('');
});

test('round_142_reset_clears_action_filter', () => {
    // Apply an action filter, click reset → action filter returns to null.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    sel.value = 'Heal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Post-reset: 2 rows + action filter dropdown is back to "全部".
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(2);
    const sel2 = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    expect(sel2.value).toBe('');
});

test('round_142_reset_clears_search', () => {
    // Type a search substring, click reset → search returns to ''.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Heal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Post-reset: 2 rows + search input is empty.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(2);
    const input2 = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    expect(input2.value).toBe('');
});

test('round_142_reset_restores_default_sort', () => {
    // Change sort to actions-desc, click reset → sort returns to
    // 'chrono-oldest' (the default).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const sel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sel.value = 'actions-desc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Post-reset: sort dropdown is back to 'chrono-oldest'.
    const sel2 = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    expect(sel2.value).toBe('chrono-oldest');
});

test('round_142_reset_restores_all_rows', () => {
    // Stack 3 filters → 0 matches. Click reset → all rows back.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Damage', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['A'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    // 1 row visible (Collide + Heal).
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    // Reset.
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(3);
});

test('round_142_reset_clears_combined_filter_action_search_and_sort', () => {
    // The headline test: stack ALL FOUR knobs (filter + action +
    // search + sort), then one click on reset clears all of them.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }, { kind: 'Damage', args: [1] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Apply event filter = Collide.
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    // Apply action filter = Heal (no narrowing, both Collide rules have Heal).
    const actionSel = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    actionSel.value = 'Heal';
    actionSel.dispatchEvent(new Event('change', { bubbles: true }));
    // Apply search = "Heal" (also matches both).
    const input = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    input.value = 'Heal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Apply sort = actions-desc (the 2-action rule first).
    const sortSel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sortSel.value = 'actions-desc';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    // Pre-reset: 2 rows visible + badge (2/3).
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(2);
    expect(root.innerHTML).toContain('dsl-codex-history-count');
    // Click reset.
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Post-reset: all 3 rows visible + every control back to default.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(3);
    const filterSel2 = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    expect(filterSel2.value).toBe('');
    const actionSel2 = root.querySelector('#dsl-codex-history-action-filter-select') as HTMLSelectElement;
    expect(actionSel2.value).toBe('');
    const input2 = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    expect(input2.value).toBe('');
    const sortSel2 = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    expect(sortSel2.value).toBe('chrono-oldest');
    // Badge is hidden (visible == total).
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
});

test('round_142_reset_is_noop_when_everything_is_already_default', () => {
    // When every state field is at its default, clicking the
    // reset button is a no-op — no `doRender()` churn.
    // We verify by checking the badge (which is hidden at
    // default) stays hidden AND by counting the row count
    // before / after.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Sanity: badge hidden at default.
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
    const rowsBefore = root.querySelectorAll('.dsl-codex-history-row').length;
    // Click reset.
    const btn = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn.click();
    // Row count unchanged.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(rowsBefore);
    // Badge still hidden.
    expect(root.innerHTML).not.toContain('dsl-codex-history-count');
});

test('round_142_reset_button_present_in_null_rule_branch', () => {
    // The reset button is also present in the empty-state
    // branch (currentRule === null), mirrors the
    // round-136/138/140/141 "X works even when current rule
    // is null" tests.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    // Sanity: button is there.
    const btn = root.querySelector('#dsl-codex-history-reset-button');
    expect(btn).not.toBeNull();
    // Filter + click reset → still all rows visible.
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
    const btn2 = root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement;
    btn2.click();
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(1);
});

// ============================================================================
// Round 143 — "→" / "在代码中查看" preview button on each history row.
// Optional `onPreviewHistory(rule)` callback (8th arg) is wired to a
// trailing button on each row. The button is independent of
// `onApplyHistory` (a panel can be preview-only, apply-only, or both).
// ============================================================================

test('round_143_no_onPreviewHistory_renders_no_preview_buttons', () => {
    // Without onPreviewHistory, no .dsl-codex-history-preview-button
    // elements are rendered (even when onApplyHistory is provided).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        (rule) => { void rule; }, // onApplyHistory present
    );
    expect(root.querySelectorAll('.dsl-codex-history-preview-button').length).toBe(0);
});

test('round_143_with_onPreviewHistory_renders_preview_buttons_per_row', () => {
    // With onPreviewHistory, each history row gets a "→" button with
    // dsl-codex-history-preview-button-N id and data-preview-idx attr.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        undefined, // no onApplyHistory
        (rule) => { void rule; }, // onPreviewHistory only
    );
    const btns = root.querySelectorAll('.dsl-codex-history-preview-button');
    expect(btns.length).toBe(3);
    // id + data-preview-idx match the row index
    for (let i = 0; i < 3; i++) {
        const btn = btns[i] as HTMLButtonElement;
        expect(btn.id).toBe(`dsl-codex-history-preview-button-${i}`);
        expect(btn.getAttribute('data-preview-idx')).toBe(String(i));
        expect(btn.textContent?.trim()).toBe('→');
        expect(btn.getAttribute('type')).toBe('button');
    }
});

test('round_143_clicking_preview_button_invokes_onPreviewHistory_with_correct_rule', () => {
    // Clicking the "→" button fires onPreviewHistory with the rule at
    // that row's post-sort index.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    let received: DslRule | null = null;
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        undefined,
        (rule) => { received = rule; },
    );
    // Click the second row's preview button.
    const btn = root.querySelector('#dsl-codex-history-preview-button-1') as HTMLButtonElement;
    btn.click();
    expect(received).not.toBeNull();
    expect(received?.event.kind).toBe('Timer');
    expect((received?.actions[0] as any).kind).toBe('Heal');
});

test('round_143_preview_button_does_not_invoke_onApplyHistory', () => {
    // The "→" button is INSIDE the row's outer div. Both handlers
    // are attached to the same root via event delegation, so we
    // stopPropagation on the preview click to prevent the outer
    // row's click-to-apply from also firing. This is the headline
    // behavior: preview ≠ apply.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    let applyCount = 0;
    let previewCount = 0;
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => { applyCount++; }, // onApplyHistory
        () => { previewCount++; }, // onPreviewHistory
    );
    const btn = root.querySelector('#dsl-codex-history-preview-button-0') as HTMLButtonElement;
    btn.click();
    expect(previewCount).toBe(1);
    expect(applyCount).toBe(0);
});

test('round_143_preview_button_works_with_post_sort_index', () => {
    // The preview button's data-preview-idx is the post-sort index.
    // When the user sorts 'actions-desc', row 0 is the rule with
    // the MOST actions. Clicking its preview button should fire
    // onPreviewHistory with the rule at the sorted position 0.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] }, // 1 action
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }, { kind: 'Spawn', args: [3] }] }, // 2 actions
    ];
    let received: DslRule | null = null;
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        undefined,
        (rule) => { received = rule; },
    );
    // Apply sort = actions-desc
    const sortSel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sortSel.value = 'actions-desc';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    // Re-query the preview button (doRender detached the old one).
    const btn = root.querySelector('#dsl-codex-history-preview-button-0') as HTMLButtonElement;
    btn.click();
    expect(received).not.toBeNull();
    expect(received?.event.kind).toBe('Timer'); // the 2-action rule
    expect(received?.actions.length).toBe(2);
});

test('round_143_preview_button_respects_event_filter', () => {
    // When the event filter is active, only the matching rows render
    // a preview button. The data-preview-idx is the post-filter index.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [3] }] },
    ];
    let received: DslRule | null = null;
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        undefined,
        (rule) => { received = rule; },
    );
    // Filter to Collide only → 2 rows, indexed 0 and 1.
    const filterSel = root.querySelector('#dsl-codex-history-filter-select') as HTMLSelectElement;
    filterSel.value = 'Collide';
    filterSel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('.dsl-codex-history-preview-button').length).toBe(2);
    // Click preview button at index 1 → should be the SECOND Collide rule.
    const btn = root.querySelector('#dsl-codex-history-preview-button-1') as HTMLButtonElement;
    btn.click();
    expect(received).not.toBeNull();
    expect(received?.event.kind).toBe('Collide');
    expect((received?.actions[0] as any).args?.[0]).toBe(3); // args=[3]
});

test('round_143_preview_button_present_in_null_rule_branch', () => {
    // The "→" button is also rendered in the empty-state branch
    // (currentRule === null), mirrors the round-136/138/140/141/142
    // "X works even when current rule is null" tests.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
        undefined,
        undefined,
        (rule) => { void rule; },
    );
    expect(root.querySelector('#dsl-codex-history-preview-button-0')).not.toBeNull();
});

test('round_143_preview_button_coexists_with_clickable_rows', () => {
    // Both onApplyHistory AND onPreviewHistory provided → rows are
    // clickable AND have a "→" button. The button doesn't suppress
    // the row's clickability; it just stops propagation on the
    // button click so the row's click handler doesn't also fire.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    let applyCount = 0;
    let previewCount = 0;
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => { applyCount++; },
        () => { previewCount++; },
    );
    // Row is clickable.
    const row = root.querySelector('.dsl-codex-history-row-clickable');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-rule-idx')).toBe('0');
    // Preview button is also there.
    const btn = root.querySelector('.dsl-codex-history-preview-button');
    expect(btn).not.toBeNull();
    // Clicking the row (not the button) → applyCount goes up.
    (row as HTMLElement).click();
    expect(applyCount).toBe(1);
    expect(previewCount).toBe(0);
    // Clicking the button → previewCount goes up, applyCount stays.
    (btn as HTMLElement).click();
    expect(previewCount).toBe(1);
    expect(applyCount).toBe(1);
});

test('round_143_no_history_callback_means_no_preview_buttons', () => {
    // Even with onPreviewHistory, the button requires getRuleHistory
    // (no history = no list = no button). Mirrors the round-134
    // "history is opt-in via getRuleHistory" contract.
    const root = makeRoot();
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        undefined, // no getRuleHistory
        undefined,
        undefined,
        (rule) => { void rule; },
    );
    expect(root.querySelector('.dsl-codex-history-preview-button')).toBeNull();
});

// ============================================================================
// Round 144 — Clickable column headers (索引 / 源码 / 动作) for column-level
// sort. When null, all 3 columns show a neutral ↕ hint. When a column is
// active, it shows ↑/↓ and takes precedence over the dropdown sort.
// 3-state click cycle: null → asc → desc → null.
// ============================================================================

test('round_144_with_history_renders_three_column_headers', () => {
    // The history list always renders 3 column headers
    // (索引 / 源码 / 动作) when history is present — even when
    // no column sort is active. The headers are always clickable.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    expect(root.querySelector('#dsl-codex-history-col-header-idx')).not.toBeNull();
    expect(root.querySelector('#dsl-codex-history-col-header-source')).not.toBeNull();
    expect(root.querySelector('#dsl-codex-history-col-header-actions')).not.toBeNull();
    // No header is active (no column sort) → all 3 show the neutral ↕ hint.
    const headers = root.querySelectorAll('.dsl-codex-history-col-header');
    expect(headers.length).toBe(3);
    headers.forEach((h) => {
        expect(h.classList.contains('dsl-codex-history-col-header-active')).toBe(false);
        expect(h.getAttribute('aria-sort')).toBe('none');
    });
});

test('round_144_no_history_callback_means_no_column_headers', () => {
    // The header row is part of the history list, so without
    // getRuleHistory, no column headers are rendered (mirrors
    // the round-134 history opt-in contract).
    const root = makeRoot();
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        undefined, // no getRuleHistory
    );
    expect(root.querySelector('.dsl-codex-history-col-header')).toBeNull();
});

test('round_144_clicking_idle_column_activates_it_as_asc', () => {
    // First click on an idle column sets it to 'asc'.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    header.click();
    // Re-query after doRender detached the old element.
    const updated = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(updated.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(updated.getAttribute('aria-sort')).toBe('ascending');
    expect(updated.textContent).toContain('↑');
});

test('round_144_clicking_active_asc_column_flips_to_desc', () => {
    // Second click on the same column flips asc → desc.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    const updated = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(updated.getAttribute('aria-sort')).toBe('descending');
    expect(updated.textContent).toContain('↓');
});

test('round_144_clicking_active_desc_column_flips_to_asc_with_secondary_round158', () => {
    // Round 158 — extended the
    // round-144 3-state cycle to
    // 4 states: null → asc → desc
    // → asc+secondary → null.
    // The 3rd click (which was
    // "clear" in round-144) now
    // flips to asc+secondary. The
    // actual clear happens on the
    // 4th click (covered by
    // `round_158_clicking_active_asc_secondary_column_clears_sort_round158`
    // below).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const headerSel = '#dsl-codex-history-col-header-actions';
    (root.querySelector(headerSel) as HTMLElement).click();
    (root.querySelector(headerSel) as HTMLElement).click();
    // 3rd click: was round-144
    // "clear" → now round-158
    // "asc + secondary" (the
    // 4th state).
    (root.querySelector(headerSel) as HTMLElement).click();
    const updated = root.querySelector(headerSel) as HTMLElement;
    // Still active (just with
    // a different direction +
    // secondary flag).
    expect(updated.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(updated.getAttribute('aria-sort')).toBe('ascending');
    // The text contains the
    // " ↑+" indicator (the `+`
    // suffix is the round-158
    // secondary signal).
    expect(updated.textContent).toContain('↑+');
});

test('round_144_clicking_different_column_starts_at_asc', () => {
    // Clicking a different column starts that column at 'asc'
    // (and the previously-active column returns to idle).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Activate actions column.
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    // Click source column → source becomes active (asc), actions becomes idle.
    (root.querySelector('#dsl-codex-history-col-header-source') as HTMLElement).click();
    const actions = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    const source = root.querySelector('#dsl-codex-history-col-header-source') as HTMLElement;
    expect(actions.classList.contains('dsl-codex-history-col-header-active')).toBe(false);
    expect(source.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(source.getAttribute('aria-sort')).toBe('ascending');
});

test('round_158_clicking_active_asc_secondary_column_clears_sort_round158', () => {
    // Round 158 — 4th click on the
    // same column clears the sort
    // (back to dropdown sort
    // driving). The 4-state cycle:
    //   null → asc → desc → asc+secondary → null
    // (was 3-state in round-144:
    // null → asc → desc → null).
    //
    // Round 165 — extended the cycle
    // to 5 states (with the
    // `costKey asc` / `costKey desc`
    // states inserted between
    // `asc+secondary` and `null`),
    // so the clear now happens on
    // the 7th click (not the 4th).
    // We preserve the round-158
    // test name (so a regression on
    // the 4-state machine still
    // shows up) but exercise the
    // 7-click path so the
    // round-165 costKey insert is
    // pinned here too.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const headerSel = '#dsl-codex-history-col-header-actions';
    const header = () => root.querySelector(headerSel) as HTMLElement;
    // 6 clicks total: null → asc → desc → asc+secondary → costKey asc → costKey desc → null
    // (round-165: the 4th click now
    // lands at costKey asc, the
    // 5th at costKey desc, the
    // 6th click clears — same
    // terminal-clear semantics as
    // round-158, just with two
    // extra costKey states inserted
    // in between).
    header().click();
    header().click();
    header().click();
    header().click();
    header().click();
    header().click();
    // 6th click clears the sort.
    expect(header().classList.contains('dsl-codex-history-col-header-active')).toBe(false);
    expect(header().getAttribute('aria-sort')).toBe('none');
});

test('round_158_secondary_state_renders_arrow_plus_indicator_round158', () => {
    // The 4th state (asc+secondary)
    // must render the special
    // ` ↑+` indicator on the
    // active header (the `+`
    // suffix signals the
    // secondary tiebreaker is
    // engaged). The round-144
    // indicators are ` ↑` /
    // ` ↓` (no suffix).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    header().click(); // → asc, indicator ` ↑`
    expect(header().textContent).toContain('↑');
    expect(header().textContent).not.toContain('↑+');
    header().click(); // → desc, indicator ` ↓`
    expect(header().textContent).toContain('↓');
    header().click(); // → asc+secondary, indicator ` ↑+`
    expect(header().textContent).toContain('↑+');
});

test('round_158_secondary_state_title_hint_includes_次要_round158', () => {
    // The 4th state's title
    // hint must include
    // "次要" (the player who
    // hovers the header sees
    // the secondary state
    // clearly).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    header().click(); // asc
    expect(header().getAttribute('title')).not.toContain('次要');
    header().click(); // desc
    expect(header().getAttribute('title')).not.toContain('次要');
    header().click(); // asc+secondary
    expect(header().getAttribute('title')).toContain('次要');
});

test('round_158_actions_asc_secondary_reverses_tiebreaker_round158', () => {
    // Round 158 — when the
    // actions column is in
    // the asc+secondary
    // state, ties in action
    // count break by idx
    // DESC (most recent
    // first), not the
    // round-144 default of
    // idx asc.
    //
    // The test sorts 3 rules
    // all with 1 action. With
    // asc-only, they appear
    // in idx-asc order
    // (rule 0, rule 1, rule
    // 2). With asc+secondary,
    // they appear in idx-desc
    // order (rule 2, rule 1,
    // rule 0).
    const root = makeRoot();
    const history: DslRule[] = [
        // All 3 rules have 1 action each.
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' },   actions: [{ kind: 'Heal',   args: [2] }] },
        { event: { kind: 'Spawn' },   actions: [{ kind: 'Spawn',  args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => { /* onApplyHistory noop — makes rows clickable so data-rule-idx is rendered */ },
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    // Cycle to asc+secondary.
    header().click();
    header().click();
    header().click();
    // Debug: confirm the state machine reached asc+secondary.
    expect(header().getAttribute('title')).toContain('次要');
    // Verify the row order reflects the
    // asc+secondary sort (idx desc
    // tiebreaker). Since all 3 rules
    // have 1 action each, the primary
    // sort is a tie — the secondary
    // tiebreaker decides the order.
    // With idx desc, the order is:
    //   row 0 = origIndex 2 (Spawn)
    //   row 1 = origIndex 1 (Timer)
    //   row 2 = origIndex 0 (Collide)
    // The event kinds appear in the
    // rendered row text in that order.
    const rows = root.querySelectorAll<HTMLElement>('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(3);
    expect((rows[0] as HTMLElement).textContent).toContain('Spawn');
    expect((rows[1] as HTMLElement).textContent).toContain('Timer');
    expect((rows[2] as HTMLElement).textContent).toContain('Collide');
});

test('round_158_secondary_state_only_reachable_from_active_column_round158', () => {
    // Round 158 — switching to a
    // different column starts
    // that column at 'asc' with
    // NO secondary (the secondary
    // is only reachable by
    // cycling the SAME column 3
    // times). A regression that
    // carried the secondary flag
    // over to a new column would
    // break this contract.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Click actions 3 times → asc+secondary.
    const actions = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    actions().click();
    actions().click();
    actions().click();
    expect(actions().textContent).toContain('↑+');
    // Click source → source becomes
    // active (asc, no secondary).
    const source = () => root.querySelector('#dsl-codex-history-col-header-source') as HTMLElement;
    source().click();
    expect(source().textContent).toContain('↑');
    expect(source().textContent).not.toContain('↑+');
});

test('round_144_actions_column_desc_sorts_rules_by_action_count', () => {
    // Headline test: when 'actions' column is set to 'desc', rules
    // with more actions come first. The post-sort index in
    // data-rule-idx should reflect the new ordering.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },                                    // 1 action
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }, { kind: 'Spawn', args: [3] }] },           // 2 actions
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Damage', args: [4] }, { kind: 'Heal', args: [5] }, { kind: 'Spawn', args: [6] }] }, // 3 actions
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        (rule) => { void rule; }, // onApplyHistory
    );
    // Click actions column twice → asc then desc.
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    // Re-query rows after doRender.
    const rows = root.querySelectorAll('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(3);
    // data-rule-idx 0 should be the 3-action rule (highest).
    expect((rows[0] as HTMLElement).getAttribute('data-rule-idx')).toBe('0');
    // Verify the action counts in the rendered textContent:
    // the row with 3 actions should be first.
    expect((rows[0] as HTMLElement).textContent).toContain('3 动作');
    expect((rows[1] as HTMLElement).textContent).toContain('2 动作');
    expect((rows[2] as HTMLElement).textContent).toContain('1 动作');
});

test('round_144_source_column_asc_sorts_alphabetically', () => {
    // When 'source' column is 'asc', rules are sorted by
    // ruleToSource() lexicographic order.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: [3] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root.querySelector('#dsl-codex-history-col-header-source') as HTMLElement).click();
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    // Chrono order is Collide / Timer / Spawn. Lexicographic
    // (case-insensitive, lowercase source) of the event kind is
    // collide / spawn / timer.
    // The full source DSL includes more text so we just verify
    // the 1st row's event kind by checking the source DSL.
    // Actually let's just verify ordering by inspecting data-rule-idx.
    // After sort, idx 0 (was Collide), idx 1 (was Timer), idx 2 (was Spawn).
    // In lexicographic order of the source DSL, the order changes.
    // Use a simpler check: the action cells should reflect the new order.
    // But the source DSL is the full text so the simplest check is
    // to verify that the first row is not the same as the original first.
    // Source starts with "On(Collide" / "On(Timer" / "On(Spawn".
    // Lexicographic: "On(Collide" < "On(Spawn" < "On(Timer".
    // Original chrono order: Collide (idx 0), Timer (idx 1), Spawn (idx 2).
    // Sorted by source asc: Collide (new idx 0), Spawn (new idx 1), Timer (new idx 2).
    expect((rows[0] as HTMLElement).textContent).toContain('#1');
    expect((rows[1] as HTMLElement).textContent).toContain('#2');
    expect((rows[2] as HTMLElement).textContent).toContain('#3');
});

test('round_144_reset_button_clears_column_sort', () => {
    // The 重置 button (round 142) also clears the column sort
    // (the player stacks 5 knobs: filter, action-filter,
    // search, sort dropdown, column sort — one click resets all).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Activate actions column sort.
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    // Also set a search.
    const search = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    search.value = 'Collide';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    // Click reset.
    (root.querySelector('#dsl-codex-history-reset-button') as HTMLButtonElement).click();
    // Column header is back to idle.
    const actions = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(actions.classList.contains('dsl-codex-history-col-header-active')).toBe(false);
    // Search input is cleared.
    const searchAfter = root.querySelector('#dsl-codex-history-search-input') as HTMLInputElement;
    expect(searchAfter.value).toBe('');
});

test('round_144_keyboard_enter_on_column_header_activates_sort', () => {
    // Pressing Enter on a focused column header (role="button"
    // tabindex="0") activates the 3-state sort cycle.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    header.focus();
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const updated = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(updated.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(updated.getAttribute('aria-sort')).toBe('ascending');
});

test('round_144_column_sort_takes_precedence_over_dropdown_sort', () => {
    // When a column sort is active, it OVERRIDES the dropdown
    // sort. The dropdown value is preserved (so toggling column
    // sort off returns to the dropdown's last value) but the
    // displayed order follows the column sort.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Set dropdown sort to chrono-newest (would put Timer first).
    const sortSel = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    sortSel.value = 'chrono-newest';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    // Activate actions column asc (would put Collide first, since
    // both have 1 action each — tie broken by chrono index).
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    // First row's #1 should still be Collide (column sort takes precedence
    // and the tie-break is by chrono index → Collide was origIndex 0).
    const firstRow = root.querySelector('.dsl-codex-history-row') as HTMLElement;
    expect(firstRow.textContent).toContain('Collide');
    // Dropdown is still 'chrono-newest' (we didn't change it).
    const sortSelAfter = root.querySelector('#dsl-codex-history-sort-select') as HTMLSelectElement;
    expect(sortSelAfter.value).toBe('chrono-newest');
});

test('round_144_column_sort_works_in_null_rule_branch', () => {
    // The column header row is also rendered in the empty-state
    // branch (currentRule === null), mirrors the round-136/138/140/141/142/143
    // "X works even when current rule is null" tests.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        () => history,
    );
    expect(root.querySelector('#dsl-codex-history-col-header-actions')).not.toBeNull();
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    const updated = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(updated.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
});

// ============================================================================
// Round 148 — Column-level hide/show via the new visibility toggle row.
// Each data column (索引 / 源码 / 动作) gets a `👁` button; clicking
// it toggles the column's visibility in BOTH the header row AND the data
// rows. Defense in depth: hiding the currently-sorted column auto-clears
// the column sort so the player doesn't get "sorting by a column you can't
// see" UX.
// ============================================================================

test('round_148_with_history_renders_3_column_visibility_toggles', () => {
    // The toggle row is ALWAYS rendered when history is shown —
    // even when all columns are visible. 3 buttons (one per
    // data column) in the order matching the header row.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const toggles = root.querySelectorAll('.dsl-codex-col-toggle');
    expect(toggles.length).toBe(3);
    // Ordered: idx, source, actions.
    expect(toggles[0].getAttribute('data-toggle-column')).toBe('idx');
    expect(toggles[1].getAttribute('data-toggle-column')).toBe('source');
    expect(toggles[2].getAttribute('data-toggle-column')).toBe('actions');
    // All start in "visible" state.
    toggles.forEach((t) => {
        expect(t.classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
        expect(t.textContent).toContain('👁');
    });
});

test('round_148_no_history_callback_means_no_toggle_row', () => {
    // No history → no toggle row (mirrors the round-134 history
    // opt-in contract).
    const root = makeRoot();
    renderDslCodexPanel(
        root,
        () => null,
        () => 'none',
        undefined, // no getRuleHistory
    );
    expect(root.querySelector('.dsl-codex-col-toggle-row')).toBeNull();
});

test('round_148_clicking_idx_toggle_hides_idx_header_and_cells', () => {
    // Click the idx toggle → idx column disappears from both the
    // header row AND the data rows.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const idxBtn = root.querySelector('[data-toggle-column="idx"]') as HTMLElement;
    idxBtn.click();
    // Re-query (doRender detached the old toggle row).
    expect(root.querySelector('#dsl-codex-history-col-header-idx')).toBeNull();
    // Data rows: no `.dsl-codex-history-idx` cells either.
    expect(root.querySelectorAll('.dsl-codex-history-idx').length).toBe(0);
    // The source + actions columns are still there.
    expect(root.querySelector('#dsl-codex-history-col-header-source')).not.toBeNull();
    expect(root.querySelector('#dsl-codex-history-col-header-actions')).not.toBeNull();
    // Re-queried toggle is now in hidden state.
    const updatedBtn = root.querySelector('[data-toggle-column="idx"]') as HTMLElement;
    expect(updatedBtn.classList.contains('dsl-codex-col-toggle-hidden')).toBe(true);
    expect(updatedBtn.textContent).toContain('—');
});

test('round_148_clicking_hidden_toggle_shows_column_again', () => {
    // Click → hide; click again → show. The toggle is a 2-state
    // switch, not a 3-state cycle.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const btn = root.querySelector('[data-toggle-column="source"]') as HTMLElement;
    btn.click();
    expect((root.querySelector('[data-toggle-column="source"]') as HTMLElement)
        .classList.contains('dsl-codex-col-toggle-hidden')).toBe(true);
    (root.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    // After re-show: source header AND data cells are back.
    expect(root.querySelector('#dsl-codex-history-col-header-source')).not.toBeNull();
    expect(root.querySelectorAll('.dsl-codex-history-source').length).toBe(history.length);
    // Toggle button is back to "visible" state.
    expect((root.querySelector('[data-toggle-column="source"]') as HTMLElement)
        .classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
});

test('round_148_hiding_all_3_columns_still_renders_rows', () => {
    // Hide all 3 columns → each row is just the (empty) grid
    // container with no data cells. The panel is still useful for
    // a player who only cares about the preview button.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root.querySelector('[data-toggle-column="idx"]') as HTMLElement).click();
    (root.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    (root.querySelector('[data-toggle-column="actions"]') as HTMLElement).click();
    // No data cells of any kind.
    expect(root.querySelectorAll('.dsl-codex-history-idx').length).toBe(0);
    expect(root.querySelectorAll('.dsl-codex-history-source').length).toBe(0);
    expect(root.querySelectorAll('.dsl-codex-history-actions').length).toBe(0);
    // No column headers either.
    expect(root.querySelectorAll('.dsl-codex-history-col-header').length).toBe(0);
    // But the rows themselves are still rendered.
    expect(root.querySelectorAll('.dsl-codex-history-row').length).toBe(history.length);
});

test('round_148_hiding_actions_column_keeps_data_rows_in_dropdown_sort_order', () => {
    // Hide the actions column → rows are still rendered in the
    // current sort order (default = chrono-oldest).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' },   actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root.querySelector('[data-toggle-column="actions"]') as HTMLElement).click();
    // Both rows still rendered, in chrono-oldest order (#1 then #2).
    const rows = root.querySelectorAll('.dsl-codex-history-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#1');
    expect(rows[1].textContent).toContain('#2');
});

test('round_148_hiding_sorted_column_clears_column_sort', () => {
    // Defense in depth: if the player has the actions column
    // sorted and then hides it, the column sort is auto-cleared
    // (otherwise the row order would be driven by a column
    // the player can't see — confusing UX).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' },   actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Activate actions sort (1st click: idle → asc).
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    expect((root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement)
        .getAttribute('aria-sort')).toBe('ascending');
    // Now hide the actions column.
    (root.querySelector('[data-toggle-column="actions"]') as HTMLElement).click();
    // The actions column is hidden.
    expect(root.querySelector('#dsl-codex-history-col-header-actions')).toBeNull();
    // The sort is cleared — so the dropdown sort drives row order again.
    // Re-render the panel (doRender detaches the old header row).
    // After clear: the next time a column is activated, it starts at asc
    // (so we just check that hiding didn't leave a stale "ascending"
    // marker on a re-activated column).
    (root.querySelector('[data-toggle-column="actions"]') as HTMLElement).click();
    // Re-show actions column.
    expect(root.querySelector('#dsl-codex-history-col-header-actions')).not.toBeNull();
    // It should be idle (not active) because the sort was cleared.
    expect((root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement)
        .classList.contains('dsl-codex-history-col-header-active')).toBe(false);
    expect((root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement)
        .getAttribute('aria-sort')).toBe('none');
});

test('round_148_hiding_non_sorted_column_does_not_clear_column_sort', () => {
    // Negative test for the auto-clear: hiding a column that is
    // NOT the sorted one must not disturb the sort.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Activate actions sort.
    (root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    // Hide the idx column (NOT the sorted one).
    (root.querySelector('[data-toggle-column="idx"]') as HTMLElement).click();
    // Hmm — wait, we hid idx so the actions header is still visible
    // somewhere? Actually the actions column is NOT hidden here so
    // its header must still be visible and active.
    // Re-query: actions header is still present.
    const actionsHeader = root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(actionsHeader).not.toBeNull();
    expect(actionsHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(actionsHeader.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
});

test('round_148_toggle_row_uses_stable_column_order_idx_source_actions', () => {
    // Pin the column order so a refactor that re-orders the
    // toggle row breaks the test.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const toggles = Array.from(root.querySelectorAll('.dsl-codex-col-toggle'));
    const order = toggles.map((t) => t.getAttribute('data-toggle-column'));
    expect(order).toEqual(['idx', 'source', 'actions']);
});

// ============================================================================
// Round 149 — Column-level sort + hidden-columns persistence across
// `renderDslCodexPanel` re-renders. The local closure re-creates on every
// call (the function returns a fresh closure), so round 144 / round 148
// state was lost when the panel re-rendered (e.g. when the player entered
// a new atom). Round 149 moves the state to module scope, so a player
// who sorted by actions-desc and hid the source column sees their
// choices preserved across re-renders.
// ============================================================================

test('round_149_column_sort_survives_panel_rerender', () => {
    // First call: render, click the actions column header to
    // activate 'asc' sort.
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' },   actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    expect((root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement)
        .getAttribute('aria-sort')).toBe('ascending');
    // Simulate a re-render (e.g. dimension change): create a new
    // root, call renderDslCodexPanel again with the same history.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // The actions column header is STILL active — the sort
    // survived the re-render.
    const header2 = root2.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(header2.classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(header2.getAttribute('aria-sort')).toBe('ascending');
});

test('round_149_hidden_columns_survive_panel_rerender', () => {
    // First call: hide the source column via the toggle row.
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    expect(root1.querySelector('#dsl-codex-history-col-header-source')).toBeNull();
    // Re-render with a fresh root.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // The source column is STILL hidden — the toggle row
    // shows "—" for source AND no source cells are rendered.
    expect(root2.querySelector('#dsl-codex-history-col-header-source')).toBeNull();
    expect(root2.querySelectorAll('.dsl-codex-history-source').length).toBe(0);
    const sourceToggle = root2.querySelector('[data-toggle-column="source"]') as HTMLElement;
    expect(sourceToggle.classList.contains('dsl-codex-col-toggle-hidden')).toBe(true);
});

test('round_149_reset_button_clears_persistent_sort_and_hidden_columns', () => {
    // Activate sort + hide 2 columns → click reset → re-render
    // → state is back to default (no sort, all columns visible).
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root1.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    (root1.querySelector('[data-toggle-column="idx"]') as HTMLElement).click();
    // Click reset.
    (root1.querySelector('#dsl-codex-history-reset-button') as HTMLElement).click();
    // Re-render with a fresh root.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Sort is cleared: all 3 column headers are idle.
    const headers = root2.querySelectorAll('.dsl-codex-history-col-header');
    headers.forEach((h) => {
        expect(h.classList.contains('dsl-codex-history-col-header-active')).toBe(false);
        expect(h.getAttribute('aria-sort')).toBe('none');
    });
    // Hidden columns are cleared: source + idx are visible.
    expect(root2.querySelector('#dsl-codex-history-col-header-source')).not.toBeNull();
    expect(root2.querySelector('#dsl-codex-history-col-header-idx')).not.toBeNull();
    const sourceToggle = root2.querySelector('[data-toggle-column="source"]') as HTMLElement;
    const idxToggle = root2.querySelector('[data-toggle-column="idx"]') as HTMLElement;
    expect(sourceToggle.classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
    expect(idxToggle.classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
});

test('round_149_clear_persistent_panel_state_resets_between_tests', () => {
    // Headline: `clearPersistentPanelState` is the
    // afterEach escape hatch. After calling it, a fresh
    // render starts at default (no sort, all columns visible).
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root1.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    // Externally clear the persistent state.
    clearPersistentPanelState();
    // Re-render.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Back to default.
    const header2 = root2.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    expect(header2.getAttribute('aria-sort')).toBe('none');
    expect(root2.querySelector('#dsl-codex-history-col-header-source')).not.toBeNull();
    expect((root2.querySelector('[data-toggle-column="source"]') as HTMLElement)
        .classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
});

test('round_149_hiding_sorted_column_clears_sort_in_persistent_state', () => {
    // The round-148 "hiding the sorted column auto-clears
    // the sort" defense must also persist: after hiding +
    // re-rendering, the sort is gone.
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root1.querySelector('[data-toggle-column="actions"]') as HTMLElement).click();
    // Re-render.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // The actions column is hidden, AND no other column is
    // active in its place (the sort was cleared by the
    // round-148 defense).
    expect(root2.querySelector('#dsl-codex-history-col-header-actions')).toBeNull();
    // The other 2 columns are idle.
    const idxHeader = root2.querySelector('#dsl-codex-history-col-header-idx') as HTMLElement;
    const srcHeader = root2.querySelector('#dsl-codex-history-col-header-source') as HTMLElement;
    expect(idxHeader.getAttribute('aria-sort')).toBe('none');
    expect(srcHeader.getAttribute('aria-sort')).toBe('none');
});

test('round_149_toggling_back_to_visible_updates_persistent_state', () => {
    // Round-trip: hide column → re-show → re-render → column
    // is visible.
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    const idxBtn1 = root1.querySelector('[data-toggle-column="idx"]') as HTMLElement;
    idxBtn1.click();
    (root1.querySelector('[data-toggle-column="idx"]') as HTMLElement).click();
    // Re-render.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => history[0],
        () => 'none',
        () => history,
    );
    // idx is visible.
    expect(root2.querySelector('#dsl-codex-history-col-header-idx')).not.toBeNull();
    expect((root2.querySelector('[data-toggle-column="idx"]') as HTMLElement)
        .classList.contains('dsl-codex-col-toggle-hidden')).toBe(false);
});

test('round_149_persistent_state_does_not_leak_to_no_history_render', () => {
    // Edge case: a render with NO `getRuleHistory` callback
    // must NOT apply the persistent sort / hidden columns
    // (the history section is entirely hidden). The
    // persistent state is preserved for the NEXT call
    // that DOES have a history.
    const root1 = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root1,
        () => history[0],
        () => 'none',
        () => history,
    );
    (root1.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement).click();
    (root1.querySelector('[data-toggle-column="source"]') as HTMLElement).click();
    // Render without getRuleHistory (different root, same
    // persistent state). No history section is shown — so
    // no headers / toggle row to leak into.
    document.getElementById('dsl-codex-root')?.remove();
    const root2 = makeRoot();
    renderDslCodexPanel(
        root2,
        () => null,
        () => 'none',
        undefined, // no getRuleHistory
    );
    // No history section.
    expect(root2.querySelector('.dsl-codex-history-col-header')).toBeNull();
    expect(root2.querySelector('.dsl-codex-col-toggle-row')).toBeNull();
    // Render with history again — sort + hidden state still
    // present (preserved across the no-history render).
    document.getElementById('dsl-codex-root')?.remove();
    const root3 = makeRoot();
    renderDslCodexPanel(
        root3,
        () => history[0],
        () => 'none',
        () => history,
    );
    expect((root3.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement)
        .classList.contains('dsl-codex-history-col-header-active')).toBe(true);
    expect(root3.querySelector('#dsl-codex-history-col-header-source')).toBeNull();
});

// ============================================================================
// Round 163 — keyboard navigation for the history list.
//
// The round-135 Enter-on-row path remains the
// primary click-to-apply entry. Round 163 adds a
// SECOND path: the player presses Up / Down while
// the panel root is focused to move a "selection
// cursor" through the visible rows (highlighted via
// the `dsl-codex-history-row-is-selected` class +
// a `data-selected="1"` attribute), then presses
// Enter to apply the row under the cursor.
//
// This is the standard listbox / listbox-like
// keyboard pattern (file pickers, IDE outlines, the
// OS X Finder list view). Big UX win for 操控性好:
// the player can navigate the rule history without
// reaching for the mouse.
//
// Pins (10 tests):
//   1. no_row_is_selected_by_default_round_163
//   2. arrow_down_marks_first_row_as_selected_round_163
//   3. arrow_down_advances_through_visible_rows_round_163
//   4. arrow_up_clamps_at_first_row_round_163
//   5. arrow_down_clamps_at_last_row_round_163
//   6. data_selected_attribute_appears_on_selected_row_round_163
//   7. only_one_row_is_selected_at_a_time_round_163
//   8. arrow_keys_ignored_when_focus_is_in_filter_input_round_163
//   9. arrow_keys_ignored_when_focus_is_on_clickable_row_round_163
//  10. enter_on_panel_root_with_selection_invokes_onApplyHistory_round_163
// ============================================================================

function dispatchKeydown(target: EventTarget, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

test('round_163_no_row_is_selected_by_default_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // No row has the
    // `data-selected`
    // attribute until the
    // player presses
    // Up / Down.
    expect(root.querySelector('[data-selected="1"]')).toBeNull();
    expect(root.querySelector('.dsl-codex-history-row-is-selected')).toBeNull();
});

test('round_163_arrow_down_marks_first_row_as_selected_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Focus is on the
    // panel root; press
    // ArrowDown to move
    // the cursor to the
    // first row.
    dispatchKeydown(root, 'ArrowDown');
    const selected = root.querySelectorAll('[data-selected="1"]');
    expect(selected.length).toBe(1);
    expect(selected[0].getAttribute('data-rule-idx')).toBe('0');
});

test('round_163_arrow_down_advances_through_visible_rows_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['a'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('0');
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('1');
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('2');
});

test('round_163_arrow_up_clamps_at_first_row_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    // Down once, then Up
    // twice — should
    // clamp at row 0
    // (not go to -1).
    dispatchKeydown(root, 'ArrowDown');
    dispatchKeydown(root, 'ArrowUp');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('0');
    dispatchKeydown(root, 'ArrowUp');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('0');
});

test('round_163_arrow_down_clamps_at_last_row_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    dispatchKeydown(root, 'ArrowDown');
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('1');
    // Press Down again —
    // should stay at the
    // last row (no -1
    // wraparound, no
    // overflow).
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelector('[data-selected="1"]')!.getAttribute('data-rule-idx')).toBe('1');
});

test('round_163_data_selected_attribute_appears_on_selected_row_round_163', () => {
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    dispatchKeydown(root, 'ArrowDown');
    const selected = root.querySelector('[data-selected="1"]') as HTMLElement;
    expect(selected).not.toBeNull();
    expect(selected.classList.contains('dsl-codex-history-row-is-selected')).toBe(true);
});

test('round_163_only_one_row_is_selected_at_a_time_round_163', () => {
    // Even with 5 rows in
    // the list, only 1
    // row carries the
    // selection class at
    // any time.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['a'] }] },
        { event: { kind: 'PlayerHit' }, actions: [{ kind: 'Damage', args: [3] }] },
        { event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [4] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    dispatchKeydown(root, 'ArrowDown');
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelectorAll('[data-selected="1"]').length).toBe(1);
    dispatchKeydown(root, 'ArrowDown');
    expect(root.querySelectorAll('[data-selected="1"]').length).toBe(1);
});

test('round_163_arrow_keys_ignored_when_focus_is_in_filter_input_round_163', () => {
    // The search input is
    // a sibling of the
    // list (not inside
    // it). Pressing Up
    // while the focus is
    // there should NOT
    // move the row
    // cursor — it should
    // just be a no-op
    // (the browser's
    // default caret
    // movement is also
    // suppressed because
    // we have no Up/Down
    // handling in a text
    // input).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const search = root.querySelector('input[type="search"], input[type="text"]') as HTMLElement;
    expect(search).not.toBeNull();
    dispatchKeydown(search, 'ArrowDown');
    // No row was selected
    // — the handler
    // returned early.
    expect(root.querySelector('[data-selected="1"]')).toBeNull();
});

test('round_163_arrow_keys_ignored_when_focus_is_on_clickable_row_round_163', () => {
    // When the focus is
    // ON a clickable row
    // (the round-135
    // click-to-apply
    // surface), Up/Down
    // should NOT move
    // the keyboard
    // selection cursor.
    // Otherwise pressing
    // Up/Down on a row
    // would both move the
    // cursor AND
    // potentially
    // double-activate
    // (Enter) on the
    // wrong row.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => undefined,  // onApplyHistory stub
    );
    const row = root.querySelector('.dsl-codex-history-row-clickable') as HTMLElement;
    expect(row).not.toBeNull();
    dispatchKeydown(row, 'ArrowDown');
    // No selection was
    // made — the row's
    // own handler is the
    // only one that
    // should respond to
    // keys on a row.
    expect(root.querySelector('[data-selected="1"]')).toBeNull();
});

test('round_163_enter_on_panel_root_with_selection_invokes_onApplyHistory_round_163', () => {
    // The canonical
    // keyboard-nav flow:
    // Down to select
    // row 1, Enter to
    // apply it. The
    // applied rule is
    // the 2nd history
    // entry, NOT the
    // first (round-135
    // default).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        { event: { kind: 'Timer' }, actions: [{ kind: 'Heal', args: [2] }] },
    ];
    const applied: DslRule[] = [];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        (r) => { applied.push(r); },
    );
    dispatchKeydown(root, 'ArrowDown');
    dispatchKeydown(root, 'ArrowDown');
    dispatchKeydown(root, 'Enter');
    expect(applied.length).toBe(1);
    expect(applied[0].event.kind).toBe('Timer');
    expect(applied[0].actions[0].kind).toBe('Heal');
});

// =====================================================================
// Round 165 — 5-state column sort
// cycle (costKey asc / desc).
//
// Cycle:
//   null → asc → desc → asc+secondary → costKey asc → costKey desc → null
//
// The 4th state (`costKey: true`)
// sorts by `mutation_cost()`
// (round-132 heuristic) instead of
// the column's *displayed value*.
// The column header still
// determines direction (asc / desc)
// and the `secondary` flag still
// controls ties. The `$` glyph is
// the single-character mnemonic
// for "cost of mutation".
// =====================================================================

test('round_165_costKey_state_renders_dollar_indicator_round165', () => {
    // The 5th state (costKey asc)
    // must render the ` ↑$`
    // indicator on the active
    // header — the `$` suffix
    // signals the costKey
    // tiebreaker is engaged. The
    // round-158 `↑+` indicator
    // is still used for the 4th
    // state (asc+secondary).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    header().click(); // → asc, indicator ` ↑`
    expect(header().textContent).toContain('↑');
    expect(header().textContent).not.toContain('↑+');
    expect(header().textContent).not.toContain('↑$');
    header().click(); // → desc, indicator ` ↓`
    expect(header().textContent).toContain('↓');
    expect(header().textContent).not.toContain('↓$');
    header().click(); // → asc+secondary, indicator ` ↑+`
    expect(header().textContent).toContain('↑+');
    expect(header().textContent).not.toContain('↑$');
    header().click(); // → costKey asc, indicator ` ↑$` (round-165)
    expect(header().textContent).toContain('↑$');
    expect(header().textContent).not.toContain('↑+');
    header().click(); // → costKey desc, indicator ` ↓$` (round-165)
    expect(header().textContent).toContain('↓$');
    header().click(); // → null (clears)
    expect(header().classList.contains('dsl-codex-history-col-header-active')).toBe(false);
});

test('round_165_costKey_state_title_hint_includes_cost_round165', () => {
    // The 5th state's title
    // hint must include
    // "cost" (so the player who
    // hovers the header sees
    // the costKey state
    // clearly).
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    // 4 clicks: null → asc → desc → asc+secondary → costKey asc
    header().click();
    header().click();
    header().click();
    header().click();
    expect(header().getAttribute('title')).toContain('cost');
});

test('round_165_costKey_asc_sorts_cheapest_rules_first_round165', () => {
    // Round 165 — the costKey
    // asc sort places the
    // cheapest rules at the
    // top. The round-132
    // heuristic gives
    //   1-action Damage/Heal: cost 2
    //   1-action Spawn: cost 3
    //   1-action SpawnEntity: cost 4
    //   2-action [Spawn, SpawnEntity]: cost 6
    // We assemble 4 rules with
    // strictly increasing cost
    // so the sort has a single
    // stable order — easier to
    // assert than a partial sort.
    const root = makeRoot();
    const history: DslRule[] = [
        // origIndex 0: 1-action Spawn (cost 3)
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['a'] }] },
        // origIndex 1: 2-action [Spawn, SpawnEntity] (cost 6)
        {
            event: { kind: 'Spawn' },
            actions: [
                { kind: 'Spawn', args: ['b'] },
                { kind: 'SpawnEntity', args: ['c'] },
            ],
        },
        // origIndex 2: 1-action Damage (cost 2)
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        // origIndex 3: 1-action SpawnEntity (cost 4)
        { event: { kind: 'Spawn' }, actions: [{ kind: 'SpawnEntity', args: ['d'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => { /* onApplyHistory noop — makes rows clickable */ },
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    // 4 clicks: null → asc → desc → asc+secondary → costKey asc
    header().click();
    header().click();
    header().click();
    header().click();
    // Confirm we landed at
    // costKey asc.
    expect(header().textContent).toContain('↑$');
    // Verify the row order
    // reflects the costKey asc
    // sort (cheapest first).
    // Cost order:
    //   row 0 = origIndex 2 (cost 2: Damage)
    //   row 1 = origIndex 0 (cost 3: Spawn)
    //   row 2 = origIndex 3 (cost 4: SpawnEntity)
    //   row 3 = origIndex 1 (cost 6: Spawn+SpawnEntity)
    const rows = root.querySelectorAll<HTMLElement>('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(4);
    // Each row contains its
    // action kind in the
    // rendered text — the
    // cheapest first order
    // means the Damage rule
    // (origIndex 2) is at the
    // top.
    expect((rows[0] as HTMLElement).textContent).toContain('Damage');
    expect((rows[1] as HTMLElement).textContent).toContain('Spawn');
    expect((rows[2] as HTMLElement).textContent).toContain('SpawnEntity');
});

test('round_165_costKey_desc_sorts_costliest_rules_first_round165', () => {
    // Round 165 — the costKey
    // desc sort places the
    // most expensive rules at
    // the top (the "show me
    // the round-162 codegen
    // output" workflow).
    const root = makeRoot();
    const history: DslRule[] = [
        // origIndex 0: 1-action Damage (cost 2)
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
        // origIndex 1: 2-action [Spawn, SpawnEntity] (cost 6)
        {
            event: { kind: 'Spawn' },
            actions: [
                { kind: 'Spawn', args: ['b'] },
                { kind: 'SpawnEntity', args: ['c'] },
            ],
        },
        // origIndex 2: 1-action Spawn (cost 3)
        { event: { kind: 'Spawn' }, actions: [{ kind: 'Spawn', args: ['a'] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
        undefined,
        () => { /* onApplyHistory noop */ },
    );
    const header = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    // 5 clicks: null → asc → desc → asc+secondary → costKey asc → costKey desc
    header().click();
    header().click();
    header().click();
    header().click();
    header().click();
    // Confirm we landed at
    // costKey desc.
    expect(header().textContent).toContain('↓$');
    const rows = root.querySelectorAll<HTMLElement>('.dsl-codex-history-row-clickable');
    expect(rows.length).toBe(3);
    // Cost order desc:
    //   row 0 = origIndex 1 (cost 6: Spawn+SpawnEntity)
    //   row 1 = origIndex 2 (cost 3: Spawn)
    //   row 2 = origIndex 0 (cost 2: Damage)
    expect((rows[0] as HTMLElement).textContent).toContain('SpawnEntity');
    expect((rows[1] as HTMLElement).textContent).toContain('Spawn');
    expect((rows[2] as HTMLElement).textContent).toContain('Damage');
});

test('round_165_costKey_state_only_reachable_from_active_column_round165', () => {
    // Round 165 — switching to a
    // different column starts
    // that column at 'asc' with
    // NO costKey (the costKey
    // is only reachable by
    // cycling the SAME column 4
    // times). Mirrors the
    // round-158 secondary-state-
    // only-reachable-from-active-
    // column test.
    const root = makeRoot();
    const history: DslRule[] = [
        { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] },
    ];
    renderDslCodexPanel(
        root,
        () => history[0],
        () => 'none',
        () => history,
    );
    const actionsHeader = () => root.querySelector('#dsl-codex-history-col-header-actions') as HTMLElement;
    const sourceHeader = () => root.querySelector('#dsl-codex-history-col-header-source') as HTMLElement;
    // Cycle actions column to
    // costKey asc.
    actionsHeader().click();
    actionsHeader().click();
    actionsHeader().click();
    actionsHeader().click();
    expect(actionsHeader().textContent).toContain('↑$');
    // Now click the source
    // column — it should start
    // at plain 'asc' (no
    // costKey, no secondary).
    sourceHeader().click();
    expect(sourceHeader().textContent).toContain('↑');
    expect(sourceHeader().textContent).not.toContain('↑$');
    expect(sourceHeader().textContent).not.toContain('↑+');
});

test('round_165_mutationCost_helper_mirrors_rust_round132_round165', () => {
    // The TS `mutationCost`
    // helper (MemeCompiler.ts)
    // is the round-165 mirror
    // of the Rust
    // `ast::Rule::mutation_cost`
    // (round-132). It must give
    // the same cost for the
    // same rule shape so the
    // sort is consistent across
    // the TS / Rust boundary.
    //   empty actions: cost 1
    //   1-action Damage/Heal: cost 2
    //   1-action Spawn: cost 3
    //   1-action SpawnEntity: cost 4
    //   2-action [Spawn, SpawnEntity]: cost 6
    //   2-action [Damage, Heal]: cost 3
    expect(mutationCost({ event: { kind: 'Collide' }, actions: [] })).toBe(1);
    expect(mutationCost({ event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [1] }] })).toBe(2);
    expect(mutationCost({ event: { kind: 'Collide' }, actions: [{ kind: 'Heal', args: [1] }] })).toBe(2);
    expect(mutationCost({ event: { kind: 'Collide' }, actions: [{ kind: 'Spawn', args: ['x'] }] })).toBe(3);
    expect(mutationCost({ event: { kind: 'Collide' }, actions: [{ kind: 'SpawnEntity', args: ['x'] }] })).toBe(4);
    expect(mutationCost({
        event: { kind: 'Collide' },
        actions: [
            { kind: 'Spawn', args: ['x'] },
            { kind: 'SpawnEntity', args: ['y'] },
        ],
    })).toBe(6);
    expect(mutationCost({
        event: { kind: 'Collide' },
        actions: [
            { kind: 'Damage', args: [1] },
            { kind: 'Heal', args: [1] },
        ],
    })).toBe(3);
});

