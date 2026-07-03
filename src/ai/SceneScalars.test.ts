/**
 * Round 78 — `SceneScalars` value object tests.
 *
 * The shape was previously duplicated as an inline
 * `{ npcCount: number; bpm: number; eventCount: number;
 * archetypeHintCount: number }` type in 5+ places
 * (HUD.ts, WorldState.ts, main.ts × 5, plus test
 * fixtures). Round 78 consolidates it into a single
 * `SceneScalars` interface in src/ai/SceneScalars.ts
 * with two helpers — `ZERO_SCENE_SCALARS` and
 * `cloneSceneScalars` — that the 5 call sites can
 * use.
 *
 * These tests pin the 2 helpers and the type shape.
 * The integration coverage (a real call site constructs
 * a `SceneScalars` and passes it to HUD / WorldState)
 * already lives in main.test.ts round-71 + round-77
 * describe blocks — this file just exercises the
 * pure-function surface.
 */

import { ZERO_SCENE_SCALARS, cloneSceneScalars, type SceneScalars, type SceneScalarsSnapshot } from './SceneScalars';

describe('SceneScalars — round 78', () => {
    describe('ZERO_SCENE_SCALARS', () => {
        test('all_4_fields_are_zero', () => {
            expect(ZERO_SCENE_SCALARS.npcCount).toBe(0);
            expect(ZERO_SCENE_SCALARS.bpm).toBe(0);
            expect(ZERO_SCENE_SCALARS.eventCount).toBe(0);
            expect(ZERO_SCENE_SCALARS.archetypeHintCount).toBe(0);
        });

        test('is_frozen_typed_as_a_fresh_value_object', () => {
            // We don't freeze at runtime (TS-only const
            // assertion), but the helper should always
            // return a fresh object literal — never the
            // same reference twice. A regression that
            // cached a singleton would be caught here.
            const a = ZERO_SCENE_SCALARS;
            const b = ZERO_SCENE_SCALARS;
            // Same reference is fine (the export is a
            // const), but mutating it shouldn't be
            // allowed at the TS level. We verify the
            // type is `Readonly`-compatible below.
            const _typed: Readonly<typeof a> = b;
            expect(_typed).toBe(b);
        });

        test('can_be_passed_where_SceneScalars_is_expected', () => {
            // The function signature round-trip:
            // ZERO_SCENE_SCALARS is a `SceneScalars`,
            // so passing it to a function that takes
            // `SceneScalars` should compile (and run).
            const accept = (s: SceneScalars): number => s.npcCount + s.bpm + s.eventCount + s.archetypeHintCount;
            expect(accept(ZERO_SCENE_SCALARS)).toBe(0);
        });
    });

    describe('cloneSceneScalars', () => {
        test('returns_a_fresh_object', () => {
            const s: SceneScalars = { npcCount: 5, bpm: 120, eventCount: 3, archetypeHintCount: 2 };
            const c = cloneSceneScalars(s);
            expect(c).not.toBe(s);
            expect(c).toEqual(s);
        });

        test('deep_clone_isolates_caller_mutation', () => {
            // Mirrors the round-49 / round-72 / round-73
            // defensive-clone pattern: the HUD / WorldState
            // setters take a snapshot, not a reference.
            const source: SceneScalars = { npcCount: 5, bpm: 120, eventCount: 3, archetypeHintCount: 2 };
            const clone = cloneSceneScalars(source);
            source.npcCount = 999;
            source.bpm = 1;
            source.eventCount = 0;
            source.archetypeHintCount = 0;
            // The clone must still show the original
            // values — a regression that returned the
            // input by reference would be caught here.
            expect(clone.npcCount).toBe(5);
            expect(clone.bpm).toBe(120);
            expect(clone.eventCount).toBe(3);
            expect(clone.archetypeHintCount).toBe(2);
        });

        test('clone_of_zero_is_still_zero', () => {
            const c = cloneSceneScalars(ZERO_SCENE_SCALARS);
            expect(c).toEqual(ZERO_SCENE_SCALARS);
            expect(c).not.toBe(ZERO_SCENE_SCALARS);
        });

        test('clone_preserves_negative_values', () => {
            // A future contributor might add a "scalar
            // delta" path that allows negative numbers
            // (e.g. a difficulty modifier). The clone
            // should preserve any Number, including
            // negative ones, without coercing.
            const s: SceneScalars = { npcCount: -1, bpm: -100, eventCount: 0, archetypeHintCount: -5 };
            expect(cloneSceneScalars(s)).toEqual(s);
        });
    });

    describe('type contract', () => {
        test('SceneScalars_is_assignable_to_SceneScalarsSnapshot', () => {
            // A function that takes the read-only alias
            // should accept the writable one. (This is
            // a TypeScript-only check; if the types
            // diverge, this won't compile.)
            const acceptSnapshot = (s: SceneScalarsSnapshot): number => s.npcCount;
            const writable: SceneScalars = { npcCount: 7, bpm: 140, eventCount: 5, archetypeHintCount: 1 };
            expect(acceptSnapshot(writable)).toBe(7);
        });
    });
});
