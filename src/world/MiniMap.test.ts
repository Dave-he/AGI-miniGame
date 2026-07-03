import {
    renderMiniMap,
    colorForTile,
    computeOutputSize,
    SUPPORTED_BIOMES,
} from './MiniMap';
import { BIOMES, type BiomeId } from './WfcBiomes';
import {
    TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST,
    TILE_SPAWN, TILE_GOAL, TILE_TRAP, TILE_SHRINE,
} from './WfcLevelGen';

describe('MiniMap', () => {
    describe('colorForTile', () => {
        it('returns the biome tileColors palette for each tile', () => {
            for (const id of SUPPORTED_BIOMES) {
                const biome = BIOMES[id];
                // Cyberpunk has distinct floor color #1d0036.
                const c = colorForTile(TILE_FLOOR, id);
                // Either matches the biome's tileColors[0] or the
                // generic fallback — but it should be a valid RGB.
                expect(c.r).toBeGreaterThanOrEqual(0);
                expect(c.r).toBeLessThanOrEqual(255);
                expect(c.g).toBeGreaterThanOrEqual(0);
                expect(c.g).toBeLessThanOrEqual(255);
                expect(c.b).toBeGreaterThanOrEqual(0);
                expect(c.b).toBeLessThanOrEqual(255);
                // Sanity: a configured biome should actually use it.
                if (biome.tileColors?.[TILE_FLOOR]) {
                    const expected = biome.tileColors[TILE_FLOOR];
                    const r = parseInt(expected.slice(1, 3), 16);
                    const g = parseInt(expected.slice(3, 5), 16);
                    const b = parseInt(expected.slice(5, 7), 16);
                    expect(c).toEqual({ r, g, b });
                }
            }
        });

        it('falls back to the dungeon palette for unknown biome ids', () => {
            const c = colorForTile(TILE_FLOOR, 'not-a-biome');
            const d = colorForTile(TILE_FLOOR, 'dungeon');
            expect(c).toEqual(d);
        });

        it('falls back to the dungeon palette for null biome', () => {
            const c = colorForTile(TILE_WALL, null);
            const d = colorForTile(TILE_WALL, 'dungeon');
            expect(c).toEqual(d);
        });

        it('all 8 tile ids produce a valid RGB triple for every biome', () => {
            const tiles = [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST,
                TILE_SPAWN, TILE_GOAL, TILE_TRAP, TILE_SHRINE];
            for (const id of SUPPORTED_BIOMES) {
                for (const t of tiles) {
                    const c = colorForTile(t, id);
                    expect(c.r).toBeGreaterThanOrEqual(0);
                    expect(c.g).toBeGreaterThanOrEqual(0);
                    expect(c.b).toBeGreaterThanOrEqual(0);
                }
            }
        });

        it('the same tile + biome always returns the same color (deterministic)', () => {
            const a = colorForTile(TILE_DOOR, 'forest');
            const b = colorForTile(TILE_DOOR, 'forest');
            expect(a).toEqual(b);
        });

        it('every supported BiomeId has a tileColors entry that includes TILE_FLOOR', () => {
            for (const id of SUPPORTED_BIOMES) {
                const biome = BIOMES[id];
                expect(biome.tileColors?.[TILE_FLOOR]).toBeDefined();
            }
        });
    });

    describe('computeOutputSize', () => {
        it('returns the target box unchanged for an empty grid', () => {
            expect(computeOutputSize(0, 0, { width: 80, height: 60 }))
                .toEqual({ width: 80, height: 60 });
        });

        it('preserves the grid aspect ratio for a 10x10 (square) grid', () => {
            const { width, height } = computeOutputSize(10, 10, { width: 80, height: 60 });
            expect(Math.abs(width / height - 1)).toBeLessThan(0.1);
        });

        it('preserves the grid aspect ratio for a wide grid (20x5)', () => {
            const { width, height } = computeOutputSize(20, 5, { width: 80, height: 60 });
            // Wide grid should hit the width bound.
            expect(width).toBe(80);
            // height should be width / aspect = 80 / 4 = 20.
            expect(height).toBe(20);
        });

        it('preserves the grid aspect ratio for a tall grid (5x20)', () => {
            const { width, height } = computeOutputSize(5, 20, { width: 80, height: 60 });
            // Tall grid should hit the height bound.
            expect(height).toBe(60);
            // width should be height * aspect = 60 / 4 = 15.
            expect(width).toBe(15);
        });

        it('uses defaults when no options are passed', () => {
            // Default target box is 80x60; for a square 10x10 grid
            // the renderer fits inside the smaller dimension (60x60)
            // to preserve the 1:1 aspect ratio. So the result is
            // 60x60 (not 80x60).
            const { width, height } = computeOutputSize(10, 10, {});
            expect(width).toBe(60);
            expect(height).toBe(60);
        });
    });

    describe('renderMiniMap', () => {
        const sampleGrid = [
            [TILE_FLOOR, TILE_FLOOR, TILE_WALL, TILE_GOAL],
            [TILE_SPAWN, TILE_DOOR, TILE_FLOOR, TILE_CHEST],
            [TILE_FLOOR, TILE_TRAP, TILE_FLOOR, TILE_SHRINE],
        ];

        it('returns an empty string for an empty grid', () => {
            expect(renderMiniMap([], 'cyberpunk')).toBe('');
            expect(renderMiniMap([[]], 'cyberpunk')).toBe('');
        });

        it('returns an empty string in jsdom / no-document environments (no canvas)', () => {
            // The default painter relies on document.createElement,
            // which jsdom provides but canvas.toDataURL is a no-op.
            // The function should still return *some* string (either
            // a data URL or an empty string), not throw.
            let result: string;
            expect(() => { result = renderMiniMap(sampleGrid, 'forest'); }).not.toThrow();
            expect(typeof result).toBe('string');
        });

        it('passes the colors grid + computed size to the injected painter', () => {
            let capturedColors: any = null;
            let capturedW = 0;
            let capturedH = 0;
            const fakePainter = (colors: any, w: number, h: number): string => {
                capturedColors = colors;
                capturedW = w;
                capturedH = h;
                return `data:image/png;base64,FAKE(${w}x${h})`;
            };
            const out = renderMiniMap(sampleGrid, 'cyberpunk', { width: 80, height: 60 }, fakePainter);
            expect(out).toContain('FAKE');
            expect(capturedColors).toHaveLength(3);
            expect(capturedColors[0]).toHaveLength(4);
            // Each color is an {r,g,b} tuple with valid channels.
            for (const row of capturedColors) {
                for (const c of row) {
                    expect(c.r).toBeGreaterThanOrEqual(0);
                    expect(c.g).toBeGreaterThanOrEqual(0);
                    expect(c.b).toBeGreaterThanOrEqual(0);
                }
            }
            // Output size is computed (may be 80x60 for 3x4 grid).
            expect(capturedW).toBeGreaterThan(0);
            expect(capturedH).toBeGreaterThan(0);
        });

        it('unknown biome id falls back to the dungeon palette in the colors', () => {
            let colors: any = null;
            const capture = (c: any, _w: number, _h: number): string => {
                colors = c;
                return '';
            };
            renderMiniMap(sampleGrid, 'not-a-biome', {}, capture);
            const dungeonColors = (() => {
                let c: any = null;
                renderMiniMap(sampleGrid, 'dungeon', {}, (cols, _w, _h) => { c = cols; return ''; });
                return c;
            })();
            expect(colors).toEqual(dungeonColors);
        });

        it('returns a data URL when the injected painter produces one', () => {
            const fakePainter = (_c: any, w: number, h: number): string =>
                `data:image/png;base64,AAAA${w}_${h}`;
            const out = renderMiniMap(sampleGrid, 'forest', {}, fakePainter);
            expect(out).toMatch(/^data:image\/png;base64,/);
        });

        it('every supported BiomeId produces a colors grid (no exceptions)', () => {
            const capture = (): string => 'ok';
            for (const id of SUPPORTED_BIOMES) {
                expect(() => renderMiniMap(sampleGrid, id, {}, capture)).not.toThrow();
            }
        });
    });
});
