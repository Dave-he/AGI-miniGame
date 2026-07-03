/**
 * VaultPanel — renders the DimensionVault as a small overlay.
 *
 * Shows:
 *   - vault length / capacity
 *   - aggregate stats (distinct themes, completion rate, ...)
 *   - the last N entries (most recent first) with their outcome pill
 *
 * The host wires a `refresh` callback to either a setInterval or
 * the App's render loop.
 */

import type { DimensionVault, VaultEntry, DimensionOutcome } from '../world/DimensionVault';

const RECENT_N = 8;

export interface VaultPanelHandle {
    refresh(): void;
}

function outcomeLabel(o: DimensionOutcome): string {
    switch (o) {
        case 'completed': return '✓';
        case 'failed': return '✗';
        case 'abandoned': return '–';
    }
}

function outcomeClass(o: DimensionOutcome): string {
    return `vault-outcome vault-outcome-${o}`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderRows(entries: VaultEntry[]): string {
    if (entries.length === 0) {
        return `<div class="vault-empty">无次元记录</div>`;
    }
    return entries.map(e => `
        <div class="vault-row" title="${escapeHtml(e.blueprintName)}">
            <span class="${outcomeClass(e.outcome)}">${outcomeLabel(e.outcome)}</span>
            <span class="vault-name">${escapeHtml(e.blueprintName)}</span>
            <span class="vault-theme">${escapeHtml(e.themeName)}</span>
            <span class="vault-difficulty">d=${e.difficulty.toFixed(2)}</span>
        </div>
    `).join('');
}

export function renderVaultPanel(
    root: HTMLElement,
    vault: DimensionVault,
    i18n?: { t: (k: string, p?: any) => string },
): VaultPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    const doRender = () => {
        const stats = vault.stats();
        const completionPct = (stats.completionRate * 100).toFixed(0);
        // Most recent first.
        const recent = vault.recent(RECENT_N).slice().reverse();

        root.innerHTML = `
            <div class="vault-panel">
                <div class="vault-title">${escapeHtml(t('vault.title'))}</div>
                <div class="vault-stats">
                    <span class="vault-stat"><b>${stats.totalVisits}</b>/${vault.getCapacity()}</span>
                    <span class="vault-stat">主题 ${stats.distinctThemes}</span>
                    <span class="vault-stat">蓝图 ${stats.distinctBlueprints}</span>
                    <span class="vault-stat">通关率 ${completionPct}%</span>
                </div>
                <div class="vault-section-label">${escapeHtml(t('vault.recent'))}</div>
                <div class="vault-entries">${renderRows(recent)}</div>
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}
