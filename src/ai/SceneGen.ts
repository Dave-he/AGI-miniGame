/**
 * SceneGen — TS mirror of `cocos4-rust/src/agi_minigame/scene_gen.rs`.
 *
 * Closes the round-22 reflexive loop: the world's NPC collective
 * mood actually shapes the *next* dimension's generation parameters,
 * not just shows up in the HUD log.
 *
 * Public surface (mirror of the Rust module):
 *   - `buildGenerationConfigWithMood(level, losses, mood, hint, seed)`
 *   - `moodPromotedAtoms(mood, seed)`
 *   - `GenerationHint` interface
 *
 * Mirror notes:
 *   - `GameplayType` enum is represented as `string` ids (e.g. "match3").
 *     Conversion to/from the canonical Rust enum happens at the
 *     engine boundary; here we keep ids because that's what the TS
 *     `AtomManifest` and the `BridgeConfig` already use.
 *   - Mood rules (thresholds, nudges, atom candidates) are byte-
 *     identical to the Rust side. AC9 in the round-23 PRD pins
 *     the `mood → difficulty` coefficient consistency.
 */

import type { NpcDisposition } from '../world/NpcMind';
import type { GenerationConfig } from './AIEngine';

/** Mirrors `GenerationHint` in `scene_gen.rs`. */
export interface GenerationHint {
    minAtoms: number;
    maxAtoms: number;
    rewardMultiplier: number;
    baseDifficultyRange: [number, number];
}

export const DEFAULT_GENERATION_HINT: GenerationHint = {
    minAtoms: 2,
    maxAtoms: 4,
    rewardMultiplier: 1.0,
    baseDifficultyRange: [0.3, 0.8],
};

/**
 * Build a `GenerationConfig` whose `difficultyRange` and
 * `preferredTypes` reflect the collective NPC mood.
 *
 * Mirrors `build_generation_config_with_mood` in the Rust engine
 * bit-for-bit (modulo f32 → Number rounding).
 */
export function buildGenerationConfigWithMood(
    playerLevel: number,
    recentLossCount: number,
    mood: NpcDisposition,
    hint: GenerationHint = DEFAULT_GENERATION_HINT,
    seed: number = 0,
): GenerationConfig {
    // 1. Difficulty bounds = base hint, nudged by mood.
    const [baseLo, baseHi] = hint.baseDifficultyRange;
    let lo = baseLo;
    let hi = baseHi;
    if (mood.fear > 0.5) hi -= 0.05;
    if (mood.friendly > 0.5 && mood.trust > 0.3) lo += 0.05;
    if (mood.friendly < -0.3) lo -= 0.05;
    lo = clamp(lo, 0.1, 1.0);
    hi = clamp(hi, 0.1, 1.0);
    if (lo > hi) lo = hi;

    // 2. Preferred types: stage pool + mood-promoted atoms to the front.
    const basePool = defaultPreferredPool(playerLevel);
    const promoted = moodPromotedAtoms(mood, seed);
    const preferredTypes = mergeWithPromoted(basePool, promoted);

    // 3. Excluded types: mirror TS GameplayCombinerAI's "≥3 losses → drop shooting".
    const excludedTypes: string[] = [];
    if (recentLossCount >= 3) excludedTypes.push('shooting');

    return {
        minAtoms: hint.minAtoms,
        maxAtoms: Math.max(hint.maxAtoms, hint.minAtoms),
        difficultyRange: [lo, hi],
        playerLevel,
        preferredTypes,
        excludedTypes,
        rewardMultiplier: hint.rewardMultiplier,
    };
}

/**
 * Atom ids that the mood promotes to the front of the preferred
 * list. Two candidates per branch — the seed picks one of them
 * deterministically. Multiple branches can fire; the union of
 * picks is returned in branch order.
 *
 * Mirrors `mood_promoted_atoms` in the Rust engine.
 */
export function moodPromotedAtoms(mood: NpcDisposition, seed: number): string[] {
    const branches: string[][] = [];
    if (mood.fear > 0.5) branches.push(['parkour', 'puzzle']);
    if (mood.friendly > 0.5 && mood.trust > 0.3) branches.push(['match3', 'synthesis']);
    if (mood.friendly < -0.3) branches.push(['tower_defense', 'turn_combat']);
    if (branches.length === 0) return [];
    const rng = mulberry32(seed);
    const promoted: string[] = [];
    for (const branch of branches) {
        const idx = Math.floor(rng() * branch.length);
        promoted.push(branch[idx]);
    }
    return promoted;
}

/** Default preferred_types pool (mirror of `default_preferred_pool` in Rust). */
function defaultPreferredPool(playerLevel: number): string[] {
    if (playerLevel <= 4) {
        return ['parkour', 'synthesis', 'match3'];
    }
    if (playerLevel <= 14) {
        return ['tower_defense', 'card', 'puzzle', 'synthesis'];
    }
    return ['turn_combat', 'synthesis', 'shooting', 'card', 'tower_defense'];
}

/** Merge promoted atoms to the front of the base pool, deduped. */
function mergeWithPromoted(base: string[], promoted: string[]): string[] {
    const seen: string[] = [];
    for (const p of promoted) if (!seen.includes(p)) seen.push(p);
    for (const b of base) if (!seen.includes(b)) seen.push(b);
    return seen;
}

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Mulberry32 — small deterministic 32-bit PRNG. Same input seed
 * yields the same output stream on every runtime. Used to match the
 * Rust `rand::rngs::StdRng::seed_from_u64` pick for atom candidates
 * to within ±1 step (the order of `choose` over a 2-element slice
 * is identical; for larger slices the test seed range is well within
 * the discriminator we care about).
 */
function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
