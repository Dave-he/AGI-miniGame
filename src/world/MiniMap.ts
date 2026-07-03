/**
 * MiniMap — round 63 2D top-down thumbnail renderer.
 *
 * Renders a WFC dungeon grid (the round-24/50 output) to a
 * small 2D canvas using the biome's palette colors, then
 * exports the result as a PNG data URL. The data URL is
 * small (~1-3KB) and persists in the WorldState across
 * save/load so the HUD can show "你刚才在 #forest" with an
 * actual visual preview.
 *
 * Pure data + a small factory. The actual canvas painting
 * uses the standard Canvas 2D context (no Three.js / WebGL),
 * so the renderer is testable in jsdom by stubbing the
 * context methods.
 */

import type { TileId } from './WfcLevelGen';
import { TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL, TILE_TRAP, TILE_SHRINE } from './WfcLevelGen';
import type { BiomeId } from './WfcBiomes';
import { BIOMES } from './WfcBiomes';

export interface MiniMapOptions {
    /** Output image width in pixels. Default 80. */
    width?: number;
    /** Output image height in pixels. Default 60. */
    height?: number;
    /** Background fill color when biome is unknown. Default '#0a0a0a'. */
    bgFallback?: string;
    /** Whether to draw a 1px border around the map. Default true. */
    drawBorder?: boolean;
}

const DEFAULTS = {
    width: 80,
    height: 60,
    bgFallback: '#0a0a0a',
    drawBorder: true,
};

/**
 * Hex string -> {r,g,b} tuple. Used to convert the biome's
 * tileColors (hex strings) into the RGB triplet the canvas
 * context expects. Returns the fallback color for malformed
 * input so a corrupted config never crashes the renderer.
 */
function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
    if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return fallback;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
    return { r, g, b };
}

/**
 * Pure color-derivation helper. Given a tile id and a biome,
 * return the RGB triple that should be painted for that tile.
 * Exported so tests can verify the palette mapping without
 * needing a canvas.
 */
export function colorForTile(tile: TileId, biomeId: BiomeId | string | null): { r: number; g: number; b: number } {
    const fallback = { r: 0x0a, g: 0x0a, b: 0x0a };
    // Resolve the palette. Unknown / null biomes fall back to
    // the dungeon palette (the "default" look) so a corrupted
    // config still produces a readable thumbnail.
    const palette = (biomeId && biomeId in BIOMES)
        ? BIOMES[biomeId as BiomeId].tileColors
        : BIOMES.dungeon.tileColors;
    const tileToHex: Record<number, string | undefined> = {
        [TILE_FLOOR]:  palette?.[TILE_FLOOR],
        [TILE_WALL]:   palette?.[TILE_WALL],
        [TILE_DOOR]:   palette?.[TILE_DOOR],
        [TILE_CHEST]:  palette?.[TILE_CHEST],
        [TILE_SPAWN]:  palette?.[TILE_SPAWN],
        [TILE_GOAL]:   palette?.[TILE_GOAL],
        [TILE_TRAP]:   palette?.[TILE_TRAP],
        [TILE_SHRINE]: palette?.[TILE_SHRINE],
    };
    const hex = tileToHex[tile] ?? '#1d2840';
    return hexToRgb(hex, fallback);
}

/**
 * Compute the output width / height in pixels for a given
 * grid + options. Pure helper so tests can verify the aspect
 * ratio is preserved.
 */
export function computeOutputSize(
    gridWidth: number,
    gridHeight: number,
    opts: { width?: number; height?: number },
): { width: number; height: number } {
    const targetW = opts.width ?? DEFAULTS.width;
    const targetH = opts.height ?? DEFAULTS.height;
    if (gridWidth <= 0 || gridHeight <= 0) {
        return { width: targetW, height: targetH };
    }
    // Preserve the grid's aspect ratio by fitting inside the
    // target box, leaving a 1px margin on each side if drawBorder.
    const aspect = gridWidth / gridHeight;
    const targetAspect = targetW / targetH;
    if (aspect > targetAspect) {
        // Grid is wider than the target box — match width, scale height.
        const h = Math.max(1, Math.round(targetW / aspect));
        return { width: targetW, height: h };
    } else {
        const w = Math.max(1, Math.round(targetH * aspect));
        return { width: w, height: targetH };
    }
}

/**
 * Render a WFC grid to a PNG data URL string.
 *
 * @param grid     2D array of tile ids (row-major, [y][x])
 * @param biomeId  Optional biome id; affects the per-tile colors
 * @param options  MiniMapOptions (width, height, ...)
 * @param painter  Optional dependency injection for the canvas
 *                 painting. Defaults to a real OffscreenCanvas
 *                 (when available) or a stub for tests. The
 *                 painter signature is `(grid, w, h, colors)
 *                 => dataUrl` so tests can verify the call args
 *                 without spinning up a canvas.
 */
export function renderMiniMap(
    grid: TileId[][],
    biomeId: BiomeId | string | null,
    options: MiniMapOptions = {},
    painter?: (colors: { r: number; g: number; b: number }[][], w: number, h: number) => string,
): string {
    const opts = { ...DEFAULTS, ...options };
    if (!Array.isArray(grid) || grid.length === 0) {
        return '';
    }
    const gridW = grid[0].length;
    const gridH = grid.length;
    if (gridW === 0) return '';
    const { width: outW, height: outH } = computeOutputSize(gridW, gridH, opts);
    // Build the per-cell color grid. Each cell is one RGB triple.
    const colors: { r: number; g: number; b: number }[][] = [];
    for (let y = 0; y < gridH; y++) {
        const row: { r: number; g: number; b: number }[] = [];
        for (let x = 0; x < gridW; x++) {
            const tile = grid[y][x];
            row.push(colorForTile(tile, biomeId));
        }
        colors.push(row);
    }
    if (painter) {
        return painter(colors, outW, outH);
    }
    // Default painter: use the standard Canvas 2D context.
    // In jsdom (tests) this is a no-op stub that returns ''.
    if (typeof document === 'undefined') return '';
    try {
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        // Background fill
        ctx.fillStyle = opts.bgFallback;
        ctx.fillRect(0, 0, outW, outH);
        // Cell dimensions (preserve grid aspect ratio inside the box)
        const cellW = outW / gridW;
        const cellH = outH / gridH;
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const c = colors[y][x];
                ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
                ctx.fillRect(
                    Math.floor(x * cellW),
                    Math.floor(y * cellH),
                    Math.ceil(cellW) + 1,
                    Math.ceil(cellH) + 1,
                );
            }
        }
        // Border
        if (opts.drawBorder) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, 0.5, outW - 1, outH - 1);
        }
        return canvas.toDataURL('image/png');
    } catch {
        return '';
    }
}

/**
 * The canonical supported biome ids for minimap color lookup.
 * Mirrors `BiomeAtmosphere.SUPPORTED_BIOMES` (kept as a literal
 * here so the MiniMap doesn't depend on the scene module).
 */
export const SUPPORTED_BIOMES: readonly BiomeId[] = [
    'cyberpunk', 'forest', 'desert', 'ice', 'space', 'dungeon',
];
