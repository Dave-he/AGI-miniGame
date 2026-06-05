/**
 * NpcMindPanel tests — round 28 inline gift / attack buttons.
 *
 * Before round 28, the only way to issue a gift or attack on a
 * specific NPC was to call `main.ts` bottom-bar buttons. This
 * suite pins the new panel-local buttons so they can be
 * exercised in isolation.
 */

import { renderNpcMindPanel, NpcMindPanelHandle } from '../ui/NpcMindPanel';
import { NpcMind, NpcRegistry } from '../world/NpcMind';

function makePanel() {
    document.body.innerHTML = '<div id="npc-mind-root"></div>';
    const root = document.getElementById('npc-mind-root')!;
    const reg = new NpcRegistry();
    reg.insert(new NpcMind('alice'));
    reg.insert(new NpcMind('bob'));
    const handle = renderNpcMindPanel(root, reg);
    return { root, reg, handle };
}

describe('NpcMindPanel — round 28 inline gift / attack buttons', () => {
    test('renders_both_buttons_inside_npc_actions_container', () => {
        const { root } = makePanel();
        const gift = root.querySelector<HTMLButtonElement>('[data-npc-action="gift"]');
        const attack = root.querySelector<HTMLButtonElement>('[data-npc-action="attack"]');
        expect(gift).toBeTruthy();
        expect(attack).toBeTruthy();
        expect(gift?.disabled).toBe(false);
        expect(attack?.disabled).toBe(false);
    });

    test('clicking_gift_raises_selected_npc_friendly', () => {
        // The "received_gift" kind does:
        //   friendly += w * 0.40   (w = 0.5  →  +0.20)
        //   trust    += w * 0.30   (w = 0.5  →  +0.15)
        // Default selection is the first NPC ("alice").
        const { handle, reg } = makePanel();
        handle.select('alice');
        const before = reg.get('alice')!.disposition();
        const gift = document.querySelector<HTMLButtonElement>('[data-npc-action="gift"]')!;
        gift.click();
        const after = reg.get('alice')!.disposition();
        expect(after.friendly - before.friendly).toBeCloseTo(0.20, 5);
        expect(after.trust    - before.trust).toBeCloseTo(0.15, 5);
    });

    test('clicking_attack_lowers_selected_npc_friendly', () => {
        // The "hostility" kind does:
        //   friendly -= |w| * 0.50   (w = -0.5 →  +0.25 in math,
        //                                but the formula uses |w|,
        //                                so friendly actually goes
        //                                DOWN by 0.25)
        //   fear     += |w| * 0.60   (w = -0.5 →  +0.30)
        const { handle, reg } = makePanel();
        handle.select('alice');
        const before = reg.get('alice')!.disposition();
        const attack = document.querySelector<HTMLButtonElement>('[data-npc-action="attack"]')!;
        attack.click();
        const after = reg.get('alice')!.disposition();
        // friendly should have decreased
        expect(after.friendly).toBeLessThan(before.friendly);
        // fear should have increased
        expect(after.fear).toBeGreaterThan(before.fear);
    });

    test('gift_does_not_affect_other_npcs', () => {
        // The panel issues a remember() on the selected NPC only,
        // not a broadcast. So "bob" must stay at default disposition
        // while "alice" gets the gift.
        const { handle, reg } = makePanel();
        handle.select('alice');
        const bobBefore = reg.get('bob')!.disposition();
        const gift = document.querySelector<HTMLButtonElement>('[data-npc-action="gift"]')!;
        gift.click();
        const bobAfter = reg.get('bob')!.disposition();
        expect(bobAfter.friendly).toBe(bobBefore.friendly);
        expect(bobAfter.trust).toBe(bobBefore.trust);
    });

    test('panel_turn_counter_strictly_increments_per_action', () => {
        // Each action must produce a unique, monotonically
        // increasing turn number so the remember() history stays
        // ordered. We test indirectly: two actions produce two
        // entries in the NPC's recent() buffer.
        const { handle, reg } = makePanel();
        handle.select('alice');
        const gift = document.querySelector<HTMLButtonElement>('[data-npc-action="gift"]')!;
        const attack = document.querySelector<HTMLButtonElement>('[data-npc-action="attack"]')!;
        gift.click();
        attack.click();
        const recent = reg.get('alice')!.recent(10);
        expect(recent.length).toBe(2);
        // The two turns must differ and the second must be larger
        // than the first (monotonic).
        expect(recent[1].turn).toBeGreaterThan(recent[0].turn);
    });

    test('buttons_become_disabled_after_clearing_registry', () => {
        // Round 21+ — renderNpcMindPanel re-picks the default on
        // every refresh. With an empty registry, the buttons
        // should be disabled.
        const { root, reg, handle } = makePanel();
        // Remove all NPCs.
        // (No remove() method on NpcRegistry — we re-create the
        //  handle with a fresh empty registry instead.)
        const freshRoot = document.createElement('div');
        document.body.appendChild(freshRoot);
        const emptyReg = new NpcRegistry();
        const h2 = renderNpcMindPanel(freshRoot, emptyReg);
        h2.refresh();
        const gift = freshRoot.querySelector<HTMLButtonElement>('[data-npc-action="gift"]');
        const attack = freshRoot.querySelector<HTMLButtonElement>('[data-npc-action="attack"]');
        expect(gift?.disabled).toBe(true);
        expect(attack?.disabled).toBe(true);
    });
});
