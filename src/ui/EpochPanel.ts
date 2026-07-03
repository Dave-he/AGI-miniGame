/**
 * EpochPanel — HUD for the 纪元更迭 / 大坍缩 system.
 *
 * Shows the current epoch, active rules, relics count, and a button to
 * trigger a collapse manually. Lives in a dedicated DOM container so
 * other UI panels can be toggled around it.
 */

import type { EpochSystem, WorldRule, HistoricalRelic } from '../world/EpochSystem';
import type { I18n } from '../i18n/I18n';

export class EpochPanel {
    private root: HTMLElement;
    private epoch: EpochSystem;
    private i18n: I18n | null;
    private onCollapse?: () => void;

    constructor(root: HTMLElement, epoch: EpochSystem, onCollapse?: () => void, i18n?: I18n) {
        this.root = root;
        this.epoch = epoch;
        this.onCollapse = onCollapse;
        this.i18n = i18n ?? null;
    }

    render(): void {
        const snap = this.epoch.snapshot();
        const ruleRows = snap.activeRules.length === 0
            ? '<div class="epoch-empty">当前纪元无活跃规则</div>'
            : snap.activeRules.map((r, i) => `
                <div class="epoch-rule">
                    <span class="epoch-rule-num">#${i + 1}</span>
                    <span class="epoch-rule-name">${escapeHtml(r.name)}</span>
                    <span class="epoch-rule-kind">${r.kind}</span>
                </div>
            `).join('');
        const relicRows = snap.relics.length === 0
            ? '<div class="epoch-empty">尚无历史遗迹</div>'
            : snap.relics.slice(-8).reverse().map(r => `
                <div class="epoch-relic ${r.effect}">
                    <span class="epoch-relic-icon">${r.effect === 'buff' ? '▲' : '▼'}</span>
                    <span class="epoch-relic-name">${escapeHtml(r.sourceRuleName)}</span>
                    <span class="epoch-relic-mag">${r.magnitude.toFixed(1)}</span>
                </div>
            `).join('');

        const damageMul = this.epoch.relicMultiplier('damage').toFixed(2);
        const goldMul = this.epoch.relicMultiplier('gold').toFixed(2);

        this.root.innerHTML = `
            <div class="epoch-panel">
                <div class="epoch-title">纪元 ${snap.epochNumber} · ${escapeHtml(snap.epochName)}</div>
                <div class="epoch-stats">
                    <span>活跃规则 ${snap.activeRules.length}/8</span>
                    <span>历史遗迹 ${snap.relics.length}</span>
                    <span>已坍缩 ${snap.collapseCount} 次</span>
                </div>
                <div class="epoch-section-label">活跃规则 (Layer 2)</div>
                <div class="epoch-rules">${ruleRows}</div>
                <div class="epoch-section-label">历史遗迹 (Layer 3)</div>
                <div class="epoch-relics">${relicRows}</div>
                <div class="epoch-muls">
                    <span>伤害 × ${damageMul}</span>
                    <span>金币 × ${goldMul}</span>
                </div>
                <button class="epoch-collapse-btn" ${snap.activeRules.length === 0 ? 'disabled' : ''}>
                    ${this.t('epoch.collapse')} → ${this.t('epoch.next', { n: snap.epochNumber + 1 })}
                </button>
            </div>
        `;

        const btn = this.root.querySelector<HTMLButtonElement>('.epoch-collapse-btn');
        if (btn) btn.addEventListener('click', () => this.onCollapse?.());
    }

    private t(key: string, params?: Record<string, string | number>): string {
        return this.i18n ? this.i18n.t(key, params) : key;
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
