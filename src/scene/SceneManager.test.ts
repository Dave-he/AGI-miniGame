/**
 * Round 93 — SceneManager file-content regression tests.
 *
 * SceneManager is a real Three.js wrapper. It can't be instantiated
 * in jsdom (no WebGL), so the methods check `if (!this.scene ||
 * !this.THREE) return;` early and become safe no-ops. That means
 * we can't write behavioural tests for the actual color-setting
 * logic here — the SceneManager's own methods would do nothing
 * in the test environment.
 *
 * What we CAN do is lock the round-93 call-order fix with
 * file-content regression tests. Round 92 introduced a per-biome
 * `fogColor` field and updated `setBiomeAtmosphere` to apply it
 * to BOTH `scene.fog.color` AND `scene.background`. But the
 * call order in `enterNewDimension` (main.ts:626 then 704) means
 * `setBiomeAtmosphere` is called FIRST and `onDimensionEntered`
 * is called SECOND. Pre-round-93, `onDimensionEntered` still
 * re-assigned `scene.background` and `fog.color` from
 * `blueprint.theme.colorPalette[0]` (the random WASM-generated
 * first colour), so the random palette silently overwrote the
 * deterministic per-biome `fogColor` on every dimension enter.
 *
 * The fix was to remove the `scene.background` + `fog.color`
 * writes from `onDimensionEntered` (the entity palette assignment
 * stays — it's a different concern). The file-content tests
 * below lock that fix at the source: a future refactor that
 * re-adds the writes would fail these tests.
 *
 * **Why not behavioural tests**: SceneManager's methods are
 * safe no-ops in jsdom (THREE is null), so behavioural tests
 * would always pass regardless of the actual logic. The
 * file-content tests are the right granularity for a jsdom-
 * hosted, Three.js-dependent module.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCENE_MANAGER_PATH = path.resolve(__dirname, 'SceneManager.ts');
const SOURCE = fs.readFileSync(SCENE_MANAGER_PATH, 'utf-8');

describe('SceneManager — round 93 call-order regression tests', () => {
    describe('onDimensionEntered (round 93: must NOT touch scene.background or fog.color)', () => {
        function extractOnDimensionEnteredBody(): string {
            // Naive but reliable: slice from the method's opening
            // brace to the next top-level method. We look for
            // `onDimensionEntered(blueprint: DimensionBlueprint)`
            // up to the next `    on` or `    set` (4-space indent
            // = method declaration in this file).
            const startMatch = SOURCE.match(/onDimensionEntered\(blueprint: DimensionBlueprint\): void \{/);
            if (!startMatch) {
                throw new Error('Could not find onDimensionEntered in SceneManager.ts');
            }
            const startIdx = startMatch.index! + startMatch[0].length;
            // Scan forward for the next method-level declaration
            // (4-space indent + identifier + `(`).
            const rest = SOURCE.slice(startIdx);
            const nextMethod = rest.match(/\n    [a-zA-Z_]+\([^)]*\):[^{]*\{/);
            const endIdx = nextMethod ? startIdx + nextMethod.index! : SOURCE.length;
            return SOURCE.slice(startIdx, endIdx);
        }

        test('does_not_assign_to_scene.background (round 93 fix)', () => {
            // The round-93 fix removed the `this.scene.background =`
            // assignment that used to read `palette[0]`. If a future
            // refactor re-adds the write, the deterministic
            // per-biome `fogColor` would silently regress.
            const body = extractOnDimensionEnteredBody();
            expect(body).not.toMatch(/this\.scene\.background\s*=/);
        });

        test('does_not_assign_to_fog.color (round 93 fix)', () => {
            // Same for `fog.color`. The fog tint is now owned by
            // `setBiomeAtmosphere` (round 92). Re-adding a write
            // here would race with the per-biome `fogColor`.
            const body = extractOnDimensionEnteredBody();
            expect(body).not.toMatch(/fog\.color\s*=/);
        });

        test('still_assigns_to_entityPalette (entity pool concern is NOT removed)', () => {
            // Sanity check the round-93 fix didn't over-rotate:
            // the entity palette is the only thing
            // `onDimensionEntered` should own (cubes pick up the
            // theme's colors). A regression that drops the
            // entity palette would make every cube the default
            // rainbow regardless of biome.
            const body = extractOnDimensionEnteredBody();
            expect(body).toMatch(/this\.entityPalette\s*=/);
        });

        test('mentions_round_93_in_body_so_future_refactors_see_why', () => {
            // Document the intent. If a future refactor re-adds
            // the scene.background / fog.color writes, the
            // "round 93" marker in the method body (a block
            // comment explaining WHY they were removed) would
            // be a search hit. Without this marker, a future
            // contributor might re-add the writes thinking
            // they were always there.
            const body = extractOnDimensionEnteredBody();
            // The round-93 marker is an inline block comment
            // inside the method, not a JSDoc. Look for the
            // `Round 93` text within the method body itself.
            expect(body).toMatch(/round 93/i);
        });
    });

    describe('setBiomeAtmosphere (round 92: must own scene.background and fog.color)', () => {
        function extractSetBiomeAtmosphereBody(): string {
            const startMatch = SOURCE.match(/setBiomeAtmosphere\(atm: BiomeAtmosphere\): void \{/);
            if (!startMatch) {
                throw new Error('Could not find setBiomeAtmosphere in SceneManager.ts');
            }
            const startIdx = startMatch.index! + startMatch[0].length;
            const rest = SOURCE.slice(startIdx);
            const nextMethod = rest.match(/\n    [a-zA-Z_]+\([^)]*\):[^{]*\{/);
            const endIdx = nextMethod ? startIdx + nextMethod.index! : SOURCE.length;
            return SOURCE.slice(startIdx, endIdx);
        }

        test('assigns_to_fog.color_from_atm_fogColor (round 92 contract)', () => {
            // `setBiomeAtmosphere` is the SOLE owner of fog.color
            // (after the round-93 fix). The assignment must read
            // from `atm.fogColor` (the per-biome field), not from
            // `lightTint` or some other source.
            const body = extractSetBiomeAtmosphereBody();
            expect(body).toMatch(/this\.scene\.fog\.color\s*=\s*new\s+THREE\.Color\(fogColorInt\)/);
        });

        test('assigns_to_scene.background_from_atm_fogColor (round 92 contract)', () => {
            // Same for `scene.background`. The sky must match the
            // fog or there's a hard line at the fog far distance.
            const body = extractSetBiomeAtmosphereBody();
            expect(body).toMatch(/this\.scene\.background\s*=\s*new\s+THREE\.Color\(fogColorInt\)/);
        });

        test('fogColorInt_is_derived_from_atm_fogColor_not_lightTint (round 92 lock)', () => {
            // The per-biome `fogColor` is a separate field from
            // `lightTint` (sky+haze vs what the directional light
            // casts). They must be derived from different sources,
            // not the same one — otherwise a future "let me just
            // reuse lightTint" refactor would collapse the two
            // concerns.
            const body = extractSetBiomeAtmosphereBody();
            expect(body).toMatch(/parseInt\(atm\.fogColor\.replace/);
        });
    });
});
