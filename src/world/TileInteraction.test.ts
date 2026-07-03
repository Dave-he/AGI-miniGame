/**
 * TileInteraction tests.
 */

import { TileInteraction } from '../world/TileInteraction';
import { WorldState } from '../world/WorldState';
import { Progression } from '../player/Progression';
import { TILE_FLOOR, TILE_WALL, TILE_CHEST, TILE_TRAP, TILE_SHRINE, TILE_GOAL } from '../world/WfcLevelGen';

function make() {
    const ws = new WorldState('tester', 'Tester');
    const p = new Progression();
    const ti = new TileInteraction(ws, p);
    return { ws, p, ti };
}

describe('TileInteraction', () => {
    test('floor and spawn are no-ops', () => {
        const { ti } = make();
        expect(ti.stepOn(TILE_FLOOR)).toBeNull();
    });

    test('wall blocks with a note', () => {
        const { ti } = make();
        const r = ti.stepOn(TILE_WALL);
        expect(r?.type).toBe('block');
        expect(r?.message).toContain('墙');
    });

    test('chest grants gold', () => {
        const { ti, ws } = make();
        const r = ti.stepOn(TILE_CHEST);
        expect(r?.type).toBe('reward');
        expect(ws.getGold()).toBeGreaterThan(0);
    });

    test('repeated chest grants increasing gold', () => {
        const { ti, ws } = make();
        ti.stepOn(TILE_CHEST);
        const after1 = ws.getGold();
        ti.stepOn(TILE_CHEST);
        const after2 = ws.getGold();
        expect(after2 - after1).toBeGreaterThan(30);
    });

    test('trap deals damage', () => {
        const { ti } = make();
        const r = ti.stepOn(TILE_TRAP);
        expect(r?.type).toBe('damage');
    });

    test('shrine grants xp', () => {
        const { ti, p } = make();
        const r = ti.stepOn(TILE_SHRINE);
        expect(r?.type).toBe('heal');
        expect(p.totalXp).toBeGreaterThan(0);
    });

    test('goal grants gold + xp', () => {
        const { ti, ws, p } = make();
        const r = ti.stepOn(TILE_GOAL);
        expect(r?.type).toBe('reward');
        expect(ws.getGold()).toBeGreaterThan(0);
        expect(p.totalXp).toBeGreaterThan(0);
    });
});
