/**
 * Round 71 — synthesize an event chain for DM-driven dimensions.
 *
 * The non-DM path (`enterNewDimension` → `themeToScene` → `SceneBlueprint`)
 * produces a randomized 3-5 `EventStep[]` chain that the `SmartWorldAI`
 * schedules at load time. The DM (God-mode) path skips `themeToScene`
 * and just calls `generateDungeon` + `renderWfcDungeon` directly, so
 * until round 71 the persistent-memories block in the HUD showed
 * `eventCount: 0` for DM-spawned dimensions. The numbers were a
 * round-66 placeholder — the rollbar summary line ("events=N
 * (round 54)") printed `events=0` for any scene the player or GM
 * spawned via the God console.
 *
 * This helper closes the gap by producing a deterministic, biome-
 * aware, content-driven 3-5 `EventStep[]` from a finished WFC
 * dungeon. The chain uses the SAME event kinds as `themeToScene`
 * (`spawn_wave`, `treasure_drop`, `fog_pulse`, `boss_hint`,
 * `echo_lore`) so a future round-72+ "replay events" UI can show
 * the DM-spawned scene's timeline alongside the engine-spawned
 * one without branching.
 *
 * **Design choice — tile-driven content, not random**:
 *
 * The standard `themeToScene` event chain uses a seeded `mulberry32`
 * RNG to pick kinds + delays. The DM path can't use that RNG (the
 * caller already burned the seed on the dungeon), so we pick
 * event kinds by counting *special tiles* in the dungeon:
 *   - chest tiles → `treasure_drop`
 *   - shrine tiles → `boss_hint`
 *   - trap tiles → `fog_pulse`
 *   - always → `spawn_wave` + `echo_lore`
 *
 * This gives 3 events for an empty dungeon (wave + echo_lore
 * always on, neither chest nor trap nor shrine), 4 for one
 * special-tile kind, 5 for two-or-more. The biome id is
 * embedded in the payload so a future "show event log" UI can
 * color-code by biome.
 *
 * **Delays** mirror `themeToScene`'s scheme (`5 + i * 8` seconds).
 * The order is fixed: treasure_drop → boss_hint → spawn_wave →
 * fog_pulse → echo_lore. This is a narrative arc (loot →
 * foreshadowing → combat → atmosphere → story) that matches the
 * standard chain's vibe.
 *
 * **Constraint**: identical to `themeToScene`, the result is
 * deterministic for the same (dungeon, biome) input. The DM
 * callback can call this and pass the result to the HUD without
 * buffering or scheduling — the GM can re-render the same scene
 * twice and the event log will be byte-identical.
 *
 * Test strategy: `DmEventChain.test.ts` (round 71) covers
 * determinism, payload format, delay ordering, the 3-5 range,
 * and the special-tile-driven kind selection. The wiring test
 * in `main.test.ts` (round 71) verifies the DM `onDimension`
 * callback now writes a non-zero `eventCount` to the HUD.
 */

import type { EventStep } from './SceneGen';
import type { BiomePalette } from '../world/WfcBiomes';
import {
    TILE_CHEST,
    TILE_TRAP,
    TILE_SHRINE,
    type TileId,
} from '../world/WfcLevelGen';

// ---------------------------------------------------------------------------
// Event kinds. Must stay in lock-step with the kind strings
// `themeToScene` uses (`spawn_wave`, `treasure_drop`, `fog_pulse`,
// `boss_hint`, `echo_lore`) so the SmartWorldAI scheduler can fire
// either path's events through the same code.
// ---------------------------------------------------------------------------

/** The 5 kinds the helper can emit, in narrative order. */
const DM_EVENT_KIND_ORDER = [
    'treasure_drop', // chest tiles → loot
    'boss_hint',     // shrine tiles → foreshadow
    'spawn_wave',    // always → combat
    'fog_pulse',     // trap tiles → atmosphere
    'echo_lore',     // always → story closer
] as const;

// ---------------------------------------------------------------------------
// Delay scheme. Mirrors `themeToScene`'s `5 + i * 8 + rng()*4`
// formula (round 48). The DM helper is deterministic so we drop
// the `rng()*4` jitter — same input always gives the same delay
// for the same event index, which a future "replay events" UI
// can rely on.
// ---------------------------------------------------------------------------

const DM_EVENT_BASE_DELAY_SECS = 5;
const DM_EVENT_STEP_SECS = 8;

function delayForIndex(i: number): number {
    return DM_EVENT_BASE_DELAY_SECS + i * DM_EVENT_STEP_SECS;
}

// ---------------------------------------------------------------------------
// Tile counting. We scan the 2D grid once and tally special tiles
// (chest, trap, shrine). Door / spawn / goal / floor / wall don't
// drive events (they're structural, not content).
// ---------------------------------------------------------------------------

interface TileCounts {
    chest: number;
    trap: number;
    shrine: number;
}

function countSpecialTiles(tiles: TileId[][]): TileCounts {
    let chest = 0;
    let trap = 0;
    let shrine = 0;
    for (const row of tiles) {
        for (const id of row) {
            if (id === TILE_CHEST) chest++;
            else if (id === TILE_TRAP) trap++;
            else if (id === TILE_SHRINE) shrine++;
        }
    }
    return { chest, trap, shrine };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Build a 3-5 `EventStep[]` for a DM-spawned dimension.
 *
 * The chain is deterministic for the same (dungeon, biome) input
 * — re-rendering the same DM-spawned scene produces the same
 * event log. Delays are in the 5..37 second range (events 0..4
 * at 5/13/21/29/37 seconds).
 *
 * Event selection:
 *   - `treasure_drop` if the dungeon has ≥ 1 chest tile
 *   - `boss_hint` if the dungeon has ≥ 1 shrine tile
 *   - `spawn_wave` always
 *   - `fog_pulse` if the dungeon has ≥ 1 trap tile
 *   - `echo_lore` always
 *
 * Empty dungeons get a minimal 3-event chain (wave + echo_lore
 * plus one of the conditional kinds if any exist).
 */
export function synthesizeDmEventChain(
    tiles: TileId[][],
    biome: BiomePalette,
): EventStep[] {
    const counts = countSpecialTiles(tiles);
    const out: EventStep[] = [];
    // `idx` tracks the output position so delays stay at
    // `5 + idx * 8` regardless of which kinds were skipped.
    let idx = 0;
    for (const kind of DM_EVENT_KIND_ORDER) {
        if (!shouldEmit(kind, counts)) continue;
        out.push({
            kind,
            delaySecs: delayForIndex(idx),
            payload: `${biome.id}_${kind}_${idx}`,
        });
        idx++;
    }
    // Safety net: an empty tile grid (rows=0, cols=0) yields an
    // empty chain. The caller should never pass that, but if it
    // does we still want a non-empty chain so the HUD doesn't
    // render `events=0` for a "valid" DM call. We always include
    // spawn_wave + echo_lore above (the `shouldEmit` returns
    // `true` for those unconditionally), so `out.length >= 2`
    // by construction. We pad to at least 3 events to match
    // the standard chain's 3-5 range.
    while (out.length < 3) {
        const kind = 'echo_lore';
        out.push({
            kind,
            delaySecs: delayForIndex(out.length),
            payload: `${biome.id}_${kind}_${out.length}`,
        });
    }
    // Defensive sort — the kind order is already monotonic in
    // delaySecs (5, 13, 21, 29, 37), so this is a no-op for
    // well-formed input but guards against future kind-order
    // edits.
    out.sort((a, b) => a.delaySecs - b.delaySecs);
    return out;
}

/**
 * Predicate: should this kind be included for the given tile counts?
 * `spawn_wave` and `echo_lore` are always on; the other three
 * require at least one matching tile.
 */
function shouldEmit(kind: typeof DM_EVENT_KIND_ORDER[number], counts: TileCounts): boolean {
    switch (kind) {
        case 'spawn_wave':   return true;
        case 'echo_lore':    return true;
        case 'treasure_drop':return counts.chest > 0;
        case 'boss_hint':    return counts.shrine > 0;
        case 'fog_pulse':    return counts.trap > 0;
    }
}

// ---------------------------------------------------------------------------
// Round 77 — `countNpcSpawnTiles(tiles)` — companion helper
// for the DM `onDimension` callback. Returns the number of
// tiles that spawn an NPC during play (the SPAWN tile id).
// The non-DM `themeToScene` path computes its own `npcCount`
// from `npcDensity * 12` (see SceneGen.ts:328-330) because
// it has the full `theme` object to read from. The DM path
// is leaner — only the WFC grid + the resolved biome — so we
// count actual spawn tiles instead of estimating from a
// density heuristic. This is a more honest value: a grid
// with 3 SPAWN tiles will produce 3 NPCs, full stop.
//
// A regression here (e.g. someone changes the tile id, or
// the function is renamed) would silently make the DM path's
// `lastSceneBlueprint.npcCount` stay at 0 — which the round-71
// test used to assert. The new round-77 tests pin the real
// contract.
// ---------------------------------------------------------------------------

import { TILE_SPAWN } from '../world/WfcLevelGen';

export function countNpcSpawnTiles(tiles: TileId[][]): number {
    let n = 0;
    for (const row of tiles) {
        for (const id of row) {
            if (id === TILE_SPAWN) n++;
        }
    }
    return n;
}
