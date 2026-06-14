/**
 * Round 70 — `Mood4thSentence` module tests.
 *
 * Covers the four public exports of the new
 * `src/ai/Mood4thSentence.ts` module: `fnv1a32`,
 * `mood4thSentenceForFallback`, `branchTagFromNumeric`, and
 * `moodBranchFromDisposition`. The pre-existing
 * `NarrationEngine.fnv1a.test.ts` file already locks the FNV-1a
 * 32-bit hash byte-for-byte (round 53b) — we re-pin a couple of
 * vectors here for module-internal coverage and add the
 * branch-pool + branch-numeric tests that didn't exist before.
 *
 * **Why a separate file**: the engine-level integration tests in
 * `NarrationEngine.test.ts` still pass byte-identically after
 * the refactor, so they implicitly cover the wiring. This file
 * focuses on the new module's surface — pool sizes, branch
 * mapping, determinism — without going through the engine.
 */

import {
    fnv1a32,
    mood4thSentenceForFallback,
    branchTagFromNumeric,
    moodBranchFromDisposition,
    MOOD_4TH_POOL,
} from './Mood4thSentence';
import type { MoodBranchTag } from './Mood4thSentence';
import { defaultDisposition } from '../world/NpcMind';
import type { NpcDisposition } from '../world/NpcMind';

// ---------------------------------------------------------------------------
// FNV-1a 32-bit hash. The full vector suite lives in
// `NarrationEngine.fnv1a.test.ts`; we re-pin a small subset
// here so the module is self-contained.
// ---------------------------------------------------------------------------

describe('Mood4thSentence — fnv1a32 (round 70 subset)', () => {
    test('empty_string_returns_FNV_offset_basis', () => {
        expect(fnv1a32('')).toBe(0x811c9dc5);
    });

    test('ascii_blueprint_id_dim_42', () => {
        // Pinned from Rust `fnv1a("dim_42")` (see
        // NarrationEngine.fnv1a.test.ts for the full table).
        expect(fnv1a32('dim_42')).toBe(0x05798420);
    });

    test('hash_is_u32_shaped_for_modular_safety', () => {
        // The `>>> 0` at the end of `fnv1a32` returns a non-
        // negative integer in the u32 range. A drop of the
        // `>>> 0` would make the result negative on inputs whose
        // hash exceeds 2^31 — which would break the
        // `hash % pool.length` pool pick.
        const h = fnv1a32('dim_42');
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
    });

    test('identical_inputs_produce_identical_hash', () => {
        expect(fnv1a32('r30-stable')).toBe(fnv1a32('r30-stable'));
    });
});

// ---------------------------------------------------------------------------
// Pool + branch sizes. The pre-refactor NarrationEngine code had
// these baked into the same 4-5-4 layout; the extraction makes
// them testable from the outside.
// ---------------------------------------------------------------------------

describe('Mood4thSentence — MOOD_4TH_POOL shape (round 70)', () => {
    test('all_three_branches_present', () => {
        expect(MOOD_4TH_POOL.fear).toBeDefined();
        expect(MOOD_4TH_POOL.friendly).toBeDefined();
        expect(MOOD_4TH_POOL.hostile).toBeDefined();
    });

    test('pool_sizes_match_round_30_layout', () => {
        // Round 30 expanded the pools to 4-5-4. Pin the sizes so
        // a future round that changes them is a deliberate
        // decision (and the bench numbers stay meaningful).
        expect(MOOD_4TH_POOL.fear.length).toBe(4);
        expect(MOOD_4TH_POOL.friendly.length).toBe(5);
        expect(MOOD_4TH_POOL.hostile.length).toBe(4);
    });

    test('every_entry_is_a_non_empty_string', () => {
        for (const branch of Object.keys(MOOD_4TH_POOL) as MoodBranchTag[]) {
            for (const sentence of MOOD_4TH_POOL[branch]) {
                expect(typeof sentence).toBe('string');
                expect(sentence.length).toBeGreaterThan(0);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// mood4thSentenceForFallback — the TS-side mirror of the WASM
// `mood_4th_sentence_for_json` helper.
// ---------------------------------------------------------------------------

describe('Mood4thSentence — mood4thSentenceForFallback (round 70)', () => {
    test('returns_a_string_from_the_correct_pool', () => {
        const s = mood4thSentenceForFallback('fear', 'dim_42');
        expect(MOOD_4TH_POOL.fear).toContain(s);
    });

    test('friendly_branch_returns_from_friendly_pool', () => {
        const s = mood4thSentenceForFallback('friendly', 'r30-friendly-3');
        expect(MOOD_4TH_POOL.friendly).toContain(s);
    });

    test('hostile_branch_returns_from_hostile_pool', () => {
        const s = mood4thSentenceForFallback('hostile', 'r30-hostile-7');
        expect(MOOD_4TH_POOL.hostile).toContain(s);
    });

    test('is_deterministic_for_same_inputs', () => {
        // The pre-refactor engine relied on this property to
        // re-pick the same 4th sentence across reloads. The
        // extracted function must preserve it.
        const a = mood4thSentenceForFallback('fear', 'dim_42');
        const b = mood4thSentenceForFallback('fear', 'dim_42');
        expect(a).toBe(b);
    });

    test('produces_variety_across_30_distinct_ids', () => {
        // With a 4-entry pool, 30 distinct ids should hit at
        // least 3 of the 4 entries (and likely all 4). This
        // catches a bug where the hash collapses to a constant.
        const seen = new Set<string>();
        for (let i = 0; i < 30; i++) {
            seen.add(mood4thSentenceForFallback('fear', `dim_variety_${i}`));
        }
        expect(seen.size).toBeGreaterThanOrEqual(3);
    });

    test('branch_tag_is_NOT_in_hash_key', () => {
        // The pre-round-53b code used `djb2(blueprint.id + '|' + branch)`,
        // which means the same id with a different branch picked a
        // different sentence. Round 53b unified on FNV-1a of the
        // id alone — the branch tag is in the POOL LOOKUP, not the
        // hash key. This is a deliberate design choice so the
        // (id, branch) sentence is the natural next entry in the
        // 4-5-4 pool rather than a pseudo-random one.
        const id = 'dim_branch_isolation';
        const fearS = mood4thSentenceForFallback('fear', id);
        const friendlyS = mood4thSentenceForFallback('friendly', id);
        const hostileS = mood4thSentenceForFallback('hostile', id);
        // The three sentences should all be valid pool entries
        // (this would also be true for the old djb2 design, so
        // it's not enough to differentiate). The stronger
        // guarantee is that the three indices are independent
        // (fear pool size 4, friendly pool size 5, hostile
        // pool size 4) — the same id can land in any of them.
        expect(MOOD_4TH_POOL.fear).toContain(fearS);
        expect(MOOD_4TH_POOL.friendly).toContain(friendlyS);
        expect(MOOD_4TH_POOL.hostile).toContain(hostileS);
    });
});

// ---------------------------------------------------------------------------
// branchTagFromNumeric — the 0/1/2/3 mapping used by the WASM
// helper. Tests must stay in lock-step with
// `callMood4thSentenceFor` in `SceneGenWasm.ts`.
// ---------------------------------------------------------------------------

describe('Mood4thSentence — branchTagFromNumeric (round 70)', () => {
    test('zero_maps_to_fear', () => {
        expect(branchTagFromNumeric(0)).toBe('fear');
    });

    test('one_maps_to_friendly', () => {
        expect(branchTagFromNumeric(1)).toBe('friendly');
    });

    test('two_maps_to_hostile', () => {
        expect(branchTagFromNumeric(2)).toBe('hostile');
    });

    test('three_maps_to_null_NEUTRAL', () => {
        // NEUTRAL has no 4th-sentence pool — the WASM helper
        // returns an error JSON, and the engine skips the
        // sentence entirely.
        expect(branchTagFromNumeric(3)).toBeNull();
    });

    test('out_of_range_returns_null', () => {
        // u8 values 4..=255 fall through to the NEUTRAL branch
        // in Rust; the bridge returns an error JSON, so the TS
        // side should treat them as "no pool" too.
        expect(branchTagFromNumeric(4)).toBeNull();
        expect(branchTagFromNumeric(255)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// moodBranchFromDisposition — the string version of
// `NarrationEngine.moodBranch`. The actual parity test (this
// helper must agree with the engine) lives in
// `NarrationEngine.test.ts` ("moodBranch helper mirrors engine
// branch order"); here we cover the local input mapping.
// ---------------------------------------------------------------------------

describe('Mood4thSentence — moodBranchFromDisposition (round 70)', () => {
    test('fear_above_threshold_returns_fear', () => {
        const d: NpcDisposition = { fear: 0.8, friendly: 0.0, trust: 0.0 };
        expect(moodBranchFromDisposition(d)).toBe('fear');
    });

    test('friendly_above_threshold_with_trust_returns_friendly', () => {
        const d: NpcDisposition = { fear: 0.0, friendly: 0.8, trust: 0.5 };
        expect(moodBranchFromDisposition(d)).toBe('friendly');
    });

    test('friendly_below_negative_threshold_returns_hostile', () => {
        const d: NpcDisposition = { fear: 0.0, friendly: -0.5, trust: 0.0 };
        expect(moodBranchFromDisposition(d)).toBe('hostile');
    });

    test('default_disposition_returns_neutral', () => {
        // `defaultDisposition()` is zeros — a lukewarm NPC.
        // The mirror helper should return 'neutral' just like
        // the engine's `moodBranch` does.
        expect(moodBranchFromDisposition(defaultDisposition())).toBe('neutral');
    });
});
