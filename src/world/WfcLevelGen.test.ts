/**
 * WFC level generator tests.
 */

import { generateDungeon, TILE_GOAL, TILE_SPAWN, TILE_WALL, TILE_FLOOR } from '../world/WfcLevelGen';

describe('WfcLevelGen', () => {
    test('produces a fully-collapsed grid of the requested size', () => {
        const { tiles, success } = generateDungeon(8, 6, 42);
        expect(tiles.length).toBe(6);
        expect(tiles[0].length).toBe(8);
        expect(success).toBe(true);
    });

    test('pins SPAWN at (0, 0) and GOAL at (w-1, h-1)', () => {
        const { tiles } = generateDungeon(6, 5, 7);
        expect(tiles[0][0]).toBe(TILE_SPAWN);
        expect(tiles[4][5]).toBe(TILE_GOAL);
    });

    test('a path of walkable tiles exists between SPAWN and GOAL', () => {
        // BFS over walkable tiles from spawn to goal.
        const { tiles } = generateDungeon(10, 10, 99);
        const h = tiles.length, w = tiles[0].length;
        const visited = new Set<string>();
        const queue: Array<[number, number]> = [[0, 0]];
        visited.add('0,0');
        let reached = false;
        while (queue.length) {
            const [x, y] = queue.shift()!;
            if (x === w - 1 && y === h - 1) { reached = true; break; }
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const key = `${nx},${ny}`;
                if (visited.has(key)) continue;
                const t = tiles[ny][nx];
                // walkable tiles (not WALL)
                if (t === TILE_WALL) continue;
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
        expect(reached).toBe(true);
    });

    test('different seeds produce different dungeons', () => {
        const a = generateDungeon(8, 8, 1);
        const b = generateDungeon(8, 8, 2);
        const flat = (g: typeof a.tiles) => g.flat().join(',');
        expect(flat(a.tiles)).not.toEqual(flat(b.tiles));
    });
});
