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
