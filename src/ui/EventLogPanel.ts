/**
 * EventLogPanel — round-132.
 *
 * Renders the `Analytics.recent` ring
 * buffer (the last 50 events
 * captured by the round-44
 * Analytics tracker) as a small
 * overlay inside
 * `<div id="event-log-root">`.
 *
 * Shows:
 *   - total uptime
 *   - the recent events list
 *     (most recent first), each
 *     row tagged with
 *     kind / ago-time (e.g.
 *     "3s ago") / a brief
 *     data preview when the
 *     event has a payload
 *   - "no events yet" empty
 *     state when the ring is
 *     empty
 *
 * Auto-refreshes via a `refresh`
 * callback the host wires to a
 * setInterval (the panel shows
 * live state — "what just
 * happened?" — and timestamps
 * tick every refresh).
 *
 * Round 132 closes the panel-toggle
 * data-driven follow-up gap from
 * round 131. With 12 toggles the
 * round-131 surface was fully
 * covered; round 132 adds the 13th
 * toggle (Z key, "event log") and
 * renders this panel so the Z key
 * is wired end-to-end (mount point
 * + button + toggle method +
 * routeKey case + KeyboardAction
 * kind + BINDING_DESCRIPTIONS row
 * + the round-131 PANEL_TOGGLE_BINDINGS
 * table row).
 */

import type { Analytics, AnalyticsEvent } from '../analytics/Analytics';

export interface EventLogPanelHandle {
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
 * Format the "ago" label
 * for an event timestamp
 * (round 132 — pin the
 * bucketing contract:
 *   < 60s  → "Ns ago"
 *   < 60m  → "Nm ago"
 *   < 24h  → "Nh ago"
 *   else   → "Nd ago"
 * + a single "just now"
 *   bucket for the first 2
 *   seconds so freshly-fired
 *   events don't read as
 *   "0s ago").
 */
function formatAgoLabel(ts: number, nowMs: number): string {
    const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (diffSec < 2) return '刚刚';
    if (diffSec < 60) return `${diffSec}s 前`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m 前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h 前`;
    return `${Math.floor(diffSec / 86400)}d 前`;
}

/**
 * Short preview of an
 * event's `data` payload
 * (the Analytics tracker
 * already truncates to
 * ~256 bytes, so this is
 * safe to render). The
 * preview is the JSON-
 * stringified payload,
 * clipped to 60 chars +
 * an ellipsis.
 */
function dataPreview(data?: Record<string, any>): string {
    if (!data || Object.keys(data).length === 0) return '';
    try {
        const json = JSON.stringify(data);
        return json.length > 60 ? json.slice(0, 60) + '…' : json;
    } catch {
        return '';
    }
}

function renderRows(events: readonly AnalyticsEvent[]): string {
    if (events.length === 0) {
        return `<div class="event-log-empty">暂无事件</div>`;
    }
    // Show most recent first.
    const now = Date.now();
    return events.slice().reverse().map((ev) => `
        <div class="event-log-row" title="${escapeHtml(ev.kind)}">
            <span class="event-log-kind">${escapeHtml(ev.kind)}</span>
            <span class="event-log-ago">${escapeHtml(formatAgoLabel(ev.ts, now))}</span>
            <span class="event-log-data">${escapeHtml(dataPreview(ev.data))}</span>
        </div>
    `).join('');
}

export function renderEventLogPanel(
    root: HTMLElement,
    analytics: Analytics,
    i18n?: { t: (k: string, p?: any) => string },
): EventLogPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    const doRender = () => {
        const snap = analytics.snapshot();
        // uptimeSecs may be a
        // fractional (Date.now() -
        // sessionStartedAt) / 1000;
        // round to 1 decimal for
        // the header.
        const uptimeLabel = `${(snap.uptimeSecs as number).toFixed(1)}s`;
        root.innerHTML = `
            <div class="event-log-panel">
                <div class="event-log-title">${escapeHtml(t('eventLog.title'))}</div>
                <div class="event-log-stats">
                    <span class="event-log-stat">运行 <b>${uptimeLabel}</b></span>
                    <span class="event-log-stat">事件 <b>${snap.recent.length}</b></span>
                </div>
                <div class="event-log-section-label">${escapeHtml(t('eventLog.list'))}</div>
                <div class="event-log-entries">${renderRows(snap.recent)}</div>
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}
