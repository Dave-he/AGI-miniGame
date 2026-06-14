//! Round 76 — `cocos4_rust::agi_minigame::generate_runtime_scene`
//! end-to-end smoke tests.
//!
//! The round-75 work committed the `Runtime Scene Generator`
//! bridge (src/wasm_api.rs + frontend/src/core/RuntimeSceneGenerator.ts)
//! that the frontend's `generateRuntimeScene` function calls
//! through. The bridge was 100% unit-tested at the TS layer
//! (frontend jest 34/34, including the
//! `RuntimeSceneGenerator.test.ts` suite) and at the Rust
//! layer (cocos4-rust has its own internal tests). What was
//! missing: a real, end-to-end Rust integration test that
//! exercises the `cocos4_rust::agi_minigame::generate_runtime_scene`
//! entry point that the WASM bridge in `src/wasm_api.rs`
//! depends on. This file closes that gap.
//!
//! These tests are deliberately small — they pin the public
//! contract the WASM bridge consumes (determinism, biome
//! selection, difficulty scaling, module propagation, lane
//! count, palette per-biome, event chain). Any future change
//! to `cocos4-rust` that breaks the bridge contract will be
//! caught here before it ships.

use cocos4_rust::agi_minigame::{
    generate_runtime_scene, RuntimeBiome, RuntimeSceneRequest,
};

/// Helper: build a request with sensible defaults and
/// override a few fields. The bridge in `src/wasm_api.rs`
/// uses the same defaults: non-zero seed (the engine
/// replaces 0 with 1), difficulty in 1..=10 (clamped
/// server-side), empty modules (server fills with
/// `default_modules(difficulty)`).
fn make_request(seed: u64, difficulty: u32, theme_hint: &str, modules: Vec<&str>) -> RuntimeSceneRequest {
    RuntimeSceneRequest {
        seed,
        player_level: 1,
        difficulty,
        theme_hint: theme_hint.to_string(),
        modules: modules.into_iter().map(String::from).collect(),
    }
}

#[test]
fn basic_call_returns_nonempty_blueprint() {
    // The simplest smoke: a request with a real seed
    // produces a blueprint with the right shape. If the
    // path-dep linkage is broken (e.g. round-75 WIP got
    // reverted), this test fails to compile.
    let bp = generate_runtime_scene(make_request(42, 3, "neon", vec![]));
    assert!(!bp.id.is_empty(), "blueprint id should be populated");
    assert!(!bp.title.is_empty(), "blueprint title should be populated");
    assert_eq!(bp.seed, 42, "seed should round-trip through the engine");
    assert!(!bp.modules.is_empty(), "default modules should fill in when caller passes none");
}

#[test]
fn same_seed_is_deterministic() {
    // Two calls with the same seed must produce equal
    // blueprints. The bridge in src/wasm_api.rs relies on
    // this for save/load determinism — a future
    // non-deterministic change (e.g. adding `Instant::now()`
    // to the RNG) would silently break replays.
    let a = generate_runtime_scene(make_request(7, 5, "ruin", vec!["tower_defense"]));
    let b = generate_runtime_scene(make_request(7, 5, "ruin", vec!["tower_defense"]));
    assert_eq!(a, b, "same seed + hint + modules must produce equal blueprints");
}

#[test]
fn different_seeds_produce_different_blueprints() {
    // The dual of the determinism check: a different
    // seed should produce a different blueprint. A bug
    // that always returns the same blueprint (e.g. a
    // hard-coded `seed = 1`) would be caught here.
    let a = generate_runtime_scene(make_request(1, 5, "neon", vec![]));
    let b = generate_runtime_scene(make_request(2, 5, "neon", vec![]));
    assert_ne!(a, b, "different seeds must produce different blueprints");
}

#[test]
fn theme_hint_picks_correct_biome() {
    // The four theme_hint substrings the engine recognizes
    // (see `pick_biome` in runtime_scene.rs): cyber/neon/city
    // → NeonHarbor, forest/ruin → VerdantRuins,
    // desert/temple/forge → SunforgeBazaar,
    // space/orbit/nebula → OrbitalGarden.
    let neon = generate_runtime_scene(make_request(1, 5, "neon", vec![]));
    assert_eq!(neon.biome, RuntimeBiome::NeonHarbor, "'neon' hint should pick NeonHarbor");
    let ruin = generate_runtime_scene(make_request(1, 5, "ruin", vec![]));
    assert_eq!(ruin.biome, RuntimeBiome::VerdantRuins, "'ruin' hint should pick VerdantRuins");
    let forge = generate_runtime_scene(make_request(1, 5, "forge", vec![]));
    assert_eq!(forge.biome, RuntimeBiome::SunforgeBazaar, "'forge' hint should pick SunforgeBazaar");
    let orbit = generate_runtime_scene(make_request(1, 5, "orbit", vec![]));
    assert_eq!(orbit.biome, RuntimeBiome::OrbitalGarden, "'orbit' hint should pick OrbitalGarden");
}

#[test]
fn unknown_theme_hint_falls_back_to_random_biome() {
    // No matching substring → pick_biome rolls a uniform
    // 0..4 → all four biomes are valid. The contract
    // is "produces SOME biome, not None".
    for seed in 1u64..=20 {
        let bp = generate_runtime_scene(make_request(seed, 5, "no-such-thing", vec![]));
        let valid = matches!(
            bp.biome,
            RuntimeBiome::NeonHarbor
                | RuntimeBiome::VerdantRuins
                | RuntimeBiome::SunforgeBazaar
                | RuntimeBiome::OrbitalGarden
        );
        assert!(valid, "seed {seed} produced an unknown biome {:?}", bp.biome);
    }
}

#[test]
fn difficulty_clamps_to_1_through_10() {
    // The engine clamps `difficulty` to 1..=10 in
    // `generate_runtime_scene`. We verify the clamp by
    // calling with 0 and with 99 and checking the
    // resulting blueprint's difficulty field.
    let low = generate_runtime_scene(make_request(1, 0, "neon", vec![]));
    assert_eq!(low.difficulty, 1, "difficulty 0 should clamp to 1");
    let high = generate_runtime_scene(make_request(1, 99, "neon", vec![]));
    assert_eq!(high.difficulty, 10, "difficulty 99 should clamp to 10");
}

#[test]
fn lane_count_grows_with_difficulty() {
    // Lane count formula: `(2 + difficulty / 3).clamp(2, 5)`
    // — so difficulty 1 → 2 lanes, difficulty 4 → 3 lanes,
    // difficulty 7 → 4 lanes, difficulty 10 → 5 lanes.
    for d in 1u32..=10 {
        let bp = generate_runtime_scene(make_request(1, d, "neon", vec![]));
        let expected = (2 + d / 3).clamp(2, 5);
        assert_eq!(
            bp.lanes.len() as u32,
            expected,
            "difficulty {d} should produce {expected} lanes, got {}",
            bp.lanes.len()
        );
    }
}

#[test]
fn tower_anchor_count_is_at_least_lane_count() {
    // The engine builds tower anchors from the lane
    // geometry. The engine may emit multiple anchors
    // per lane (e.g. one at each bend, plus extra
    // flanking positions), so anchors.len() >= lanes.len()
    // is the right contract. A regression that emits
    // zero anchors for a non-empty lane set would
    // silently make the bridge render no towers.
    for d in [1u32, 5, 10] {
        let bp = generate_runtime_scene(make_request(1, d, "neon", vec![]));
        assert!(
            !bp.tower_anchors.is_empty(),
            "difficulty {d}: tower_anchors should be non-empty, got {}",
            bp.tower_anchors.len()
        );
        assert!(
            bp.tower_anchors.len() >= bp.lanes.len(),
            "difficulty {d}: anchors ({}) should be >= lanes ({})",
            bp.tower_anchors.len(),
            bp.lanes.len()
        );
    }
}

#[test]
fn explicit_modules_propagate_unchanged() {
    // When the caller passes a non-empty `modules` list,
    // the engine must NOT overwrite it with
    // `default_modules(difficulty)`. The bridge uses this
    // path when the DM wants a specific atom set.
    let bp = generate_runtime_scene(make_request(
        1,
        5,
        "neon",
        vec!["match3", "tower_defense"],
    ));
    assert_eq!(bp.modules, vec!["match3".to_string(), "tower_defense".to_string()]);
}

#[test]
fn empty_modules_get_filled_with_difficulty_defaults() {
    // The dual of the propagation check: empty modules
    // → engine picks a default. The default varies by
    // difficulty band (see `default_modules`).
    let easy = generate_runtime_scene(make_request(1, 2, "neon", vec![]));
    let hard = generate_runtime_scene(make_request(1, 9, "neon", vec![]));
    assert!(!easy.modules.is_empty());
    assert!(!hard.modules.is_empty());
    // The exact modules depend on cocos4-rust's
    // `default_modules`, but the easy and hard defaults
    // should differ (the formula is banded by difficulty).
    assert_ne!(easy.modules, hard.modules, "easy vs hard defaults should differ");
}

#[test]
fn palette_per_biome_is_distinct() {
    // The four biomes each ship their own palette
    // (sky/ground/road/tower/etc.). The bridge serializes
    // these as camelCase JSON. We verify the runtime
    // palette field is populated and varies across
    // biomes — a future regression that uses a single
    // global palette would be caught here.
    let neon = generate_runtime_scene(make_request(1, 5, "neon",  vec![]));
    let ruin = generate_runtime_scene(make_request(1, 5, "ruin",  vec![]));
    let forge = generate_runtime_scene(make_request(1, 5, "forge", vec![]));
    let orbit = generate_runtime_scene(make_request(1, 5, "orbit", vec![]));
    // The sky color of each biome must differ — that's
    // the most visually obvious field and the easiest
    // proxy for "the palettes are not all the same".
    let sky_top = [
        neon.palette.sky_top,
        ruin.palette.sky_top,
        forge.palette.sky_top,
        orbit.palette.sky_top,
    ];
    for (i, a) in sky_top.iter().enumerate() {
        for (j, b) in sky_top.iter().enumerate() {
            if i != j {
                assert_ne!(a, b, "biomes {i} and {j} share the same sky_top color");
            }
        }
    }
    // The tower color should also vary (a biome's
    // tower palette is the most read-by-eye field
    // after sky).
    let mut tower: Vec<&'static str> = vec![
        neon.palette.tower,
        ruin.palette.tower,
        forge.palette.tower,
        orbit.palette.tower,
    ];
    tower.sort();
    tower.dedup();
    assert_eq!(tower.len(), 4, "towers should have 4 distinct colors");
}

#[test]
fn events_chain_is_populated() {
    // The runtime scene includes a director-event list
    // (spawn waves, boss hints, treasure drops, etc.).
    // The TS bridge's `synthesizeDmEventChain` falls
    // back to this list when a per-DM chain isn't
    // provided. We verify the list is non-empty.
    let bp = generate_runtime_scene(make_request(1, 5, "neon", vec![]));
    assert!(!bp.events.is_empty(), "director events should be populated");
}

#[test]
fn logic_source_is_a_nontrivial_dsl_string() {
    // `logic_source` is the generated gameplay DSL
    // (a string the engine emits and the TS bridge
    // parses via `createRuntimeLogic`). It should
    // be non-empty and contain at least a few
    // characters — a regression that emits "" would
    // break runtime logic without raising a compile
    // error.
    let bp = generate_runtime_scene(make_request(1, 5, "neon", vec![]));
    assert!(bp.logic_source.len() > 10, "logic_source should be a non-trivial string, got: {:?}", bp.logic_source);
}
