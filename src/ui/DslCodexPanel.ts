/**
 * DslCodexPanel — round-133 + round-134 + round-135 + round-136 + round-138 + round-139 + round-140 + round-141 + round-142.
 *
 * Renders the AGI's most recently
 * generated / hot-reloaded `DslRule`
 * (the round-15/16 `MemeCompiler`
 * output) as a small codex
 * overlay inside
 * `<div id="dsl-codex-root">`.
 *
 * Round 133 — shows:
 *   - the rule's source DSL
 *     (the raw `DslRule` rendered
 *     as `On(<event>) -> <action>(...)`)
 *   - the parsed AST breakdown
 *     (event kind / arg + each
 *     action's kind + args)
 *   - "no DSL generated yet"
 *     empty state when the host
 *     hasn't called
 *     `hotReloadFromMemes` yet
 *   - "rule rejected" state
 *     when the most recent
 *     hot-reload was rejected
 *     (round-48 frequency
 *     limit or format error)
 *
 * Round 134 — also shows:
 *   - the last N successfully-
 *     applied rules from the
 *     `HotReloadController`
 *     `getRuleHistory()` ring
 *     buffer (default capacity
 *     5). Rendered as a small
 *     "历史" list below the
 *     main codex block so the
 *     player can spot the AGI's
 *     pattern of recent
 *     generations. Each row
 *     shows the source DSL +
 *     the action count for
 *     quick scanning.
 *
 * Round 135 — also supports
 * click-to-apply: each
 * history row becomes a
 * clickable element when
 * the `onApplyHistory`
 * callback is provided.
 *
 * Round 136 — adds a
 * "filter by event kind"
 * dropdown above the
 * history list. The
 * player can pick one of
 * the 4 `DslEventKind`
 * variants (or "全部" /
 * All) to narrow the
 * displayed history rows.
 * Useful when the
 * ring-buffer is full
 * and the player wants
 * to see "all recent
 * Collide rules" or
 * "all recent Timer
 * rules" without
 * scrolling through the
 * full list. Filter state
 * is local to the panel
 * (resets on panel close
 * + re-open).
 *
 * Auto-refreshes via a `refresh`
 * callback the host wires to the
 * App's `onHotEvent` listener
 * (so the panel updates
 * immediately after a successful
 * hot-reload).
 *
 * Round 133 is the 14th
 * panel-toggle (K key, "DSL
 * Codex"). Round 133 follows the
 * round-131 + round-132
 * data-driven `PANEL_TOGGLE_BINDINGS`
 * pattern exactly: 1 row in
 * `PANEL_TOGGLE_BINDINGS` + 1
 * `routeKey` switch case + 1
 * `KeyboardAction` union member
 * + 1 `BINDING_DESCRIPTIONS` row
 * + 1 wrapper method body +
 * everything else follows
 * automatically.
 *
 * Round 134 extends the panel
 * with a history list (no
 * additional panel-toggle
 * needed — the K key is still
 * the single entry point).
 *
 * Round 135 adds click-to-apply
 * via the optional 6th arg
 * `onApplyHistory`. No panel
 * toggle change.
 *
 * Round 136 adds the filter
 * dropdown. No panel toggle
 * change (the K key is still
 * the single entry point —
 * the filter lives inside).
 *
 * Round 138 — also adds a
 * "search by source DSL"
 * text input next to the
 * filter dropdown. The
 * player can type a
 * case-insensitive
 * substring and the
 * history list narrows to
 * rules whose source DSL
 * contains that substring.
 * Works in combination with
 * the filter dropdown
 * (both AND). Resets on
 * panel close + re-open
 * (local state). Useful
 * for quickly finding all
 * rules that reference a
 * specific event/action
 * keyword in long-running
 * sessions where the
 * history ring buffer is
 * saturated.
 *
 * Round 139 — also adds a
 * "sort by" dropdown so
 * the player can reorder
 * the history list. The
 * default is chronological
 * (oldest first, newest
 * last — matches the
 * ring-buffer insertion
 * order). Other options:
 * "newest first"
 * (reverse chronological),
 * "action count" asc / desc,
 * and "event kind"
 * (alphabetical). Sort +
 * filter + search all
 * combine (filter + search
 * AND the set, then sort
 * the result). Click-to-
 * apply (`data-rule-idx`)
 * uses the post-sort index
 * so the click target is
 * still correct.
 *
 * Round 140 — also adds a
 * "filter by action kind"
 * dropdown next to the
 * existing event-kind
 * filter. The player can
 * narrow the history list
 * to rules that contain a
 * specific action (Heal /
 * Damage / Spawn /
 * SpawnEntity). Complements
 * the event-kind filter:
 * the player can ask "all
 * recent Collide rules"
 * AND "all rules that
 * contain a Heal action".
 * Action filter + event
 * filter + search + sort
 * all combine (action +
 * event + search AND the
 * set, then sort). Click-
 * to-apply uses the post-
 * action-filter index so
 * the click target is
 * still correct.
 *
 * Round 141 — also adds a
 * count badge to the
 * "历史" section label.
 * The label becomes
 * "历史 (3/7)" — visible
 * /total — so the player
 * can see at-a-glance how
 * many rows survived the
 * filter / search / action
 * filter combination.
 * When the set is
 * unfiltered (visible ==
 * total), the badge is
 * hidden (the count is
 * implied by the full
 * list). When the count
 * drops to 0, the existing
 * "暂无匹配" empty state
 * still shows; the badge
 * reads "(0/N)" so the
 * player knows how many
 * are hidden.
 *
 * Round 143 — also adds
 * a "→" / "在代码中查看"
 * (view in codex)
 * button on each
 * history row that
 * fires an
 * `onPreviewHistory`
 * callback (8th arg,
 * optional). This is
 * the "jump-to-source"
 * gesture: clicking
 * the button swaps the
 * main codex to that
 * rule's source DSL
 * + event breakdown,
 * without re-applying
 * the rule to the
 * game (that's still
 * `onApplyHistory`).
 * Useful when the
 * player wants to
 * inspect a past rule
 * in detail without
 * disrupting the live
 * session. The button
 * is orthogonal to
 * `onApplyHistory`:
 * a row can be
 * preview-only (no
 * `onApplyHistory`
 * callback provided)
 * or both (the
 * `→` button doesn't
 * conflict with the
 * row's click-to-apply
 * handler — they're
 * separate elements).
 *
 * Round 142 — also adds
 * a "重置" / "Reset"
 * button next to the
 * filter controls. The
 * button clears the
 * event filter + action
 * filter + search
 * substring + sort mode
 * back to their defaults
 * in one click
 * (mirrors how a single
 * click can apply
 * multiple filters).
 * Useful when the player
 * has stacked several
 * filters and wants to
 * start over without
 * manually clearing each
 * one. The button is a
 * sibling of the filter
 * controls; the host's
 * delegated `click`
 * listener on `root`
 * catches it and routes
 * to `dispatchReset`.
 * No-op when every
 * control is already at
 * its default (so we
 * don't churn `doRender`
 * for no reason).
 */

import type { DslRule, DslEventKind, DslActionKind } from '../dsl/MemeCompiler';

export interface DslCodexPanelHandle {
    refresh(): void;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Round 139 —
 * the 5 sort
 * modes
 * supported by
 * the panel.
 *
 * `'chrono-oldest'`
 * (default)
 * matches the
 * ring-buffer
 * insertion
 * order
 * (oldest first,
 * newest last).
 * `'chrono-newest'`
 * is the reverse
 * (newest first).
 * `'actions-desc'`
 * / `'actions-asc'`
 * sort by the
 * number of
 * actions in the
 * rule (ties
 * broken by
 * chronological
 * index for
 * determinism).
 * `'kind-asc'`
 * sorts by the
 * event kind
 * string
 * (alphabetical).
 *
 * The string
 * literals are
 * also the
 * `<option value>`
 * values in the
 * dropdown.
 */
export type DslHistorySort =
    | 'chrono-oldest'
    | 'chrono-newest'
    | 'actions-desc'
    | 'actions-asc'
    | 'kind-asc';

/**
 * Round 144 —
 * column header
 * identifier.
 * Matches the
 * three columns
 * rendered in
 * the history
 * row template:
 * `idx` (#N),
 * `source` (rule
 * source DSL
 * preview), and
 * `actions` (the
 * `${rule.actions.length} 动作`
 * cell).
 */
export type DslHistoryColumn =
    | 'idx'
    | 'source'
    | 'actions';

/**
 * Round 144 —
 * active
 * column-level
 * sort. When
 * `null`, the
 * column header
 * has no sort
 * applied and
 * the dropdown
 * sort
 * (`DslHistorySort`)
 * drives row
 * order. When
 * set, the
 * column sort
 * takes
 * precedence
 * over the
 * dropdown sort
 * (a 3-state
 * click cycle:
 * null → asc →
 * desc → null).
 *
 * Indirection
 * (not just
 * `DslHistoryColumn | null`):
 * keeps the
 * direction +
 * column
 * coupling
 * explicit so a
 * future
 * "sort icon"
 * component
 * can read both
 * atomically.
 */
export type DslHistoryColumnSort = {
    column: DslHistoryColumn;
    direction: 'asc' | 'desc';
} | null;

/**
 * Render a `DslRule` back
 * to its source DSL form
 * (the inverse of
 * `parseDSL` — used to
 * show the player what
 * the AGI generated).
 * Shape:
 *   On(<Event>[, <arg>]) -> <Action>(<args>) [, <Action>(<args>)]*
 */
function ruleToSource(rule: DslRule): string {
    const eventPart = rule.event.arg !== undefined
        ? `On(${rule.event.kind}, ${JSON.stringify(rule.event.arg)})`
        : `On(${rule.event.kind})`;
    const actionParts = rule.actions.map((a) => {
        if (a.args.length === 0) {
            return `${a.kind}()`;
        }
        const argStrs = a.args.map((arg) => JSON.stringify(arg));
        return `${a.kind}(${argStrs.join(', ')})`;
    });
    return `${eventPart} -> ${actionParts.join(', ')}`;
}

function renderEventRow(rule: DslRule): string {
    const arg = rule.event.arg !== undefined
        ? `, ${escapeHtml(JSON.stringify(rule.event.arg))}`
        : '';
    return `
        <div class="dsl-codex-event">
            <span class="dsl-codex-label">事件</span>
            <span class="dsl-codex-value">${escapeHtml(rule.event.kind)}${arg}</span>
        </div>
    `;
}

function renderActionRows(rule: DslRule): string {
    if (rule.actions.length === 0) {
        return `<div class="dsl-codex-empty-actions">(无动作)</div>`;
    }
    return rule.actions.map((a, i) => {
        const argsStr = a.args.length === 0
            ? '()'
            : `(${a.args.map((arg) => escapeHtml(JSON.stringify(arg))).join(', ')})`;
        return `
            <div class="dsl-codex-action">
                <span class="dsl-codex-label">动作 ${i + 1}</span>
                <span class="dsl-codex-value">${escapeHtml(a.kind)}${argsStr}</span>
            </div>
        `;
    }).join('');
}

/**
 * Round 136 — render
 * the "filter by
 * event kind"
 * dropdown. The
 * dropdown has 5
 * options: "全部" (All)
 * + the 4 `DslEventKind`
 * variants. The
 * dropdown fires a
 * `change` event that
 * the host's delegated
 * `change` listener
 * (registered on the
 * stable `root`
 * element) catches
 * and dispatches to
 * the filter-state
 * updater.
 */
function renderHistoryFilter(currentFilter: DslEventKind | null): string {
    const kinds: DslEventKind[] = ['Collide', 'Timer', 'Spawn', 'PlayerHit'];
    const opts = [
        `<option value=""${currentFilter === null ? ' selected' : ''}>全部</option>`,
        ...kinds.map((k) =>
            `<option value="${k}"${currentFilter === k ? ' selected' : ''}>${k}</option>`
        ),
    ].join('');
    return `
        <div class="dsl-codex-history-filter">
            <label for="dsl-codex-history-filter-select">事件:</label>
            <select id="dsl-codex-history-filter-select" class="dsl-codex-history-filter-select">
                ${opts}
            </select>
        </div>
    `;
}

/**
 * Round 140 — render
 * the "filter by
 * action kind"
 * dropdown. Sits
 * next to the
 * event-kind filter
 * (round-136) so the
 * player can combine
 * event + action
 * filters. The
 * dropdown has 5
 * options: "全部"
 * (All) + the 4
 * `DslActionKind`
 * variants
 * (Damage / Heal /
 * Spawn /
 * SpawnEntity). The
 * dropdown fires a
 * `change` event
 * that the host's
 * delegated
 * `change` listener
 * catches and
 * dispatches to the
 * action-filter
 * state updater.
 */
function renderHistoryActionFilter(currentActionFilter: DslActionKind | null): string {
    const kinds: DslActionKind[] = ['Damage', 'Heal', 'Spawn', 'SpawnEntity'];
    const opts = [
        `<option value=""${currentActionFilter === null ? ' selected' : ''}>全部</option>`,
        ...kinds.map((k) =>
            `<option value="${k}"${currentActionFilter === k ? ' selected' : ''}>${k}</option>`
        ),
    ].join('');
    return `
        <div class="dsl-codex-history-action-filter">
            <label for="dsl-codex-history-action-filter-select">动作:</label>
            <select id="dsl-codex-history-action-filter-select" class="dsl-codex-history-action-filter-select">
                ${opts}
            </select>
        </div>
    `;
}

/**
 * Round 138 — render
 * the "search by
 * source DSL"
 * text input. Placed
 * next to the filter
 * dropdown so the
 * player can combine
 * event-kind filter
 * + free-text
 * substring search.
 * The input fires an
 * `input` event that
 * the host's
 * delegated `input`
 * listener catches
 * and dispatches to
 * the search-state
 * updater. The value
 * is preserved
 * across
 * `doRender()`
 * re-renders (so
 * the player's
 * typed text
 * survives
 * hot-reload
 * updates). When
 * empty, no search
 * filter is
 * applied.
 */
function renderHistorySearch(currentSearch: string): string {
    const safe = escapeHtml(currentSearch);
    return `
        <div class="dsl-codex-history-search">
            <label for="dsl-codex-history-search-input">搜索:</label>
            <input
                id="dsl-codex-history-search-input"
                class="dsl-codex-history-search-input"
                type="text"
                placeholder="按源 DSL 关键字..."
                value="${safe}"
            />
        </div>
    `;
}

/**
 * Round 139 — render
 * the "sort by"
 * dropdown. Placed
 * next to the
 * search input so
 * the player can
 * combine event-
 * kind filter +
 * free-text
 * substring search
 * + sort mode. The
 * dropdown fires a
 * `change` event
 * that the host's
 * delegated
 * `change` listener
 * catches and
 * dispatches to
 * the sort-state
 * updater. The
 * value is
 * preserved across
 * `doRender()`
 * re-renders.
 */
function renderHistorySort(currentSort: DslHistorySort): string {
    const options: Array<{ value: DslHistorySort; label: string }> = [
        { value: 'chrono-oldest', label: '时间最早' },
        { value: 'chrono-newest', label: '时间最近' },
        { value: 'actions-desc', label: '动作最多' },
        { value: 'actions-asc', label: '动作最少' },
        { value: 'kind-asc', label: '事件名 A→Z' },
    ];
    const opts = options.map((o) =>
        `<option value="${o.value}"${currentSort === o.value ? ' selected' : ''}>${o.label}</option>`
    ).join('');
    return `
        <div class="dsl-codex-history-sort">
            <label for="dsl-codex-history-sort-select">排序:</label>
            <select id="dsl-codex-history-sort-select" class="dsl-codex-history-sort-select">
                ${opts}
            </select>
        </div>
    `;
}

/**
 * Round 141 — render
 * the history count
 * badge. The badge is a
 * small "(visible/total)"
 * tag that sits inside
 * the "历史" section
 * label so the player can
 * see at-a-glance how
 * many rows survived the
 * current filter / search
 * / action-filter
 * combination.
 *
 *   - `visible == total`
 *     (no filter active,
 *     or filter matches
 *     everything): the
 *     badge hides itself
 *     (the count is
 *     implied by the
 *     full list — no
 *     visual noise).
 *   - `visible < total`:
 *     renders the badge
 *     so the player
 *     knows how many
 *     rows are hidden
 *     by the active
 *     filter / search /
 *     action filter.
 *   - `visible == 0`:
 *     still renders the
 *     "(0/N)" badge so
 *     the player knows
 *     how many are
 *     hidden behind the
 *     filter (the
 *     "暂无匹配" empty
 *     state appears
 *     below).
 *
 * Returns `''` when no
 * badge should render
 * (caller concatenates
 * directly into the
 * section label).
 */
function renderHistoryCountBadge(visible: number, total: number): string {
    if (visible === total) return '';
    return `<span class="dsl-codex-history-count">(${visible}/${total})</span>`;
}

/**
 * Round 142 — render
 * the "重置" / "Reset"
 * button. The button is
 * a sibling of the
 * filter / search / sort
 * controls. Clicking it
 * clears the event
 * filter + action filter
 * + search substring +
 * sort mode back to
 * their defaults. The
 * host's delegated
 * `click` listener on
 * `root` catches the
 * click and routes to
 * `dispatchReset`.
 *
 * The button is always
 * rendered (we don't
 * hide it when every
 * control is at default)
 * because the player
 * can still click it as
 * a confirmation that
 * the panel is in its
 * default state. The
 * `dispatchReset`
 * handler is the one
 * that decides whether
 * the click is a no-op
 * (when every state
 * field is already at
 * default) — see the
 * round-142 test
 * `reset_is_noop_when_everything_is_already_default`.
 */
function renderHistoryReset(): string {
    return `
        <button
            id="dsl-codex-history-reset-button"
            class="dsl-codex-history-reset-button"
            type="button"
            title="重置事件 / 动作 / 搜索 / 排序为默认"
        >重置</button>
    `;
}

/**
 * Round 143 — render
 * the "→" /
 * "在代码中查看"
 * (view in codex)
 * button. The button
 * is a small inline
 * action that appears
 * at the end of each
 * history row. Clicking
 * it fires
 * `onPreviewHistory(rule)`
 * — the host wires
 * this to swap the
 * main codex to that
 * rule's source DSL +
 * event breakdown.
 *
 * The button uses a
 * stable `id` per row
 * so the host's
 * delegated `click`
 * listener can find it
 * via `closest()` and
 * the post-sort index
 * in the `data-` attr.
 * The button is always
 * rendered (we don't
 * gate on
 * `onApplyHistory`) —
 * it's an independent
 * affordance.
 */
function renderHistoryPreviewButton(i: number): string {
    return `
        <button
            id="dsl-codex-history-preview-button-${i}"
            class="dsl-codex-history-preview-button"
            type="button"
            data-preview-idx="${i}"
            title="在主代码中查看此规则"
        >→</button>
    `;
}

/**
 * Round 142 — predicate
 * for whether the
 * history panel is in
 * its default state
 * (no event filter, no
 * action filter, no
 * search, default
 * sort). Used by the
 * "重置" button to skip
 * a `doRender()` call
 * when there's nothing
 * to reset. Mirrors the
 * initial state set in
 * the `renderDslCodexPanel`
 * closure.
 */
function isHistoryAtDefault(
    filter: DslEventKind | null,
    actionFilter: DslActionKind | null,
    search: string,
    sort: DslHistorySort,
    // Round 144 —
    // column sort
    // is part of
    // the
    // "default
    // state"
    // (no
    // column
    // sort
    // active
    // →
    // dropdown
    // sort
    // drives).
    columnSort: DslHistoryColumnSort,
): boolean {
    return (
        filter === null
        && actionFilter === null
        && search === ''
        && sort === 'chrono-oldest'
        && columnSort === null
    );
}

/**
 * Round 141 — compute
 * the number of history
 * rows that survive the
 * current filter +
 * search + action-filter
 * combination. Mirrors
 * the same predicates
 * used by
 * `renderHistoryList` so
 * the visible count in
 * the badge always agrees
 * with the number of
 * rows actually rendered.
 *
 * Lives outside
 * `renderHistoryList`
 * because the badge sits
 * in the section label,
 * which is rendered as a
 * sibling of the list —
 * we don't want to call
 * `renderHistoryList`
 * twice (once for the
 * count, once for the
 * actual HTML).
 */
function countHistoryVisible(
    history: ReadonlyArray<DslRule>,
    filter: DslEventKind | null,
    actionFilter: DslActionKind | null,
    search: string,
): number {
    const searchLower = search.toLowerCase();
    return history.filter((r) => {
        if (filter !== null && r.event.kind !== filter) return false;
        if (actionFilter !== null && !r.actions.some((a) => a.kind === actionFilter)) return false;
        if (searchLower !== '') {
            const source = ruleToSource(r).toLowerCase();
            if (!source.includes(searchLower)) return false;
        }
        return true;
    }).length;
}

/**
 * Round 134 — render
 * the rule history
 * list. The list is
 * the last N applied
 * rules in
 * chronological order
 * (oldest first, newest
 * last). Each row is
 * a small clickable
 * preview of the
 * source DSL + the
 * action count.
 *
 * The list is rendered
 * below the main
 * codex block as a
 * "历史" section. When
 * the history is empty
 * (no rule has been
 * applied yet), the
 * "暂无历史" empty
 * state is shown.
 *
 * Round 135 — when
 * the `onApplyHistory`
 * callback is
 * provided, each row
 * gets a
 * `dsl-codex-history-row-clickable`
 * class + a
 * `data-rule-idx`
 * attribute so the
 * host's click
 * handler can find
 * the right entry
 * (round-135 click-to-
 * apply UX). When
 * the callback is
 * omitted, rows are
 * plain divs (backward
 * compat).
 *
 * Round 136 — when
 * a filter is
 * supplied, the list
 * is filtered to only
 * rules whose event
 * kind matches. The
 * indices (`#N`) are
 * recomputed after
 * filtering so the
 * numbering is
 * continuous
 * (1-based, no gaps).
 * If the filter
 * matches 0 rules,
 * the
 * "暂无匹配" empty
 * state is shown.
 *
 * Round 138 — when
 * a non-empty search
 * substring is
 * supplied, the
 * list is further
 * filtered to only
 * rules whose
 * source DSL
 * contains the
 * substring
 * (case-insensitive).
 * Search + filter
 * are combined with
 * AND semantics.
 * The "暂无匹配"
 * empty state is
 * shared between
 * filter and search
 * misses.
 *
 * Round 139 — when
 * a sort mode is
 * supplied, the
 * filtered list is
 * sorted before
 * rendering. The
 * indices (`#N`)
 * reflect the
 * post-sort order
 * so the numbering
 * stays continuous
 * (1-based, no
 * gaps). Filter +
 * search are
 * applied first
 * (AND), then
 * sort. Ties in
 * `actions-desc` /
 * `actions-asc` are
 * broken by the
 * original chrono
 * index (stable
 * sort) so the
 * output is
 * deterministic
 * across
 * re-renders.
 *
 * Round 140 — when
 * a non-null action
 * filter is
 * supplied, the
 * list is further
 * filtered to only
 * rules whose
 * `actions` array
 * contains at least
 * one action of the
 * specified
 * `DslActionKind`.
 * Event filter +
 * action filter +
 * search are
 * combined with AND
 * semantics. The
 * "暂无匹配" empty
 * state is shared
 * between all three
 * filter misses.
 */
/**
 * Round 144 —
 * render the
 * clickable
 * column header
 * row above the
 * history list.
 * Three columns
 * (索引 / 源码 /
 * 动作), each a
 * `<th>`-style
 * clickable
 * button with
 * an
 * `id` +
 * `data-column`
 * so the host's
 * delegated
 * `click`
 * listener can
 * find it via
 * `closest()`.
 *
 * The active
 * column (per
 * `columnSort`)
 * shows a `↑` /
 * `↓` indicator
 * after the
 * label. Other
 * columns show
 * a faint `↕`
 * hint so the
 * player knows
 * the column is
 * clickable.
 *
 * When
 * `columnSort`
 * is `null`,
 * no column
 * shows a
 * direction
 * indicator
 * (all 3
 * columns
 * show the
 * neutral `↕`).
 *
 * Click
 * semantics
 * (handled in
 * `dispatchColumnSort`):
 *   - click
 *     inactive
 *     column →
 *     set as
 *     active
 *     with
 *     `asc`
 *   - click
 *     active
 *     column
 *     with
 *     `asc` →
 *     flip to
 *     `desc`
 *   - click
 *     active
 *     column
 *     with
 *     `desc` →
 *     clear
 *     (back to
 *     null,
 *     dropdown
 *     sort
 *     drives
 *     again)
 *
 * This 3-state
 * cycle is the
 * standard
 * table-sort
 * UX; matches
 * Finder /
 * Explorer /
 * most
 * spreadsheet
 * UIs.
 */

/**
 * Round 148 — render a
 * column-visibility
 * toggle row. Three
 * small `👁` /
 * `—` buttons, one per
 * data column (索引 /
 * 源码 / 动作). Clicking
 * a button toggles that
 * column's visibility
 * in the history list
 * (the column header
 * cell AND the
 * corresponding data
 * cell are both
 * omitted). Mirrors
 * Finder / Explorer's
 * right-click "show /
 * hide columns" pattern.
 *
 * The toggle row is
 * ALWAYS rendered when
 * the history is shown
 * — even when all
 * columns are visible
 * — so the player knows
 * the feature exists.
 *
 * Empty array: returns
 * '' (no-op).
 */
function renderColumnVisibilityToggle(
    hiddenColumns: Set<DslHistoryColumn>,
): string {
    if (hiddenColumns === null || hiddenColumns === undefined) return '';
    // Use stable
    // column order
    // matching the
    // header row: idx
    // / source /
    // actions.
    const columns: ReadonlyArray<{ key: DslHistoryColumn; label: string }> = [
        { key: 'idx',     label: '索引' },
        { key: 'source',  label: '源码' },
        { key: 'actions', label: '动作' },
    ];
    const cells = columns.map(({ key, label }) => {
        const isHidden = hiddenColumns.has(key);
        const cls = isHidden
            ? 'dsl-codex-col-toggle dsl-codex-col-toggle-hidden'
            : 'dsl-codex-col-toggle';
        const icon = isHidden ? '—' : '👁';
        const title = isHidden
            ? `显示 ${label} 列`
            : `隐藏 ${label} 列`;
        return `<button type="button" class="${cls}" data-toggle-column="${key}" title="${title}">${icon} ${label}</button>`;
    }).join('');
    return `<div class="dsl-codex-col-toggle-row">${cells}</div>`;
}

function renderHistoryColumnHeader(
    columnSort: DslHistoryColumnSort,
    hasPreview: boolean,
    hiddenColumns: Set<DslHistoryColumn>,
): string {
    // When rows have a
    // trailing "→"
    // preview button,
    // we add a 4th
    // empty cell so the
    // header row's
    // column count
    // matches the row
    // template's column
    // count. This keeps
    // the visual grid
    // aligned (the
    // preview buttons
    // sit in their own
    // column rather
    // than being
    // misaligned with
    // the last data
    // column).
    //
    // Round 148 — when a
    // column is in
    // `hiddenColumns`,
    // BOTH the header
    // cell AND the
    // corresponding
    // data cell are
    // omitted, so the
    // visual grid stays
    // aligned (mirrors
    // the row template's
    // column logic).
    const previewHeader = hasPreview
        ? '<span class="dsl-codex-history-col-preview" data-column="preview"></span>'
        : '';
    const renderHeader = (
        id: string,
        column: DslHistoryColumn,
        label: string,
    ): string | null => {
        if (hiddenColumns.has(column)) return null;
        const active = columnSort?.column === column;
        const indicator = active
            ? (columnSort?.direction === 'asc' ? ' ↑' : ' ↓')
            : ' <span class="dsl-codex-history-col-hint">↕</span>';
        const cls = active
            ? 'dsl-codex-history-col-header dsl-codex-history-col-header-active'
            : 'dsl-codex-history-col-header';
        const ariaSort = active
            ? (columnSort?.direction === 'asc' ? 'ascending' : 'descending')
            : 'none';
        return `<span class="${cls}" id="${id}" data-column="${column}" aria-sort="${ariaSort}" role="button" tabindex="0" title="按${label}排序">${label}${indicator}</span>`;
    };
    const idxHdr = renderHeader('dsl-codex-history-col-header-idx',     'idx',     '索引');
    const srcHdr = renderHeader('dsl-codex-history-col-header-source',  'source',  '源码');
    const actHdr = renderHeader('dsl-codex-history-col-header-actions', 'actions', '动作');
    return `
        <div class="dsl-codex-history-col-header-row">
            ${idxHdr ?? ''}
            ${srcHdr ?? ''}
            ${actHdr ?? ''}
            ${previewHeader}
        </div>
    `;
}

function renderHistoryList(
    history: ReadonlyArray<DslRule>,
    clickable: boolean,
    filter: DslEventKind | null,
    actionFilter: DslActionKind | null,
    search: string,
    sort: DslHistorySort,
    // Round 143 —
    // when true,
    // each row
    // gets a
    // trailing
    // "→"
    // preview
    // button that
    // fires
    // `onPreviewHistory(rule)`.
    // Independent
    // of
    // `clickable`
    // (a panel can
    // be preview-
    // only, or
    // both).
    previewable: boolean,
    // Round 144 —
    // active
    // column-
    // level sort.
    // When non-
    // null, this
    // takes
    // precedence
    // over the
    // `sort`
    // dropdown
    // (and a
    // column
    // header row
    // is rendered
    // above the
    // list). When
    // null, the
    // header row
    // is still
    // rendered
    // (so the
    // player can
    // click to
    // activate a
    // column
    // sort) but
    // the sort
    // comes from
    // the
    // dropdown.
    columnSort: DslHistoryColumnSort,
    // Round 148 —
    // Set of
    // columns the
    // player has
    // toggled off
    // via the
    // column-
    // visibility
    // toggle row.
    // Header cells
    // AND data
    // cells for
    // these columns
    // are omitted
    // from the
    // rendered list.
    // The preview
    // button cell
    // is unaffected
    // (it's a
    // separate
    // concern from
    // data columns).
    hiddenColumns: Set<DslHistoryColumn>,
): string {
    // Round 136 —
    // apply the
    // filter
    // before
    // rendering.
    // Round 138 —
    // also apply
    // the search
    // substring
    // (case-
    // insensitive
    // match on
    // the source
    // DSL form).
    // Round 140 —
    // also apply
    // the action-
    // kind filter
    // (rule must
    // contain at
    // least one
    // action of
    // the
    // specified
    // kind).
    const searchLower = search.toLowerCase();
    const filtered = history.filter((r) => {
        if (filter !== null && r.event.kind !== filter) return false;
        if (actionFilter !== null && !r.actions.some((a) => a.kind === actionFilter)) return false;
        if (searchLower !== '') {
            const source = ruleToSource(r).toLowerCase();
            if (!source.includes(searchLower)) return false;
        }
        return true;
    });
    if (filtered.length === 0) {
        if (history.length === 0) {
            return `<div class="dsl-codex-history-empty">暂无历史</div>`;
        }
        // History
        // exists
        // but
        // the
        // filter
        // / search
        // matches
        // 0
        // rows.
        return `<div class="dsl-codex-history-empty">暂无匹配</div>`;
    }
    // Round 139 —
    // apply the
    // sort after
    // filtering.
    // Build an
    // `indexed`
    // copy so
    // ties can be
    // broken by
    // the
    // original
    // chrono
    // index.
    //
    // Round 144 —
    // when
    // `columnSort`
    // is non-null,
    // it takes
    // precedence
    // over the
    // `sort`
    // dropdown.
    // The 3 column
    // comparators
    // (idx /
    // source /
    // actions) all
    // break ties
    // by the
    // original
    // chrono index
    // (stable
    // sort) so
    // output is
    // deterministic
    // across
    // re-renders,
    // mirroring
    // the round-
    // 139
    // dropdown
    // tie-break
    // pattern.
    const indexed = filtered.map((rule, i) => ({ rule, origIndex: i }));
    const compareByColumn = (
        a: { rule: DslRule; origIndex: number },
        b: { rule: DslRule; origIndex: number },
    ): number => {
        if (columnSort === null) return 0; // unreachable; caller checks
        const dir = columnSort.direction === 'asc' ? 1 : -1;
        switch (columnSort.column) {
            case 'idx':
                // Sort by the
                // original
                // chrono index
                // (= the
                // insertion
                // order in
                // `history`,
                // before
                // filter).
                return (a.origIndex - b.origIndex) * dir;
            case 'source': {
                const aSrc = ruleToSource(a.rule);
                const bSrc = ruleToSource(b.rule);
                const cmp = aSrc.localeCompare(bSrc);
                if (cmp !== 0) return cmp * dir;
                return a.origIndex - b.origIndex;
            }
            case 'actions': {
                const aLen = a.rule.actions.length;
                const bLen = b.rule.actions.length;
                if (aLen !== bLen) return (aLen - bLen) * dir;
                return a.origIndex - b.origIndex;
            }
        }
    };
    indexed.sort((a, b) => {
        // Column sort takes
        // precedence over
        // the dropdown
        // sort.
        if (columnSort !== null) {
            return compareByColumn(a, b);
        }
        switch (sort) {
            case 'chrono-oldest':
                return a.origIndex - b.origIndex;
            case 'chrono-newest':
                return b.origIndex - a.origIndex;
            case 'actions-desc':
                if (a.rule.actions.length !== b.rule.actions.length) {
                    return b.rule.actions.length - a.rule.actions.length;
                }
                return a.origIndex - b.origIndex;
            case 'actions-asc':
                if (a.rule.actions.length !== b.rule.actions.length) {
                    return a.rule.actions.length - b.rule.actions.length;
                }
                return a.origIndex - b.origIndex;
            case 'kind-asc':
                return a.rule.event.kind.localeCompare(b.rule.event.kind);
        }
    });
    const rows = indexed.map(({ rule }, i) => {
        const source = ruleToSource(rule);
        // Cap the row
        // preview at
        // 80 chars
        // (long rules
        // would
        // otherwise
        // stretch the
        // panel).
        const preview = source.length > 80 ? source.slice(0, 77) + '…' : source;
        const cls = clickable
            ? 'dsl-codex-history-row dsl-codex-history-row-clickable'
            : 'dsl-codex-history-row';
        const dataAttr = clickable
            ? ` data-rule-idx="${i}" role="button" tabindex="0"`
            : '';
        // Round 143 —
        // the preview
        // button is
        // always
        // rendered
        // when
        // `previewable`
        // is true,
        // regardless
        // of
        // `clickable`.
        // The host
        // decides
        // whether the
        // panel is
        // preview-only,
        // apply-only,
        // or both.
        const previewBtn = previewable ? renderHistoryPreviewButton(i) : '';
        // Round 148 —
        // hidden-column
        // cells are
        // omitted
        // (mirrors the
        // header-row
        // omission
        // logic). The
        // preview button
        // cell is always
        // shown (it's a
        // separate
        // concern from
        // data columns).
        const idxCell = hiddenColumns.has('idx')
            ? ''
            : `<span class="dsl-codex-history-idx">#${i + 1}</span>`;
        const srcCell = hiddenColumns.has('source')
            ? ''
            : `<span class="dsl-codex-history-source">${escapeHtml(preview)}</span>`;
        const actCell = hiddenColumns.has('actions')
            ? ''
            : `<span class="dsl-codex-history-actions">${rule.actions.length} 动作</span>`;
        return `
            <div class="${cls}"${dataAttr}>
                ${idxCell}
                ${srcCell}
                ${actCell}
                ${previewBtn}
            </div>
        `;
    }).join('');
    // Round 144 —
    // prepend the
    // column
    // header row
    // (rendered as
    // a `<div>`
    // grid so it
    // visually
    // aligns with
    // the
    // data-row
    // `<div>`s
    // below via
    // shared CSS
    // grid
    // columns).
    // The column
    // headers are
    // clickable
    // (handled
    // via
    // `dispatchColumnSort`).
    const headerRow = renderHistoryColumnHeader(columnSort, previewable, hiddenColumns);
    return `<div class="dsl-codex-history-list">${headerRow}${rows}</div>`;
}

export function renderDslCodexPanel(
    root: HTMLElement,
    getCurrentRule: () => DslRule | null,
    getLastOutcome: () => 'accepted' | 'rejected' | 'none',
    /**
     * Round 134 —
     * optional
     * callback for
     * the rule
     * history. If
     * omitted, the
     * history list
     * section is
     * hidden (so
     * pre-round-134
     * callers don't
     * need to pass
     * it).
     */
    getRuleHistory?: () => ReadonlyArray<DslRule>,
    i18n?: { t: (k: string, p?: any) => string },
    /**
     * Round 135 —
     * optional click-
     * to-apply
     * callback. When
     * provided, each
     * history row
     * becomes
     * clickable and
     * clicking (or
     * pressing Enter
     * on) it calls
     * this callback
     * with the rule
     * at that row's
     * index. When
     * omitted, the
     * history rows
     * are static
     * divs (backward
     * compat with
     * round-134).
     */
    onApplyHistory?: (rule: DslRule) => void,
    /**
     * Round 143 —
     * optional
     * "preview /
     * jump-to-
     * source"
     * callback. When
     * provided,
     * each history
     * row gets a
     * trailing "→"
     * button. Clicking
     * the button
     * fires this
     * callback with
     * the rule at
     * that row's
     * post-filter /
     * post-sort
     * index. The
     * host wires
     * this to swap
     * the main
     * codex to that
     * rule's source
     * DSL + event
     * breakdown
     * (without
     * re-applying
     * the rule to
     * the game —
     * that's still
     * `onApplyHistory`).
     * Independent
     * of `onApplyHistory`:
     * a panel can
     * be preview-
     * only (no
     * `onApplyHistory`),
     * apply-only,
     * or both. When
     * omitted, no
     * preview
     * buttons are
     * rendered.
     */
    onPreviewHistory?: (rule: DslRule) => void,
): DslCodexPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    /**
     * Round 136 —
     * local filter
     * state. Defaults
     * to `null` (All
     * — no filter
     * applied).
     * Persists across
     * `doRender()`
     * re-renders so
     * the player's
     * filter
     * selection
     * survives
     * hot-reload
     * updates. Resets
     * when the
     * panel is
     * closed and
     * re-opened (the
     * entire
     * `renderDslCodexPanel`
     * call returns a
     * fresh closure).
     */
    let currentFilter: DslEventKind | null = null;

    /**
     * Round 138 —
     * local search
     * substring
     * state. Defaults
     * to `''` (no
     * search). When
     * non-empty, the
     * history list is
     * further filtered
     * to rules whose
     * source DSL
     * contains this
     * substring
     * (case-
     * insensitive).
     * Persists across
     * `doRender()`
     * re-renders so
     * the player's
     * typed text
     * survives
     * hot-reload
     * updates. Resets
     * when the panel
     * is closed and
     * re-opened.
     */
    let currentSearch: string = '';

    /**
     * Round 139 —
     * local sort
     * mode. Defaults
     * to
     * `'chrono-oldest'`
     * (matches the
     * ring-buffer
     * insertion
     * order —
     * oldest first,
     * newest last).
     * Other options:
     * `'chrono-newest'`
     * (reverse),
     * `'actions-desc'`
     * /
     * `'actions-asc'`
     * (by action
     * count),
     * `'kind-asc'`
     * (alphabetical
     * by event kind).
     * Persists across
     * `doRender()`
     * re-renders so
     * the player's
     * sort selection
     * survives
     * hot-reload
     * updates. Resets
     * when the panel
     * is closed and
     * re-opened.
     */
    let currentSort: DslHistorySort = 'chrono-oldest';

    /**
     * Round 140 —
     * local action-
     * kind filter
     * state. Defaults
     * to `null`
     * ("All" — no
     * filter). When
     * set, the
     * history list is
     * further filtered
     * to only rules
     * whose `actions`
     * array contains
     * at least one
     * action of the
     * specified
     * `DslActionKind`.
     * Combines with
     * the event-kind
     * filter +
     * search (AND
     * semantics).
     * Persists across
     * `doRender()`
     * re-renders so
     * the player's
     * action filter
     * selection
     * survives
     * hot-reload
     * updates. Resets
     * when the panel
     * is closed and
     * re-opened.
     */
    let currentActionFilter: DslActionKind | null = null;

    /**
     * Round 144 —
     * local
     * column-
     * level
     * sort
     * state.
     * Defaults
     * to `null`
     * (no
     * column
     * sort
     * active —
     * the
     * dropdown
     * sort
     * drives
     * row
     * order).
     * When set,
     * the
     * column
     * sort
     * takes
     * precedence
     * over the
     * dropdown
     * sort. The
     * header
     * row is
     * always
     * rendered
     * (even when
     * `null`)
     * so the
     * player
     * can click
     * to
     * activate
     * a column
     * sort. The
     * 3-state
     * click
     * cycle:
     * null →
     * {col,
     * 'asc'} →
     * {col,
     * 'desc'} →
     * null. (See
     * `dispatchColumnSort`
     * for the
     * state
     * machine.)
     *
     * Persists
     * across
     * `doRender()`
     * re-renders
     * so the
     * player's
     * column
     * sort
     * selection
     * survives
     * hot-reload
     * updates.
     * Resets
     * when the
     * panel is
     * closed and
     * re-opened
     * (the
     * entire
     * `renderDslCodexPanel`
     * call
     * returns a
     * fresh
     * closure).
     */
    let currentColumnSort: DslHistoryColumnSort = null;

    /**
     * Round 148 — Set of
     * columns currently
     * hidden by the player
     * via the column-
     * visibility toggle row.
     * Starts empty (all
     * columns visible). A
     * column can be
     * hidden even when no
     * column sort is
     * active; the column
     * header and the data
     * cell are both
     * omitted from the
     * rendered list. Used
     * to declutter the
     * panel when the
     * player only cares
     * about, say, the
     * source column.
     */
    let currentHiddenColumns: Set<DslHistoryColumn> = new Set();

    /**
     * Round 135 —
     * delegate click
     * + keyboard
     * (Enter / Space)
     * events on
     * `.dsl-codex-history-row-clickable`
     * elements to the
     * `onApplyHistory`
     * callback. The
     * row's
     * `data-rule-idx`
     * attribute tells
     * us which entry
     * to pull from
     * the current
     * `getRuleHistory()`
     * snapshot.
     */
    const dispatchClick = (target: EventTarget | null) => {
        if (!onApplyHistory || !getRuleHistory) return;
        // Round 143 —
        // if the click
        // landed on the
        // row's
        // "→" preview
        // button (a
        // nested
        // interactive
        // element
        // inside the
        // clickable
        // row), skip
        // the apply
        // handler —
        // the preview
        // button has
        // its own
        // dedicated
        // handler
        // (`dispatchPreview`).
        // Without
        // this guard,
        // a click on
        // the "→"
        // would
        // BOTH preview
        // AND apply the
        // same rule
        // (both
        // handlers see
        // the event
        // because
        // they're all
        // on the same
        // `root`).
        const el0 = (target as HTMLElement | null)?.closest(
            '.dsl-codex-history-row-clickable'
        ) as HTMLElement | null;
        if (el0 && (target as HTMLElement | null)?.closest('.dsl-codex-history-preview-button')) {
            return;
        }
        const el = (target as HTMLElement | null)?.closest(
            '.dsl-codex-history-row-clickable'
        ) as HTMLElement | null;
        if (!el) return;
        const idxAttr = el.getAttribute('data-rule-idx');
        if (idxAttr === null) return;
        const idx = Number.parseInt(idxAttr, 10);
        if (!Number.isFinite(idx)) return;
        const history = getRuleHistory();
        // Round 136 —
        // the
        // `data-rule-idx`
        // is
        // the
        // post-filter
        // index,
        // so
        // we
        // need
        // to
        // re-apply
        // the
        // current
        // filter
        // before
        // looking
        // up
        // the
        // rule.
        // Round 138 —
        // also
        // re-apply
        // the
        // search
        // substring
        // (AND
        // semantics
        // with the
        // filter).
        // Round 139 —
        // also
        // re-apply
        // the
        // sort so
        // the
        // post-sort
        // index
        // maps to
        // the
        // correct
        // rule.
        // Round 140 —
        // also
        // re-apply
        // the
        // action
        // filter so
        // the
        // post-
        // action-
        // filter
        // index
        // maps to
        // the
        // correct
        // rule.
        const searchLower = currentSearch.toLowerCase();
        const filtered = history.filter((r) => {
            if (currentFilter !== null && r.event.kind !== currentFilter) return false;
            if (currentActionFilter !== null && !r.actions.some((a) => a.kind === currentActionFilter)) return false;
            if (searchLower !== '') {
                const source = ruleToSource(r).toLowerCase();
                if (!source.includes(searchLower)) return false;
            }
            return true;
        });
        const indexed = filtered.map((rule, i) => ({ rule, origIndex: i }));
        indexed.sort((a, b) => {
            switch (currentSort) {
                case 'chrono-oldest':
                    return a.origIndex - b.origIndex;
                case 'chrono-newest':
                    return b.origIndex - a.origIndex;
                case 'actions-desc':
                    if (a.rule.actions.length !== b.rule.actions.length) {
                        return b.rule.actions.length - a.rule.actions.length;
                    }
                    return a.origIndex - b.origIndex;
                case 'actions-asc':
                    if (a.rule.actions.length !== b.rule.actions.length) {
                        return a.rule.actions.length - b.rule.actions.length;
                    }
                    return a.origIndex - b.origIndex;
                case 'kind-asc':
                    return a.rule.event.kind.localeCompare(b.rule.event.kind);
            }
        });
        const rule = indexed[idx]?.rule;
        if (rule) onApplyHistory(rule);
    };

    /**
     * Round 136 —
     * dispatch the
     * `change` event
     * on the filter
     * dropdown to
     * update
     * `currentFilter`
     * and re-render
     * the history
     * list. We pull
     * the value from
     * the `<select>`
     * element (rather
     * than from a
     * closure) so the
     * delegation works
     * with the
     * standard DOM
     * `change` event.
     */
    const dispatchFilter = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const sel = (target as HTMLElement | null)?.closest(
            '#dsl-codex-history-filter-select'
        ) as HTMLSelectElement | null;
        if (!sel) return;
        const value = sel.value;
        if (value === '') {
            currentFilter = null;
        } else {
            currentFilter = value as DslEventKind;
        }
        doRender();
    };

    /**
     * Round 140 —
     * dispatch the
     * `change` event
     * on the action-
     * kind filter
     * dropdown to
     * update
     * `currentActionFilter`
     * and re-render
     * the history
     * list. Mirrors
     * the round-136
     * `dispatchFilter`
     * (event-kind
     * filter) pattern.
     */
    const dispatchActionFilter = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const sel = (target as HTMLElement | null)?.closest(
            '#dsl-codex-history-action-filter-select'
        ) as HTMLSelectElement | null;
        if (!sel) return;
        const value = sel.value;
        if (value === '') {
            currentActionFilter = null;
        } else {
            currentActionFilter = value as DslActionKind;
        }
        doRender();
    };

    /**
     * Round 138 —
     * dispatch the
     * `input` event
     * on the search
     * text field to
     * update
     * `currentSearch`
     * and re-render
     * the history
     * list. We pull
     * the value from
     * the `<input>`
     * element (rather
     * than from a
     * closure) so the
     * delegation works
     * with the
     * standard DOM
     * `input` event.
     * The value is
     * stored as-typed
     * (so the player's
     * original case is
     * preserved in the
     * input after
     * re-render); the
     * filter check
     * itself
     * lowercases both
     * sides for case-
     * insensitive
     * matching.
     */
    const dispatchSearch = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const input = (target as HTMLElement | null)?.closest(
            '#dsl-codex-history-search-input'
        ) as HTMLInputElement | null;
        if (!input) return;
        currentSearch = input.value;
        doRender();
    };

    /**
     * Round 139 —
     * dispatch the
     * `change` event
     * on the sort
     * dropdown to
     * update
     * `currentSort`
     * and re-render
     * the history
     * list. We pull
     * the value from
     * the `<select>`
     * element (rather
     * than from a
     * closure) so the
     * delegation works
     * with the
     * standard DOM
     * `change` event.
     */
    const dispatchSort = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const sel = (target as HTMLElement | null)?.closest(
            '#dsl-codex-history-sort-select'
        ) as HTMLSelectElement | null;
        if (!sel) return;
        const value = sel.value;
        if (value === 'chrono-oldest'
            || value === 'chrono-newest'
            || value === 'actions-desc'
            || value === 'actions-asc'
            || value === 'kind-asc') {
            currentSort = value;
        }
        doRender();
    };

    /**
     * Round 142 —
     * dispatch the
     * `click` event on
     * the "重置" /
     * "Reset" button to
     * clear the event
     * filter + action
     * filter + search
     * substring + sort
     * mode back to
     * their defaults
     * (null / null / '' /
     * 'chrono-oldest').
     *
     * The click is a
     * no-op when every
     * state field is
     * already at default
     * (so we don't churn
     * `doRender()` for
     * no reason). When
     * the click DOES
     * change state, we
     * re-render the
     * panel so the
     * visible controls
     * (dropdowns +
     * search input) snap
     * back to their
     * default values.
     */
    const dispatchReset = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const btn = (target as HTMLElement | null)?.closest(
            '#dsl-codex-history-reset-button'
        ) as HTMLButtonElement | null;
        if (!btn) return;
        if (isHistoryAtDefault(currentFilter, currentActionFilter, currentSearch, currentSort, currentColumnSort)) {
            return;
        }
        currentFilter = null;
        currentActionFilter = null;
        currentSearch = '';
        currentSort = 'chrono-oldest';
        currentColumnSort = null;
        doRender();
    };

    /**
     * Round 144 —
     * dispatch the
     * `click` event on
     * a column header
     * (索引 / 源码 /
     * 动作) to advance
     * the
     * 3-state column-
     * sort state
     * machine:
     *
     *   null
     *     ↓
     *   {col,
     *    'asc'}
     *     ↓
     *   {col,
     *    'desc'}
     *     ↓
     *   null
     *     ↓
     *   (back to
     *    column
     *    click;
     *    starts
     *    cycle
     *    over
     *    from
     *    null)
     *
     * The header's
     * `data-column`
     * attribute holds
     * the column id
     * (`'idx'` /
     * `'source'` /
     * `'actions'`).
     * The handler
     * uses
     * `closest('.dsl-codex-history-col-header')`
     * to find the
     * specific
     * header element
     * (so it
     * coexists
     * safely with
     * other
     * `click`
     * handlers on
     * `root`).
     *
     * 3-state click
     * semantics is
     * the standard
     * table-sort UX
     * (matches
     * Finder /
     * Explorer /
     * most
     * spreadsheet
     * UIs) and is
     * the only way
     * the player
     * can CLEAR
     * a column
     * sort (going
     * back to the
     * dropdown
     * sort).
     */
    const dispatchColumnSort = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const header = (target as HTMLElement | null)?.closest(
            '.dsl-codex-history-col-header'
        ) as HTMLElement | null;
        if (!header) return;
        const column = header.getAttribute('data-column');
        if (column !== 'idx' && column !== 'source' && column !== 'actions') return;
        // 3-state state
        // machine.
        if (currentColumnSort === null) {
            currentColumnSort = { column, direction: 'asc' };
        } else if (currentColumnSort.column === column) {
            if (currentColumnSort.direction === 'asc') {
                currentColumnSort = { column, direction: 'desc' };
            } else {
                // direction === 'desc' → clear (back to dropdown sort).
                currentColumnSort = null;
            }
        } else {
            // Different column → start that column at 'asc'.
            currentColumnSort = { column, direction: 'asc' };
        }
        doRender();
    };

    /**
     * Round 148 —
     * dispatch the
     * `click` event on
     * a column-
     * visibility toggle
     * button (the
     * `👁 X` / `— X`
     * row above the
     * history list).
     * Toggles that
     * column's
     * membership in
     * `currentHiddenColumns`
     * AND — defense in
     * depth — if the
     * player hides the
     * column they're
     * currently sorting
     * by, clear the
     * column sort
     * (otherwise the
     * hidden column
     * would still be
     * driving the row
     * order, which is
     * confusing UX).
     */
    const dispatchToggleColumn = (target: EventTarget | null) => {
        if (!getRuleHistory) return;
        const btn = (target as HTMLElement | null)?.closest(
            '.dsl-codex-col-toggle'
        ) as HTMLElement | null;
        if (!btn) return;
        const column = btn.getAttribute('data-toggle-column');
        if (column !== 'idx' && column !== 'source' && column !== 'actions') return;
        if (currentHiddenColumns.has(column)) {
            currentHiddenColumns.delete(column);
        } else {
            currentHiddenColumns.add(column);
            // If the column being
            // hidden is the one
            // currently driving
            // the sort, clear the
            // sort so the player
            // doesn't get
            // "sorting by a
            // column you can't
            // see" UX.
            if (currentColumnSort !== null && currentColumnSort.column === column) {
                currentColumnSort = null;
            }
        }
        doRender();
    };

    /**
     * Round 143 —
     * dispatch the
     * `click` event on
     * a row's "→"
     * preview button to
     * fire
     * `onPreviewHistory(rule)`.
     * The button's
     * `data-preview-idx`
     * attribute holds
     * the post-filter /
     * post-sort index,
     * so we re-apply
     * the current
     * filter + action-
     * filter + search +
     * sort pipeline
     * before looking up
     * the rule (same
     * pattern as
     * `dispatchClick`).
     *
     * Note: the row's
     * outer `<div>` is
     * also clickable
     * (when
     * `onApplyHistory`
     * is provided) and
     * keyboard-
     * activatable. The
     * `→` button is a
     * NESTED element
     * inside that row.
     * We use
     * `e.stopPropagation()`
     * when the click
     * hits the preview
     * button so the
     * outer row's click
     * handler doesn't
     * ALSO fire
     * `onApplyHistory`
     * (the host wired
     * both via the
     * same `root` click
     * listener, so they
     * both see the
     * event). This
     * mirrors how
     * nested
     * interactive
     * elements normally
     * work in HTML.
     */
    const dispatchPreview = (target: EventTarget | null) => {
        if (!onPreviewHistory || !getRuleHistory) return;
        const el = (target as HTMLElement | null)?.closest(
            '.dsl-codex-history-preview-button'
        ) as HTMLElement | null;
        if (!el) return;
        const idxAttr = el.getAttribute('data-preview-idx');
        if (idxAttr === null) return;
        const idx = Number.parseInt(idxAttr, 10);
        if (!Number.isFinite(idx)) return;
        const history = getRuleHistory();
        // Re-apply the
        // current
        // filter +
        // action-
        // filter +
        // search +
        // sort pipeline
        // so the
        // post-sort
        // index maps
        // to the
        // correct
        // rule.
        const searchLower = currentSearch.toLowerCase();
        const filtered = history.filter((r) => {
            if (currentFilter !== null && r.event.kind !== currentFilter) return false;
            if (currentActionFilter !== null && !r.actions.some((a) => a.kind === currentActionFilter)) return false;
            if (searchLower !== '') {
                const source = ruleToSource(r).toLowerCase();
                if (!source.includes(searchLower)) return false;
            }
            return true;
        });
        const indexed = filtered.map((rule, i) => ({ rule, origIndex: i }));
        indexed.sort((a, b) => {
            switch (currentSort) {
                case 'chrono-oldest':
                    return a.origIndex - b.origIndex;
                case 'chrono-newest':
                    return b.origIndex - a.origIndex;
                case 'actions-desc':
                    if (a.rule.actions.length !== b.rule.actions.length) {
                        return b.rule.actions.length - a.rule.actions.length;
                    }
                    return a.origIndex - b.origIndex;
                case 'actions-asc':
                    if (a.rule.actions.length !== b.rule.actions.length) {
                        return a.rule.actions.length - b.rule.actions.length;
                    }
                    return a.origIndex - b.origIndex;
                case 'kind-asc':
                    return a.rule.event.kind.localeCompare(b.rule.event.kind);
            }
        });
        const rule = indexed[idx]?.rule;
        if (rule) onPreviewHistory(rule);
    };

    const doRender = () => {
        const rule = getCurrentRule();
        const outcome = getLastOutcome();
        const hasHistory = !!getRuleHistory;
        const clickable = hasHistory && !!onApplyHistory;
        // Round 143 —
        // independent
        // of
        // `clickable`:
        // a panel can
        // be preview-
        // only (no
        // `onApplyHistory`),
        // apply-only,
        // or both. The
        // preview
        // button is
        // always
        // available
        // when this
        // callback is
        // provided.
        const previewable = hasHistory && !!onPreviewHistory;
        if (rule === null) {
            root.innerHTML = `
                <div class="dsl-codex-panel">
                    <div class="dsl-codex-title">${escapeHtml(t('dslCodex.title'))}</div>
                    <div class="dsl-codex-empty">暂无 DSL — 按 1-8 进入 atom 后由 AGI 自动生成</div>
                    ${hasHistory ? (() => {
                        const hist = getRuleHistory!();
                        const visible = countHistoryVisible(hist, currentFilter, currentActionFilter, currentSearch);
                        const badge = renderHistoryCountBadge(visible, hist.length);
                        return `
                            ${renderHistoryFilter(currentFilter)}
                            ${renderHistoryActionFilter(currentActionFilter)}
                            ${renderHistorySearch(currentSearch)}
                            ${renderHistorySort(currentSort)}
                            ${renderHistoryReset()}
                            ${renderColumnVisibilityToggle(currentHiddenColumns)}
                            <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.history'))} ${badge}</div>
                            ${renderHistoryList(hist, clickable, currentFilter, currentActionFilter, currentSearch, currentSort, previewable, currentColumnSort, currentHiddenColumns)}
                        `;
                    })() : ''}
                </div>
            `;
            return;
        }
        const source = ruleToSource(rule);
        // The status badge depends on the last hot-reload outcome.
        // (The round-48 `HotReload` accepts / rejects based on
        // frequency-limit + format error; the panel surfaces
        // this so the player can see whether the most recent
        // generation actually took effect.)
        let statusBadge = '';
        if (outcome === 'rejected') {
            statusBadge = `<span class="dsl-codex-status dsl-codex-status-rejected">被拒绝</span>`;
        } else if (outcome === 'accepted') {
            statusBadge = `<span class="dsl-codex-status dsl-codex-status-accepted">已接受</span>`;
        }
        root.innerHTML = `
            <div class="dsl-codex-panel">
                <div class="dsl-codex-title">${escapeHtml(t('dslCodex.title'))} ${statusBadge}</div>
                <div class="dsl-codex-source">${escapeHtml(source)}</div>
                <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.breakdown'))}</div>
                ${renderEventRow(rule)}
                ${renderActionRows(rule)}
                ${hasHistory ? `
                    ${(() => {
                        const hist = getRuleHistory!();
                        const visible = countHistoryVisible(hist, currentFilter, currentActionFilter, currentSearch);
                        const badge = renderHistoryCountBadge(visible, hist.length);
                        return `
                            ${renderHistoryFilter(currentFilter)}
                            ${renderHistoryActionFilter(currentActionFilter)}
                            ${renderHistorySearch(currentSearch)}
                            ${renderHistorySort(currentSort)}
                            ${renderHistoryReset()}
                            ${renderColumnVisibilityToggle(currentHiddenColumns)}
                            <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.history'))} ${badge}</div>
                            ${renderHistoryList(hist, clickable, currentFilter, currentActionFilter, currentSearch, currentSort, previewable, currentColumnSort, currentHiddenColumns)}
                        `;
                    })()}
                ` : ''}
            </div>
        `;
    };

    // Round 135 —
    // wire click +
    // keyboard
    // activation on
    // the panel root
    // (event delegation
    // — survives
    // `doRender()`
    // re-renders
    // because the
    // listener is
    // attached to the
    // stable `root`
    // element, not to
    // the per-render
    // children).
    if (onApplyHistory) {
        root.addEventListener('click', (e) => dispatchClick(e.target));
        root.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dispatchClick(e.target);
            }
        });
    }

    // Round 144 —
    // wire the
    // `keydown`
    // event on the
    // column header
    // (Enter /
    // Space
    // activate the
    // 3-state sort
    // cycle, same
    // as the click
    // handler). The
    // header is
    // rendered
    // with
    // `role="button"
    // tabindex="0"`
    // (see
    // `renderHistoryColumnHeader`)
    // so it can
    // receive
    // keyboard
    // focus and
    // respond to
    // Enter / Space
    // like a
    // standard
    // clickable
    // button.
    // The keyboard
    // handler is
    // wired
    // REGARDLESS of
    // `onApplyHistory`
    // (sorting is
    // a separate
    // concern from
    // click-to-apply).
    if (getRuleHistory) {
        root.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const target = e.target as HTMLElement | null;
            if (!target?.closest('.dsl-codex-history-col-header')) return;
            e.preventDefault();
            dispatchColumnSort(target);
        });
    }

    // Round 142 —
    // wire the
    // `click` event
    // on the "重置" /
    // "Reset" button
    // (event-delegated
    // on the stable
    // `root` element so
    // it survives
    // `doRender()`
    // re-renders).
    // The reset button
    // is wired
    // REGARDLESS of
    // `onApplyHistory`
    // — it's a separate
    // concern from
    // click-to-apply
    // (a panel without
    // the click-to-apply
    // feature still
    // needs a way to
    // clear filters).
    if (getRuleHistory) {
        root.addEventListener('click', (e) => dispatchReset(e.target));
    }

    // Round 144 —
    // wire the
    // `click` event
    // on the column
    // header (索引 /
    // 源码 / 动作)
    // (event-
    // delegated on
    // the stable
    // `root` element
    // so it survives
    // `doRender()`
    // re-renders).
    //
    // The column
    // headers are
    // siblings of
    // (NOT inside)
    // the data
    // rows, so no
    // `stopPropagation`
    // is needed
    // (a column-
    // header click
    // never reaches
    // a row click
    // handler). The
    // column header
    // is wired
    // REGARDLESS of
    // `onApplyHistory`
    // — sorting is
    // a separate
    // concern from
    // click-to-apply
    // (a panel
    // without the
    // click-to-apply
    // feature still
    // needs
    // sorting).
    if (getRuleHistory) {
        root.addEventListener('click', (e) => dispatchColumnSort(e.target));
    }

    // Round 143 —
    // wire the
    // `click` event
    // on the "→"
    // preview
    // button
    // (event-
    // delegated on
    // the stable
    // `root` element
    // so it survives
    // `doRender()`
    // re-renders).
    //
    // The preview
    // button is
    // INSIDE the
    // row's outer
    // `<div>`, and
    // the outer div
    // is itself
    // clickable
    // (when
    // `onApplyHistory`
    // is provided).
    // Both handlers
    // are attached
    // to the same
    // `root`, so a
    // click on the
    // button
    // bubbles to the
    // row's outer
    // handler too.
    // We
    // `stopPropagation`
    // when the click
    // lands on the
    // preview button
    // so the outer
    // row's click
    // handler does
    // NOT also fire
    // `onApplyHistory`
    // (the player
    // should be able
    // to preview a
    // rule without
    // also applying
    // it to the live
    // game).
    if (onPreviewHistory) {
        root.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('.dsl-codex-history-preview-button')) {
                e.stopPropagation();
                dispatchPreview(target);
            }
        });
    }

    // Round 148 — wire
    // the `click` event
    // on the column-
    // visibility toggle
    // row. The toggle
    // row is always
    // rendered (when
    // history is
    // present) regardless
    // of `onApplyHistory`
    // or `onPreviewHistory`
    // — column visibility
    // is a separate
    // concern from
    // click-to-apply or
    // preview. The
    // toggle buttons are
    // siblings of (NOT
    // inside) the data
    // rows, so no
    // `stopPropagation`
    // is needed (a
    // toggle click never
    // reaches a row
    // click handler).
    if (getRuleHistory) {
        root.addEventListener('click', (e) => dispatchToggleColumn(e.target));
    }

    // Round 136 —
    // wire the
    // `change` event
    // on the filter
    // dropdown (also
    // event-delegated
    // on the
    // stable `root`
    // element).
    // Round 139 —
    // also route
    // the `change`
    // event on
    // the sort
    // dropdown to
    // `dispatchSort`.
    // Both handlers
    // use `closest`
    // to find the
    // specific
    // element they
    // own, so it's
    // safe to call
    // both for
    // every `change`
    // event.
    if (getRuleHistory) {
        root.addEventListener('change', (e) => {
            dispatchFilter(e.target);
            dispatchActionFilter(e.target);
            dispatchSort(e.target);
        });
    }

    // Round 138 —
    // wire the
    // `input` event
    // on the search
    // text field
    // (event-delegated
    // on the
    // stable `root`
    // element so it
    // survives
    // `doRender()`
    // re-renders).
    // We re-query
    // the input
    // element each
    // time inside
    // the handler
    // (rather than
    // capturing a
    // ref at wire
    // time) because
    // `doRender()`
    // detaches the
    // old element.
    if (getRuleHistory) {
        root.addEventListener('input', (e) => dispatchSearch(e.target));
    }

    doRender();
    return { refresh: doRender };
}
