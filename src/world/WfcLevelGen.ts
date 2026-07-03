/**
 * WfcLevelGen — a tiny Wave Function Collapse implementation for 2D
 * dungeon / overworld tiles. The PRD §2.2.B says "关卡设计：通过 AI 算法
 * (WFC / 启发式搜索) 自动生成随机但合理的关卡、地图布局和怪物波次。"
 *
 * This module ships the WFC core: tile set, adjacency rules, and a
 * collapse loop that respects border constraints. Output is a 2D grid
 * of tile indices that the 3D scene can use to place geometry.
 */

export type TileId = number;

export interface TileDefinition {
    id: TileId;
    name: string;
    /** Weight when picking a random allowed tile (higher = more common). */
    weight: number;
    /** Right, Top, Left, Bottom neighbour tile ids that are allowed. */
    allowed: [TileId[], TileId[], TileId[], TileId[]];
    /** Whether a player can walk on this tile. */
    walkable: boolean;
    /** Visual color (for the 2D minimap). */
    color: string;
    /** Optional height hint for the 3D scene (1.0 = floor, 2.0 = wall, etc). */
    height: number;
}

export const TILE_FLOOR: TileId = 0;
export const TILE_WALL:  TileId = 1;
export const TILE_DOOR:  TileId = 2;
export const TILE_CHEST: TileId = 3;
export const TILE_SPAWN: TileId = 4;
export const TILE_GOAL:  TileId = 5;
export const TILE_TRAP:  TileId = 6;
export const TILE_SHRINE:TileId = 7;

export const DEFAULT_TILES: TileDefinition[] = [
    { id: TILE_FLOOR, name: 'floor', weight: 6, walkable: true,  color: '#1d2840', height: 0.1,
      allowed: [[TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL],
                [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL],
                [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL],
                [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL]] },
    { id: TILE_WALL,  name: 'wall',  weight: 3, walkable: false, color: '#0a0e1d', height: 2.0,
      allowed: [[TILE_FLOOR, TILE_DOOR, TILE_CHEST, TILE_GOAL],
                [TILE_WALL, TILE_FLOOR, TILE_DOOR],
                [TILE_FLOOR, TILE_DOOR, TILE_CHEST, TILE_GOAL],
                [TILE_WALL, TILE_FLOOR, TILE_DOOR]] },
    { id: TILE_DOOR,  name: 'door',  weight: 1, walkable: true,  color: '#a06cd5', height: 1.5,
      allowed: [[TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL],
                [TILE_WALL, TILE_DOOR, TILE_FLOOR],
                [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL],
                [TILE_WALL, TILE_DOOR, TILE_FLOOR]] },
    { id: TILE_CHEST, name: 'chest', weight: 1, walkable: true,  color: '#ffd166', height: 0.6,
      allowed: [[TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST],
                [TILE_FLOOR, TILE_WALL],
                [TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST],
                [TILE_FLOOR, TILE_WALL]] },
    { id: TILE_SPAWN, name: 'spawn', weight: 0, walkable: true,  color: '#06d6a0', height: 0.1,
      allowed: [[TILE_FLOOR, TILE_SPAWN],
                [TILE_FLOOR, TILE_SPAWN],
                [TILE_FLOOR, TILE_SPAWN],
                [TILE_FLOOR, TILE_SPAWN]] },
    { id: TILE_GOAL,  name: 'goal',  weight: 0, walkable: true,  color: '#ff66cc', height: 0.1,
      allowed: [[TILE_FLOOR, TILE_GOAL],
                [TILE_FLOOR, TILE_GOAL],
                [TILE_FLOOR, TILE_GOAL],
                [TILE_FLOOR, TILE_GOAL]] },
    { id: TILE_TRAP,  name: 'trap',  weight: 1, walkable: true,  color: '#ff4d4d', height: 0.15,
      allowed: [[TILE_FLOOR, TILE_TRAP],
                [TILE_FLOOR, TILE_TRAP],
                [TILE_FLOOR, TILE_TRAP],
                [TILE_FLOOR, TILE_TRAP]] },
    { id: TILE_SHRINE,name: 'shrine',weight: 1, walkable: true,  color: '#9c89ff', height: 1.2,
      allowed: [[TILE_FLOOR, TILE_SHRINE, TILE_WALL],
                [TILE_FLOOR, TILE_SHRINE, TILE_WALL],
                [TILE_FLOOR, TILE_SHRINE, TILE_WALL],
                [TILE_FLOOR, TILE_SHRINE, TILE_WALL]] },
];

export type WfcCell = {
    /** Set of tile ids this cell could still be. */
    options: Set<TileId>;
    collapsed: TileId | null;
};

export interface WfcConfig {
    width: number;
    height: number;
    tiles: TileDefinition[];
    seed: number;
    /** Force SPAWN at this (x, y). */
    spawn?: { x: number; y: number };
    /** Force GOAL at this (x, y). Defaults to (width-1, height-1). */
    goal?:  { x: number; y: number };
}

export class WfcLevelGen {
    private cfg: WfcConfig;
    private grid: WfcCell[][];
    private rng: () => number;

    constructor(cfg: WfcConfig) {
        this.cfg = cfg;
        this.rng = this.makeRng(cfg.seed);
        this.grid = [];
        for (let y = 0; y < cfg.height; y++) {
            const row: WfcCell[] = [];
            for (let x = 0; x < cfg.width; x++) {
                row.push({ options: new Set(cfg.tiles.map(t => t.id)), collapsed: null });
            }
            this.grid.push(row);
        }
        if (cfg.spawn) this.pinTile(cfg.spawn.x, cfg.spawn.y, TILE_SPAWN);
        if (cfg.goal)  this.pinTile(cfg.goal.x,  cfg.goal.y,  TILE_GOAL);
    }

    generate(): { tiles: TileId[][]; success: boolean } {
        let safety = this.cfg.width * this.cfg.height * 4;
        while (safety-- > 0) {
            const next = this.lowestEntropy();
            if (!next) break; // all collapsed
            this.collapse(next.x, next.y);
            if (!this.propagate()) {
                // Restart on contradiction.
                this.restart();
                safety -= 4;
            }
        }
        const tiles: TileId[][] = [];
        for (let y = 0; y < this.cfg.height; y++) {
            const row: TileId[] = [];
            for (let x = 0; x < this.cfg.width; x++) {
                const cell = this.grid[y][x];
                row.push(cell.collapsed ?? this.firstAllowed(cell));
            }
            tiles.push(row);
        }
        return { tiles, success: safety > 0 };
    }

    private restart(): void {
        for (let y = 0; y < this.cfg.height; y++) {
            for (let x = 0; x < this.cfg.width; x++) {
                this.grid[y][x] = { options: new Set(this.cfg.tiles.map(t => t.id)), collapsed: null };
            }
        }
        if (this.cfg.spawn) this.pinTile(this.cfg.spawn.x, this.cfg.spawn.y, TILE_SPAWN);
        if (this.cfg.goal)  this.pinTile(this.cfg.goal.x,  this.cfg.goal.y,  TILE_GOAL);
    }

    private pinTile(x: number, y: number, tile: TileId): void {
        if (x < 0 || x >= this.cfg.width || y < 0 || y >= this.cfg.height) return;
        this.grid[y][x] = { options: new Set([tile]), collapsed: tile };
    }

    private lowestEntropy(): { x: number; y: number } | null {
        let best: { x: number; y: number; n: number } | null = null;
        for (let y = 0; y < this.cfg.height; y++) {
            for (let x = 0; x < this.cfg.width; x++) {
                const cell = this.grid[y][x];
                if (cell.collapsed !== null) continue;
                const n = cell.options.size;
                if (n === 0) return null;
                if (best === null || n < best.n) {
                    best = { x, y, n };
                }
            }
        }
        if (!best) return null;
        return { x: best.x, y: best.y };
    }

    private collapse(x: number, y: number): void {
        const cell = this.grid[y][x];
        const weights: Array<[TileId, number]> = [];
        for (const id of cell.options) {
            const t = this.cfg.tiles.find(t => t.id === id);
            if (t) weights.push([id, t.weight + 0.01]);
        }
        if (weights.length === 0) {
            cell.collapsed = this.firstAllowed(cell);
            return;
        }
        const total = weights.reduce((a, [, w]) => a + w, 0);
        let pick = this.rng() * total;
        for (const [id, w] of weights) {
            pick -= w;
            if (pick <= 0) {
                cell.collapsed = id;
                cell.options = new Set([id]);
                return;
            }
        }
        cell.collapsed = weights[0][0];
        cell.options = new Set([cell.collapsed]);
    }

    private propagate(): boolean {
        let changed = true;
        let safety = this.cfg.width * this.cfg.height * 4;
        while (changed && safety-- > 0) {
            changed = false;
            for (let y = 0; y < this.cfg.height; y++) {
                for (let x = 0; x < this.cfg.width; x++) {
                    const cell = this.grid[y][x];
                    if (cell.collapsed !== null) continue;
                    const allowed = this.intersectNeighbourOptions(x, y);
                    if (allowed.size < cell.options.size) {
                        cell.options = allowed;
                        changed = true;
                    }
                    if (cell.options.size === 0) return false;
                }
            }
        }
        return true;
    }

    private intersectNeighbourOptions(x: number, y: number): Set<TileId> {
        const result = new Set<TileId>();
        const dirs: Array<[number, number, 0 | 1 | 2 | 3]> = [
            [ 1,  0, 0], // right neighbour sees my RIGHT allowed set
            [ 0, -1, 1], // top neighbour sees my TOP allowed set
            [-1,  0, 2], // left neighbour sees my LEFT allowed set
            [ 0,  1, 3], // bottom neighbour sees my BOTTOM allowed set
        ];
        for (const [dx, dy, side] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= this.cfg.width || ny < 0 || ny >= this.cfg.height) {
                // Border: any tile that allows the border is OK
                for (const id of this.grid[y][x].options) {
                    const t = this.cfg.tiles.find(t => t.id === id);
                    if (!t) continue;
                    if (t.allowed[side].length > 0) result.add(id);
                }
                continue;
            }
            const neighbour = this.grid[ny][nx];
            const allowedHere = new Set<TileId>();
            for (const id of this.grid[y][x].options) {
                const t = this.cfg.tiles.find(t => t.id === id);
                if (!t) continue;
                if (t.allowed[side].length > 0) allowedHere.add(id);
            }
            // The neighbour is only compatible if IT can be one of those tiles
            // AND the original tile's allowed set for the side overlaps with neighbour options.
            for (const id of allowedHere) {
                if (neighbour.options.has(id)) {
                    const t = this.cfg.tiles.find(t => t.id === id);
                    if (!t) continue;
                    const reverseSide = (side + 2) % 4 as 0 | 1 | 2 | 3;
                    if (t.allowed[reverseSide].some(rid => neighbour.options.has(rid))) {
                        result.add(id);
                    }
                }
            }
        }
        return result;
    }

    private firstAllowed(cell: WfcCell): TileId {
        if (cell.options.size > 0) {
            const id = cell.options.values().next().value as TileId;
            return id;
        }
        return TILE_FLOOR;
    }

    private makeRng(seed: number): () => number {
        let s = seed % 233280;
        if (s <= 0) s += 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}

/** Convenience: a fresh dungeon of the given size with SPAWN at (0,0) and GOAL at (w-1, h-1). */
export function generateDungeon(width: number, height: number, seed: number) {
    const result = new WfcLevelGen({
        width,
        height,
        tiles: DEFAULT_TILES,
        seed,
        spawn: { x: 0, y: 0 },
        goal:  { x: width - 1, y: height - 1 },
    }).generate();
    // Post-process: ensure a walkable corridor from SPAWN to GOAL. WFC is
    // not guaranteed to keep them connected (the constraints are local),
    // so we carve a Manhattan path through any WALL tiles.
    carveCorridor(result.tiles, 0, 0, width - 1, height - 1);
    return result;
}

/**
 * Round 24 — overload that accepts a per-tile weight override. The
 * caller passes an 8-entry array indexed `[FLOOR, WALL, DOOR, CHEST,
 * SPAWN, GOAL, TRAP, SHRINE]`. The `DEFAULT_TILES` are deep-cloned
 * and the supplied weights replace the corresponding `weight` field.
 *
 * Mirrors the `theme_to_scene` engine output — when the content AI
 * picks `visualStyle=desert`, it returns `[6,2,1,1,0,0,4,0]`, which
 * makes TRAP far more common in the dungeon. The biome palette is
 * applied later by `SceneManager.renderWfcDungeon(grid, size, biome)`.
 */
export function generateDungeonWithWeights(
    width: number,
    height: number,
    seed: number,
    weights: readonly number[],
) {
    if (weights.length !== DEFAULT_TILES.length) {
        throw new Error(
            `weights must have ${DEFAULT_TILES.length} entries ` +
            `(FLOOR/WALL/DOOR/CHEST/SPAWN/GOAL/TRAP/SHRINE), got ${weights.length}`,
        );
    }
    const tiles: TileDefinition[] = DEFAULT_TILES.map((t, i) => ({
        ...t,
        weight: weights[i] ?? t.weight,
    }));
    const result = new WfcLevelGen({
        width,
        height,
        tiles,
        seed,
        spawn: { x: 0, y: 0 },
        goal:  { x: width - 1, y: height - 1 },
    }).generate();
    carveCorridor(result.tiles, 0, 0, width - 1, height - 1);
    return result;
}

function carveCorridor(tiles: TileId[][], x0: number, y0: number, x1: number, y1: number): void {
    let x = x0, y = y0;
    while (x !== x1) {
        x += x < x1 ? 1 : -1;
        const t = tiles[y][x];
        if (t === TILE_WALL) tiles[y][x] = TILE_FLOOR;
    }
    while (y !== y1) {
        y += y < y1 ? 1 : -1;
        const t = tiles[y][x];
        if (t === TILE_WALL) tiles[y][x] = TILE_FLOOR;
    }
}
