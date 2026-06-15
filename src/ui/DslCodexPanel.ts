/**
 * DslCodexPanel — round-133 + round-134.
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
 */

import type { DslRule } from '../dsl/MemeCompiler';

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
 */
function renderHistoryList(history: ReadonlyArray<DslRule>): string {
    if (history.length === 0) {
        return `<div class="dsl-codex-history-empty">暂无历史</div>`;
    }
    const rows = history.map((rule, i) => {
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
        return `
            <div class="dsl-codex-history-row">
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
): DslCodexPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    const doRender = () => {
        const rule = getCurrentRule();
        const outcome = getLastOutcome();
        if (rule === null) {
            root.innerHTML = `
                <div class="dsl-codex-panel">
                    <div class="dsl-codex-title">${escapeHtml(t('dslCodex.title'))}</div>
                    <div class="dsl-codex-empty">暂无 DSL — 按 1-8 进入 atom 后由 AGI 自动生成</div>
                    ${getRuleHistory ? renderHistoryList(getRuleHistory()) : ''}
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
                ${getRuleHistory ? `
                    <div class="dsl-codex-section-label">${escapeHtml(t('dslCodex.history'))}</div>
                    ${renderHistoryList(getRuleHistory())}
                ` : ''}
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}
