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

const RECENT_N = 6;

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

    // Panel-local state: which NPC is selected.
    let selectedId: string | null = null;
    const pickDefault = () => {
        if (selectedId && registry.get(selectedId)) return;
        const first = registry.iter()[0];
        selectedId = first ? first.id() : null;
    };

    const doRender = () => {
        pickDefault();
        const selected: NpcMind | undefined = selectedId ? registry.get(selectedId) : undefined;
        const avg = registry.averageDisposition();
        const recent = selected ? selected.recent(RECENT_N).slice().reverse() : [];

        root.innerHTML = `
            <div class="npc-panel">
                <div class="npc-title">${escapeHtml(t('npc.title'))}</div>
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
            </div>
        `;

        // Wire click-to-select on each roster row.
        root.querySelectorAll<HTMLElement>('.npc-row').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.npcId;
                if (id) { selectedId = id; doRender(); }
            });
        });
    };

    doRender();
    return {
        refresh: doRender,
        select(id: string | null) { selectedId = id; doRender(); },
    };
}
