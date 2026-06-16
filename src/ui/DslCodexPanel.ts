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
): boolean {
    return (
        filter === null
        && actionFilter === null
        && search === ''
        && sort === 'chrono-oldest'
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
function renderHistoryList(
    history: ReadonlyArray<DslRule>,
    clickable: boolean,
    filter: DslEventKind | null,
    actionFilter: DslActionKind | null,
    search: string,
    sort: DslHistorySort,
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
    const indexed = filtered.map((rule, i) => ({ rule, origIndex: i }));
    indexed.sort((a, b) => {
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
        return `
            <div class="${cls}"${dataAttr}>
                <span class="dsl-codex-history-idx">#${i + 1}</span>
                <span class="dsl-codex-history-source">${escapeHtml(preview)}</span>
                <span class="dsl-codex-history-actions">${rule.actions.length} 动作</span>
            </div>
        `;
    }).join('');
    return `<div class="dsl-codex-history-list">${rows}</div>`;
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
        if (isHistoryAtDefault(currentFilter, currentActionFilter, currentSearch, currentSort)) {
            return;
        }
        currentFilter = null;
        currentActionFilter = null;
        currentSearch = '';
        currentSort = 'chrono-oldest';
        doRender();
    };

    const doRender = () => {
        const rule = getCurrentRule();
        const outcome = getLastOutcome();
        const hasHistory = !!getRuleHistory;
        const clickable = hasHistory && !!onApplyHistory;
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
                            <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.history'))} ${badge}</div>
                            ${renderHistoryList(hist, clickable, currentFilter, currentActionFilter, currentSearch, currentSort)}
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
                            <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.history'))} ${badge}</div>
                            ${renderHistoryList(hist, clickable, currentFilter, currentActionFilter, currentSearch, currentSort)}
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
