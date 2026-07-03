/**
 * NpcMindPanel — renders an NpcRegistry overview + selected NPC detail.
 *
 * Shows:
 *   - all registered NPCs (id + mood pill + disposition mini-bar)
 *   - clicking one selects it
 *   - the selected NPC's most recent N memories with kind pills
 *
 * Round 21: mirrors VaultPanel's structure on purpose so the host
 * can drop both into the cyberpunk grid without writing new CSS
 * hooks. The selection lives in panel state so the host doesn't
 * have to thread it through.
 */

import type { NpcMind, NpcMemoryEntry, NpcMemoryKind, NpcMood, NpcRegistry } from '../world/NpcMind';
import { makeEntry } from '../world/NpcMind';
import { BalanceTuner } from '../ai/AIEngine';

const RECENT_N = 6;

/** Round 28 — actions the panel can take on the selected NPC. */
export type NpcPanelAction = 'gift' | 'attack';

export interface NpcMindPanelHandle {
    refresh(): void;
    /** Force the selected NPC by id; if absent, falls back to first. */
    select(id: string | null): void;
}

function moodLabel(m: NpcMood): string {
    switch (m) {
        case 'happy':   return '😊 友善';
        case 'neutral': return '😐 中立';
        case 'uneasy':  return '😟 不安';
        case 'hostile': return '😡 敌对';
    }
}

function moodClass(m: NpcMood): string {
    return `npc-mood npc-mood-${m}`;
}

function kindLabel(k: NpcMemoryKind): string {
    switch (k) {
        case 'dialogue':              return '💬';
        case 'witnessed_event':       return '👁';
        case 'heard_about_dimension': return '🌐';
        case 'received_gift':         return '🎁';
        case 'hostility':             return '⚔';
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function pct(x: number): string {
    return `${Math.round(x * 100)}%`;
}

function dispositionBar(label: string, value: number): string {
    // value in [-1, 1]; render as bipolar bar with center origin.
    const positive = Math.max(0, value);
    const negative = Math.max(0, -value);
    return `
        <div class="npc-axis" title="${escapeHtml(label)}=${value.toFixed(2)}">
            <span class="npc-axis-label">${escapeHtml(label)}</span>
            <span class="npc-axis-bar">
                <span class="npc-axis-neg" style="width:${pct(negative)}"></span>
                <span class="npc-axis-pos" style="width:${pct(positive)}"></span>
            </span>
        </div>
    `;
}

function renderRoster(reg: NpcRegistry, selectedId: string | null): string {
    const minds = reg.iter();
    if (minds.length === 0) {
        return `<div class="npc-empty">没有已知 NPC</div>`;
    }
    return minds.map(m => {
        const isSel = m.id() === selectedId;
        return `
            <div class="npc-row ${isSel ? 'npc-row-selected' : ''}" data-npc-id="${escapeHtml(m.id())}">
                <span class="npc-id">${escapeHtml(m.id())}</span>
                <span class="${moodClass(m.mood())}">${moodLabel(m.mood())}</span>
                <span class="npc-mem-count">${m.len()} 记忆</span>
            </div>
        `;
    }).join('');
}

function renderMemoryRows(entries: NpcMemoryEntry[]): string {
    if (entries.length === 0) {
        return `<div class="npc-empty">还没有记忆</div>`;
    }
    return entries.map(e => `
        <div class="npc-mem-row" title="weight=${e.weight.toFixed(2)} turn=${e.turn}">
            <span class="npc-mem-kind">${kindLabel(e.kind)}</span>
            <span class="npc-mem-summary">${escapeHtml(e.summary)}</span>
        </div>
    `).join('');
}

export function renderNpcMindPanel(
    root: HTMLElement,
    registry: NpcRegistry,
    i18n?: { t: (k: string, p?: any) => string },
): NpcMindPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    // Panel-local state: which NPC is selected, and the monotonic
    // turn counter for the broadcasts the panel itself issues.
    let selectedId: string | null = null;
    let panelTurn = 0;
    const pickDefault = () => {
        if (selectedId && registry.get(selectedId)) return;
        const first = registry.iter()[0];
        selectedId = first ? first.id() : null;
    };

    // Round 28 — action helper. The panel issues a single
    // remember() call on the selected NPC. We use the existing
    // 'received_gift' / 'hostility' kinds (introduced in round 21)
    // with positive / negative weights so the resulting shift is
    // the canonical "gift → friendly up / attack → friendly down".
    const act = (action: NpcPanelAction) => {
        if (!selectedId) return;
        const m = registry.get(selectedId);
        if (!m) return;
        const turn = ++panelTurn;
        if (action === 'gift') {
            m.remember(makeEntry('received_gift', 'panel: gift', turn, 0.5));
        } else {
            m.remember(makeEntry('hostility', 'panel: attack', turn, -0.5));
        }
    };

    const doRender = () => {
        pickDefault();
        const selected: NpcMind | undefined = selectedId ? registry.get(selectedId) : undefined;
        const avg = registry.averageDisposition();
        const recent = selected ? selected.recent(RECENT_N).slice().reverse() : [];

        // Round 22 — preview the reflexive loop bias the BalanceTuner
        // will apply to the next dimension's difficulty.
        const bias = BalanceTuner.moodBias(avg);
        const biasLabel = bias === 0
            ? '中性 (无影响)'
            : `${bias > 0 ? '+' : ''}${bias.toFixed(2)}`;
        const biasClass = bias > 0 ? 'npc-bias-up' : bias < 0 ? 'npc-bias-down' : 'npc-bias-flat';

        root.innerHTML = `
            <div class="npc-panel">
                <div class="npc-title">${escapeHtml(t('npc.title'))}</div>
                <div class="npc-bias-row">
                    <span class="npc-bias-label">→ 影响下次难度</span>
                    <span class="npc-bias ${biasClass}">${biasLabel}</span>
                </div>
                <div class="npc-avg">
                    <span class="npc-avg-label">${escapeHtml(t('npc.average'))}</span>
                    ${dispositionBar('好感', avg.friendly)}
                    ${dispositionBar('恐惧', avg.fear)}
                    ${dispositionBar('信任', avg.trust)}
                </div>
                <div class="npc-section-label">${escapeHtml(t('npc.roster'))}</div>
                <div class="npc-roster">${renderRoster(registry, selectedId)}</div>
                <div class="npc-section-label">${escapeHtml(t('npc.memory'))}: ${escapeHtml(selectedId ?? '–')}</div>
                <div class="npc-memory">${renderMemoryRows(recent)}</div>
                <div class="npc-actions">
                    <button type="button" class="npc-action-btn npc-action-gift" data-npc-action="gift" ${selectedId ? '' : 'disabled'}>🎁 ${escapeHtml(t('npc.action.gift') ?? '送礼')}</button>
                    <button type="button" class="npc-action-btn npc-action-attack" data-npc-action="attack" ${selectedId ? '' : 'disabled'}>⚔️ ${escapeHtml(t('npc.action.attack') ?? '攻击')}</button>
                </div>
            </div>
        `;

        // Wire click-to-select on each roster row.
        root.querySelectorAll<HTMLElement>('.npc-row').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.npcId;
                if (id) { selectedId = id; doRender(); }
            });
        });
        // Round 28 — wire the gift / attack buttons. Disabled when
        // no NPC is selected; doRender() re-runs whenever the roster
        // changes, so the disabled state stays accurate.
        root.querySelectorAll<HTMLButtonElement>('.npc-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.npcAction as NpcPanelAction | undefined;
                if (a) { act(a); doRender(); }
            });
        });
    };

    doRender();
    return {
        refresh: doRender,
        select(id: string | null) { selectedId = id; doRender(); },
    };
}
