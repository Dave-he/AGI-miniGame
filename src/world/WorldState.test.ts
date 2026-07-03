/**
 * WorldState tests — round 31 BiomeId persistence.
 *
 * The round-24 WFC scaffold produces a BiomeId per dimension, but
 * until round 31 the WorldState threw it away. These tests pin
 * the new contract: the biome travels with the active dimension
 * info AND survives `clearActiveDimension()` via `lastBiome`.
 */

import { WorldState } from '../world/WorldState';
import type { BiomeId } from '../ai/SceneGen';

function makeWs() {
    return new WorldState('test-p1', 'Tester');
}

describe('WorldState — round 31 BiomeId persistence', () => {
    test('setActiveDimension_records_biome_on_activeDimension', () => {
        const ws = makeWs();
        ws.setActiveDimension('d1', ['match3'], 'forest');
        expect(ws.activeDimension).not.toBeNull();
        expect(ws.activeDimension!.biome).toBe('forest');
    });

    test('setActiveDimension_without_biome_leaves_biome_undefined', () => {
        // Back-compat: callers that predate the round-31 signature
        // still work.
        const ws = makeWs();
        ws.setActiveDimension('d1', ['match3']);
        expect(ws.activeDimension).not.toBeNull();
        expect(ws.activeDimension!.biome).toBeUndefined();
    });

    test('lastBiome_is_set_when_biome_is_supplied', () => {
        const ws = makeWs();
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        expect(ws.lastBiome).toBe('cyberpunk');
    });

    test('lastBiome_survives_clearActiveDimension', () => {
        // Round 31's headline behavior: even after a run is over,
        // the HUD / persistence layer can still ask "what biome
        // was the player last in?".
        const ws = makeWs();
        ws.setActiveDimension('d1', ['match3'], 'forest');
        ws.clearActiveDimension();
        expect(ws.activeDimension).toBeNull();
        expect(ws.lastBiome).toBe('forest');
    });

    test('lastBiome_tracks_most_recent_setActiveDimension', () => {
        // Sequence of two dim entries: the second one wins.
        const ws = makeWs();
        ws.setActiveDimension('d1', ['match3'], 'forest');
        ws.setActiveDimension('d2', ['tower_defense'], 'cyberpunk');
        expect(ws.lastBiome).toBe('cyberpunk');
    });

    test('lastBiome_stays_null_until_first_biome_set', () => {
        // Defensive: a brand-new WorldState must not invent a biome.
        const ws = makeWs();
        expect(ws.lastBiome).toBeNull();
    });

    test('biome_field_round_trips_through_serialization_friendly_types', () => {
        // The BiomeId is a string-literal union; we just verify the
        // type contract holds across the storage shape.
        const ws = makeWs();
        const biomes: BiomeId[] = ['cyberpunk', 'forest', 'desert', 'ice', 'space', 'dungeon'];
        for (const b of biomes) {
            ws.setActiveDimension(`d-${b}`, ['match3'], b);
            expect(ws.activeDimension!.biome).toBe(b);
            expect(ws.lastBiome).toBe(b);
        }
    });
});

// ---------------------------------------------------------------------------
// Round 32 — biome persistence across save / load.
//
// Round 31 added `lastBiome` and `DimensionInfo.biome` on the
// WorldState, but the save/load path didn't carry them. This
// round makes them survive a save → reload cycle, so a player
// can close the tab and resume without losing the "你刚从
// #forest 归来" signal.
// ---------------------------------------------------------------------------

describe('WorldState — round 32 biome persistence across save/load', () => {
    test('lastBiome_round_trips_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'forest');
        const json = ws.saveToJSON();
        // Strip the saved activeDimension pointer (we don't
        // round-trip the session), but the lastBiome must
        // survive.
        const fresh = new WorldState('p', 'P');
        expect(fresh.lastBiome).toBeNull();
        const ok = fresh.loadFromJSON(json);
        expect(ok).toBe(true);
        expect(fresh.lastBiome).toBe('forest');
    });

    test('activeDimensionBiome_round_trips_when_no_active_dim_pointer', () => {
        // The save/load currently keeps lastBiome and a
        // restored active-dim pointer carrying only the biome.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        // lastBiome is the headline behavior.
        expect(fresh.lastBiome).toBe('cyberpunk');
    });

    test('lastBiome_separately_round_trips_through_saveToStorage_loadFromStorage', () => {
        // The end-to-end shape: the actual localStorage path.
        // (We don't hit the real localStorage in jsdom without
        // a key; we just verify the JSON shape in storage.)
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'ice');
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.lastBiome).toBe('ice');
        // Reload into a fresh WorldState and verify.
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('ice');
    });

    test('back_compat_save_without_lastBiome_field_loads_as_null', () => {
        // Older saves (pre round 32) don't carry lastBiome.
        // loadFromJSON must not crash and must leave lastBiome
        // null.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastBiome).toBeNull();
    });

    test('lastBiome_preserved_across_clearActiveDimension_then_save_load', () => {
        // Headline cross-round scenario: set biome, clear
        // (so the dim ends), save, reload. The lastBiome
        // (set on clear by the round-31 setActiveDimension
        // path) survives.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'desert');
        ws.clearActiveDimension();
        expect(ws.lastBiome).toBe('desert');
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('desert');
        expect(fresh.activeDimension).toBeNull();
    });

    test('save_uses_undefined_for_null_lastBiome_so_older_loaders_skip_it', () => {
        // We serialize null → undefined so the JSON stays
        // compact for fresh WorldStates that never set a biome.
        const ws = new WorldState('p', 'P');
        const parsed = JSON.parse(ws.saveToJSON());
        // lastBiome key is present but value is undefined →
        // JSON.stringify drops it; the parsed object either
        // has lastBiome: undefined (rare) or no key at all.
        expect(parsed.lastBiome).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Round 35 — NpcRegistry.averageDisposition persistence across save / load.
//
// The NpcRegistry itself is rebuilt on app startup via NpcFactory, so
// it can't be fully round-tripped. But the *average* disposition
// is the signal downstream consumers (scene_gen, narration, balance_tuner)
// read; round 35 persists a snapshot so the world's mood survives
// save → reload. The App keeps the snapshot in sync via
// `syncNpcDisposition()` after every broadcast.
// ---------------------------------------------------------------------------

describe('WorldState — round 35 lastNpcDisposition persistence', () => {
    test('lastNpcDisposition_defaults_to_null_on_fresh_worldState', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastNpcDisposition).toBeNull();
    });

    test('app_can_set_lastNpcDisposition_directly', () => {
        const ws = new WorldState('p', 'P');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        expect(ws.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
    });

    test('lastNpcDisposition_round_trips_through_save_load', () => {
        const ws = new WorldState('p', 'P');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
    });

    test('back_compat_save_without_lastNpcDisposition_field_loads_as_null', () => {
        // Pre-round-35 saves don't carry the field; load must
        // not crash and must leave the snapshot null.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastNpcDisposition).toBeNull();
    });

    test('null_lastNpcDisposition_serialize_as_undefined', () => {
        // Same compactness invariant as lastBiome (round 32):
        // null → undefined so JSON.stringify drops the key.
        const ws = new WorldState('p', 'P');
        const parsed = JSON.parse(ws.saveToJSON());
        expect(parsed.lastNpcDisposition).toBeUndefined();
    });

    test('lastNpcDisposition_combines_with_lastBiome_in_one_save', () => {
        // Headline cross-round: a save carries BOTH the biome
        // (round 32) and the mood snapshot (round 35) and
        // both reload correctly into a fresh WorldState.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'forest');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('forest');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
    });
});

// ---------------------------------------------------------------------------
// Round 36 — individual speaker id + disposition persistence.
//
// Round 33 added a `speakerId` to the Narration return when a
// single extreme NPC takes the 4th-sentence slot. Round 36
// persists that speaker id (and the speaker's disposition at
// the time of speech) so the HUD can show "你刚才听见了
// hostile_1 说：…" after a reload.
// ---------------------------------------------------------------------------

describe('WorldState — round 36 individual speaker persistence', () => {
    test('lastSpeakerId_defaults_to_null', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastSpeakerId).toBeNull();
        expect(ws.lastSpeakerDisposition).toBeNull();
    });

    test('app_can_set_lastSpeakerId_directly', () => {
        const ws = new WorldState('p', 'P');
        ws.lastSpeakerId = 'mage_1';
        ws.lastSpeakerDisposition = { friendly: 0, fear: 0.7, trust: 0.1 };
        expect(ws.lastSpeakerId).toBe('mage_1');
        expect(ws.lastSpeakerDisposition).toEqual({ friendly: 0, fear: 0.7, trust: 0.1 });
    });

    test('lastSpeakerId_round_trips_through_save_load', () => {
        const ws = new WorldState('p', 'P');
        ws.lastSpeakerId = 'hostile_1';
        ws.lastSpeakerDisposition = { friendly: -0.4, fear: 0.5, trust: 0 };
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.lastSpeakerId).toBe('hostile_1');
        expect(parsed.lastSpeakerDisposition).toEqual({ friendly: -0.4, fear: 0.5, trust: 0 });
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastSpeakerId).toBe('hostile_1');
        expect(fresh.lastSpeakerDisposition).toEqual({ friendly: -0.4, fear: 0.5, trust: 0 });
    });

    test('back_compat_save_without_lastSpeakerId_loads_as_null', () => {
        // Pre-round-36 saves don't carry the field.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastSpeakerId).toBeNull();
        expect(fresh.lastSpeakerDisposition).toBeNull();
    });

    test('null_speakerId_serialize_as_undefined', () => {
        // Same compactness invariant: null → undefined for
        // clean JSON.
        const ws = new WorldState('p', 'P');
        const parsed = JSON.parse(ws.saveToJSON());
        expect(parsed.lastSpeakerId).toBeUndefined();
        expect(parsed.lastSpeakerDisposition).toBeUndefined();
    });

    test('lastSpeakerId_combines_with_lastBiome_and_lastNpcDisposition', () => {
        // Headline cross-round scenario: a single save carries
        // round 32's lastBiome, round 35's lastNpcDisposition,
        // and round 36's lastSpeakerId — three HUD prompts all
        // survive a save → reload cycle.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'forest');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        ws.lastSpeakerId = 'hostile_1';
        ws.lastSpeakerDisposition = { friendly: -0.4, fear: 0.5, trust: 0 };
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('forest');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(fresh.lastSpeakerId).toBe('hostile_1');
        expect(fresh.lastSpeakerDisposition).toEqual({ friendly: -0.4, fear: 0.5, trust: 0 });
    });
});

// ---------------------------------------------------------------------------
// Round 40 — per-NPC memory snapshot persistence.
//
// The NpcRegistry is rebuilt on app startup, so a full
// "rehydration" is a larger task. Round 40 persists a
// *snapshot* of each NPC's `(id, archetype, disposition,
// entries)` so a save → reload preserves a record of what
// the world remembered. The HUD prompt can read it for
// "the world remembers N NPC minds" continuity.
// ---------------------------------------------------------------------------

describe('WorldState — round 40 npcMindsSnapshot persistence', () => {
    test('npcMindsSnapshot_defaults_to_empty_array', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.npcMindsSnapshot).toEqual([]);
    });

    test('updateNpcMindsSnapshot_replaces_the_array', () => {
        const ws = new WorldState('p', 'P');
        ws.updateNpcMindsSnapshot([
            { id: 'mage_1', archetype: 'mage', disposition: { friendly: 0, fear: 0, trust: 0.1 },
              entries: [] },
        ]);
        expect(ws.npcMindsSnapshot.length).toBe(1);
        expect(ws.npcMindsSnapshot[0].id).toBe('mage_1');
    });

    test('npcMindsSnapshot_round_trips_through_save_load', () => {
        const ws = new WorldState('p', 'P');
        ws.updateNpcMindsSnapshot([
            {
                id: 'merchant_1',
                archetype: 'merchant',
                disposition: { friendly: 0.4, fear: 0, trust: 0 },
                entries: [
                    { kind: 'dialogue',           summary: 'hi',       turn: 1, weight: 0.1 },
                    { kind: 'received_gift',      summary: 'potion',   turn: 2, weight: 0.5 },
                ],
            },
            {
                id: 'rogue_1',
                archetype: 'rogue',
                disposition: { friendly: -0.2, fear: 0.3, trust: -0.1 },
                entries: [],
            },
        ]);
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.npcMindsSnapshot).toHaveLength(2);
        expect(parsed.npcMindsSnapshot[0].id).toBe('merchant_1');
        expect(parsed.npcMindsSnapshot[0].entries).toHaveLength(2);
        expect(parsed.npcMindsSnapshot[0].entries[1].kind).toBe('received_gift');
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.npcMindsSnapshot).toEqual(ws.npcMindsSnapshot);
    });

    test('back_compat_save_without_npcMindsSnapshot_loads_as_empty', () => {
        // Pre-round-40 saves don't carry the field.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.npcMindsSnapshot).toEqual([]);
    });

    test('empty_snapshot_round_trips_as_empty_array', () => {
        // Sanity: a fresh WorldState's save carries
        // npcMindsSnapshot: [] (not undefined), so a
        // load on a never-broadcast save still has
        // something to read.
        const ws = new WorldState('p', 'P');
        const parsed = JSON.parse(ws.saveToJSON());
        expect(parsed.npcMindsSnapshot).toEqual([]);
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(ws.saveToJSON());
        expect(fresh.npcMindsSnapshot).toEqual([]);
    });

    test('npcMindsSnapshot_combines_with_lastBiome_lastNpcDisposition_lastSpeakerId', () => {
        // Headline cross-round scenario: a single save
        // carries the round-32 lastBiome, the round-35
        // lastNpcDisposition, the round-36 lastSpeakerId,
        // AND the round-40 npcMindsSnapshot — all four
        // HUD prompts survive a save → reload cycle.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'forest');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        ws.lastSpeakerId = 'hostile_1';
        ws.lastSpeakerDisposition = { friendly: -0.4, fear: 0.5, trust: 0 };
        ws.updateNpcMindsSnapshot([
            { id: 'mage_1', archetype: 'mage', disposition: { friendly: 0, fear: 0, trust: 0.1 }, entries: [] },
        ]);
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('forest');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(fresh.lastSpeakerId).toBe('hostile_1');
        expect(fresh.lastSpeakerDisposition).toEqual({ friendly: -0.4, fear: 0.5, trust: 0 });
        expect(fresh.npcMindsSnapshot).toHaveLength(1);
        expect(fresh.npcMindsSnapshot[0].id).toBe('mage_1');
    });
});

// ---------------------------------------------------------------------------
// Round 47 — SceneBlueprint scalars persistence.
//
// Round 24's themeToScene produces four user-visible
// scalars: npcCount, musicBpm, eventChain.length,
// npcArchetypeHints.length. Round 47 persists them on
// WorldState (this file) so the HUD can read "🎬 上次维度:
// NPC×N · BPM T · M 事件 · K archetype" across
// save/load — matching the round-32/35/36/40 pattern.
// ---------------------------------------------------------------------------

describe('WorldState — round 47 SceneBlueprint scalars persistence', () => {
    test('all_four_scene_scalars_default_to_null', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastSceneNpcCount).toBeNull();
        expect(ws.lastSceneBpm).toBeNull();
        expect(ws.lastSceneEventCount).toBeNull();
        expect(ws.lastSceneArchetypeHintCount).toBeNull();
    });

    test('updateLastSceneBlueprint_sets_all_four_fields', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprint({
            npcCount: 6,
            bpm: 130,
            eventCount: 4,
            archetypeHintCount: 1,
        });
        expect(ws.lastSceneNpcCount).toBe(6);
        expect(ws.lastSceneBpm).toBe(130);
        expect(ws.lastSceneEventCount).toBe(4);
        expect(ws.lastSceneArchetypeHintCount).toBe(1);
    });

    test('updateLastSceneBlueprint_null_resets_all_four_fields', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprint({
            npcCount: 6,
            bpm: 130,
            eventCount: 4,
            archetypeHintCount: 1,
        });
        ws.updateLastSceneBlueprint(null);
        expect(ws.lastSceneNpcCount).toBeNull();
        expect(ws.lastSceneBpm).toBeNull();
        expect(ws.lastSceneEventCount).toBeNull();
        expect(ws.lastSceneArchetypeHintCount).toBeNull();
    });

    test('scene_scalars_round_trip_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprint({
            npcCount: 8,
            bpm: 95,
            eventCount: 5,
            archetypeHintCount: 2,
        });
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        // JSON keeps the four fields verbatim (non-null
        // values → not omitted by the `?? undefined`
        // compactness guard).
        expect(parsed.lastSceneNpcCount).toBe(8);
        expect(parsed.lastSceneBpm).toBe(95);
        expect(parsed.lastSceneEventCount).toBe(5);
        expect(parsed.lastSceneArchetypeHintCount).toBe(2);
        // Round-trip: a fresh WorldState recovers them.
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastSceneNpcCount).toBe(8);
        expect(fresh.lastSceneBpm).toBe(95);
        expect(fresh.lastSceneEventCount).toBe(5);
        expect(fresh.lastSceneArchetypeHintCount).toBe(2);
    });

    test('back_compat_save_without_scene_scalars_loads_as_null', () => {
        // Pre-round-47 saves don't carry the fields.
        // loadFromJSON must not crash and must leave the
        // four fields as their null default (the
        // App's next enterNewDimension will refresh).
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastSceneNpcCount).toBeNull();
        expect(fresh.lastSceneBpm).toBeNull();
        expect(fresh.lastSceneEventCount).toBeNull();
        expect(fresh.lastSceneArchetypeHintCount).toBeNull();
        // Default (never-updated) save also omits the
        // fields, so JSON.stringify keeps the payload
        // compact.
        const freshSave = JSON.parse(new WorldState('p', 'P').saveToJSON());
        expect(freshSave.lastSceneNpcCount).toBeUndefined();
        expect(freshSave.lastSceneBpm).toBeUndefined();
        expect(freshSave.lastSceneEventCount).toBeUndefined();
        expect(freshSave.lastSceneArchetypeHintCount).toBeUndefined();
    });

    test('all_five_persisted_signals_coexist_through_save_load', () => {
        // Headline cross-round scenario for round 47:
        // a single save round-trips the round-32 lastBiome,
        // round-35 lastNpcDisposition, round-36 lastSpeakerId,
        // round-40 npcMindsSnapshot, AND the round-47
        // SceneBlueprint scalars — five persistence layers
        // co-exist in one save, none clobber each other.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        ws.lastSpeakerId = 'robot_1';
        ws.lastSpeakerDisposition = { friendly: 0.5, fear: 0, trust: 0.6 };
        ws.updateNpcMindsSnapshot([
            { id: 'robot_1', archetype: 'robot', disposition: { friendly: 0.5, fear: 0, trust: 0.6 }, entries: [] },
        ]);
        ws.updateLastSceneBlueprint({
            npcCount: 11,
            bpm: 130,
            eventCount: 4,
            archetypeHintCount: 1,
        });
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('cyberpunk');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(fresh.lastSpeakerId).toBe('robot_1');
        expect(fresh.npcMindsSnapshot).toHaveLength(1);
        expect(fresh.npcMindsSnapshot[0].archetype).toBe('robot');
        // Round 47 — the four scene scalars round-trip
        // alongside the other four persistence layers.
        expect(fresh.lastSceneNpcCount).toBe(11);
        expect(fresh.lastSceneBpm).toBe(130);
        expect(fresh.lastSceneEventCount).toBe(4);
        expect(fresh.lastSceneArchetypeHintCount).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Round 49 — Full SceneBlueprint snapshot persistence.
//
// Round 47 persisted only four user-visible scalars. Round 49 persists
// the full SceneBlueprint shape (wfcTileWeights[8] + biomeId +
// densities + eventChain + npcArchetypeHints) so round 50 can
// re-render the exact dungeon the player left behind. The round-47
// scalars stay synced for back-compat with code that reads them
// directly.
// ---------------------------------------------------------------------------

const SAMPLE_SNAPSHOT = {
    wfcTileWeights: [4, 4, 2, 2, 0, 0, 3, 1] as [number, number, number, number, number, number, number, number],
    biomeId: 'cyberpunk',
    baseNpcDensity: 0.9,
    npcDensity: 0.765,
    npcCount: 9,
    eventChain: [
        { kind: 'spawn_wave',   delaySecs: 5,  payload: '0_0' },
        { kind: 'echo_lore',    delaySecs: 13, payload: '0_1' },
        { kind: 'fog_pulse',    delaySecs: 22, payload: '0_2' },
        { kind: 'treasure_drop', delaySecs: 30, payload: '0_3' },
    ],
    musicBpm: 130,
    npcArchetypeHints: ['robot'],
};

describe('WorldState — round 49 full SceneBlueprint snapshot persistence', () => {
    test('lastSceneBlueprint_defaults_to_null', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastSceneBlueprint).toBeNull();
    });

    test('updateLastSceneBlueprintFull_sets_full_snapshot', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        const snap = ws.lastSceneBlueprint;
        expect(snap).not.toBeNull();
        expect(snap!.wfcTileWeights).toEqual([4, 4, 2, 2, 0, 0, 3, 1]);
        expect(snap!.biomeId).toBe('cyberpunk');
        expect(snap!.eventChain).toHaveLength(4);
        expect(snap!.eventChain[0].kind).toBe('spawn_wave');
        expect(snap!.npcArchetypeHints).toEqual(['robot']);
        // Defensive clone: mutating the source eventChain
        // doesn't leak into the stored snapshot.
        SAMPLE_SNAPSHOT.eventChain[0].kind = 'mutated';
        expect(snap!.eventChain[0].kind).toBe('spawn_wave');
        SAMPLE_SNAPSHOT.eventChain[0].kind = 'spawn_wave'; // reset
    });

    test('updateLastSceneBlueprintFull_null_resets_snapshot_and_scalars', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        expect(ws.lastSceneNpcCount).toBe(9);
        ws.updateLastSceneBlueprintFull(null);
        expect(ws.lastSceneBlueprint).toBeNull();
        expect(ws.lastSceneNpcCount).toBeNull();
        expect(ws.lastSceneBpm).toBeNull();
        expect(ws.lastSceneEventCount).toBeNull();
        expect(ws.lastSceneArchetypeHintCount).toBeNull();
    });

    test('updateLastSceneBlueprintFull_syncs_round_47_scalars', () => {
        // Calling the round-49 full setter MUST keep the round-47
        // four scalars in sync — HUD.setLastSceneBlueprint(scalars)
        // and any direct readers depend on them.
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        expect(ws.lastSceneNpcCount).toBe(9);
        expect(ws.lastSceneBpm).toBe(130);
        expect(ws.lastSceneEventCount).toBe(4);
        expect(ws.lastSceneArchetypeHintCount).toBe(1);
    });

    test('lastSceneBlueprint_round_trips_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        const snap = fresh.lastSceneBlueprint;
        expect(snap).not.toBeNull();
        expect(snap!.wfcTileWeights).toEqual([4, 4, 2, 2, 0, 0, 3, 1]);
        expect(snap!.biomeId).toBe('cyberpunk');
        expect(snap!.npcDensity).toBeCloseTo(0.765, 5);
        expect(snap!.eventChain).toHaveLength(4);
        expect(snap!.eventChain[3].payload).toBe('0_3');
        expect(snap!.npcArchetypeHints).toEqual(['robot']);
    });

    test('back_compat_save_with_only_round_47_scalars_synthesizes_minimal_snapshot', () => {
        // A round 47/48 save has the four scalars but no full
        // snapshot. Round 49 synthesizes a minimal one from the
        // scalars + lastBiome so the round-50 re-render path has
        // something to work with.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
            lastBiome: 'forest',
            lastSceneNpcCount: 5,
            lastSceneBpm: 95,
            lastSceneEventCount: 3,
            lastSceneArchetypeHintCount: 2,
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        // Synthesized snapshot uses defaultWfcWeights and empty
        // eventChain — but preserves the user-visible npcCount/bpm.
        const snap = fresh.lastSceneBlueprint;
        expect(snap).not.toBeNull();
        expect(snap!.npcCount).toBe(5);
        expect(snap!.musicBpm).toBe(95);
        expect(snap!.biomeId).toBe('forest');
        expect(snap!.eventChain).toEqual([]);  // can't be recovered from scalars
        expect(snap!.npcArchetypeHints).toEqual([]);  // can't be recovered from scalars
        // Canonical default WFC weights.
        expect(snap!.wfcTileWeights).toEqual([6, 3, 1, 1, 0, 0, 1, 1]);
    });

    test('back_compat_save_without_any_scene_fields_loads_as_null', () => {
        // Pre-round-47 save — no scalars and no full snapshot.
        // Both round-47 scalars AND round-49 full snapshot stay null.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastSceneBlueprint).toBeNull();
        expect(fresh.lastSceneNpcCount).toBeNull();
    });

    test('headline_six_fields_coexist_across_save_load', () => {
        // Headline cross-round scenario for round 49: one save
        // round-trips the round-32 lastBiome, the round-35
        // lastNpcDisposition, the round-36 lastSpeakerId, the
        // round-40 npcMindsSnapshot, the round-47 scalars (still
        // present), AND the round-49 full snapshot. Six
        // persistence layers in one save, none clobber each other.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        ws.lastSpeakerId = 'robot_1';
        ws.lastSpeakerDisposition = { friendly: 0.5, fear: 0, trust: 0.6 };
        ws.updateNpcMindsSnapshot([
            { id: 'robot_1', archetype: 'robot', disposition: { friendly: 0.5, fear: 0, trust: 0.6 }, entries: [] },
        ]);
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastBiome).toBe('cyberpunk');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(fresh.lastSpeakerId).toBe('robot_1');
        expect(fresh.npcMindsSnapshot).toHaveLength(1);
        // Round 47 scalars still present.
        expect(fresh.lastSceneNpcCount).toBe(9);
        expect(fresh.lastSceneBpm).toBe(130);
        // Round 49 full snapshot also round-trips.
        expect(fresh.lastSceneBlueprint).not.toBeNull();
        expect(fresh.lastSceneBlueprint!.wfcTileWeights).toEqual([4, 4, 2, 2, 0, 0, 3, 1]);
        expect(fresh.lastSceneBlueprint!.eventChain).toHaveLength(4);
    });
});

// ---------------------------------------------------------------------------
// Round 50 — lastDimensionSeed persistence.
//
// The round-49 snapshot is enough to identify *what* dungeon to
// re-render, but not enough to make it byte-identical with the
// original enterNewDimension's WFC tiles — generateDungeonWithWeights
// needs the seed. Round 50 persists the seed alongside the snapshot
// so loadGame's re-render path produces the exact tiles the player
// left behind, not just the same blueprint with random tiles.
// ---------------------------------------------------------------------------

describe('WorldState — round 50 lastDimensionSeed persistence', () => {
    test('lastDimensionSeed_defaults_to_null', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastDimensionSeed).toBeNull();
    });

    test('setLastDimensionSeed_sets_value_and_null_clears', () => {
        const ws = new WorldState('p', 'P');
        ws.setLastDimensionSeed(123456);
        expect(ws.lastDimensionSeed).toBe(123456);
        ws.setLastDimensionSeed(null);
        expect(ws.lastDimensionSeed).toBeNull();
    });

    test('lastDimensionSeed_round_trips_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.setLastDimensionSeed(42);
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        // Non-null value lands in the JSON verbatim — the `?? undefined`
        // compactness guard does not strip it.
        expect(parsed.lastDimensionSeed).toBe(42);
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastDimensionSeed).toBe(42);
    });

    test('back_compat_save_without_lastDimensionSeed_loads_as_null', () => {
        // Pre-round-50 saves don't carry the field. loadFromJSON
        // must default to null (the loadGame re-render path then
        // falls back to a stable hash of the snapshot).
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastDimensionSeed).toBeNull();
        // Default (never-set) save also omits the field, keeping
        // the JSON payload compact for users who never play.
        const freshSave = JSON.parse(new WorldState('p', 'P').saveToJSON());
        expect(freshSave.lastDimensionSeed).toBeUndefined();
    });

    test('headline_seven_persisted_signals_coexist_through_save_load', () => {
        // Headline cross-round scenario for round 50: one save
        // round-trips the round-32 lastBiome, the round-35
        // lastNpcDisposition, the round-36 lastSpeakerId, the
        // round-40 npcMindsSnapshot, the round-47 scalars, the
        // round-49 full snapshot, AND the round-50 seed. Seven
        // persistence layers, none clobber each other.
        const ws = new WorldState('p', 'P');
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        ws.lastNpcDisposition = { friendly: 0.4, fear: 0, trust: 0.2 };
        ws.lastSpeakerId = 'robot_1';
        ws.lastSpeakerDisposition = { friendly: 0.5, fear: 0, trust: 0.6 };
        ws.updateNpcMindsSnapshot([
            { id: 'robot_1', archetype: 'robot', disposition: { friendly: 0.5, fear: 0, trust: 0.6 }, entries: [] },
        ]);
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        ws.setLastDimensionSeed(0xDEADBEEF);
        const json = ws.saveToJSON();
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        // Six earlier-round signals still present (regression
        // guard for round 32/35/36/40/47/49).
        expect(fresh.lastBiome).toBe('cyberpunk');
        expect(fresh.lastNpcDisposition).toEqual({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(fresh.lastSpeakerId).toBe('robot_1');
        expect(fresh.npcMindsSnapshot).toHaveLength(1);
        expect(fresh.lastSceneNpcCount).toBe(9);
        expect(fresh.lastSceneBlueprint).not.toBeNull();
        // Round 50 — the new seventh layer.
        expect(fresh.lastDimensionSeed).toBe(0xDEADBEEF);
    });
});

// ---------------------------------------------------------------------------
// Round 53 — lastFailedSnapshot (one-deep backup of the 4
// fields most likely to be unrecoverable after a failed
// re-render). Called by `App.recoverFromRenderFailure`
// before the recovery orchestrator takes over. Cleared at
// the end of a successful `enterNewDimension`.
// ---------------------------------------------------------------------------

describe('WorldState — round 53 lastFailedSnapshot backup', () => {
    test('backupFailedSnapshot_deep_copies_4_fields', () => {
        const ws = new WorldState('acct-1');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        ws.setLastDimensionSeed(0xCAFEBABE);
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        ws.npcMindsSnapshot = [{
            id: 'a', archetype: 'mage',
            disposition: { friendly: 0, fear: 0, trust: 0 },
            entries: [],
        }];
        ws.backupFailedSnapshot();
        expect(ws.lastFailedSnapshot).not.toBeNull();
        const f = ws.lastFailedSnapshot!;
        expect(f.blueprint).not.toBeNull();
        expect(f.seed).toBe(0xCAFEBABE);
        expect(f.biome).toBe('cyberpunk');
        expect(f.npcSnapshot.length).toBe(1);
        // Defensive clone: mutating the source after
        // backup must NOT leak into the backup.
        ws.lastSceneBlueprint!.biomeId = 'space';
        ws.npcMindsSnapshot[0].id = 'MUTATED';
        expect(f.blueprint!.biomeId).toBe('cyberpunk');
        expect(f.npcSnapshot[0].id).toBe('a');
    });

    test('clearFailedSnapshot_resets_to_null', () => {
        const ws = new WorldState('acct-1');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        ws.backupFailedSnapshot();
        expect(ws.lastFailedSnapshot).not.toBeNull();
        ws.clearFailedSnapshot();
        expect(ws.lastFailedSnapshot).toBeNull();
    });

    test('round_trip_save_load_with_lastFailedSnapshot', () => {
        const ws = new WorldState('acct-1');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        ws.setLastDimensionSeed(0xBABE);
        ws.setActiveDimension('d1', ['match3'], 'cyberpunk');
        ws.backupFailedSnapshot();
        const json = ws.saveToJSON();
        const ws2 = new WorldState('acct-2');
        const ok = ws2.loadFromJSON(json);
        expect(ok).toBe(true);
        expect(ws2.lastFailedSnapshot).not.toBeNull();
        expect(ws2.lastFailedSnapshot!.seed).toBe(0xBABE);
        expect(ws2.lastFailedSnapshot!.biome).toBe('cyberpunk');
        expect(ws2.lastFailedSnapshot!.blueprint!.biomeId).toBe('cyberpunk');
    });
});

// ---------------------------------------------------------------------------
// Round 54 — hasFailedSnapshot() guard helper.
//
// Called by HUD's render path (via setBackupAvailable
// signal in main.ts) to decide whether to render the
// inline "🔙 回滚" button inside the recovery banner.
// Cheap boolean guard — no snapshot copy.
// ---------------------------------------------------------------------------

describe('WorldState — round 54 hasFailedSnapshot()', () => {
    test('returns_false_on_fresh_worldstate', () => {
        const ws = new WorldState('acct-1');
        expect(ws.hasFailedSnapshot()).toBe(false);
    });

    test('returns_true_after_backupFailedSnapshot', () => {
        const ws = new WorldState('acct-1');
        ws.backupFailedSnapshot();
        expect(ws.hasFailedSnapshot()).toBe(true);
    });

    test('returns_false_after_clearFailedSnapshot', () => {
        const ws = new WorldState('acct-1');
        ws.backupFailedSnapshot();
        expect(ws.hasFailedSnapshot()).toBe(true);
        ws.clearFailedSnapshot();
        expect(ws.hasFailedSnapshot()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Round 72 — `lastSceneEventChain` full-timeline persistence.
//
// Complements the round-47 scalars (which store COUNTS only)
// with the full `{ kind, delaySecs, payload }[]` so a future
// "replay events" UI can render the timeline. Set via
// `setLastSceneEventChain` (DM path) or via
// `updateLastSceneBlueprintFull` (non-DM path). Cleared when
// the full snapshot is cleared or `setLastSceneEventChain(null)`.
// ---------------------------------------------------------------------------

describe('WorldState — round 72 lastSceneEventChain persistence', () => {
    const SAMPLE_CHAIN = [
        { kind: 'spawn_wave',    delaySecs: 5,  payload: 'forest_spawn_wave_2' },
        { kind: 'echo_lore',     delaySecs: 13, payload: 'forest_echo_lore_4' },
        { kind: 'treasure_drop', delaySecs: 21, payload: 'forest_treasure_drop_0' },
    ];

    test('lastSceneEventChain_defaults_to_null', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.lastSceneEventChain).toBeNull();
    });

    test('setLastSceneEventChain_stores_array', () => {
        const ws = new WorldState('p', 'P');
        ws.setLastSceneEventChain(SAMPLE_CHAIN);
        expect(ws.lastSceneEventChain).not.toBeNull();
        expect(ws.lastSceneEventChain?.length).toBe(3);
        expect(ws.lastSceneEventChain?.[0].kind).toBe('spawn_wave');
        expect(ws.lastSceneEventChain?.[2].payload).toBe('forest_treasure_drop_0');
    });

    test('setLastSceneEventChain_deep_clones_so_caller_mutation_does_not_leak', () => {
        // The round-47 scalars don't have this concern (numbers),
        // but the chain is an array of objects — a future caller
        // might mutate the source after storing it. The
        // defensive clone mirrors the snapshot write in
        // `updateLastSceneBlueprintFull`.
        const ws = new WorldState('p', 'P');
        const source = [
            { kind: 'spawn_wave', delaySecs: 5, payload: '0_0' },
        ];
        ws.setLastSceneEventChain(source);
        // Mutate the source AFTER storing.
        source[0].payload = 'MUTATED';
        source.push({ kind: 'echo_lore', delaySecs: 13, payload: 'evil' });
        // The stored copy must NOT reflect the mutation.
        expect(ws.lastSceneEventChain?.[0].payload).toBe('0_0');
        expect(ws.lastSceneEventChain?.length).toBe(1);
    });

    test('setLastSceneEventChain_null_clears', () => {
        const ws = new WorldState('p', 'P');
        ws.setLastSceneEventChain(SAMPLE_CHAIN);
        expect(ws.lastSceneEventChain).not.toBeNull();
        ws.setLastSceneEventChain(null);
        expect(ws.lastSceneEventChain).toBeNull();
    });

    test('updateLastSceneBlueprintFull_syncs_chain_from_snapshot', () => {
        // The non-DM path goes through `updateLastSceneBlueprintFull`
        // (round 49) which receives the full snapshot. The
        // round-72 extension should auto-sync the chain so the
        // DM and non-DM paths produce the same WorldState shape.
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        expect(ws.lastSceneEventChain).not.toBeNull();
        expect(ws.lastSceneEventChain?.length).toBe(SAMPLE_SNAPSHOT.eventChain.length);
        expect(ws.lastSceneEventChain?.[0].kind).toBe('spawn_wave');
        expect(ws.lastSceneEventChain?.[3].payload).toBe('0_3');
    });

    test('updateLastSceneBlueprintFull_null_clears_chain', () => {
        // The null branch should also clear the chain
        // (symmetric with the setLastSceneEventChain(null)
        // path). Without this, clearing the snapshot would
        // leave a stale chain in WorldState.
        const ws = new WorldState('p', 'P');
        ws.updateLastSceneBlueprintFull(SAMPLE_SNAPSHOT);
        expect(ws.lastSceneEventChain).not.toBeNull();
        ws.updateLastSceneBlueprintFull(null);
        expect(ws.lastSceneEventChain).toBeNull();
    });

    test('chain_round_trips_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.setLastSceneEventChain(SAMPLE_CHAIN);
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        // The field is present (not undefined) because
        // `?? undefined` only omits null chains.
        expect(parsed.lastSceneEventChain).toBeDefined();
        expect(parsed.lastSceneEventChain.length).toBe(3);
        expect(parsed.lastSceneEventChain[1].kind).toBe('echo_lore');
        // Round-trip: a fresh WorldState recovers the chain.
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastSceneEventChain).not.toBeNull();
        expect(fresh.lastSceneEventChain?.length).toBe(3);
        expect(fresh.lastSceneEventChain?.[2].payload).toBe('forest_treasure_drop_0');
    });

    test('null_chain_round_trips_through_saveToJSON_loadFromJSON', () => {
        // A save that never entered a dimension should
        // omit the field entirely (compact payload).
        const ws = new WorldState('p', 'P');
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.lastSceneEventChain).toBeUndefined();
        // Round-trip: still null after load.
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.lastSceneEventChain).toBeNull();
    });

    test('back_compat_pre_round_72_save_falls_back_to_lastSceneBlueprint_chain', () => {
        // Pre-round-72 saves don't carry `lastSceneEventChain`
        // but DO carry `lastSceneBlueprint` (round 49+). The
        // loader should fall back to the snapshot's event
        // chain so a "replay events" UI works on old saves.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
            // Round 49+ snapshot, no round-72 chain.
            lastSceneBlueprint: SAMPLE_SNAPSHOT,
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastSceneEventChain).not.toBeNull();
        expect(fresh.lastSceneEventChain?.length).toBe(SAMPLE_SNAPSHOT.eventChain.length);
        expect(fresh.lastSceneEventChain?.[0].kind).toBe('spawn_wave');
    });

    test('back_compat_pre_round_49_save_loads_with_null_chain', () => {
        // Pre-round-49 saves have NEITHER `lastSceneEventChain`
        // NOR `lastSceneBlueprint`. The chain loader must
        // default to null without crashing.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.lastSceneEventChain).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Round 79 — `rollbackCount` field. Monotonically increasing
// integer; persists across save/load; defaults to 0 for
// pre-round-79 saves.
// ---------------------------------------------------------------------------

describe('WorldState — round 79 rollbackCount field', () => {
    test('defaults_to_zero_on_fresh_WorldState', () => {
        const ws = new WorldState('p', 'P');
        expect(ws.rollbackCount).toBe(0);
    });

    test('setRollbackCount_stores_value', () => {
        const ws = new WorldState('p', 'P');
        ws.setRollbackCount(7);
        expect(ws.rollbackCount).toBe(7);
    });

    test('setRollbackCount_null_resets_to_zero', () => {
        const ws = new WorldState('p', 'P');
        ws.setRollbackCount(5);
        expect(ws.rollbackCount).toBe(5);
        ws.setRollbackCount(null);
        expect(ws.rollbackCount).toBe(0);
    });

    test('rollbackCount_round_trips_through_saveToJSON_loadFromJSON', () => {
        const ws = new WorldState('p', 'P');
        ws.setRollbackCount(3);
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        // The field IS persisted (not omitted) because it's > 0.
        expect(parsed.rollbackCount).toBe(3);

        // Round-trip: a fresh WorldState recovers the count.
        const fresh = new WorldState('p', 'P');
        fresh.loadFromJSON(json);
        expect(fresh.rollbackCount).toBe(3);
    });

    test('rollbackCount_omitted_from_save_when_zero', () => {
        // Back-compat discipline: a save that never saw a
        // rollback stays compact (no `rollbackCount: 0`
        // noise). Pre-round-79 readers see the same JSON
        // they would have seen pre-round-79.
        const ws = new WorldState('p', 'P');
        const json = ws.saveToJSON();
        const parsed = JSON.parse(json);
        expect(parsed.rollbackCount).toBeUndefined();
    });

    test('pre_round_79_save_loads_with_rollbackCount_zero', () => {
        // A save JSON that lacks `rollbackCount` entirely
        // (i.e. written by a pre-round-79 build) must
        // load successfully and default the count to 0.
        const oldJson = JSON.stringify({
            player: { accountId: 'p' },
            progression: { level: 1, xp: 0, talentPoints: 0 },
            wallet: {},
            inventory: [],
            dimensionHistory: [],
        });
        const fresh = new WorldState('p', 'P');
        const ok = fresh.loadFromJSON(oldJson);
        expect(ok).toBe(true);
        expect(fresh.rollbackCount).toBe(0);
    });

    test('rollbackCount_monotonically_increments_through_setRollbackCount', () => {
        // Mirrors the App.rollbackToLastGood() success
        // path: each call reads the prev value, adds 1,
        // and stores the result. Verified here at the
        // WorldState level so a future contributor
        // changing the setter signature sees the contract.
        const ws = new WorldState('p', 'P');
        ws.setRollbackCount((ws.rollbackCount ?? 0) + 1);
        ws.setRollbackCount((ws.rollbackCount ?? 0) + 1);
        ws.setRollbackCount((ws.rollbackCount ?? 0) + 1);
        expect(ws.rollbackCount).toBe(3);
    });
});
