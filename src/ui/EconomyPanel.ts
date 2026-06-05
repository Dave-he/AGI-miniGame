/**
 * EconomyPanel — renders the 通用货币 + 玩法专属代币 + 背包 structure
 * described in PRD §2.3 (统一经济).
 */

import type { WorldState } from '../world/WorldState';
import type { InventoryItem } from '../economy/Inventory';

export interface CurrencyDef {
    id: string;
    name: string;
    color: string;
    /** Scope: "universal" (通用) or "per-atom" (per-gameplay). */
    scope: 'universal' | 'per-atom';
}

export const CURRENCY_DEFS: CurrencyDef[] = [
    { id: 'gold',         name: '金币',     color: '#ffd166', scope: 'universal' },
    { id: 'gem',          name: '钻石',     color: '#a06cd5', scope: 'universal' },
    { id: 'energy',       name: '体力',     color: '#06d6a0', scope: 'universal' },
    { id: 'token_match3', name: '三消代币', color: '#ff6b6b', scope: 'per-atom' },
    { id: 'token_tower',  name: '塔防代币', color: '#4ecdc4', scope: 'per-atom' },
    { id: 'token_card',   name: '卡牌代币', color: '#ef476f', scope: 'per-atom' },
    { id: 'token_parkour',name: '跑酷代币', color: '#ff8fa3', scope: 'per-atom' },
];

export class EconomyPanel {
    private root: HTMLElement;
    private worldState: WorldState;

    constructor(root: HTMLElement, worldState: WorldState) {
        this.root = root;
        this.worldState = worldState;
    }

    render(): void {
        // Round 41 — `as any` cleanup. Wallet and
        // Inventory expose the methods directly, and
        // WorldState's `getInventory()` already returns
        // a typed `Inventory`, so no escape hatch is
        // needed. (Round 26's HUD.getState() refactor
        // did the same for `(this.hud as any).state`.)
        const wallet = this.worldState.wallet;
        const balances: Record<string, number> = wallet.getAllBalances();
        const universal = CURRENCY_DEFS.filter(c => c.scope === 'universal');
        const perAtom = CURRENCY_DEFS.filter(c => c.scope === 'per-atom');

        const universalRow = universal.map(c => this.balChip(c, balances[c.id] ?? 0)).join('');
        const perAtomRow = perAtom.map(c => this.balChip(c, balances[c.id] ?? 0)).join('');

        const inventory: InventoryItem[] = this.worldState.getInventory().getAllItems();
        const invRows = inventory.length === 0
            ? '<div class="econ-empty">背包空空如也</div>'
            : inventory.slice(0, 24).map((it: InventoryItem) => `
                <div class="econ-item">
                    <span class="econ-item-name">${escapeHtml(it.name || it.itemId)}</span>
                    <span class="econ-item-qty">x${it.quantity}</span>
                </div>
            `).join('');

        this.root.innerHTML = `
            <div class="econ-panel">
                <div class="econ-title">统一经济</div>
                <div class="econ-section-label">通用货币</div>
                <div class="econ-row">${universalRow}</div>
                <div class="econ-section-label">玩法专属代币</div>
                <div class="econ-row">${perAtomRow}</div>
                <div class="econ-section-label">背包</div>
                <div class="econ-inventory">${invRows}</div>
            </div>
        `;
    }

    private balChip(c: CurrencyDef, amount: number): string {
        return `
            <div class="econ-chip" style="--chip-color:${c.color}">
                <span class="econ-chip-name">${c.name}</span>
                <b class="econ-chip-amt">${amount}</b>
            </div>
        `;
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
