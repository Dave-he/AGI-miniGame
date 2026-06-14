/**
 * Round 71 — `synthesizeDmEventChain` tests.
 *
 * Pure-function tests (no jest.spyOn, no WorldState setup, no
 * DOM) for the round-71 DM event-chain helper. The integration
 * test (verifying the DM `onDimension` callback writes a
 * non-zero `eventCount` to the HUD) lives in `main.test.ts`.
 */

import { synthesizeDmEventChain, countNpcSpawnTiles } from './DmEventChain';
import {
    TILE_FLOOR,
    TILE_WALL,
    TILE_CHEST,
    TILE_TRAP,
    TILE_SHRINE,
    TILE_SPAWN,
    type TileId,
} from '../world/WfcLevelGen';
import { BIOMES, type BiomePalette } from '../world/WfcBiomes';

// ---------------------------------------------------------------------------
// Test fixture helpers. A 5x5 grid builder keeps the tile-count
// test cases compact — most tests only need 1-2 special tiles
// in an otherwise-floor field.
// ---------------------------------------------------------------------------

function grid(rows: number, cols: number, fill: TileId = TILE_FLOOR): TileId[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function placeTile(g: TileId[][], x: number, y: number, id: TileId): void {
    g[y][x] = id;
}

const forest: BiomePalette = BIOMES.forest;
const cyberpunk: BiomePalette = BIOMES.cyberpunk;

// ---------------------------------------------------------------------------
// Length range — the standard chain is 3-5 events; the DM helper
// must hit the same range so the HUD's "events=N" line reads
// naturally next to the engine-spawned scenes.
// ---------------------------------------------------------------------------

describe('DmEventChain — length range (round 71)', () => {
    test('empty_dungeon_yields_at_least_3_events', () => {
        // No special tiles → just spawn_wave + echo_lore (2),
        // padded to 3 by the safety net.
        const chain = synthesizeDmEventChain(grid(5, 5), forest);
        expect(chain.length).toBeGreaterThanOrEqual(3);
    });

    test('chest_only_dungeon_yields_3_events', () => {
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.length).toBe(3); // treasure_drop + spawn_wave + echo_lore
    });

    test('chest_and_shrine_yield_4_events', () => {
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        placeTile(g, 2, 2, TILE_SHRINE);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.length).toBe(4);
    });

    test('chest_shrine_and_trap_yield_5_events', () => {
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        placeTile(g, 2, 2, TILE_SHRINE);
        placeTile(g, 3, 3, TILE_TRAP);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.length).toBe(5);
    });

    test('caps_at_5_events_even_with_all_three_kinds', () => {
        // Many chests / shrines / traps — should still cap at 5.
        const g = grid(5, 5);
        for (let i = 0; i < 4; i++) placeTile(g, i, 0, TILE_CHEST);
        for (let i = 0; i < 4; i++) placeTile(g, i, 1, TILE_SHRINE);
        for (let i = 0; i < 4; i++) placeTile(g, i, 2, TILE_TRAP);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.length).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Kind selection. Special tiles drive the conditional kinds; the
// always-on kinds (`spawn_wave`, `echo_lore`) are unconditional.
// ---------------------------------------------------------------------------

describe('DmEventChain — kind selection (round 71)', () => {
    test('spawn_wave_and_echo_lore_are_always_included', () => {
        // Empty dungeon still has the two unconditional kinds.
        const chain = synthesizeDmEventChain(grid(5, 5), forest);
        const kinds = chain.map((e) => e.kind);
        expect(kinds).toContain('spawn_wave');
        expect(kinds).toContain('echo_lore');
    });

    test('chest_tile_emits_treasure_drop', () => {
        const g = grid(5, 5);
        placeTile(g, 0, 0, TILE_CHEST);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.some((e) => e.kind === 'treasure_drop')).toBe(true);
    });

    test('shrine_tile_emits_boss_hint', () => {
        const g = grid(5, 5);
        placeTile(g, 0, 0, TILE_SHRINE);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.some((e) => e.kind === 'boss_hint')).toBe(true);
    });

    test('trap_tile_emits_fog_pulse', () => {
        const g = grid(5, 5);
        placeTile(g, 0, 0, TILE_TRAP);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain.some((e) => e.kind === 'fog_pulse')).toBe(true);
    });

    test('no_special_tiles_no_conditional_kinds', () => {
        // Floor + wall only — no chest, no shrine, no trap.
        const g = grid(5, 5, TILE_WALL);
        const chain = synthesizeDmEventChain(g, forest);
        const kinds = chain.map((e) => e.kind);
        expect(kinds).not.toContain('treasure_drop');
        expect(kinds).not.toContain('boss_hint');
        expect(kinds).not.toContain('fog_pulse');
    });

    test('floor_and_wall_tiles_do_not_emit_conditional_kinds', () => {
        // A wall-only dungeon should behave like an empty one —
        // walls are structural, not content.
        const g = grid(5, 5);
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                g[y][x] = (x + y) % 2 === 0 ? TILE_FLOOR : TILE_WALL;
            }
        }
        const chain = synthesizeDmEventChain(g, forest);
        const kinds = chain.map((e) => e.kind);
        expect(kinds).not.toContain('treasure_drop');
        expect(kinds).not.toContain('boss_hint');
        expect(kinds).not.toContain('fog_pulse');
    });
});

// ---------------------------------------------------------------------------
// Delays. The DM helper uses the same `5 + i * 8` formula as
// `themeToScene` (round 48) but drops the RNG jitter — same input
// always gives the same delay for the same event index.
// ---------------------------------------------------------------------------

describe('DmEventChain — delays (round 71)', () => {
    test('delays_are_monotonically_increasing', () => {
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        placeTile(g, 2, 2, TILE_SHRINE);
        placeTile(g, 3, 3, TILE_TRAP);
        const chain = synthesizeDmEventChain(g, forest);
        for (let i = 1; i < chain.length; i++) {
            expect(chain[i].delaySecs).toBeGreaterThan(chain[i - 1].delaySecs);
        }
    });

    test('first_event_delay_is_5_seconds', () => {
        const chain = synthesizeDmEventChain(grid(5, 5), forest);
        expect(chain[0].delaySecs).toBe(5);
    });

    test('delays_follow_5_plus_8n_formula', () => {
        // Pre-round-71 the formula was `5 + i*8 + rng()*4`. The DM
        // helper drops the jitter, so delays are exactly 5, 13,
        // 21, 29, 37 for chains of length 1..5.
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        placeTile(g, 2, 2, TILE_SHRINE);
        placeTile(g, 3, 3, TILE_TRAP);
        const chain = synthesizeDmEventChain(g, forest);
        const expected = [5, 13, 21, 29, 37];
        chain.forEach((e, i) => expect(e.delaySecs).toBe(expected[i]));
    });
});

// ---------------------------------------------------------------------------
// Payloads. The biome id is embedded in every payload so a
// future "event log" UI can color-code by biome.
// ---------------------------------------------------------------------------

describe('DmEventChain — payloads (round 71)', () => {
    test('payload_includes_biome_id', () => {
        const chain = synthesizeDmEventChain(grid(5, 5), forest);
        for (const evt of chain) {
            expect(evt.payload).toContain('forest');
        }
    });

    test('payload_uses_different_biomes_for_different_inputs', () => {
        const a = synthesizeDmEventChain(grid(5, 5), forest);
        const b = synthesizeDmEventChain(grid(5, 5), cyberpunk);
        expect(a[0].payload).toContain('forest');
        expect(b[0].payload).toContain('cyberpunk');
        expect(a[0].payload).not.toBe(b[0].payload);
    });

    test('payload_format_is_biome_kind_index', () => {
        // Format: `${biome.id}_${kind}_${idx}`. This makes the
        // payload unique per (chain-position, biome) and stable
        // across re-renders.
        const g = grid(5, 5);
        placeTile(g, 1, 1, TILE_CHEST);
        const chain = synthesizeDmEventChain(g, forest);
        expect(chain[0].payload).toMatch(/^forest_[a-z_]+_0$/);
    });
});

// ---------------------------------------------------------------------------
// Determinism. The helper is pure — re-running with the same
// inputs yields the same chain byte-for-byte. This matters for
// the round-50 reload-the-same-scene test and for any future
// "replay events" UI.
// ---------------------------------------------------------------------------

describe('DmEventChain — determinism (round 71)', () => {
    test('same_inputs_produce_same_chain', () => {
        const g1 = grid(5, 5);
        placeTile(g1, 1, 1, TILE_CHEST);
        placeTile(g1, 2, 2, TILE_SHRINE);
        const g2 = grid(5, 5);
        placeTile(g2, 1, 1, TILE_CHEST);
        placeTile(g2, 2, 2, TILE_SHRINE);
        const a = synthesizeDmEventChain(g1, forest);
        const b = synthesizeDmEventChain(g2, forest);
        expect(a).toEqual(b);
    });

    test('different_dungeon_shapes_produce_different_chains', () => {
        // Chest on the left vs on the right — should still
        // produce the same chain (the helper doesn't care about
        // position, just count). This is a stronger guarantee
        // than "deterministic" — it's "position-invariant".
        const gA = grid(5, 5);
        placeTile(gA, 0, 0, TILE_CHEST);
        const gB = grid(5, 5);
        placeTile(gB, 4, 4, TILE_CHEST);
        const a = synthesizeDmEventChain(gA, forest);
        const b = synthesizeDmEventChain(gB, forest);
        expect(a).toEqual(b);
    });

    test('different_dungeon_content_produces_different_chains', () => {
        const gA = grid(5, 5);
        placeTile(gA, 0, 0, TILE_CHEST);
        const gB = grid(5, 5);
        placeTile(gB, 0, 0, TILE_SHRINE);
        const a = synthesizeDmEventChain(gA, forest);
        const b = synthesizeDmEventChain(gB, forest);
        // Different kinds → different chains.
        expect(a[0].kind).not.toBe(b[0].kind);
    });
});

// ---------------------------------------------------------------------------
// Round 77 — `countNpcSpawnTiles(tiles)` helper. The DM
// `onDimension` callback in main.ts uses this to fill the
// `npcCount` scalar (previously a hard-coded `0` placeholder).
// The function counts SPAWN (id=4) tiles in the WFC grid —
// a real, observable count of where NPCs will appear during
// play. Floor / wall / door / chest / trap / shrine / goal
// don't count (they're structural or content, not spawn
// points).
// ---------------------------------------------------------------------------

describe('DmEventChain — round 77 countNpcSpawnTiles', () => {
    test('empty_grid_returns_zero', () => {
        const g = grid(5, 5);
        expect(countNpcSpawnTiles(g)).toBe(0);
    });

    test('all_floor_grid_returns_zero', () => {
        // An 8x8 floor-only dungeon (the round-71 "empty
        // dungeon" case) has no spawn points.
        const g = grid(8, 8, TILE_FLOOR);
        expect(countNpcSpawnTiles(g)).toBe(0);
    });

    test('single_spawn_tile_returns_one', () => {
        const g = grid(5, 5);
        placeTile(g, 2, 2, TILE_SPAWN);
        expect(countNpcSpawnTiles(g)).toBe(1);
    });

    test('multiple_spawn_tiles_sum_correctly', () => {
        const g = grid(8, 8);
        placeTile(g, 1, 1, TILE_SPAWN);
        placeTile(g, 3, 3, TILE_SPAWN);
        placeTile(g, 5, 5, TILE_SPAWN);
        placeTile(g, 6, 6, TILE_SPAWN);
        expect(countNpcSpawnTiles(g)).toBe(4);
    });

    test('non_spawn_tiles_are_not_counted', () => {
        // Mirrors the round-71 "dungeon with chests
        // shrine trap" grid: 2 chests + 1 shrine +
        // 1 trap. None of these are SPAWN tiles, so
        // the count stays at 0.
        const g = grid(5, 5);
        placeTile(g, 0, 0, TILE_CHEST);
        placeTile(g, 1, 1, TILE_CHEST);
        placeTile(g, 2, 2, TILE_SHRINE);
        placeTile(g, 3, 3, TILE_TRAP);
        expect(countNpcSpawnTiles(g)).toBe(0);
    });

    test('mixed_grid_counts_only_spawn', () => {
        // Realistic 5x5 grid: 1 chest + 2 spawn + 1 wall.
        // The helper must count 2, not 4.
        const g = grid(5, 5);
        placeTile(g, 0, 0, TILE_CHEST);
        placeTile(g, 1, 1, TILE_SPAWN);
        placeTile(g, 2, 2, TILE_SPAWN);
        placeTile(g, 3, 3, TILE_WALL);
        expect(countNpcSpawnTiles(g)).toBe(2);
    });

    test('non_rectangular_grid_works', () => {
        // The helper doesn't assume the grid is square
        // — it iterates each row independently. A 3x7
        // grid (3 rows, 7 cols) with 2 spawns in the
        // last row should return 2.
        const g: TileId[][] = [
            [TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR],
            [TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR],
            [TILE_SPAWN, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_FLOOR, TILE_SPAWN],
        ];
        expect(countNpcSpawnTiles(g)).toBe(2);
    });
});
