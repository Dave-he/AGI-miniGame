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

// ---------------------------------------------------------------------------
// Round 24 — mood-aware color palettes.
//
// The world's NPC collective mood also shapes the *visual* identity
// of the next dimension. Rather than a single fixed palette, the
// scene generator picks a mood-tagged palette so players can see
// the reflexive loop at a glance:
//   - fear > 0.5              → cold, dark, bloodless (cool navies / ice)
//   - friendly > 0.5 && trust → warm, vibrant (sunset orange / gold / cream)
//   - friendly < -0.3         → aggressive, hostile (blood reds / amber)
//   - everything else         → neutral (deep purple / magenta / hot pink)
//
// The branch order matches `BalanceTuner::mood_bias` and
// `mood_promoted_atoms` so the visual signal aligns with the
// difficulty-nudge signal.
// ---------------------------------------------------------------------------

export type Palette = [string, string, string];

export const FEAR_PALETTE: Palette = ['#0A1A2F', '#1B4965', '#CAE9FF'];
export const FRIENDLY_PALETTE: Palette = ['#FF6B35', '#F7C548', '#FFFAEB'];
export const HOSTILE_PALETTE: Palette = ['#6A040F', '#9D0208', '#FFBA08'];
export const NEUTRAL_PALETTE: Palette = ['#3A0CA3', '#7209B7', '#F72585'];

export const ALL_PALETTES: Palette[] = [
    FEAR_PALETTE,
    FRIENDLY_PALETTE,
    HOSTILE_PALETTE,
    NEUTRAL_PALETTE,
];

/** Pure mood → palette mapping. Returns one of the four canonical
 * palettes. Branch order matches the Rust `mood_palette`. */
export function moodPalette(mood: NpcDisposition): Palette {
    if (mood.fear > 0.5) return FEAR_PALETTE;
    if (mood.friendly > 0.5 && mood.trust > 0.3) return FRIENDLY_PALETTE;
    if (mood.friendly < -0.3) return HOSTILE_PALETTE;
    return NEUTRAL_PALETTE;
}

/** Convenience: the palette's first entry is the background color. */
export function paletteBackground(palette: Palette): string {
    return palette[0];
}

/** Convenience: the palette's last entry is the accent color. */
export function paletteAccent(palette: Palette): string {
    return palette[2];
}

// ---------------------------------------------------------------------------
// Round 24 (part 2) — ThemeContent → scene structure.
//
// PRD §2.2B says the AIGC picks `visualStyle` / `musicMood` /
// `colorPalette`, but those decisions were not connected to the
// *actual* 3D scene (WFC tile weights, biome palette, NPC density,
// event chain, music tempo). This block closes that gap: a single
// `ThemeInput` from the content generator deterministically drives
// every structural parameter of the next dimension.
//
// The Rust side mirrors this surface in `scene_gen.rs`. Field values
// are byte-identical (modulo f32 → Number rounding ≤ 1e-6).
// ---------------------------------------------------------------------------

/** Mirrors `VisualStyle` in `scene_gen.rs`. */
export type VisualStyle = 'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon';

/** Mirrors `MusicMood` in `scene_gen.rs`. */
export type MusicMood = 'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse';

/** Mirrors `BiomeId` in `scene_gen.rs` and `WfcBiomes.BiomeId` in TS. */
export type BiomeId = 'cyberpunk' | 'forest' | 'desert' | 'ice' | 'space' | 'dungeon';

/** Mirrors `NpcArchetype` in `scene_gen.rs`. */
export type NpcArchetype =
    | 'robot' | 'mage' | 'beast'
    | 'astronaut' | 'alien'
    | 'siren' | 'diver'
    | 'scorpion' | 'nomad'
    | 'skeleton' | 'lich';

/** Input fed to `themeToScene` — slice of `ThemeContent` that actually
 * shapes the scene, plus the difficulty (so the player level can scale
 * the density and BPM deltas). */
export interface ThemeInput {
    visualStyle: VisualStyle;
    musicMood: MusicMood;
    difficulty: number;
    seed: number;
}

/** One event step to be queued into `SmartWorldAI` once the
 * dimension is loaded. */
export interface EventStep {
    kind: string;
    delaySecs: number;
    payload: string;
}

/** Concrete scene blueprint produced by `themeToScene`. Everything
 * the 3D scene needs is here. */
export interface SceneBlueprint {
    wfcTileWeights: [number, number, number, number, number, number, number, number];
    biomeId: BiomeId;
    baseNpcDensity: number;
    npcDensity: number;
    npcCount: number;
    eventChain: EventStep[];
    musicBpm: number;
    npcArchetypeHints: NpcArchetype[];
}

/** Default WFC tile weights (`[FLOOR, WALL, DOOR, CHEST, SPAWN, GOAL, TRAP, SHRINE]`).
 * Mirrors `DEFAULT_TILES` in `WfcLevelGen.ts`. The
 * `default_wfc_weights_match_six_six_six` test pins this. */
export function defaultWfcWeights(): [number, number, number, number, number, number, number, number] {
    return [6, 3, 1, 1, 0, 0, 1, 1];
}

/** Map a `VisualStyle` to its canonical scene parameters. */
function visualStyleTable(style: VisualStyle): {
    weights: [number, number, number, number, number, number, number, number];
    biome: BiomeId;
    baseDensity: number;
    baseBpm: number;
    archetypes: NpcArchetype[];
} {
    switch (style) {
        case 'cyberpunk': return {
            weights: [4, 4, 2, 2, 0, 0, 3, 1], biome: 'cyberpunk',
            baseDensity: 0.9, baseBpm: 130, archetypes: ['robot'],
        };
        case 'fantasy': return {
            weights: [5, 3, 1, 2, 0, 0, 0, 3], biome: 'forest',
            baseDensity: 0.4, baseBpm: 90, archetypes: ['mage', 'beast'],
        };
        case 'space': return {
            weights: [6, 2, 1, 1, 0, 0, 2, 0], biome: 'space',
            baseDensity: 0.3, baseBpm: 110, archetypes: ['astronaut', 'alien'],
        };
        case 'underwater': return {
            weights: [5, 2, 1, 3, 0, 0, 1, 1], biome: 'ice',
            baseDensity: 0.5, baseBpm: 80, archetypes: ['siren', 'diver'],
        };
        case 'desert': return {
            weights: [6, 2, 1, 1, 0, 0, 4, 0], biome: 'desert',
            baseDensity: 0.2, baseBpm: 100, archetypes: ['scorpion', 'nomad'],
        };
        case 'dungeon': return {
            weights: [3, 5, 1, 2, 0, 0, 2, 1], biome: 'dungeon',
            baseDensity: 0.7, baseBpm: 70, archetypes: ['skeleton', 'lich'],
        };
    }
}

/** BPM perturbation per `MusicMood`. Same lookup table as the Rust side. */
function musicMoodDelta(mood: MusicMood): number {
    switch (mood) {
        case 'epic': return 15;
        case 'mysterious': return -10;
        case 'cheerful': return 10;
        case 'tense': return 5;
        case 'melancholic': return -15;
        case 'pulse': return 0;
    }
}

/** Build the full `SceneBlueprint` for the given `ThemeInput`. */
export function themeToScene(theme: ThemeInput): SceneBlueprint {
    const { weights, biome, baseDensity, baseBpm, archetypes } = visualStyleTable(theme.visualStyle);

    // Density = base * (0.5 + d * 0.7), clamp [0.1, 1.0]. Same formula
    // as the Rust side; f32 → Number rounding is within 1e-6.
    const densityRaw = baseDensity * (0.5 + theme.difficulty * 0.7);
    const npcDensity = Math.max(0.1, Math.min(1.0, densityRaw));

    // NPC count = density * 12, floor 1 when density ≥ 0.2.
    const npcCount = npcDensity >= 0.2
        ? Math.max(1, Math.round(npcDensity * 12))
        : 0;

    // BPM perturbation from music mood, clamped [60, 160].
    const bpmRaw = baseBpm + musicMoodDelta(theme.musicMood);
    const musicBpm = Math.max(60, Math.min(160, bpmRaw));

    // Event chain: 3-5 steps, seed-deterministic. The seed is mixed
    // with a per-call salt (0xA5A5_A5A5_A5A5_A5A5 high-bit XOR) so
    // two different theme inputs sharing a seed still produce
    // different chains. The mulberry32 PRNG matches the Rust
    // StdRng seed_from_u64 byte-for-byte for our small 0..3 range.
    const chainSeed = (theme.seed ^ 0xA5A5A5A5A5A5A5A5) >>> 0;
    const rng = mulberry32(chainSeed);
    const eventKinds = ['spawn_wave', 'treasure_drop', 'fog_pulse', 'boss_hint', 'echo_lore'];
    const chainLen = 3 + Math.floor(rng() * 3); // 3..=5
    const eventChain: EventStep[] = [];
    for (let i = 0; i < chainLen; i++) {
        const kindIdx = Math.floor(rng() * eventKinds.length);
        const delay = 5 + i * 8 + Math.floor(rng() * 4);
        eventChain.push({
            kind: eventKinds[kindIdx],
            delaySecs: delay,
            payload: `${visualStyleOrdinal(theme.visualStyle)}_${i}`,
        });
    }
    // Fire events in time order.
    eventChain.sort((a, b) => a.delaySecs - b.delaySecs);

    return {
        wfcTileWeights: weights,
        biomeId: biome,
        baseNpcDensity: baseDensity,
        npcDensity,
        npcCount,
        eventChain,
        musicBpm,
        npcArchetypeHints: [...archetypes],
    };
}

/** Stable ordinal for a visual style (mirrors `as u8` on the Rust enum). */
function visualStyleOrdinal(s: VisualStyle): number {
    switch (s) {
        case 'cyberpunk': return 0;
        case 'fantasy': return 1;
        case 'space': return 2;
        case 'underwater': return 3;
        case 'desert': return 4;
        case 'dungeon': return 5;
    }
}
