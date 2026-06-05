/**
 * Round 23 — TS mirror tests for `SceneGen.ts`.
 * 1:1 mirror of `cocos4-rust/src/agi_minigame/scene_gen.rs` tests.
 */

import { NpcDisposition, NpcMind, NpcRegistry, defaultDisposition, makeEntry } from '../world/NpcMind';
import {
    buildGenerationConfigWithMood,
    moodPromotedAtoms,
    DEFAULT_GENERATION_HINT,
    GenerationHint,
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
