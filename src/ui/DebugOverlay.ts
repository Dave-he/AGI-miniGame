/**
 * DebugOverlay — round 128 (操控性好 UX).
 *
 * Renders the 4 `ActionDebouncer` instances'
 * runtime state as a small developer overlay
 * inside `<div id="debug-overlay-root">`. The
 * panel shows each debouncer's:
 *   - action label (loadGame / saveGame /
 *     rollWorldEvent / enterAtom)
 *   - introducing round tag (round 104 /
 *     round 106 / round 107 / round 109)
 *   - current window size in ms
 *   - ms since last stamp (∞ when never
 *     stamped)
 *   - debouncing now? (ms since stamp <
 *     window size)
 *
 * The panel is meant for QA + dev debugging
 * ("why didn't my save fire?") — the 4
 * debouncer contracts (round 104/106/107/109)
 * are otherwise invisible to the player.
 *
 * Refresh model: the host wires
 * `setInterval(handle.refresh, 200)` so the
 * `ms since stamp` counts tick in real time.
 *
 * Round 128 wires this module into the App
 * constructor alongside `renderVaultPanel`
 * / `renderBiomeLibraryPanel` etc.
 *
 * Round 130 — adds an optional `extras`
 * session-stats section above the debouncer
 * rows: player level + current biome +
 * session duration + last action. The
 * extras are a thin data interface so the
 * test can pass a stub without depending
 * on the App's private fields.
 */

import type { ActionDebouncer } from '../utils/ActionDebouncer';

export interface DebugOverlayHandle {
    refresh(): void;
}

export interface DebugOverlayDebouncerInfo {
    /** The debouncer instance (typed as a minimal interface so
     *  the test can pass a stub without depending on
     *  ActionDebouncer's internals). */
    debouncer: ActionDebouncer;
    /** A short Chinese label for the panel row. */
    chineseLabel: string;
}

/**
 * Round 130 — optional session-stats section.
 *
 * Surfaced above the debouncer rows so the
 * QA panel answers "what's the player
 * doing right now?" in addition to "when
 * did the debouncer last fire?". The
 * `lastAction` label + ago are derived
 * from the debouncers themselves (the
 * one with the smallest `msSinceLastFire`
 * is the most recent action), so the host
 * doesn't need to track them separately.
 */
export interface DebugOverlayExtraStats {
    /** Player progression level (e.g. `progression.level`). */
    playerLevel: number;
    /** Current biome id (e.g. 'cyberpunk'); null = no biome visited yet. */
    currentBiome: string | null;
    /** `Date.now()` snapshot taken at App construction time. */
    sessionStartedAt: number;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMsSinceStamp(ms: number): string {
    if (!Number.isFinite(ms)) return '∞ (尚未触发)';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Round 130 — format a duration (ms) as
 * "Xm Ys" for ≥60s or "Ys" for <60s.
 * Used by the session-duration + last-action-ago
 * cells. Always uses non-negative values.
 */
function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '0s';
    const totalSecs = Math.floor(ms / 1000);
    if (totalSecs < 60) return `${totalSecs}s`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs - mins * 60;
    return `${mins}m ${secs}s`;
}

function formatCurrentBiome(id: string | null): string {
    if (id == null || id === '') return '—';
    return id;
}

/**
 * Round 130 — find the most-recently-fired
 * debouncer (smallest `msSinceLastFire`).
 * Returns `{ label, sinceMs }` or `null`
 * when every debouncer is at Infinity
 * (none has ever fired).
 */
function pickLastAction(debouncers: readonly DebugOverlayDebouncerInfo[]): { label: string; sinceMs: number } | null {
    let best: { label: string; sinceMs: number } | null = null;
    for (const info of debouncers) {
        const since = info.debouncer.msSinceLastFire;
        if (!Number.isFinite(since)) continue;
        if (best == null || since < best.sinceMs) {
            best = { label: info.debouncer.actionLabel, sinceMs: since };
        }
    }
    return best;
}

export function renderDebugOverlay(
    root: HTMLElement,
    debouncers: readonly DebugOverlayDebouncerInfo[],
    extras?: DebugOverlayExtraStats,
): DebugOverlayHandle {
    function render(): void {
        const rows = debouncers.map((info) => {
            const d = info.debouncer;
            const sinceMs = d.msSinceLastFire;
            const window = d.windowSizeMs;
            // "Debouncing now?" = has been stamped AND the elapsed
            // time is still under the window. A debouncer that has
            // never stamped is NOT debouncing (it'll allow the
            // first call).
            const isDebouncing = Number.isFinite(sinceMs) && sinceMs < window;
            const statusClass = isDebouncing ? 'is-debouncing' : 'is-open';
            const statusLabel = isDebouncing ? '屏蔽中' : '可触发';
            return `
                <div class="debug-overlay-row">
                    <span class="debug-overlay-action">${escapeHtml(info.chineseLabel)}</span>
                    <span class="debug-overlay-name">${escapeHtml(d.actionLabel)}</span>
                    <span class="debug-overlay-round">${escapeHtml(d.debounceRound)}</span>
                    <span class="debug-overlay-window">${window}ms</span>
                    <span class="debug-overlay-since">${escapeHtml(formatMsSinceStamp(sinceMs))}</span>
                    <span class="debug-overlay-status ${statusClass}">${statusLabel}</span>
                </div>
            `;
        }).join('');

        // Round 130 — optional session-stats section.
        // When `extras` is undefined, the section is
        // omitted entirely (preserving the round-128
        // minimal layout for callers that don't care
        // about player state). The "last action" /
        // "last action ago" cells are derived from
        // the debouncers themselves so the host
        // doesn't need to track them separately.
        const lastAction = pickLastAction(debouncers);
        const lastActionLabel = lastAction ? lastAction.label : '—';
        const lastActionAgo = lastAction ? formatDuration(lastAction.sinceMs) + ' 前' : '—';

        const extrasSection = extras
            ? `
                <div class="debug-overlay-extras">
                    <div class="debug-overlay-extras-row">
                        <span class="debug-overlay-extras-label">等级</span>
                        <span class="debug-overlay-extras-value">Lv ${extras.playerLevel}</span>
                    </div>
                    <div class="debug-overlay-extras-row">
                        <span class="debug-overlay-extras-label">当前生物群系</span>
                        <span class="debug-overlay-extras-value">${escapeHtml(formatCurrentBiome(extras.currentBiome))}</span>
                    </div>
                    <div class="debug-overlay-extras-row">
                        <span class="debug-overlay-extras-label">会话时长</span>
                        <span class="debug-overlay-extras-value">${escapeHtml(formatDuration(Date.now() - extras.sessionStartedAt))}</span>
                    </div>
                    <div class="debug-overlay-extras-row">
                        <span class="debug-overlay-extras-label">最后动作</span>
                        <span class="debug-overlay-extras-value">${escapeHtml(lastActionLabel)}</span>
                    </div>
                    <div class="debug-overlay-extras-row">
                        <span class="debug-overlay-extras-label">最后动作距今</span>
                        <span class="debug-overlay-extras-value">${escapeHtml(lastActionAgo)}</span>
                    </div>
                </div>
            `
            : '';

        const titleSuffix = extras ? ' (+ 会话状态)' : '';
        root.innerHTML = `
            <div class="debug-overlay-panel">
                <div class="debug-overlay-title">🔧 调试信息 (4 个防抖器)${titleSuffix}</div>
                ${extrasSection}
                <div class="debug-overlay-header">
                    <span>中文</span>
                    <span>动作名</span>
                    <span>引入轮次</span>
                    <span>窗口</span>
                    <span>距上次</span>
                    <span>状态</span>
                </div>
                ${rows}
            </div>
        `;
    }
    render();
    return { refresh: render };
}
