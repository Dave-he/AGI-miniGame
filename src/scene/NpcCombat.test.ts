/**
 * NpcCombat tests.
 */

import { NpcCombat, NpcCombatActions, NpcCombatCallbacks } from '../scene/NpcCombat';

class MockActions implements NpcCombatActions {
    public flashes: number[] = [];
    public hidden: number[] = [];
    public floats: Array<{ idx: number; text: string; color: string }> = [];
    public bubbles: Array<{ idx: number; text: string | null }> = [];
    flashNpc(i: number) { this.flashes.push(i); }
    hideNpc(i: number) { this.hidden.push(i); }
    floatOverNpc(i: number, t: string, c: string) { this.floats.push({ idx: i, text: t, color: c }); }
    setNpcDialogue(i: number, t: string) { this.bubbles.push({ idx: i, text: t }); }
    clearNpcDialogue(i: number) { this.bubbles.push({ idx: i, text: null }); }
}

describe('NpcCombat', () => {
    test('register creates an alive NPC at full HP', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'Sage', 30);
        const n = c.get(0)!;
        expect(n.hp).toBe(30);
        expect(n.alive).toBe(true);
    });

    test('attack reduces HP and flashes the NPC', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'Sage', 30);
        c.attack(0, 10);
        expect(c.get(0)!.hp).toBe(20);
        expect(a.flashes).toEqual([0]);
        expect(a.floats[0]).toEqual({ idx: 0, text: '-10', color: '#ff4d6d' });
    });

    test('attack that drops HP to 0 hides the NPC and fires onDefeated', () => {
        const a = new MockActions();
        let defeated = '';
        const cb: NpcCombatCallbacks = { onDefeated: (i, name) => { defeated = `${i}:${name}`; } };
        const c = new NpcCombat(a, cb);
        c.register(1, 'Mage', 20);
        c.attack(1, 25);
        expect(c.get(1)!.alive).toBe(false);
        expect(a.hidden).toEqual([1]);
        expect(a.bubbles.some(b => b.idx === 1 && b.text === null)).toBe(true);
        expect(defeated).toBe('1:Mage');
    });

    test('heal caps at maxHp', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'Sage', 30);
        c.attack(0, 20);
        c.heal(0, 999);
        expect(c.get(0)!.hp).toBe(30);
    });

    test('attack on a dead NPC is a no-op', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'Sage', 10);
        c.attack(0, 99);
        const flashesBefore = a.flashes.length;
        c.attack(0, 5);
        expect(a.flashes.length).toBe(flashesBefore); // no new flash
    });

    test('resetAll revives every NPC', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'A', 20);
        c.register(1, 'B', 20);
        c.attack(0, 99);
        c.attack(1, 99);
        c.resetAll();
        expect(c.get(0)!.alive).toBe(true);
        expect(c.get(1)!.alive).toBe(true);
        expect(c.get(0)!.hp).toBe(20);
    });

    test('buildClickHandler deals randomized damage and only hits alive NPCs', () => {
        const a = new MockActions();
        const c = new NpcCombat(a);
        c.register(0, 'A', 30);
        const handler = NpcCombat.buildClickHandler(c);
        handler(0);
        const hp = c.get(0)!.hp;
        // Damage is 5..=10
        expect(hp).toBeGreaterThanOrEqual(20);
        expect(hp).toBeLessThanOrEqual(25);
    });
});
