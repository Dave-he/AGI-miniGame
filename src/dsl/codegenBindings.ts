/**
 * Round 164 — TS mirror of cocos4-rust's
 * `src/agi_minigame/dsl/codegen.rs::generate_rules`.
 *
 * Why a TS mirror: the AGI-miniGame runtime has a
 * round-48 progressive-enhancement gate that
 * tries WASM first and falls back to a TS-mirror
 * when WASM is null. The codegen module needs
 * the same treatment — the Rust implementation
 * is the source of truth (round-162/163/164
 * cargo tests), and this file is the
 * 1:1 behavioural mirror so the App can call
 * `generateRules(input)` regardless of whether
 * the WASM module is loaded.
 *
 * What this file provides (each is the TS-side
 * counterpart of a Rust function in
 * `cocos4-rust/src/agi_minigame/dsl/codegen.rs`):
 *
 *   - `BiomeKind`        ↔ `codegen::BiomeKind`
 *   - `MoodKind`         ↔ `codegen::MoodKind`
 *   - `ComplexityKind`   ↔ `codegen::ComplexityKind`
 *   - `GenInput`         ↔ `codegen::GenInput`
 *   - `seedFromString()` ↔ `codegen::seed_from_string`
 *   - `seedOffset()`     ↔ `codegen::seed_offset`
 *   - `generateRules()`  ↔ `codegen::generate_rules`
 *   - `generateRule()`   ↔ `codegen::generate_rule`
 *
 * Determinism contract: given the same `GenInput`
 * (including the same `seed`), `generateRules`
 * returns the same `DslRule[]` in the same order
 * across runs. The FNV-1a 64-bit hash (round-164
 * B) and the xorshift64 mixer (round-163) are
 * both pure functions, so the output is
 * bit-stable.
 *
 * Cross-validation: the test
 * `seedFromString_known_vector_round_164` in
 * `codegenBindings.test.ts` pins the exact
 * FNV-1a 64-bit outputs (`""` →
 * 0xCBF29CE484222325, `"a"` → 0xAF63DC4C8601EC8C,
 * `"b"` → 0xAF63DF4C8601F1A5, `"forest"` →
 * 0x2098148EC99FB680). If the Rust side changes
 * its algorithm, that test will fail and force a
 * sync update of the TS mirror.
 */

import type { DslRule, DslAction, DslEvent, DslEventKind, DslActionKind } from './MemeCompiler';

// ---------------------------------------------------------------------------
// Inputs (mirrors of `BiomeKind` / `MoodKind` / `ComplexityKind` / `GenInput`)
// ---------------------------------------------------------------------------

/**
 * Round 162 → 167 — biome flavor. The 6 biomes match
 * the full AGI-miniGame `BiomeAtmosphere` palette
 * (forest / desert / ice / cyberpunk / lava / space)
 * so the generated rules "taste" like the scene the
 * player is in.
 *
 * Round 167 — added `Lava` and `Space`. Before round
 * 167 the type had 4 variants and the 6-biome
 * atmosphere palette had 2 extras (`space` and
 * `lava`) that fell back to `Forest` (via
 * `biomeIdToKind`'s default arm). Round 167 promotes
 * them to first-class codegen variants so the
 * auto-generated rules read `space_mob` / `lava_mob`
 * instead of `forest_mob` — a Space biome's rules
 * now "taste" like the actual biome the player is in.
 * The Rust-side `cocos4-rust::dsl::codegen::BiomeKind`
 * mirror uses the same 6 variants.
 */
export type BiomeKind = 'Forest' | 'Desert' | 'Ice' | 'Cyberpunk' | 'Lava' | 'Space';

/**
 * Round 162 — mood tone. Calms down or agitates
 * the rule actions (heals vs damage) so the
 * player's emotional state matches the game
 * state.
 */
export type MoodKind = 'Calm' | 'Tense' | 'Epic' | 'Mysterious';

/**
 * Round 162 — rule volume. `Low` = 1 rule, `Med`
 * = 3 rules, `High` = 5 rules. The 3-way split
 * is the smallest one that lets a future
 * round-balance AI flag a regression that flips
 * complexity.
 */
export type ComplexityKind = 'Low' | 'Medium' | 'High';

/**
 * Round 162 + 163 — all inputs the codegen
 * reads. The `seed` axis is round-163; a
 * different seed perturbs the generated
 * magnitudes (spawn count, timer durations,
 * action damage) but NOT the action kinds or
 * rule counts.
 */
export interface GenInput {
    biome: BiomeKind;
    mood: MoodKind;
    complexity: ComplexityKind;
    seed: bigint;
}

/**
 * Round 164 — default GenInput. The seed is 0
 * (matches the Rust `Default for GenInput`).
 * Mirrors the pre-round-163 codegen output (the
 * round-163 perturbations are visible in the
 * spawn count, but at seed=0 the perturbation
 * is a small offset around the original
 * magnitude).
 */
export const DEFAULT_GEN_INPUT: GenInput = {
    biome: 'Forest',
    mood: 'Calm',
    complexity: 'Low',
    seed: 0n,
};

// ---------------------------------------------------------------------------
// Hash helpers (mirrors of `seed_from_string` / `seed_offset`)
// ---------------------------------------------------------------------------

/**
 * Round 164 — derive a `bigint` seed from a
 * human-readable string (typically a dimension
 * ID like `"dim_alpha"` or a biome key like
 * `"forest"`). The App calls this at
 * dimension-enter time to seed the round-163
 * `seedOffset` axis, so reloading the same
 * dimension gives the same auto-generated rule
 * set (round-72 save round-trip stability).
 *
 * Implementation: 64-bit FNV-1a (offset basis
 * 0xCBF29CE484222325, prime 0x100000001B3, "xor
 * then multiply" order). Identical to the Rust
 * `codegen::seed_from_string` (round-164 B).
 *
 * Returns `bigint` (not `number`) so the full
 * 64-bit range is preserved. The Rust side
 * returns `u64`; `bigint` is the closest
 * TypeScript analogue (the `Number` type only
 * safely represents integers up to 2^53).
 */
export function seedFromString(s: string): bigint {
    let h = 0xCBF29CE484222325n;
    const prime = 0x100000001B3n;
    const mask = 0xFFFFFFFFFFFFFFFFn;
    for (let i = 0; i < s.length; i++) {
        // Hash the UTF-16 code unit truncated to
        // 8 bits (matches Rust's `s.as_bytes()`
        // on ASCII; for non-BMP characters the
        // 16-bit code unit is split, which the
        // round-164 `seedFromString_unicode_*`
        // test pins as "stable but not necessarily
        // identical to the Rust side for non-
        // BMP"). The Rust side hashes the UTF-8
        // bytes directly; for ASCII strings
        // (which is the 99% case for dimension
        // IDs) the two are identical.
        const code = s.charCodeAt(i) & 0xFF;
        h ^= BigInt(code);
        h = (h * prime) & mask;
    }
    return h;
}

/**
 * Round 163 — derive a deterministic per-
 * (seed, slot) offset in the range
 * `[-0.5, +0.5]`. The function is a tiny
 * xorshift-style mixer: a different seed gives
 * a different offset, a different slot gives a
 * different offset for the same seed, and the
 * output is bounded so the codegen can multiply
 * it into a "perturb within band" percentage
 * without worrying about overflow.
 *
 * Identical algorithm to the Rust
 * `codegen::seed_offset` (round-163 B). The
 * xorshift operates on `bigint` (not
 * `Number`) so the 64-bit shift is preserved.
 */
export function seedOffset(seed: bigint, slot: number): number {
    // Mix the seed and slot into a single bigint.
    // The slot lives in the low bits so a single
    // seed with 5 different slots (the 5-rule
    // High complexity case) gives 5 independent
    // offsets.
    const multiplier = 0x9E3779B97F4A7C15n;
    const mask = 0xFFFFFFFFFFFFFFFFn;
    let x = ((seed * multiplier) + BigInt(slot)) & mask;
    // xorshift64 — 4 rounds is enough scatter
    // for our needs (verified by the round-163
    // cargo tests).
    for (let i = 0; i < 4; i++) {
        x ^= (x << 13n) & mask;
        x ^= x >> 7n;
        x ^= (x << 17n) & mask;
    }
    // Map the low 32 bits of `x` to [-0.5, +0.5].
    const low32 = Number(x & 0xFFFFFFFFn);
    return low32 * (1.0 / 0xFFFFFFFF) - 0.5;
}

// ---------------------------------------------------------------------------
// Per-axis builders (mirrors of the Rust private functions)
// ---------------------------------------------------------------------------

const BIOME_FLAVOR: Record<BiomeKind, string> = {
    Forest: 'forest',
    Desert: 'desert',
    Ice: 'ice',
    Cyberpunk: 'cyber',
    // Round 167 — `lava` and `space` flavor strings added
    // so the auto-generated rules "taste" like the
    // actual biome (e.g. a Space biome's spawn rule
    // reads `space_mob` instead of `forest_mob`). The
    // Rust-side `biome_flavor` function in
    // `cocos4-rust/src/agi_minigame/dsl/codegen.rs`
    // mirrors this Record byte-for-byte.
    Lava: 'lava',
    Space: 'space',
};

const EVENT_KIND_BY_RUST: Record<string, DslEventKind> = {
    Spawn: 'Spawn',
    Timer: 'Timer',
    Collide: 'Collide',
    PlayerHit: 'PlayerHit',
};

const ACTION_KIND_BY_RUST: Record<string, DslActionKind> = {
    Damage: 'Damage',
    Heal: 'Heal',
    Spawn: 'Spawn',
    SpawnEntity: 'SpawnEntity',
};

function spawnPopulationRule(input: GenInput): DslRule {
    const flavor = BIOME_FLAVOR[input.biome];
    // Spawn count band: 1..6 mobs, perturbed by
    // the seed. Rounded + clamped to match the
    // Rust side (round-163).
    const offset = seedOffset(input.seed, 0);
    let count = Math.round(3.0 + offset * 4.0);
    if (count < 1) count = 1;
    if (count > 6) count = 6;
    return {
        event: { kind: 'Spawn' },
        actions: [{
            kind: 'Spawn',
            args: [`${flavor}_mob`, count],
        }],
    };
}

function moodRule(input: GenInput, slot: number): DslRule {
    const flavor = BIOME_FLAVOR[input.biome];
    const offset = seedOffset(input.seed, slot);
    let actionKind: DslActionKind;
    let baseMagnitude: number;
    switch (input.mood) {
        case 'Calm':         actionKind = 'Heal';        baseMagnitude = 5.0; break;
        case 'Tense':        actionKind = 'Damage';      baseMagnitude = 3.0; break;
        case 'Epic':         actionKind = 'Spawn';       baseMagnitude = 3.0; break;
        case 'Mysterious':   actionKind = 'SpawnEntity'; baseMagnitude = 1.0; break;
    }
    const magnitude = Math.max(1.0, baseMagnitude * (1.0 + offset * 0.5));
    let args: (number | string)[];
    switch (input.mood) {
        case 'Calm':       args = [magnitude, `${flavor}_herb`]; break;
        case 'Tense':      args = [magnitude, `${flavor}_thorn`]; break;
        case 'Epic':       args = [`${flavor}_boss_wave`, magnitude]; break;
        case 'Mysterious': args = [`${flavor}_spirit`, magnitude]; break;
    }
    return {
        event: { kind: 'Spawn' },
        actions: [{ kind: actionKind, args }],
    };
}

function timerRule(biome: BiomeKind, secs: number): DslRule {
    const flavor = BIOME_FLAVOR[biome];
    return {
        event: { kind: 'Timer', arg: secs },
        actions: [{ kind: 'Spawn', args: [`${flavor}_timer_spawn`] }],
    };
}

function playerhitRule(input: GenInput): DslRule {
    let baseMagnitude: number;
    switch (input.mood) {
        case 'Calm':       baseMagnitude = 1.0; break;
        case 'Tense':      baseMagnitude = 4.0; break;
        case 'Epic':       baseMagnitude = 8.0; break;
        case 'Mysterious': baseMagnitude = 2.0; break;
    }
    const offset = seedOffset(input.seed, 4);
    const magnitude = Math.max(0.5, baseMagnitude * (1.0 + offset * 0.25));
    return {
        event: { kind: 'PlayerHit' },
        actions: [{ kind: 'Damage', args: [magnitude] }],
    };
}

/**
 * Round 162 — generate a deterministic
 * `DslRule[]` for the given runtime inputs.
 * See the module docs for the determinism +
 * coverage contracts.
 *
 * Always emits at least 1 `On(Spawn) -> Spawn`
 * rule so the scene has a population action
 * even on minimal `Low` complexity + neutral
 * mood. Never emits more than 6 rules (to keep
 * the DslCodexPanel history list readable + the
 * DslExecutor cheap).
 */
export function generateRules(input: GenInput): DslRule[] {
    const rules: DslRule[] = [];

    // 1. The baseline "population" rule.
    rules.push(spawnPopulationRule(input));

    // 2. The complexity-driven mood + extras.
    switch (input.complexity) {
        case 'Low':
            // No extras; the baseline is enough.
            break;
        case 'Medium': {
            rules.push(moodRule(input, 1));
            // Timer band: 4.0..7.0 secs, perturbed
            // by the seed (slot=2) so different
            // seeds give slightly different cycle
            // times.
            const secs = 5.0 + seedOffset(input.seed, 2) * 1.5;
            rules.push(timerRule(input.biome, secs));
            break;
        }
        case 'High': {
            rules.push(moodRule(input, 1));
            // Two timers: a fast one (band
            // 2.0..4.0) and a slow one (band
            // 7.0..9.0). Each perturbed by the
            // seed independently.
            const fastSecs = 3.0 + seedOffset(input.seed, 2) * 1.0;
            const slowSecs = 8.0 + seedOffset(input.seed, 3) * 1.0;
            rules.push(timerRule(input.biome, fastSecs));
            rules.push(timerRule(input.biome, slowSecs));
            rules.push(playerhitRule(input));
            break;
        }
    }

    // Cap at 6 rules so the dispatcher stays
    // cheap and the DslCodexPanel doesn't get a
    // 48-row scrollbar.
    return rules.slice(0, 6);
}

/**
 * Round 162 — generate a single canonical rule
 * for the given inputs. Equivalent to
 * `generateRules(input)[0]` but more readable at
 * the call site. The seed axis still flows
 * through (so `generateRule(input)` at seed=0
 * is the same as it was pre-round-163).
 */
export function generateRule(input: GenInput): DslRule {
    return spawnPopulationRule(input);
}

// ---------------------------------------------------------------------------
// Round 164 — App wiring helpers
// ---------------------------------------------------------------------------

/**
 * Map an AGI-miniGame `BiomeId` (the 6-biome
 * palette from `WfcBiomes.ts`) to a
 * `BiomeKind` (the 6-biome codegen enum). All
 * 6 canonical biomes (`forest` / `desert` /
 * `ice` / `cyberpunk` / `lava` / `space`) have
 * their own first-class variant — unknown tags
 * still fall back to `Forest` for graceful
 * degradation.
 *
 * Round 167 — `lava` and `space` were promoted
 * from default-Forest to first-class mappings.
 * Before round 167 the 4-biome subset was
 * sufficient (the 2 extras silently fell back
 * to `forest_mob` rules). Round 167 aligns the
 * codegen with the full 6-biome atmosphere
 * palette so Space / Lava scenes get their own
 * flavored rules (`space_mob` / `lava_mob`).
 */
export function biomeIdToKind(biomeId: string): BiomeKind {
    switch (biomeId) {
        case 'forest':    return 'Forest';
        case 'desert':    return 'Desert';
        case 'ice':       return 'Ice';
        case 'cyberpunk': return 'Cyberpunk';
        case 'lava':      return 'Lava';
        case 'space':     return 'Space';
        default:          return 'Forest';
    }
}

/**
 * Map a string (typically a dimension ID like
 * `"dim_alpha"`) to a stable `MoodKind`. The
 * 4 moods are picked via `mod 4` of the
 * `seedFromString` result, so each dimension
 * always has the same mood across reloads
 * (round-72 save stability) but different
 * dimensions cycle through different moods
 * (variety).
 *
 * Using the seed as the picker (rather than
 * e.g. `Math.random()`) is the whole point of
 * the round-164 integration: the rule set must
 * be reproducible from the dimension ID alone,
 * not from runtime random state.
 */
export function moodKindFromSeed(seed: bigint): MoodKind {
    // `Number(seed & 0xFFn)` keeps the picker
    // in the safe-integer range. The mod 4
    // covers all 4 MoodKind variants.
    const picker = Number(seed & 0xFFn) % 4;
    switch (picker) {
        case 0:  return 'Calm';
        case 1:  return 'Tense';
        case 2:  return 'Epic';
        default: return 'Mysterious';
    }
}

/**
 * Top-level convenience: given a dimension ID
 * and a biome ID, build the `GenInput` and
 * generate the rule set. This is what the App
 * calls at dimension-enter time.
 *
 * The seed is `seedFromString(dimensionId)` so
 * reloads of the same dimension give the same
 * rules. The mood is derived from the same
 * seed (so the mood axis is also stable
 * across reloads). The complexity defaults to
 * `Medium` — a future round could wire this to
 * a player-level / progression-tier signal.
 */
export function autoGenerateForDimension(
    dimensionId: string,
    biomeId: string,
    complexity: ComplexityKind = 'Medium',
): { input: GenInput; rules: DslRule[] } {
    const seed = seedFromString(dimensionId);
    const input: GenInput = {
        biome: biomeIdToKind(biomeId),
        mood: moodKindFromSeed(seed),
        complexity,
        seed,
    };
    return { input, rules: generateRules(input) };
}
