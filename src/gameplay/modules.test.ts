/**
 * Tests for the real Synthesis and Card modules.
 */

import { SynthesisModule, CardModule, Match3Module, SynthesisItem } from '../gameplay/GameplayManager';

describe('SynthesisModule', () => {
    test('load produces a starting inventory of tier-1 + a few tier-2/3', async () => {
        const m = new SynthesisModule();
        await m.load();
        const items = m.getItems();
        expect(items.length).toBe(6);
        expect(items.some(i => i.tier === 1)).toBe(true);
        expect(items.some(i => i.tier === 2)).toBe(true);
    });

    test('merge of wood + stone produces an iron-tier item', async () => {
        const m = new SynthesisModule();
        await m.load();
        const items = m.getItems();
        const wood = items.find(i => i.kind === 'wood' && i.tier === 1)!;
        const stone = items.find(i => i.kind === 'stone' && i.tier === 1)!;
        const scoreBefore = m.getScore();
        const produced = m.merge(wood, stone);
        expect(produced).not.toBeNull();
        expect(produced!.tier).toBe(2);
        expect(produced!.kind).toBe('iron');
        expect(m.getScore()).toBeGreaterThan(scoreBefore);
        // Wood and stone are consumed
        expect(m.getItems().find(i => i === wood)).toBeUndefined();
        expect(m.getItems().find(i => i === stone)).toBeUndefined();
    });

    test('merge with no known recipe returns null and resets combo', async () => {
        const m = new SynthesisModule();
        await m.load();
        const items = m.getItems();
        const wood = items.find(i => i.kind === 'wood')!;
        const shadow = { id: 'shadow_1_x', name: '暗影', kind: 'shadow' as const, tier: 1 as const };
        const r = m.merge(wood, shadow);
        expect(r).toBeNull();
        expect(m.getCombo()).toBe(0);
    });

    test('combo counter increments on successful merges', async () => {
        const m = new SynthesisModule();
        await m.load();
        const items = m.getItems();
        const wood1 = items.find(i => i.kind === 'wood' && i.tier === 1)!;
        const wood2 = items.find(i => i.kind === 'wood' && i.tier === 1 && i !== wood1)!;
        m.merge(wood1, wood2);
        expect(m.getCombo()).toBe(1);
    });

    test('merge of crystal+fire produces tier-4', async () => {
        const m = new SynthesisModule();
        await m.load();
        const items = m.getItems();
        const crystal = items.find(i => i.kind === 'crystal')!;
        // Manually inject a fire item
        const fire = { id: 'fire_1_x', name: '火焰', kind: 'fire' as const, tier: 1 as const };
        m['items'].push(fire);
        const produced = m.merge(crystal, fire);
        expect(produced).not.toBeNull();
        expect(produced!.tier).toBe(4);
    });
});

describe('Match3Module (new gameplay)', () => {
    test('findMatches on a force-built 3-in-a-row returns one group', async () => {
        const m = new Match3Module();
        await m.load();
        m['board'][0][0] = 0; m['board'][0][1] = 0; m['board'][0][2] = 0;
        const groups = m.findMatches();
        expect(groups.length).toBeGreaterThanOrEqual(1);
        expect(groups[0].length).toBe(3);
    });

    test('cascade removes at least the forced match', async () => {
        const m = new Match3Module();
        await m.load();
        m['board'][0][0] = 0; m['board'][0][1] = 0; m['board'][0][2] = 0;
        const before = m.getScore();
        const removed = m.cascade();
        // The forced 3 cells are removed. Cascading may add more.
        expect(removed).toBeGreaterThanOrEqual(3);
        expect(m.getScore()).toBeGreaterThan(before);
    });

    test('swap then cascade handles cascading matches', async () => {
        const m = new Match3Module();
        await m.load();
        m['board'][0][0] = 0; m['board'][0][1] = 0; m['board'][0][2] = 0;
        m['board'][1][3] = 0; m['board'][1][4] = 0;
        m['board'][1][2] = 0;
        const removed = m.cascade();
        expect(removed).toBeGreaterThanOrEqual(3);
    });

    test('getBoard returns a defensive copy', async () => {
        const m = new Match3Module();
        await m.load();
        const b = m.getBoard();
        b[0][0] = 99;
        const b2 = m.getBoard();
        expect(b2[0][0]).not.toBe(99);
    });
});

describe('CardModule', () => {
    test('load draws 6 cards and resets energy', async () => {
        const m = new CardModule();
        await m.load();
        expect(m.getHand().length).toBe(6);
        expect(m.getEnergy()).toBe(3);
        expect(m.getTurn()).toBe(0);
    });

    test('playing a damage card reduces enemy HP and increases score', async () => {
        const m = new CardModule();
        await m.load();
        // End turns until we have a damage card we can afford
        let safety = 0;
        let idx = -1;
        while (idx < 0 && safety++ < 10) {
            const hand = m.getHand();
            idx = hand.findIndex(c => c.damage > 0 && c.cost <= m.getEnergy());
            if (idx < 0) m.endTurn();
        }
        expect(idx).toBeGreaterThanOrEqual(0);
        const before = m.getEnemyHp();
        const r = m.playCard(idx);
        expect(r.ok).toBe(true);
        expect(m.getEnemyHp()).toBeLessThan(before);
    });

    test('cannot play a card without enough energy', async () => {
        const m = new CardModule();
        await m.load();
        // Drain energy by playing 3 cheap cards
        let safety = 0;
        while (m.getEnergy() > 0 && safety++ < 10) {
            const hand = m.getHand();
            const cheap = hand.findIndex(c => c.cost <= m.getEnergy());
            if (cheap < 0) break;
            m.playCard(cheap);
        }
        // Now try to play the most expensive card still in hand (if any)
        const hand = m.getHand();
        if (hand.length > 0) {
            const expensive = hand.reduce((best, c, i) => c.cost > hand[best].cost ? i : best, 0);
            const r = m.playCard(expensive);
            if (hand[expensive].cost > m.getEnergy()) {
                expect(r.ok).toBe(false);
            }
        }
    });

    test('endTurn draws 6 new cards and regenerates energy', async () => {
        const m = new CardModule();
        await m.load();
        const energyBefore = m.getEnergy();
        m.endTurn();
        expect(m.getTurn()).toBe(1);
        expect(m.getHand().length).toBe(6);
        expect(m.getEnergy()).toBeGreaterThanOrEqual(energyBefore);
    });
});
