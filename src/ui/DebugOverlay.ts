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

export function renderDebugOverlay(
    root: HTMLElement,
    debouncers: readonly DebugOverlayDebouncerInfo[],
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
        root.innerHTML = `
            <div class="debug-overlay-panel">
                <div class="debug-overlay-title">🔧 调试信息 (4 个防抖器)</div>
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
