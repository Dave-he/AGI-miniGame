/**
 * Round 82 — `sceneGenWasmStub` helper tests.
 *
 * Locks the round-80 stub factory's default values, override
 * semantics, version stamp, and snake_case / camelCase shape
 * so a future refactor that "accidentally" changes the stub
 * output is caught immediately. The companion test in
 * `main.test.ts` covers the App-level wiring; this file
 * covers the stub surface in isolation.
 *
 * **Why a stand-alone test file**:
 *   1. The stub is shared between describe blocks in
 *      `main.test.ts`. A bug in the stub (e.g. a typo in the
 *      default `biomeId`) would cascade into N test failures
 *      with confusing stack traces. The helper-level tests
 *      catch the bug at the source.
 *   2. The version stamp is a load-bearing detail: the real
 *      `loadSceneGenWasm` checks for `0.2.0-round*`. A
 *      contributor bumping the real WASM version must
 *      remember to bump the stub stamp too — the
 *      `wasm_module_version_returns_round80_e2e_stamp` test
 *      fails if they don't.
 *   3. The override type is a thin wrapper over
 *      `SceneBlueprint`; pinning the override semantics
 *      (e.g. "overrides flow into the snake_case output")
 *      keeps the helper usable for new test scenarios
 *      without re-discovering the shape by trial and error.
 *
 * **Strategy** (mirrors the round-70 `Mood4thSentence.test.ts`
 * approach):
 *   - Parse the stub's JSON output with `JSON.parse` (the
 *     real `callThemeToScene` does the same).
 *   - Assert individual fields, not the whole blob (a more
 *     specific failure on a partial refactor).
 */

import { makeWasmStub } from './sceneGenWasmStub';

// ---------------------------------------------------------------------------
// Defaults — the round-80 "happy path" fixture. The e2e tests in
// `main.test.ts` rely on these defaults to drive the App's WASM
// branch without any overrides.
// ---------------------------------------------------------------------------

describe('sceneGenWasmStub — defaults (round 82)', () => {
    test('theme_to_scene_json_returns_snake_case_blueprint', () => {
        const stub = makeWasmStub();
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed).toEqual(expect.objectContaining({
            wfc_tile_weights: [5, 4, 2, 2, 1, 0, 2, 1],
            biome_id: 'verdant-ruins',
            base_npc_density: 0.4,
            npc_density: 0.4,
            npc_count: 6,
            music_bpm: 110,
            npc_archetype_hints: ['mage', 'beast'],
        }));
    });

    test('default_event_chain_has_three_round80_entries', () => {
        // The event chain is the round-80 fixture's primary
        // "user-visible" signal (the round-73 HUD ⏰ row
        // reads from it). Pin the count + the kind names so
        // a future contributor changing the default chain
        // sees a test failure rather than a silent HUD shift.
        const stub = makeWasmStub();
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(Array.isArray(parsed.event_chain)).toBe(true);
        expect(parsed.event_chain).toHaveLength(3);
        expect(parsed.event_chain.map((e: { kind: string }) => e.kind)).toEqual([
            'spawn_wave', 'echo_lore', 'treasure_drop',
        ]);
    });

    test('default_event_chain_uses_snake_case_delay_secs', () => {
        // The real `callThemeToScene` translates
        // `delay_secs` → `delaySecs`. A stub that emits
        // camelCase would silently bypass the translator
        // and the App would crash on `e.delaySecs`.
        const stub = makeWasmStub();
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.event_chain[0]).toHaveProperty('delay_secs');
        expect(parsed.event_chain[0]).not.toHaveProperty('delaySecs');
    });

    test('theme_echo_includes_input_visual_style_and_seed', () => {
        // The `_echo` field lets tests assert "the
        // themeToScene call actually received the bridge
        // blueprint's visual_style + seed" without round-
        // tripping through the real WASM. Pin the shape.
        const stub = makeWasmStub();
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'dungeon', music_mood: 'tense', difficulty: 0.7, seed: 42,
        }));
        const parsed = JSON.parse(out);
        expect(parsed._echo).toEqual({ visual_style: 'dungeon', seed: 42 });
    });
});

// ---------------------------------------------------------------------------
// Overrides — every override field flows into the snake_case output
// so a test can model "npcCount=7, bpm=140" without rewriting the
// whole fixture.
// ---------------------------------------------------------------------------

describe('sceneGenWasmStub — overrides (round 82)', () => {
    test('biomeId_override_flows_into_output', () => {
        const stub = makeWasmStub({ biomeId: 'neon-harbor' });
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.biome_id).toBe('neon-harbor');
    });

    test('npcCount_and_musicBpm_overrides_flow_into_output', () => {
        const stub = makeWasmStub({ npcCount: 7, musicBpm: 140 });
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.npc_count).toBe(7);
        expect(parsed.music_bpm).toBe(140);
    });

    test('npcArchetypeHints_override_flows_into_output', () => {
        const stub = makeWasmStub({ npcArchetypeHints: ['mage', 'beast', 'thief'] });
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.npc_archetype_hints).toEqual(['mage', 'beast', 'thief']);
    });

    test('eventChain_override_replaces_default_chain', () => {
        const stub = makeWasmStub({
            eventChain: [
                { kind: 'mood_shift', delaySecs: 8, payload: 'r80-override-0' },
            ],
        });
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        // The override uses camelCase (`delaySecs`); the stub
        // emits whatever shape the caller supplied. This test
        // pins that the override REPLACES, not merges with, the
        // default chain.
        expect(parsed.event_chain).toEqual([
            { kind: 'mood_shift', delaySecs: 8, payload: 'r80-override-0' },
        ]);
    });

    test('wfcTileWeights_override_flows_into_output', () => {
        const stub = makeWasmStub({ wfcTileWeights: [7, 6, 0, 0, 0, 0, 0, 0] });
        const out = stub.theme_to_scene_json(JSON.stringify({
            visual_style: 'cyberpunk', music_mood: 'pulse', difficulty: 0.5, seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.wfc_tile_weights).toEqual([7, 6, 0, 0, 0, 0, 0, 0]);
    });
});

// ---------------------------------------------------------------------------
// Version stamp — the load-bearing detail. `loadSceneGenWasm` checks
// for `0.2.0-round*`; the stub must satisfy that guard so the e2e
// tests can hand the stub to `loadSceneGenWasm` without bypassing
// the version check.
// ---------------------------------------------------------------------------

describe('sceneGenWasmStub — version stamp (round 82)', () => {
    test('wasm_module_version_returns_round80_e2e_stamp', () => {
        const stub = makeWasmStub();
        expect(stub.wasm_module_version()).toBe('0.2.0-round80-e2e');
    });

    test('version_stamp_satisfies_loadSceneGenWasm_guard', () => {
        // The guard is `!v.startsWith('0.2.0-round')`. A future
        // contributor bumping the real WASM to 0.3.0 must
        // bump this stamp too (or the guard's prefix).
        const v = makeWasmStub().wasm_module_version();
        expect(v.startsWith('0.2.0-round')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// mood_palette_json + build_generation_config_with_mood_json +
// mood_4th_sentence_for_json — the round-51 helpers. The App only
// reads the round-80 fixtures through the `theme_to_scene_json`
// path, but a future e2e test for the `moodPalette` HUD row
// (round-58) would need these stubs to work too. Pin the shapes.
// ---------------------------------------------------------------------------

describe('sceneGenWasmStub — round-51 helpers (round 82)', () => {
    test('mood_palette_json_returns_three_hex_strings', () => {
        const stub = makeWasmStub();
        const out = stub.mood_palette_json(JSON.stringify({ friendly: 0.5, fear: 0.3, trust: 0.2 }));
        const parsed = JSON.parse(out);
        expect(Array.isArray(parsed.colors)).toBe(true);
        expect(parsed.colors).toHaveLength(3);
        for (const c of parsed.colors) {
            expect(typeof c).toBe('string');
            expect(c).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    test('build_generation_config_with_mood_json_returns_player_level_from_args', () => {
        // The helper echoes `player_level` from the input
        // so tests can assert "the call actually received
        // the right level". A future contributor changing
        // the stub to return a constant would see this
        // test fail.
        const stub = makeWasmStub();
        const out = stub.build_generation_config_with_mood_json(JSON.stringify({
            player_level: 7, recent_loss_count: 2, mood: { friendly: 0, fear: 0, trust: 0 },
            hint: { min_atoms: 1, max_atoms: 2, reward_multiplier: 1.0, base_difficulty_range_lo: 0.1, base_difficulty_range_hi: 0.9 },
            seed: 1,
        }));
        const parsed = JSON.parse(out);
        expect(parsed.player_level).toBe(7);
    });

    test('mood_4th_sentence_for_json_returns_sentence_field', () => {
        const stub = makeWasmStub();
        const out = stub.mood_4th_sentence_for_json(JSON.stringify({ branch: 1, blueprint_id: 'dim_1' }));
        const parsed = JSON.parse(out);
        expect(parsed.sentence).toBe('wasm-4th');
    });
});

// ---------------------------------------------------------------------------
// Return type — TS-level guarantee that the stub satisfies the
// `SceneGenWasmModule` interface. A future contributor who adds a new
// required function to the interface (e.g. round-90 adds
// `event_chain_filter_json`) would see a TS compile error here, not
// a silent runtime mismatch in the e2e tests.
// ---------------------------------------------------------------------------

describe('sceneGenWasmStub — return type (round 82)', () => {
    test('returns_an_object_with_all_5_required_functions', () => {
        const stub = makeWasmStub();
        expect(typeof stub.theme_to_scene_json).toBe('function');
        expect(typeof stub.wasm_module_version).toBe('function');
        expect(typeof stub.build_generation_config_with_mood_json).toBe('function');
        expect(typeof stub.mood_palette_json).toBe('function');
        expect(typeof stub.mood_4th_sentence_for_json).toBe('function');
    });
});
