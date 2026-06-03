/**
 * Match3Bridge tests.
 */

import { Match3Bridge, Match3BridgeActions, Match3BoardView } from '../gameplay/Match3Bridge';

class MockActions implements Match3BridgeActions {
    public renders: Array<{ rows: number; cols: number; len: number }> = [];
    public flashes: Array<Array<[number, number]>> = [];
    renderMatch3Grid(cells: number[], rows: number, cols: number) {
        this.renders.push({ rows, cols, len: cells.length });
    }
    flashMatch3Cells(cells: Array<[number, number]>) {
        this.flashes.push(cells);
    }
}

describe('Match3Bridge', () => {
    test('sync() pushes the board to the scene on first call', () => {
        const a = new MockActions();
        const board: Match3BoardView = { rows: 3, cols: 3, cells: [0, 1, 2, 3, 4, 5, 0, 1, 2] };
        const b = new Match3Bridge(a, () => board, () => []);
        const ok = b.sync();
        expect(ok).toBe(true);
        expect(a.renders.length).toBe(1);
        expect(a.renders[0]).toEqual({ rows: 3, cols: 3, len: 9 });
    });

    test('sync() is a no-op when the board has not changed', () => {
        const a = new MockActions();
        const board: Match3BoardView = { rows: 2, cols: 2, cells: [0, 1, 2, 3] };
        const b = new Match3Bridge(a, () => board, () => []);
        b.sync();
        const ok2 = b.sync();
        expect(ok2).toBe(false);
        expect(a.renders.length).toBe(1);
    });

    test('sync() returns false when there is no board', () => {
        const a = new MockActions();
        const b = new Match3Bridge(a, () => null, () => []);
        expect(b.sync()).toBe(false);
    });

    test('flashMatches() forwards groups and dedups on no change', () => {
        const a = new MockActions();
        const b = new Match3Bridge(a, () => null, () => [
            [[0, 0], [0, 1], [0, 2]],
            [[2, 0], [2, 1], [2, 2]],
        ]);
        const n1 = b.flashMatches();
        expect(n1).toBe(6);
        expect(a.flashes.length).toBe(2);
        // No new matches → no new flash.
        const n2 = b.flashMatches();
        expect(n2).toBe(0);
    });
});
