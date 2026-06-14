/**
 * Round 78 — `SceneScalars` value object.
 *
 * Consolidates the 4 scene-summary scalars that were
 * previously an inline shape repeated in 5+ places:
 *
 *   - `HUD.setLastSceneBlueprint(scalars)` (src/ui/HUD.ts:242)
 *   - `WorldState.updateLastSceneBlueprint(scalars)` (src/world/WorldState.ts:246)
 *   - DM `onDimension` callback (src/main.ts:311) — the
 *     round-77 path
 *   - `enterNewDimension` non-DM path (src/main.ts:650)
 *   - `enterAtom` path (src/main.ts:883)
 *   - `rollbackToLastGood` restore + `syncNpcDisposition`
 *     rebuild from WorldState fields (src/main.ts:1505,
 *     1621)
 *   - Test fixtures in HUD.test.ts (4+ call sites)
 *
 * The shape was already a 4-tuple, so folding it into a
 * named type is mostly a refactor — but it does add:
 *   1. A single source of truth for the field set. A future
 *      contributor adding a 5th scalar (e.g. `lootRarity`)
 *      only needs to extend this interface, not chase 7
 *      type signatures.
 *   2. Two helpers (`ZERO_SCENE_SCALARS`, `cloneSceneScalars`)
 *      used at the 5 call sites so the caller doesn't have
 *      to spell out `{ npcCount: 0, bpm: 0, eventCount: 0,
 *      archetypeHintCount: 0 }` or hand-roll a defensive
 *      clone.
 *   3. A read-only `SceneScalarsSnapshot` alias for places
 *      that want to advertise "I won't mutate this" (e.g.
 *      a `lastSceneBlueprint` getter on WorldState).
 *
 * The `eventChain` field was deliberately NOT folded in
 * here — it was added in round 72/73 as a separate field
 * on WorldState/HUDState (`lastSceneEventChain`) and the
 * call sites that write both at once (main.ts:311, 650,
 * 883) are clearer when the chain and the scalars are
 * passed in two separate arguments. Folding `eventChain`
 * into this type would be a round-79+ decision.
 *
 * Naming: `SceneScalars` (not `SceneMetadata` or
 * `SceneSummary`) because the original main.ts call sites
 * already used the local variable name `sceneScalars` for
 * this exact shape. Renaming the variable would have
 * churned the diff for no semantic gain.
 */
export interface SceneScalars {
    /** How many NPCs the scene will spawn during play. */
    npcCount: number;
    /** The biome's mood-mapped music tempo in BPM. */
    bpm: number;
    /** Length of the synthesized event chain (3..5). */
    eventCount: number;
    /** Count of NPC archetype hints (0 for the WFC DM path). */
    archetypeHintCount: number;
}

/** Read-only view of a `SceneScalars`. */
export type SceneScalarsSnapshot = Readonly<SceneScalars>;

/**
 * A canonical "no data" / placeholder value. The DM
 * `onDimension` path's round-77 helper used to return
 * literal `{ npcCount: 0, bpm: 120, eventCount: 0,
 * archetypeHintCount: 0 }` — but `bpm: 120` was a magic
 * number with no clear meaning. This zero-value is the
 * same shape a fresh HUD/WorldState starts with, and
 * the round-78 callers use it for null/undefined
 * fallbacks.
 */
export const ZERO_SCENE_SCALARS: SceneScalars = {
    npcCount: 0,
    bpm: 0,
    eventCount: 0,
    archetypeHintCount: 0,
};

/**
 * Defensive clone of a `SceneScalars` value. Mirrors the
 * round-72 `setLastSceneEventChain` defensive-clone
 * pattern: callers can hand us a mutable object and we
 * copy it into a fresh object so a post-call mutation
 * doesn't leak into HUD state.
 *
 * The clone is a 4-field literal copy — JSON round-trips
 * would also work but would be 10x slower and would lose
 * type information.
 */
export function cloneSceneScalars(s: SceneScalars): SceneScalars {
    return {
        npcCount: s.npcCount,
        bpm: s.bpm,
        eventCount: s.eventCount,
        archetypeHintCount: s.archetypeHintCount,
    };
}
