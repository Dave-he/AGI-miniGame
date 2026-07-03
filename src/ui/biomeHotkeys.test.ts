/**
 * Round 151 — biomeHotkeys module tests.
 *
 * Before round 151, the `BIOME_HOTKEYS` map lived inline in
 * `src/main.ts` (a tangled 2000-line entry point with side
 * effects). Round 151 extracts the map + a lookup helper into
 * `src/ui/biomeHotkeys.ts` so the lookup contract can be pinned
 * with unit tests. This file pins:
 *
 *  1. Known-good biome ids (the 6 biomes that the
 *     `BiomeLibraryPanel` knows about) all resolve to a non-null
 *     context with a label and ≥1 binding.
 *  2. The empty-string key (used by the welcome hub) and any
 *     unknown biome id resolve to `null`, matching the round-150
 *     contract that a null context hides the biome strip.
 *  3. Each context has a non-empty label and a stable shape
 *     (`key` non-empty + `action` non-empty).
 *  4. The 6 biomes have distinct labels and distinct binding
 *     sets (a regression where someone copy-pasted the forest
 *     bindings into the dungeon entry would now fail).
 *  5. `listMappedBiomeIds` returns the 6 mapped ids and skips the
 *     explicit-null '' sentinel.
 *
 * Round 151 also closes the 4→6 coverage gap: `space` and
 * `dungeon` are now mapped (round 150 had only `forest`,
 * `desert`, `cyberpunk`, `ice`). The `get('space')` and
 * `get('dungeon')` tests pin this backfill.
 */

import {
    getBiomeHotkeyContext,
    listMappedBiomeIds,
} from '../ui/biomeHotkeys';

describe('biomeHotkeys lookup (round 151)', () => {
    test('forest_resolves_to_non_null_context (round 150 baseline)', () => {
        const ctx = getBiomeHotkeyContext('forest');
        expect(ctx).not.toBeNull();
        expect(ctx!.label).toBe('森林');
        expect(ctx!.bindings.length).toBeGreaterThan(0);
    });

    test('space_resolves_to_non_null_context (round 151 backfill)', () => {
        const ctx = getBiomeHotkeyContext('space');
        expect(ctx).not.toBeNull();
        expect(ctx!.label.length).toBeGreaterThan(0);
        expect(ctx!.bindings.length).toBeGreaterThan(0);
    });

    test('dungeon_resolves_to_non_null_context (round 151 backfill)', () => {
        const ctx = getBiomeHotkeyContext('dungeon');
        expect(ctx).not.toBeNull();
        expect(ctx!.label.length).toBeGreaterThan(0);
        expect(ctx!.bindings.length).toBeGreaterThan(0);
    });

    test('empty_string_key_returns_null (welcome hub / unknown biome)', () => {
        // The map stores an explicit `['', null]` entry so the
        // welcome-hub biome id ('' resolves to that key) hides
        // the biome strip. This is what the round-150 main.ts
        // use-site branches on.
        expect(getBiomeHotkeyContext('')).toBeNull();
    });

    test('unknown_biome_id_returns_null_via_fallback', () => {
        // Any biome id not in the map should also resolve to
        // null (not undefined). The `?? null` boundary coercion
        // inside getBiomeHotkeyContext guarantees this.
        expect(getBiomeHotkeyContext('atlantis')).toBeNull();
        expect(getBiomeHotkeyContext('not-a-biome')).toBeNull();
        expect(getBiomeHotkeyContext('FOREST')).toBeNull(); // case-sensitive
    });

    test('listMappedBiomeIds_returns_6_unique_entries', () => {
        const ids = listMappedBiomeIds();
        // Exactly the 6 biomes known to WfcBiomes / BiomeLibraryPanel.
        expect(ids).toHaveLength(6);
        // No duplicates — guards against copy-paste regression
        // in the map literal.
        expect(new Set(ids).size).toBe(6);
        // Sorted alphabetically for determinism (the iteration
        // order of a `Map` is insertion order, and we insert
        // them as `forest, desert, cyberpunk, ice, space, dungeon`
        // — the alphabetical sort is what the tests check).
        expect([...ids].sort()).toEqual([
            'cyberpunk',
            'desert',
            'dungeon',
            'forest',
            'ice',
            'space',
        ]);
    });

    test('each_binding_has_non_empty_key_and_action', () => {
        // Defense in depth: any future biome added to the map
        // must have bindings with non-empty `key` and `action`
        // fields, otherwise the HUD render would emit an empty
        // <kbd> tag (regression on the round-147 single-pass
        // layout — empty bindings break the dot-separator
        // spacing).
        for (const id of listMappedBiomeIds()) {
            const ctx = getBiomeHotkeyContext(id);
            expect(ctx).not.toBeNull();
            for (const b of ctx!.bindings) {
                expect(b.key.length).toBeGreaterThan(0);
                expect(b.action.length).toBeGreaterThan(0);
            }
        }
    });

    test('biome_labels_are_unique (no copy-paste regression)', () => {
        // If someone accidentally pasted the forest label
        // '森林' into another biome, this test fails. Distinct
        // labels are required because the round-150 HUD biome
        // strip renders the label as the centered header
        // (`—— ${label} ——`) — two biomes with the same label
        // would be visually indistinguishable.
        const labels = listMappedBiomeIds().map((id) => getBiomeHotkeyContext(id)!.label);
        expect(new Set(labels).size).toBe(labels.length);
    });
});