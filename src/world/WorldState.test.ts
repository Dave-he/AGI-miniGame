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
