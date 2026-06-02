/**
 * InventoryUI — full inventory panel with item details and use/drop
 * actions. Items are stored in WorldState.inventory; this module gives
 * the player a way to see and consume them.
 *
 * Items are tagged with a `kind` field (set when added) so the UI can
 * know whether they're consumable, equippable, or quest items.
 */

import type { WorldState } from '../world/WorldState';
import type { InventoryItem } from '../economy/Inventory';

export type ItemKind = 'consumable' | 'equipment' | 'key' | 'lore' | 'currency';

export interface ExtendedItem extends InventoryItem {
    kind?: ItemKind;
    /** Optional lore text shown in the detail pane. */
    flavor?: string;
    /** Stat bonuses when equipped. */
    bonuses?: Record<string, number>;
}

export interface InventoryAction {
    type: 'used' | 'dropped' | 'selected';
    itemId: string;
    name: string;
    /** Optional result text (e.g. "回血 +20"). */
    result?: string;
}

const HEALING_ITEMS = new Set(['potion', 'elixir', '生命药剂', '治愈药剂']);
const KEY_ITEMS = new Set(['key', 'chest_key', '神秘宝箱钥匙', '次元钥匙']);
const CURRENCY_ITEMS = new Set(['gold_pouch', 'gem_pouch']);

export class InventoryUI {
    private root: HTMLElement;
    private worldState: WorldState;
    private onAction: (a: InventoryAction) => void;
    private selectedId: string | null = null;

    constructor(root: HTMLElement, worldState: WorldState, onAction: (a: InventoryAction) => void = () => {}) {
        this.root = root;
        this.worldState = worldState;
        this.onAction = onAction;
    }

    refresh(): void {
        this.render();
    }

    /** Use the currently selected item (or itemId if provided). */
    use(itemId?: string): InventoryAction | null {
        const id = itemId ?? this.selectedId;
        if (!id) return null;
        const inv = (this.worldState.getInventory() as any);
        const items: ExtendedItem[] = inv.getAllItems ? inv.getAllItems() : [];
        const item = items.find(i => i.itemId === id);
        if (!item) return null;
        const kind = this.kindOf(item);
        let result: string | undefined;
        if (kind === 'consumable') {
            const healed = 20 + (item.quantity > 1 ? 10 : 0);
            this.worldState.spendEnergy?.(-healed); // noop if API absent
            inv.removeItem?.(id, 1);
            result = `使用 ${item.name}，恢复 ${healed} 体力`;
        } else if (kind === 'key') {
            result = `${item.name} 需要在特定地点使用`;
        } else if (kind === 'currency') {
            result = `${item.name} 不可直接使用`;
        } else {
            result = `${item.name} 已选中`;
        }
        const action: InventoryAction = { type: 'used', itemId: id, name: item.name, result };
        this.onAction(action);
        this.render();
        return action;
    }

    /** Drop (delete) one copy of an item. */
    drop(itemId?: string): InventoryAction | null {
        const id = itemId ?? this.selectedId;
        if (!id) return null;
        const inv = (this.worldState.getInventory() as any);
        const items: ExtendedItem[] = inv.getAllItems ? inv.getAllItems() : [];
        const item = items.find(i => i.itemId === id);
        if (!item) return null;
        inv.removeItem?.(id, 1);
        const action: InventoryAction = { type: 'dropped', itemId: id, name: item.name };
        this.onAction(action);
        if (this.selectedId === id) this.selectedId = null;
        this.render();
        return action;
    }

    /** Add an item programmatically (for tests and demos). */
    giveItem(itemId: string, name: string, quantity: number = 1, kind: ItemKind = 'consumable'): boolean {
        return this.worldState.addInventoryItem(itemId, name, quantity);
    }

    select(itemId: string): void {
        this.selectedId = itemId;
        this.onAction({ type: 'selected', itemId, name: itemId });
        this.render();
    }

    private kindOf(item: ExtendedItem): ItemKind {
        if ((item as any).kind) return (item as any).kind;
        if (HEALING_ITEMS.has(item.itemId) || HEALING_ITEMS.has(item.name)) return 'consumable';
        if (KEY_ITEMS.has(item.itemId) || KEY_ITEMS.has(item.name)) return 'key';
        if (CURRENCY_ITEMS.has(item.itemId) || CURRENCY_ITEMS.has(item.name)) return 'currency';
        if (item.itemId.startsWith('equip_')) return 'equipment';
        return 'lore';
    }

    private render(): void {
        const inv = (this.worldState.getInventory() as any);
        const items: ExtendedItem[] = inv.getAllItems ? inv.getAllItems() : [];
        const list = items.length === 0
            ? '<div class="inv-empty">背包空空如也</div>'
            : items.map(it => {
                const kind = this.kindOf(it);
                const sel = it.itemId === this.selectedId ? 'is-selected' : '';
                return `
                    <div class="inv-item ${sel}" data-id="${it.itemId}">
                        <span class="inv-icon inv-icon-${kind}">${this.iconFor(kind)}</span>
                        <span class="inv-name">${escapeHtml(it.name)}</span>
                        <span class="inv-qty">x${it.quantity}</span>
                    </div>
                `;
            }).join('');

        const selected = items.find(i => i.itemId === this.selectedId) ?? null;
        const detail = selected ? `
            <div class="inv-detail">
                <div class="inv-detail-name">${escapeHtml(selected.name)}</div>
                <div class="inv-detail-kind">${this.kindOf(selected)}</div>
                <div class="inv-detail-flavor">${escapeHtml(selected.flavor ?? this.defaultFlavor(selected))}</div>
                <div class="inv-detail-actions">
                    <button class="inv-btn inv-use" data-action="use">使用</button>
                    <button class="inv-btn inv-drop" data-action="drop">丢弃</button>
                </div>
            </div>
        ` : '<div class="inv-detail-empty">选择物品以查看详情</div>';

        this.root.innerHTML = `
            <div class="inv-panel">
                <div class="inv-title">背包 (${items.length})</div>
                <div class="inv-list">${list}</div>
                ${detail}
            </div>
        `;

        // Bind item click
        this.root.querySelectorAll<HTMLElement>('.inv-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                if (id) this.select(id);
            });
        });
        // Bind detail actions
        this.root.querySelector('.inv-use')?.addEventListener('click', () => this.use());
        this.root.querySelector('.inv-drop')?.addEventListener('click', () => this.drop());
    }

    private iconFor(kind: ItemKind): string {
        return { consumable: '🧪', equipment: '⚔️', key: '🔑', lore: '📜', currency: '💰' }[kind];
    }

    private defaultFlavor(item: ExtendedItem): string {
        const k = this.kindOf(item);
        return ({
            consumable: '使用后恢复体力或生命值。',
            equipment:  '可装备以获得属性加成。',
            key:        '在特定地点使用以开启新区域。',
            lore:       '只读物品，记录你的冒险历史。',
            currency:   '可在商店中兑换其他物品。',
        } as Record<ItemKind, string>)[k];
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
