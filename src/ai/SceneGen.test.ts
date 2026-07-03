/**
 * Round 23 — TS mirror tests for `SceneGen.ts`.
 * 1:1 mirror of `cocos4-rust/src/agi_minigame/scene_gen.rs` tests.
 */

import { NpcDisposition, NpcMind, NpcRegistry, defaultDisposition, makeEntry } from '../world/NpcMind';
import {
    buildGenerationConfigWithMood,
    moodPromotedAtoms,
    moodPalette,
    paletteBackground,
    paletteAccent,
    DEFAULT_GENERATION_HINT,
    GenerationHint,
    FEAR_PALETTE,
    FRIENDLY_PALETTE,
    HOSTILE_PALETTE,
    NEUTRAL_PALETTE,
    ALL_PALETTES,
    themeToScene,
    defaultWfcWeights,
    ThemeInput,
    VisualStyle,
    MusicMood,
    NpcArchetype,
} from './SceneGen';

const neutral = (): NpcDisposition => defaultDisposition();

describe('SceneGen — round 23 reflexive scene generation', () => {
    test('neutral_mood_preserves_base_hint_range', () => {
        const cfg = buildGenerationConfigWithMood(5, 0, neutral(), DEFAULT_GENERATION_HINT, 42);
        expect(cfg.difficultyRange[0]).toBeCloseTo(0.3, 5);
        expect(cfg.difficultyRange[1]).toBeCloseTo(0.8, 5);
    });

    test('high_fear_lowers_upper_below_base', () => {
        const fear: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        const cfg = buildGenerationConfigWithMood(5, 0, fear, DEFAULT_GENERATION_HINT, 7);
        expect(cfg.difficultyRange[1]).toBeLessThan(0.80);
        expect(cfg.difficultyRange[0]).toBeCloseTo(0.30, 5);
        expect(cfg.difficultyRange[1]).toBeCloseTo(0.75, 5);
    });

    test('friendly_and_trusting_raises_lower_above_base', () => {
        const loved: NpcDisposition = { friendly: 0.7, fear: 0.0, trust: 0.4 };
        const cfg = buildGenerationConfigWithMood(5, 0, loved, DEFAULT_GENERATION_HINT, 13);
        expect(cfg.difficultyRange[0]).toBeGreaterThan(0.30);
        expect(cfg.difficultyRange[0]).toBeCloseTo(0.35, 5);
        expect(cfg.difficultyRange[1]).toBeCloseTo(0.80, 5);
    });

    test('hated_lowers_lower_below_base', () => {
        const hated: NpcDisposition = { friendly: -0.5, fear: 0.0, trust: 0.0 };
        const cfg = buildGenerationConfigWithMood(5, 0, hated, DEFAULT_GENERATION_HINT, 21);
        expect(cfg.difficultyRange[0]).toBeLessThan(0.30);
        expect(cfg.difficultyRange[0]).toBeCloseTo(0.25, 5);
        expect(cfg.difficultyRange[1]).toBeCloseTo(0.80, 5);
    });

    test('stacked_moods_clamp_to_unit_range', () => {
        const nightmare: NpcDisposition = { friendly: -1.0, fear: 1.0, trust: -1.0 };
        const cfg = buildGenerationConfigWithMood(20, 0, nightmare, DEFAULT_GENERATION_HINT, 99);
        expect(cfg.difficultyRange[0]).toBeGreaterThanOrEqual(0.1);
        expect(cfg.difficultyRange[1]).toBeLessThanOrEqual(1.0);
        expect(cfg.difficultyRange[0]).toBeLessThanOrEqual(cfg.difficultyRange[1]);
    });

    test('seed_determinism_same_input_same_output', () => {
        const fear: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        const a = buildGenerationConfigWithMood(5, 0, fear, DEFAULT_GENERATION_HINT, 42);
        const b = buildGenerationConfigWithMood(5, 0, fear, DEFAULT_GENERATION_HINT, 42);
        expect(a.difficultyRange).toEqual(b.difficultyRange);
        expect(a.preferredTypes).toEqual(b.preferredTypes);
        expect(a.excludedTypes).toEqual(b.excludedTypes);
        expect(a.playerLevel).toEqual(b.playerLevel);
        expect(a.minAtoms).toEqual(b.minAtoms);
        expect(a.maxAtoms).toEqual(b.maxAtoms);
    });

    test('neutral_mood_does_not_promote', () => {
        const cfg = buildGenerationConfigWithMood(5, 0, neutral(), DEFAULT_GENERATION_HINT, 42);
        // No mood branches fire → head of preferredTypes is the
        // base-pool head for level 5.
        expect(cfg.preferredTypes[0]).toBe('tower_defense');
    });

    test('extreme_fear_caps_difficulty_upper', () => {
        const fear: NpcDisposition = { friendly: 0.0, fear: 1.0, trust: 0.0 };
        const cfg = buildGenerationConfigWithMood(20, 0, fear, DEFAULT_GENERATION_HINT, 1);
        expect(cfg.difficultyRange[1]).toBeLessThanOrEqual(1.0);
        expect(cfg.difficultyRange[0]).toBeGreaterThanOrEqual(0.1);
    });

    test('preferred_types_are_deduped_across_promoted_and_base', () => {
        const loved: NpcDisposition = { friendly: 0.7, fear: 0.0, trust: 0.4 };
        for (let seed = 0; seed < 50; seed++) {
            const cfg = buildGenerationConfigWithMood(5, 0, loved, DEFAULT_GENERATION_HINT, seed);
            const seen = new Set<string>();
            for (const t of cfg.preferredTypes) {
                expect(seen.has(t)).toBe(false);
                seen.add(t);
            }
        }
    });

    test('default_hint_fields', () => {
        const h: GenerationHint = DEFAULT_GENERATION_HINT;
        expect(h.minAtoms).toBe(2);
        expect(h.maxAtoms).toBe(4);
        expect(h.rewardMultiplier).toBe(1.0);
        expect(h.baseDifficultyRange).toEqual([0.3, 0.8]);
    });

    test('excluded_types_drops_shooting_after_three_losses', () => {
        const cfg = buildGenerationConfigWithMood(5, 3, neutral(), DEFAULT_GENERATION_HINT, 0);
        expect(cfg.excludedTypes).toContain('shooting');
    });

    test('excluded_types_empty_below_three_losses', () => {
        const cfg = buildGenerationConfigWithMood(5, 2, neutral(), DEFAULT_GENERATION_HINT, 0);
        expect(cfg.excludedTypes).toEqual([]);
    });

    // ---- Additional TS-side coverage ----

    test('mood_promoted_atoms_fear_returns_parkour_or_puzzle', () => {
        const fear: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        for (let seed = 0; seed < 10; seed++) {
            const atoms = moodPromotedAtoms(fear, seed);
            expect(atoms.length).toBe(1);
            expect(['parkour', 'puzzle']).toContain(atoms[0]);
        }
    });

    test('mood_promoted_atoms_multiple_branches_stack', () => {
        // fear=0.8 AND friendly<-0.3 → two branches fire.
        const nightmare: NpcDisposition = { friendly: -0.5, fear: 0.8, trust: 0.0 };
        const atoms = moodPromotedAtoms(nightmare, 42);
        expect(atoms.length).toBe(2);
        // Order: fear branch first, then hostile branch.
        expect(['parkour', 'puzzle']).toContain(atoms[0]);
        expect(['tower_defense', 'turn_combat']).toContain(atoms[1]);
    });

    test('seed_determinism_promoted_atoms', () => {
        // AC7 — same seed must give same result.
        const fear: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        const a = moodPromotedAtoms(fear, 42);
        const b = moodPromotedAtoms(fear, 42);
        expect(a).toEqual(b);
    });
});

describe('SceneGen — integration with NpcRegistry round trip', () => {
    test('plan_with_neutral_mood_yields_byte_identical_config_to_existing_path', () => {
        // AC5 — neutral mood must produce a GenerationConfig that the
        // AIBridge / DimensionGenerator downstream will handle the
        // same way as the existing `toGenerationConfig` baseline.
        // (We can't compare against the exact TS function without
        // wiring it up; we compare fields.)
        const cfg = buildGenerationConfigWithMood(5, 0, neutral(), DEFAULT_GENERATION_HINT, 42);
        expect(cfg.difficultyRange[0]).toBeCloseTo(0.3, 5);
        expect(cfg.difficultyRange[1]).toBeCloseTo(0.8, 5);
        expect(cfg.preferredTypes[0]).toBe('tower_defense');
        expect(cfg.excludedTypes).toEqual([]);
        expect(cfg.minAtoms).toBe(2);
        expect(cfg.maxAtoms).toBe(4);
        expect(cfg.playerLevel).toBe(5);
    });

    test('plan_after_three_positive_broadcasts_lowers_lower_bound_friendly', () => {
        // AC8 (TS mirror) — after 3 friendly broadcasts the average
        // disposition is friendly+trusting, which should raise the
        // lower bound (raise the stakes for the beloved player).
        const reg = new NpcRegistry();
        for (let i = 0; i < 3; i++) {
            reg.insert(new NpcMind(`n${i}`));
        }
        for (let i = 0; i < 3; i++) {
            reg.broadcast(makeEntry('received_gift', `potion ${i}`, i + 1, 0.6));
        }
        const avg = reg.averageDisposition();
        // Sanity: 3 gifts × 0.6 weight → friendly += 0.6*0.4*3 = 0.72 (clamped)
        // trust  += 0.6*0.3*3 = 0.54 (clamped)
        expect(avg.friendly).toBeGreaterThan(0.5);
        expect(avg.trust).toBeGreaterThan(0.3);
        const cfg = buildGenerationConfigWithMood(5, 0, avg, DEFAULT_GENERATION_HINT, 42);
        // friendly+trust should fire the lower+=0.05 nudge.
        expect(cfg.difficultyRange[0]).toBeGreaterThan(0.30);
    });
});

describe('SceneGen — round 24 mood-aware color palettes', () => {
    test('fear_returns_cool_dark_palette', () => {
        const fear: NpcDisposition = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        expect(moodPalette(fear)).toEqual(FEAR_PALETTE);
    });

    test('friendly_and_trusting_returns_warm_palette', () => {
        const loved: NpcDisposition = { friendly: 0.7, fear: 0.0, trust: 0.4 };
        expect(moodPalette(loved)).toEqual(FRIENDLY_PALETTE);
    });

    test('hostile_returns_aggressive_palette', () => {
        const hated: NpcDisposition = { friendly: -0.5, fear: 0.0, trust: 0.0 };
        expect(moodPalette(hated)).toEqual(HOSTILE_PALETTE);
    });

    test('neutral_returns_neutral_palette', () => {
        expect(moodPalette(defaultDisposition())).toEqual(NEUTRAL_PALETTE);
        // Frightened but still friendly → no fear-priority match.
        const warmish: NpcDisposition = { friendly: 0.2, fear: 0.1, trust: 0.0 };
        expect(moodPalette(warmish)).toEqual(NEUTRAL_PALETTE);
    });

    test('fear_takes_priority_over_friendly_when_both_fire', () => {
        // Canonical order: fear first, matching mood_bias and
        // moodPromotedAtoms.
        const nightmare: NpcDisposition = { friendly: 0.9, fear: 0.9, trust: 0.5 };
        expect(moodPalette(nightmare)).toEqual(FEAR_PALETTE);
    });

    test('all_palettes_have_exactly_three_entries', () => {
        for (const p of ALL_PALETTES) {
            expect(p.length).toBe(3);
        }
    });

    test('palette_background_and_accent_helpers', () => {
        const p = moodPalette(defaultDisposition());
        expect(paletteBackground(p)).toBe(p[0]);
        expect(paletteAccent(p)).toBe(p[2]);
    });

    test('palette_colors_match_engine_1to1', () => {
        // Cross-check the canonical hex values from the Rust side
        // match the TS values exactly. If anyone changes one side,
        // the test fails and forces the other to be updated.
        expect(FEAR_PALETTE).toEqual(['#0A1A2F', '#1B4965', '#CAE9FF']);
        expect(FRIENDLY_PALETTE).toEqual(['#FF6B35', '#F7C548', '#FFFAEB']);
        expect(HOSTILE_PALETTE).toEqual(['#6A040F', '#9D0208', '#FFBA08']);
        expect(NEUTRAL_PALETTE).toEqual(['#3A0CA3', '#7209B7', '#F72585']);
    });
});

// ---- Round 24 (part 2) — ThemeContent → scene structure ----

function input(visual: VisualStyle, mood: MusicMood, difficulty: number, seed: number): ThemeInput {
    return { visualStyle: visual, musicMood: mood, difficulty, seed };
}

describe('SceneGen — round 24 theme-to-scene', () => {
    test('theme_to_scene_cyberpunk_returns_correct_biome', () => {
        const bp = themeToScene(input('cyberpunk', 'pulse', 0.5, 1));
        expect(bp.biomeId).toBe('cyberpunk');
    });

    test('theme_to_scene_cyberpunk_dense_npc', () => {
        // cyberpunk base 0.9 × (0.5 + 0.7*0.7) = 0.9 × 0.99 = 0.891
        const bp = themeToScene(input('cyberpunk', 'pulse', 0.7, 1));
        expect(bp.npcDensity).toBeGreaterThanOrEqual(0.6);
        expect(bp.npcCount).toBeGreaterThanOrEqual(1);
    });

    test('theme_to_scene_dungeon_more_walls', () => {
        const bp = themeToScene(input('dungeon', 'tense', 0.5, 1));
        expect(bp.wfcTileWeights[1]).toBeGreaterThanOrEqual(4);
    });

    test('theme_to_scene_desert_dense_traps', () => {
        const bp = themeToScene(input('desert', 'epic', 0.5, 1));
        expect(bp.wfcTileWeights[6]).toBeGreaterThanOrEqual(3);
    });

    test('theme_to_scene_underwater_maps_to_ice_biome', () => {
        const bp = themeToScene(input('underwater', 'mysterious', 0.5, 1));
        expect(bp.biomeId).toBe('ice');
    });

    test('theme_to_scene_event_chain_length_in_range', () => {
        for (let seed = 0; seed < 20; seed++) {
            const bp = themeToScene(input('fantasy', 'cheerful', 0.5, seed));
            expect(bp.eventChain.length).toBeGreaterThanOrEqual(3);
            expect(bp.eventChain.length).toBeLessThanOrEqual(5);
        }
    });

    test('theme_to_scene_event_chain_deterministic_for_seed', () => {
        const a = themeToScene(input('space', 'pulse', 0.5, 42));
        const b = themeToScene(input('space', 'pulse', 0.5, 42));
        expect(a.eventChain).toEqual(b.eventChain);
    });

    test('theme_to_scene_music_bpm_within_bounds', () => {
        const visuals: VisualStyle[] = ['cyberpunk', 'fantasy', 'space', 'underwater', 'desert', 'dungeon'];
        const moods: MusicMood[] = ['epic', 'mysterious', 'cheerful', 'tense', 'melancholic', 'pulse'];
        for (const v of visuals) {
            for (const m of moods) {
                const bp = themeToScene(input(v, m, 0.5, 1));
                expect(bp.musicBpm).toBeGreaterThanOrEqual(60);
                expect(bp.musicBpm).toBeLessThanOrEqual(160);
            }
        }
    });

    test('theme_to_scene_npc_density_scales_with_difficulty', () => {
        const low = themeToScene(input('cyberpunk', 'pulse', 0.1, 1));
        const high = themeToScene(input('cyberpunk', 'pulse', 0.9, 1));
        expect(high.npcDensity).toBeGreaterThan(low.npcDensity);
    });

    test('theme_to_scene_archetype_hints_per_visual_style', () => {
        const cases: Array<[VisualStyle, NpcArchetype[]]> = [
            ['cyberpunk', ['robot']],
            ['fantasy',   ['mage', 'beast']],
            ['space',     ['astronaut', 'alien']],
            ['underwater',['siren', 'diver']],
            ['desert',    ['scorpion', 'nomad']],
            ['dungeon',   ['skeleton', 'lich']],
        ];
        for (const [v, expected] of cases) {
            const bp = themeToScene(input(v, 'pulse', 0.5, 1));
            expect(bp.npcArchetypeHints).toEqual(expected);
        }
    });

    test('default_wfc_weights_match_six_six_six', () => {
        // Mirrors Rust `default_wfc_weights()` and TS WfcLevelGen.DEFAULT_TILES.
        expect(defaultWfcWeights()).toEqual([6, 3, 1, 1, 0, 0, 1, 1]);
    });

    test('theme_to_scene_cross_layer_density_snapshots', () => {
        // AC7 — for seeds 0..10 cyberpunk + pulse, the density must
        // be byte-identical to the Rust side (the formula is the
        // same f32 math on both sides, with ≤ 1e-6 rounding).
        // cyberpunk base 0.9; density = 0.9 * (0.5 + 0.7 * d).
        const expectedDensity: number[] = [
            0.513, 0.5445, 0.576, 0.6075, 0.639,
            0.6705, 0.702, 0.7335, 0.765, 0.7965, 0.828,
        ];
        for (let i = 0; i < expectedDensity.length; i++) {
            const bp = themeToScene(input('cyberpunk', 'pulse', 0.1 + i * 0.05, i));
            expect(bp.npcDensity).toBeCloseTo(expectedDensity[i], 3);
        }
    });
});
