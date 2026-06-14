/**
 * Round 70 — `mood4thSentenceFor` TS-side mirror, extracted.
 *
 * The Rust engine picks the average-mood 4th sentence via
 * `cocos4-rust/src/agi_minigame/narration.rs::mood_4th_sentence_for`,
 * which keys the pool pick on `fnv1a(blueprint_id) % pool.len()`
 * (the branch tag is in the pool *lookup*, NOT the hash key —
 * round 53b's unification). This module is the TS-side mirror of
 * that helper, so when `loadSceneGenWasm` fails (or the WASM fn
 * returns an error JSON), the `NarrationEngine` can call a
 * stand-alone, deterministic, branch-tag-typed function instead of
 * inlining the pool + hash + `pick` chain.
 *
 * Pre-round-70 history:
 *   - Round 25 — added the 4th-sentence pick (3-3-3 pools, djb2 hash).
 *   - Round 30 — expanded the pools to 4-5-4.
 *   - Round 33 — added the individual-NPC variant (3-3-3 individual
 *     pool, still djb2). That pool is NOT mirrored here — it lives
 *     in `NarrationEngine` because the WASM helper doesn't model
 *     individual contexts.
 *   - Round 51 — added the WASM `callMood4thSentenceFor` bridge.
 *   - Round 53b — aligned the TS fallback hash with Rust's FNV-1a
 *     32-bit, eliminating the WASM/TS divergence for the
 *     average-mood path. The pool + hash stayed inline in
 *     `NarrationEngine.narrate` because no caller needed a
 *     stand-alone mirror.
 *   - Round 70 — extracted the mirror into this module so the
 *     round-67 bench can finally grow a 4th function and the
 *     round-68 `wasm.latency` HUD row has a real TS baseline to
 *     subtract from its wall-clock numbers.
 *
 * **Branch-numeric mapping** (must match the Rust `MoodBranch` enum
 * and the existing `callMood4thSentenceFor` helper):
 *
 *     0 = fear, 1 = friendly, 2 = hostile
 *
 * The TS-side mirror takes the string branch (`'fear' | 'friendly'
 * | 'hostile'`) directly so the caller doesn't have to remember
 * the numeric mapping; the WASM path does the translation in
 * `NarrationEngine.narrate` because it still owns the WASM bridge.
 *
 * **Constraint**: `blueprintId` must be ASCII (the standard
 * `dim_<digits>` or `r<N>-<tag>-<n>` format from `Date.now()` /
 * `stableSeedFromSnapshot`). Non-ASCII ids produce different hash
 * values in TS (`charCodeAt` returns UTF-16 code units) vs Rust
 * (`as_bytes` returns UTF-8 bytes) and the WASM/TS paths would
 * pick different pool entries.
 *
 * Test strategy:
 *   - `Mood4thSentence.test.ts` (round 70) covers the FNV-1a
 *     pinned vectors, the pool size per branch, the branch-string
 *     vs branch-numeric parity, and the determinism guarantee.
 *   - `NarrationEngine.test.ts` adds 1-2 integration tests
 *     verifying the engine uses this module (via the existing
 *     round-25 + round-53b test surface — they continue to pass
 *     byte-identically after the refactor).
 *   - The pre-existing `NarrationEngine.fnv1a.test.ts` is updated
 *     to import `fnv1a32` from this module directly (instead of
 *     accessing the now-removed private method).
 */

import type { NpcDisposition } from '../world/NpcMind';

// ---------------------------------------------------------------------------
// FNV-1a 32-bit hash. Matches the Rust implementation in
// `cocos4-rust/src/agi_minigame/narration.rs::fnv1a` byte-for-byte
// for ASCII inputs. Used by the average-mood 4th-sentence path so
// the WASM bridge and the TS fallback produce identical sentences
// for the same (blueprint_id, branch).
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit offset basis. The canonical FNV reference value. */
const FNV_OFFSET_BASIS_32 = 0x811c9dc5; // 2166136261

/** FNV-1a 32-bit prime. 2^24 + 2^8 + 0x93. */
const FNV_PRIME_32 = 0x01000193; // 16777619

/**
 * FNV-1a 32-bit hash of a string. Returns a non-negative integer
 * in the u32 range. The `Math.imul` keeps the multiplication
 * inside 32-bit semantics (matches the Rust `wrapping_mul`).
 *
 * Pinned test vectors (round 53b / 70) live in
 * `NarrationEngine.fnv1a.test.ts` and `Mood4thSentence.test.ts`.
 */
export function fnv1a32(s: string): number {
    let h = FNV_OFFSET_BASIS_32;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME_32);
    }
    return h >>> 0;
}

// ---------------------------------------------------------------------------
// Mood-branch pool. The same 4-5-4 set the round-30 / 53b code
// used, moved out of NarrationEngine so the bench + the
// WASM-mirror can both reach it without going through the engine.
// ---------------------------------------------------------------------------

/** Mood-branch tag (matches `callMood4thSentenceFor`'s 0/1/2 mapping). */
export type MoodBranchTag = 'fear' | 'friendly' | 'hostile';

/**
 * Round 30 — average-mood 4th-sentence pool. Each branch has 4-5
 * alternatives picked deterministically by the dimension id. The
 * pool size is what the FNV-1a hash is modded against; the branch
 * tag itself is NOT in the hash key.
 */
export const MOOD_4TH_POOL: Record<MoodBranchTag, string[]> = {
    fear: [
        '空气本身在退避，仿佛这里有过太多恐惧。',
        '远处有什么东西在低声警告你停下脚步。',
        '脚下的地板似乎在颤抖，不是风。',
        '阴影里残留的尖叫还没有完全散去。',
    ],
    friendly: [
        '当地的居民说，这里对旅人尚算友好。',
        '守门人朝你点了点头，似乎记得上次的英勇。',
        '空气里飘着淡淡的节日气息，像是在欢迎。',
        '村口的风铃响了三下，节奏恰好。',
        '你听见远处有人在哼着熟悉的小调。',
    ],
    hostile: [
        '他们不会原谅你上次带来的麻烦。',
        '哨兵把手按在剑柄上，眼神很冷。',
        '上一次的伤痕写在每一张脸上。',
        '你听见身后有人在啐口水。',
    ],
};

// ---------------------------------------------------------------------------
// Branch-numeric mapping. The WASM helper takes a u8 (0=fear,
// 1=friendly, 2=hostile). The TS mirror takes a string branch
// directly. This helper is exposed for any future caller that
// already has the numeric index (e.g. a refactor of
// `callMood4thSentenceFor`'s call site).
// ---------------------------------------------------------------------------

const BRANCH_NUMERIC_TO_TAG: Record<number, MoodBranchTag | null> = {
    0: 'fear',
    1: 'friendly',
    2: 'hostile',
    3: null, // NEUTRAL — no 4th-sentence pool
};

/** Convert the WASM-helper's 0/1/2 branch index to a string tag (or null for NEUTRAL). */
export function branchTagFromNumeric(n: number): MoodBranchTag | null {
    return BRANCH_NUMERIC_TO_TAG[n] ?? null;
}

// ---------------------------------------------------------------------------
// Mood-branch classifier. The string version of
// `NarrationEngine.moodBranch`, so the WASM mirror and the
// `NarrationEngine` agree on the branch without one calling the
// other. (Keeping a copy here instead of importing means a
// future change to either side shows up as a TS compile error if
// the shapes diverge — round 70's `moodBranch helper mirrors
// engine branch order` test in `NarrationEngine.test.ts` is the
// one that locks the two into sync.)
// ---------------------------------------------------------------------------

/** Map a `NpcDisposition` to the average-mood branch. */
export function moodBranchFromDisposition(mood: NpcDisposition): MoodBranchTag | 'neutral' {
    if (mood.fear > 0.5) return 'fear';
    if (mood.friendly > 0.5 && mood.trust > 0.3) return 'friendly';
    if (mood.friendly < -0.3) return 'hostile';
    return 'neutral';
}

// ---------------------------------------------------------------------------
// The mirror. Stand-alone `mood4thSentenceFor(branch, blueprintId)`
// that returns a 4th-sentence string. Equivalent to calling the
// WASM `mood_4th_sentence_for_json` and getting a successful
// (non-error) result — the pool + hash match the Rust side
// byte-for-byte for ASCII ids.
// ---------------------------------------------------------------------------

/**
 * TS-side mirror of the WASM `mood_4th_sentence_for` helper.
 *
 * Picks a 4th-sentence string from the per-branch pool using
 * `fnv1a32(blueprintId) % pool.length`. The branch tag is the pool
 * lookup, NOT the hash key — the hash is keyed on `blueprintId`
 * alone, matching the Rust `mood_4th_sentence_for` implementation.
 *
 * Always returns a string (the pool is non-empty for all three
 * branches). Callers that want to fall through to the individual-
 * NPC path (round 33) should check the branch *before* calling —
 * the `moodBranchFromDisposition` helper is the canonical way.
 */
export function mood4thSentenceForFallback(
    branch: MoodBranchTag,
    blueprintId: string,
): string {
    const pool = MOOD_4TH_POOL[branch];
    const idx = fnv1a32(blueprintId) % pool.length;
    return pool[idx];
}
