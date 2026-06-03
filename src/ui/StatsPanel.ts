/**
 * StatsPanel — renders the Analytics snapshot as a small overlay.
 *
 * Shows:
 *   - session uptime
 *   - top counters (DSL applied, dimension visited, epoch collapsed, ...)
 *   - last 5 events with timestamp + payload
 *
 * Auto-refreshes via an `onRefresh` callback the host wires to a
 * setInterval or an onEvent subscription.
 */

import type { Analytics, AnalyticsSnapshot, AnalyticsEvent } from '../analytics/Analytics';

export interface StatsPanelHandle {
    refresh(): void;
}

const TOP_N = 8;
const RECENT_N = 5;

export function renderStatsPanel(root: HTMLElement, analytics: Analytics, i18n?: { t: (k: string, p?: any) => string }): StatsPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    const doRender = () => {
        const snap: AnalyticsSnapshot = analytics.snapshot();
        const uptime = Math.floor(snap.uptimeSecs);
        const mm = Math.floor(uptime / 60).toString().padStart(2, '0');
        const ss = (uptime % 60).toString().padStart(2, '0');

        // Sort counters desc and take TOP_N
        const entries = Object.entries(snap.counters).sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
        const counterRows = entries.length === 0
            ? `<div class="stats-empty">${escapeHtml(t('stats.empty'))}</div>`
            : entries.map(([k, v]) => `
                <div class="stats-row">
                    <span class="stats-key">${escapeHtml(k)}</span>
                    <b class="stats-val">${v}</b>
                </div>
            `).join('');

        const recent = snap.recent.slice(-RECENT_N).reverse();
        const recentRows = recent.length === 0
            ? `<div class="stats-empty">${escapeHtml(t('stats.empty'))}</div>`
            : recent.map(e => {
                const ts = new Date(e.ts).toISOString().slice(11, 19);
                const data = e.data ? ' ' + JSON.stringify(e.data) : '';
                return `<div class="stats-event"><span class="stats-ts">${ts}</span> ${escapeHtml(e.kind)}${escapeHtml(data)}</div>`;
            }).join('');

        root.innerHTML = `
            <div class="stats-panel">
                <div class="stats-title">${escapeHtml(t('stats.title'))}</div>
                <div class="stats-uptime">uptime ${mm}:${ss}</div>
                <div class="stats-section-label">${escapeHtml(t('stats.counters'))}</div>
                <div class="stats-counters">${counterRows}</div>
                <div class="stats-section-label">${escapeHtml(t('stats.recent'))}</div>
                <div class="stats-recent">${recentRows}</div>
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
