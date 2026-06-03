/**
 * PlayerHealth tests.
 */

import { PlayerHealth } from '../player/PlayerHealth';
import { Analytics } from '../analytics/Analytics';

function make() {
    let collapses = 0;
    const a = new Analytics();
    let deathEpoch = -1, reviveEpoch = -1;
    const h = new PlayerHealth({
        epochTriggerCollapse: () => { collapses += 1; },
        analytics: a,
    }, {
        onDeath: (e) => { deathEpoch = e; },
        onRevive: (e) => { reviveEpoch = e; },
    });
    return { h, getCollapses: () => collapses, getDeathEpoch: () => deathEpoch, getReviveEpoch: () => reviveEpoch, a };
}

describe('PlayerHealth', () => {
    test('starts at full HP and alive', () => {
        const { h } = make();
        expect(h.getHp()).toBe(100);
        expect(h.isAlive()).toBe(true);
    });

    test('takeDamage reduces HP and fires onDamage', () => {
        let fired = 0;
        const h = new PlayerHealth({ epochTriggerCollapse: () => {} }, { onDamage: () => fired += 1 });
        h.takeDamage(30);
        expect(h.getHp()).toBe(70);
        expect(fired).toBe(1);
    });

    test('heal caps at maxHp', () => {
        const { h } = make();
        h.takeDamage(50);
        h.heal(999);
        expect(h.getHp()).toBe(100);
    });

    test('HP=0 triggers epoch collapse and revive-at-1', () => {
        const { h, getCollapses, getDeathEpoch, getReviveEpoch } = make();
        h.takeDamage(40);
        h.takeDamage(40);
        expect(h.isAlive()).toBe(true);
        expect(h.getHp()).toBe(20);
        h.takeDamage(20);
        // HP=0 → die → collapse → revive at 1
        expect(getCollapses()).toBe(1);
        expect(getDeathEpoch()).toBe(1);
        expect(getReviveEpoch()).toBe(1);
        expect(h.getHp()).toBe(1);
        expect(h.isAlive()).toBe(true);
    });

    test('damage to a dead player is ignored', () => {
        const { h } = make();
        h.kill();
        const hpBefore = h.getHp();
        h.takeDamage(50);
        expect(h.getHp()).toBe(hpBefore);
    });

    test('reviveToFull resets HP', () => {
        const { h } = make();
        h.takeDamage(80);
        h.reviveToFull();
        expect(h.getHp()).toBe(100);
    });

    test('death fires an Analytics event', () => {
        const { h, a } = make();
        h.takeDamage(150);
        expect(a.count('player.died')).toBe(1);
    });

    test('damage to a living player fires a damaged event', () => {
        const { h, a } = make();
        h.takeDamage(10);
        expect(a.count('player.damaged')).toBe(1);
    });
});
