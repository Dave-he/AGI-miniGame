/**
 * InventoryUI tests.
 */

import { InventoryUI } from '../ui/InventoryUI';
import { WorldState } from '../world/WorldState';

function make() {
    const ws = new WorldState('tester', 'Tester');
    const actions: any[] = [];
    const ui = new InventoryUI(document.createElement('div'), ws, a => actions.push(a));
    return { ws, actions, ui };
}

describe('InventoryUI', () => {
    test('refresh on empty inventory shows the empty message', () => {
        const { ui } = make();
        ui.refresh();
        expect(ui['root'].querySelector('.inv-empty')).toBeTruthy();
    });

    test('selecting an item populates the detail panel', () => {
        const { ui, ws } = make();
        ws.addInventoryItem('potion', '生命药剂', 3);
        ui.refresh();
        ui.select('potion');
        expect(ui['root'].querySelector('.inv-detail')).toBeTruthy();
    });

    test('use() on a consumable consumes one copy and fires an action', () => {
        const { ui, ws, actions } = make();
        ws.addInventoryItem('potion', '生命药剂', 3);
        ui.refresh();
        ui.select('potion');
        ui.use();
        const inv = (ws.getInventory() as any).getAllItems();
        const potion = inv.find((i: any) => i.itemId === 'potion');
        expect(potion.quantity).toBe(2);
        expect(actions.some(a => a.type === 'used' && a.itemId === 'potion')).toBe(true);
    });

    test('drop() reduces quantity by one', () => {
        const { ui, ws } = make();
        ws.addInventoryItem('potion', '生命药剂', 2);
        ui.refresh();
        ui.select('potion');
        ui.drop();
        const inv = (ws.getInventory() as any).getAllItems();
        const potion = inv.find((i: any) => i.itemId === 'potion');
        expect(potion.quantity).toBe(1);
    });

    test('use() with no selection is a no-op', () => {
        const { ui, actions } = make();
        const r = ui.use();
        expect(r).toBeNull();
        expect(actions.length).toBe(0);
    });

    test('giveItem() works for any kind', () => {
        const { ui, ws } = make();
        ui.giveItem('chest_key', '神秘宝箱钥匙', 1, 'key');
        ui.refresh();
        const inv = (ws.getInventory() as any).getAllItems();
        expect(inv.length).toBe(1);
        expect(inv[0].name).toBe('神秘宝箱钥匙');
    });
});
