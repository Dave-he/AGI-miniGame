/**
 * Round 164 — tests for the TS mirror of
 * cocos4-rust's `dsl/codegen` module.
 *
 * The tests are organized in 4 describe blocks
 * that mirror the Rust test modules:
 *   - `seedFromString_*`  ↔ Rust `mod round164_tests::seed_from_string_*`
 *   - `seedOffset_*`     ↔ Rust `mod round163_tests::seed_offset_*`
 *   - `generateRules_*`  ↔ Rust `mod round162_tests::generate_rules_*`
 *   - `autoGenerateForDimension_*` ↔ new round-164 App-wiring tests
 *
 * The known-vector tests (e.g.
 * `seedFromString_known_vector_round_164`) pin
 * the FNV-1a 64-bit constants so a regression on
 * either side (TS or Rust) breaks the same
 * cross-check.
 */

import {
    seedFromString,
    seedOffset,
    generateRules,
    generateRule,
    autoGenerateForDimension,
    biomeIdToKind,
    moodKindFromSeed,
    DEFAULT_GEN_INPUT,
} from './codegenBindings';
import type { GenInput } from './codegenBindings';

// ============================================================================
//  seedFromString — round 164 (TS mirror of `codegen::seed_from_string`)
// ============================================================================

describe('seedFromString round_164', () => {
    test('empty_string_returns_fnv_offset_basis_round_164', () => {
        // FNV-1a 64-bit offset basis:
        // 0xCBF29CE484222325
        expect(seedFromString('')).toBe(0xCBF29CE484222325n);
    });

    test('is_deterministic_round_164', () => {
        for (const s of ['dim_alpha', 'dim_beta', 'forest', 'cyber_boss_wave', 'x']) {
            expect(seedFromString(s)).toBe(seedFromString(s));
        }
    });

    test('distinct_inputs_give_distinct_seeds_round_164', () => {
        const inputs = [
            'forest', 'desert', 'ice', 'cyber',
            'dim_alpha', 'dim_beta', 'dim_gamma',
            'cyber_boss_wave', 'ice_herb', 'desert_thorn',
        ];
        const seeds = inputs.map(s => seedFromString(s));
        const unique = new Set(seeds.map(s => s.toString()));
        expect(unique.size).toBe(10);
    });

    test('known_vector_round_164', () => {
        // These constants are derived from the FNV
        // reference implementation. A regression
        // that flips the algorithm order (FNV-1
        // "multiply then xor" instead of FNV-1a
        // "xor then multiply") would change these
        // values and break the cross-check with
        // the Rust side.
        expect(seedFromString('')).toBe(0xCBF29CE484222325n);
        expect(seedFromString('a')).toBe(0xAF63DC4C8601EC8Cn);
        expect(seedFromString('b')).toBe(0xAF63DF4C8601F1A5n);
        expect(seedFromString('forest')).toBe(0x2098148EC99FB680n);
    });

    test('unicode_is_stable_and_distinct_round_164', () => {
        // The hash operates on the UTF-16 code
        // units (truncated to 8 bits, mirroring
        // Rust's UTF-8 byte iteration on ASCII).
        // For non-BMP strings the two sides may
        // diverge — what matters for round-164
        // is the in-language stability.
        const a = seedFromString('次元_alpha');
        const b = seedFromString('次元_alpha');
        expect(a).toBe(b);
        // And a 1-char difference produces a
        // different seed.
        expect(seedFromString('次元_alpha')).not.toBe(seedFromString('次元_beta'));
    });
});

// ============================================================================
//  seedOffset — round 163 (TS mirror of `codegen::seed_offset`)
// ============================================================================

describe('seedOffset round_163', () => {
    test('returns_value_in_negative_half_to_positive_half_round_163', () => {
        for (let seed = 0n; seed < 64n; seed++) {
            for (let slot = 0; slot < 5; slot++) {
                const v = seedOffset(seed, slot);
                expect(v).toBeGreaterThanOrEqual(-0.5);
                expect(v).toBeLessThanOrEqual(0.5);
            }
        }
    });

    test('is_deterministic_round_163', () => {
        for (const seed of [0n, 1n, 42n, 0xDEADn, 0xFEEDBEEFn]) {
            for (let slot = 0; slot < 5; slot++) {
                expect(seedOffset(seed, slot)).toBe(seedOffset(seed, slot));
            }
        }
    });

    test('different_seeds_produce_different_offsets_round_163', () => {
        expect(seedOffset(0n, 0)).not.toBe(seedOffset(1n, 0));
        expect(seedOffset(0n, 0)).not.toBe(seedOffset(42n, 0));
        expect(seedOffset(1n, 0)).not.toBe(seedOffset(42n, 0));
    });
});

// ============================================================================
//  generateRules — round 162 (TS mirror of `codegen::generate_rules`)
// ============================================================================

describe('generateRules round_162', () => {
    function low(): GenInput {
        return { biome: 'Forest', mood: 'Calm', complexity: 'Low', seed: 0n };
    }
    function med(): GenInput {
        return { biome: 'Desert', mood: 'Tense', complexity: 'Medium', seed: 0n };
    }
    function high(): GenInput {
        return { biome: 'Cyberpunk', mood: 'Epic', complexity: 'High', seed: 0n };
    }

    test('low_complexity_emits_one_rule_round_162', () => {
        expect(generateRules(low())).toHaveLength(1);
    });

    test('medium_complexity_emits_three_rules_round_162', () => {
        expect(generateRules(med())).toHaveLength(3);
    });

    test('high_complexity_emits_five_rules_round_162', () => {
        expect(generateRules(high())).toHaveLength(5);
    });

    test('is_deterministic_round_162', () => {
        expect(generateRules(med())).toEqual(generateRules(med()));
    });

    test('mood_calm_emits_heal_action_round_162', () => {
        const rules = generateRules({
            biome: 'Desert', mood: 'Calm', complexity: 'Medium', seed: 0n,
        });
        expect(rules[1].actions[0].kind).toBe('Heal');
    });

    test('mood_tense_emits_damage_action_round_162', () => {
        const rules = generateRules(med());
        expect(rules[1].actions[0].kind).toBe('Damage');
    });

    test('mood_epic_emits_spawn_action_round_162', () => {
        const rules = generateRules({
            biome: 'Cyberpunk', mood: 'Epic', complexity: 'Medium', seed: 0n,
        });
        expect(rules[1].actions[0].kind).toBe('Spawn');
    });

    test('mood_mysterious_emits_spawn_entity_round_162', () => {
        const rules = generateRules({
            biome: 'Ice', mood: 'Mysterious', complexity: 'Medium', seed: 0n,
        });
        expect(rules[1].actions[0].kind).toBe('SpawnEntity');
    });

    test('high_complexity_includes_playerhit_rule_round_162', () => {
        const rules = generateRules(high());
        expect(rules.some(r => r.event.kind === 'PlayerHit')).toBe(true);
    });

    test('biome_flavor_propagates_into_spawn_population_rule_round_162', () => {
        const rules = generateRules({
            biome: 'Forest', mood: 'Calm', complexity: 'Low', seed: 0n,
        });
        expect(rules[0].actions[0].args[0]).toBe('forest_mob');
    });

    test('generate_rule_singleton_matches_baseline_round_162', () => {
        const input = high();
        expect(generateRule(input)).toEqual(generateRules(input)[0]);
    });
});

// ============================================================================
//  generateRules — round 163 (TS mirror of seed-axis perturbation)
// ============================================================================

describe('generateRules round_163 (seed axis)', () => {
    function forestCalmMed(seed: bigint): GenInput {
        return { biome: 'Forest', mood: 'Calm', complexity: 'Medium', seed };
    }

    test('seed_axis_preserves_rule_count_round_163', () => {
        for (const seed of [0n, 1n, 42n, 999n, BigInt(0xCAFE)]) {
            expect(generateRules(forestCalmMed(seed))).toHaveLength(3);
        }
    });

    test('seed_axis_preserves_action_kinds_round_163', () => {
        // The seed perturbs AMOUNTS, not KINDS.
        for (const seed of [0n, 1n, 42n, 999n, BigInt(0xCAFE)]) {
            const rules = generateRules(forestCalmMed(seed));
            expect(rules[1].actions[0].kind).toBe('Heal');
        }
    });

    test('seed_axis_produces_distinct_magnitudes_round_163', () => {
        const r0 = generateRules(forestCalmMed(0n));
        const r42 = generateRules(forestCalmMed(42n));
        // The baseline spawn-count arg is
        // args[1] of the first action.
        const count0 = r0[0].actions[0].args[1];
        const count42 = r42[0].actions[0].args[1];
        expect(count0).not.toBe(count42);
    });
});

// ============================================================================
//  autoGenerateForDimension — round 164 (App wiring)
// ============================================================================

describe('autoGenerateForDimension round_164', () => {
    test('returns_input_and_rules_round_164', () => {
        const { input, rules } = autoGenerateForDimension('dim_alpha', 'forest');
        expect(input.biome).toBe('Forest');
        expect(input.complexity).toBe('Medium');
        expect(rules.length).toBeGreaterThan(0);
    });

    test('same_dimension_id_is_stable_round_164', () => {
        const a = autoGenerateForDimension('dim_alpha', 'forest');
        const b = autoGenerateForDimension('dim_alpha', 'forest');
        expect(a.input.seed).toBe(b.input.seed);
        expect(a.rules).toEqual(b.rules);
    });

    test('different_dimension_ids_give_different_rules_round_164', () => {
        const a = autoGenerateForDimension('dim_alpha', 'forest');
        const b = autoGenerateForDimension('dim_beta', 'forest');
        // Different seeds → different rules
        // (for Low complexity, the spawn count
        // is the easiest perturbation to
        // detect).
        expect(a.input.seed).not.toBe(b.input.seed);
        expect(a.rules[0].actions[0].args[1])
            .not.toBe(b.rules[0].actions[0].args[1]);
    });

    test('biome_id_to_kind_maps_known_values_round_164', () => {
        expect(biomeIdToKind('forest')).toBe('Forest');
        expect(biomeIdToKind('desert')).toBe('Desert');
        expect(biomeIdToKind('ice')).toBe('Ice');
        expect(biomeIdToKind('cyberpunk')).toBe('Cyberpunk');
    });

    test('biome_id_to_kind_maps_space_and_lava_round_167', () => {
        // Round 167 — `lava` and `space` are now first-class
        // BiomeKind variants (the 6-biome atmosphere palette
        // is fully represented). A Space biome's auto-gen
        // rules now read `space_mob` instead of falling back
        // to `forest_mob`. The Rust `biome_from_id` mirror
        // uses the same mapping.
        expect(biomeIdToKind('space')).toBe('Space');
        expect(biomeIdToKind('lava')).toBe('Lava');
    });

    test('biome_id_to_kind_falls_back_to_forest_for_unknown_round_164', () => {
        // Truly unknown tags still fall back to Forest —
        // `space` and `lava` now have first-class mappings
        // (round 167) so they're NOT in this fallback path.
        expect(biomeIdToKind('unknown')).toBe('Forest');
        expect(biomeIdToKind('')).toBe('Forest');
        expect(biomeIdToKind('dungeon')).toBe('Forest');
    });

    test('mood_kind_from_seed_covers_all_4_moods_round_164', () => {
        // Sample 64 seeds and check that all
        // 4 MoodKinds are reachable. A bug
        // that always returned Calm would fail
        // this.
        const seen = new Set<string>();
        for (let i = 0n; i < 64n; i++) {
            seen.add(moodKindFromSeed(i));
        }
        expect(seen.size).toBe(4);
        expect(seen.has('Calm')).toBe(true);
        expect(seen.has('Tense')).toBe(true);
        expect(seen.has('Epic')).toBe(true);
        expect(seen.has('Mysterious')).toBe(true);
    });

    test('default_gen_input_round_164', () => {
        // The default input mirrors the pre-
        // round-163 codegen output (so old
        // callers that don't think about the
        // seed axis still get the same rules
        // they used to).
        expect(DEFAULT_GEN_INPUT.biome).toBe('Forest');
        expect(DEFAULT_GEN_INPUT.mood).toBe('Calm');
        expect(DEFAULT_GEN_INPUT.complexity).toBe('Low');
        expect(DEFAULT_GEN_INPUT.seed).toBe(0n);
    });

    test('complexity_can_be_overridden_round_164', () => {
        const low = autoGenerateForDimension('dim_alpha', 'forest', 'Low');
        const high = autoGenerateForDimension('dim_alpha', 'forest', 'High');
        expect(low.rules).toHaveLength(1);
        expect(high.rules).toHaveLength(5);
    });

    // Round 167 — cross-validation: each
    // biome's auto-generated rule set must
    // carry that biome's spawn tag in the
    // baseline rule's `Spawn` action args[0].
    // The Rust `generate_rules_json_internal`
    // emits the same biome-specific mob
    // string, so a regression on either side
    // breaks both.
    test('each_biome_baseline_uses_its_own_mob_tag_round_167', () => {
        const expectedMob: Record<string, string> = {
            Forest: 'forest_mob',
            Desert: 'desert_mob',
            Ice: 'ice_mob',
            Cyberpunk: 'cyber_mob',
            Lava: 'lava_mob',
            Space: 'space_mob',
        };
        for (const biome of Object.keys(expectedMob) as Array<keyof typeof expectedMob>) {
            const out = autoGenerateForDimension(
                `dim_${biome.toLowerCase()}`,
                biome.toLowerCase(),
                'Low', // Low complexity emits only the baseline.
            );
            // Round 132 manual JSON shape: rule.actions[0].args[0].
            const baseline = out.rules[0];
            expect(baseline).toBeDefined();
            const firstAction = (baseline.actions as Array<{ kind: string; args: unknown[] }>)[0];
            expect(firstAction.kind).toBe('Spawn');
            expect(firstAction.args[0]).toBe(expectedMob[biome]);
        }
    });

    test('biome_id_to_kind_covers_six_atmospheric_variants_round_167', () => {
        // The 6-biome atmosphere palette is
        // the source of truth for "what
        // biomes the player sees" — the
        // BiomeKind enum must match it
        // exactly. A regression that drops
        // Lava or Space would break this
        // pin.
        const allBiomes = new Set([
            biomeIdToKind('forest'),
            biomeIdToKind('desert'),
            biomeIdToKind('ice'),
            biomeIdToKind('cyberpunk'),
            biomeIdToKind('lava'),
            biomeIdToKind('space'),
        ]);
        expect(allBiomes.size).toBe(6);
        expect(allBiomes.has('Lava')).toBe(true);
        expect(allBiomes.has('Space')).toBe(true);
    });
});
