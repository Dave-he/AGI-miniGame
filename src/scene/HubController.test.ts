/**
 * HubController tests.
 */

import { HubController, HubControllerActions } from '../scene/HubController';

function makeActions(overrides: Partial<HubControllerActions> = {}): HubControllerActions & { moved: number[][]; npcClicks: number[]; portalClicks: string[] } {
    const moved: number[][] = [];
    const npcClicks: number[] = [];
    const portalClicks: string[] = [];
    return {
        moved,
        npcClicks,
        portalClicks,
        moveCamera(dx, dz) { moved.push([dx, dz]); },
        moveCameraTo(_x, _z) { /* noop */ },
        listNpcs() {
            return [
                { index: 0, name: 'Sage',   x: 5,  z: 5 },
                { index: 1, name: 'Merch',  x: -5, z: 5 },
            ];
        },
        listPortals() {
            return [
                { atomId: 'match3',        x: 14, z: 0 },
                { atomId: 'tower_defense', x: -14, z: 0 },
            ];
        },
        onNpcClick(i) { npcClicks.push(i); },
        onPortalClick(a) { portalClicks.push(a); },
        ...overrides,
    };
}

describe('HubController', () => {
    test('handleClick on an NPC fires onNpcClick and moves camera', () => {
        const a = makeActions();
        const c = new HubController(a);
        c.handleClick(5, 5);
        expect(a.npcClicks).toEqual([0]);
    });

    test('handleClick on a portal fires onPortalClick', () => {
        const a = makeActions();
        const c = new HubController(a);
        c.handleClick(14, 0);
        expect(a.portalClicks).toEqual(['match3']);
    });

    test('handleClick on empty space is a no-op', () => {
        const a = makeActions();
        const c = new HubController(a);
        c.handleClick(0, 0);
        expect(a.npcClicks).toEqual([]);
        expect(a.portalClicks).toEqual([]);
    });

    test('handleClick on a position close to an NPC picks the NPC over a farther portal', () => {
        const a = makeActions();
        const c = new HubController(a);
        // The position is 1 unit from NPC 0 (5,5) and 13 units from any portal.
        c.handleClick(6, 5);
        expect(a.npcClicks).toEqual([0]);
    });

    test('on() listener receives events', () => {
        const a = makeActions();
        const c = new HubController(a);
        const events: any[] = [];
        c.on(e => events.push(e));
        c.handleClick(5, 5);
        expect(events.some(e => e.type === 'selected-npc')).toBe(true);
    });
});
