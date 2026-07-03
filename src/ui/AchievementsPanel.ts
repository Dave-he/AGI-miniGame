/**
 * AchievementsPanel — round-115 follow-up (round 118).
 *
 * Renders the `PlayerProfile.achievements` list
 * (a `string[]` of unlocked achievement ids,
 * populated via `addAchievement(id)`) as a
 * small overlay inside `<div id="achievements-root">`.
 *
 * Shows:
 *   - total unlocked count
 *   - the unlocked list (most recently unlocked first)
 *   - "no achievements yet" empty state when the
 *     list is empty
 *
 * Auto-refreshes via a `refresh` callback the
 * host wires to a setInterval or the
 * `addAchievement` call site.
 *
 * Round 115 shipped the mount point + the V key
 * toggle + the App.toggleAchievements method, but
 * the panel content was never rendered — the
 * `<div id="achievements-root">` was an empty div.
 * Round 118 closes that follow-up gap by adding
 * this module + wiring it into the App constructor
 * (similar to `renderVaultPanel`).
 */

import type { PlayerProfile } from '../player/PlayerProfile';

export interface AchievementsPanelHandle {
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

function renderRows(achievements: readonly string[]): string {
    if (achievements.length === 0) {
        return `<div class="achievements-empty">暂无成就</div>`;
    }
    // Show most recently unlocked first.
    return achievements.slice().reverse().map((id) => `
        <div class="achievements-row" title="${escapeHtml(id)}">
            <span class="achievements-pill">🏅</span>
            <span class="achievements-id">${escapeHtml(id)}</span>
        </div>
    `).join('');
}

export function renderAchievementsPanel(
    root: HTMLElement,
    player: PlayerProfile,
    i18n?: { t: (k: string, p?: any) => string },
): AchievementsPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    const doRender = () => {
        const achievements = player.achievements;
        root.innerHTML = `
            <div class="achievements-panel">
                <div class="achievements-title">${escapeHtml(t('achievements.title'))}</div>
                <div class="achievements-stats">
                    <span class="achievements-stat">解锁 <b>${achievements.length}</b></span>
                </div>
                <div class="achievements-section-label">${escapeHtml(t('achievements.list'))}</div>
                <div class="achievements-entries">${renderRows(achievements)}</div>
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}
