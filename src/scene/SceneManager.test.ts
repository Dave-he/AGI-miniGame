/**
 * Round 105 — SceneManager behavioural test suite with mocked THREE.
 *
 * The round-93 file-content tests above pin the round-92/93 fixes
 * at the SOURCE — they catch a "refactor re-added the writes"
 * regression by reading the source file. But they have a gap:
 * they don't catch a "refactor changed the variable name but
 * the assignment still works" regression, nor do they verify
 * the actual colour value flowing through the call site.
 *
 * Round 105 adds BEHAVIOURAL tests that mock the THREE.js
 * dependencies and verify the actual side effects at the
 * `scene.background` and `fog.color` level. The SceneManager
 * is constructed with a stub canvas (jsdom), and the `THREE`
 * and `scene` private fields are injected via the
 * `(sceneManager as unknown as { ... })` cast pattern
 * (round-90 + round-98 standard). When `setBiomeAtmosphere`
 * is called with a real `BiomeAtmosphere`, the mocked
 * `scene.background` and `scene.fog.color` should both equal
 * the per-biome `fogColor` integer.
 *
 * **Why mock THREE instead of awaiting start()**: SceneManager
 * uses `await import('three')` for lazy loading. In jsdom, this
 * import returns the real `three` module, but the subsequent
 * `new THREE.WebGLRenderer({ canvas: ... })` throws because
 * jsdom's HTMLCanvasElement has no WebGL context. The methods
 * we want to test (`setBiomeAtmosphere`, `onDimensionEntered`)
 * both check `if (!this.scene || !this.THREE) return;` early
 * and become safe no-ops. Mocking bypasses the WebGL failure
 * by injecting a stub `THREE` class and a stub `scene` object
 * — the methods run their body in jsdom and we can assert on
 * the stub side effects.
 */

import { SceneManager } from './SceneManager';
import type { BiomeAtmosphere } from './BiomeAtmosphere';
import type { DimensionBlueprint } from '../ai/AIEngine';

// ---------------------------------------------------------------------------
// Mock helpers — minimal THREE stubs that let SceneManager's
// methods run their body in jsdom without WebGL.
// ---------------------------------------------------------------------------

/**
 * A minimal THREE stub. We only need `Color` (round-92 fog
 * tint + scene background) and `Vector3` (used in the
 * setBiomeAtmosphere path for light position). All other
 * Three.js classes are stubbed with constructors that
 * record their args for assertion.
 */
class MockColor {
    value: number;
    constructor(arg: number | string) {
        if (typeof arg === 'number') {
            this.value = arg;
        } else {
            // We don't actually call Color(hex-string) in
            // the production code path we're testing, but
            // the stub is robust to it for forward-compat.
            this.value = parseInt((arg as string).replace('#', ''), 16);
        }
    }
    setHex(hex: number): this {
        this.value = hex;
        return this;
    }
}

interface MockScene {
    background: MockColor | null;
    fog: { near: number; far: number; color: MockColor } | null;
    add: (...args: unknown[]) => void;
    remove: (...args: unknown[]) => void;
}

function makeMockScene(): MockScene {
    return {
        background: null,
        fog: { near: 30, far: 120, color: new MockColor(0x050617) },
        add: () => undefined,
        remove: () => undefined,
    };
}

function makeMockThree(): Record<string, unknown> {
    return {
        Color: MockColor,
        // The other Three classes SceneManager uses
        // (BoxGeometry, CircleGeometry, etc.) aren't on
        // the setBiomeAtmosphere / onDimensionEntered
        // path, but we stub them anyway so any
        // future call doesn't throw.
        Vector3: class { constructor(public x = 0, public y = 0, public z = 0) {} },
        AmbientLight: class { constructor(public color: number, public intensity: number) {} },
        DirectionalLight: class {
            color: MockColor;
            intensity: number;
            position = { set: () => undefined };
            constructor(c: number, i: number) {
                this.color = new MockColor(c);
                this.intensity = i;
            }
        },
        PointLight: class {
            color: MockColor;
            intensity: number;
            distance: number;
            position = { set: () => undefined };
            constructor(c: number, i: number, d: number) {
                this.color = new MockColor(c);
                this.intensity = i;
                this.distance = d;
            }
        },
        Fog: class {
            color: MockColor;
            near: number;
            far: number;
            constructor(c: number, n: number, f: number) {
                this.color = new MockColor(c);
                this.near = n;
                this.far = f;
            }
        },
        Scene: class { constructor() { /* stub */ } },
        PerspectiveCamera: class { position = { set: () => undefined }; lookAt: () => void = () => undefined; },
        WebGLRenderer: class { setPixelRatio: () => void; setSize: () => void; },
        CircleGeometry: class {},
        MeshStandardMaterial: class {},
        Mesh: class { position = { set: () => undefined }; rotation = { x: 0, y: 0, z: 0 }; scale = { set: () => undefined }; },
        Group: class { add: () => void; rotation = { y: 0 }; children: unknown[] = []; position = { y: 0 }; },
        BoxGeometry: class {},
        MeshBasicMaterial: class {},
        Points: class { geometry = { attributes: {}, setAttribute: () => undefined }; material = { color: 0, size: 0, transparent: false, opacity: 1, depthWrite: true, sizeAttenuation: true }; },
        BufferGeometry: class { setAttribute() { return undefined; } },
        BufferAttribute: class {},
        Float32BufferAttribute: class {},
        AdditiveBlending: 1,
        PointsMaterial: class {},
    };
}

/**
 * Construct a SceneManager with the private THREE + scene
 * fields injected. The cast pattern mirrors round-90/98 —
 * private fields are accessed via `(obj as unknown as { ... })`.
 * Returns the manager, the injected scene, and the mock THREE
 * (so the test can assert on scene side effects).
 */
function makeSceneManagerWithMockThree(): {
    manager: SceneManager;
    scene: MockScene;
    THREE: Record<string, unknown>;
} {
    // jsdom supplies HTMLCanvasElement globally
    const canvas = document.createElement('canvas');
    const manager = new SceneManager(canvas);
    const scene = makeMockScene();
    const THREE = makeMockThree();
    // Inject the mock fields. The round-90/98 cast pattern.
    (manager as unknown as { THREE: typeof THREE }).THREE = THREE;
    (manager as unknown as { scene: MockScene }).scene = scene;
    return { manager, scene, THREE };
}

function makeBiomeAtmosphere(overrides: Partial<BiomeAtmosphere> = {}): BiomeAtmosphere {
    return {
        particleColor: '#90c290',
        particleCount: 50,
        particleSize: 0.1,
        particleSpeed: 0.5,
        particleDrift: { x: 0, y: 0, z: 0 },
        fogNear: 30,
        fogFar: 120,
        // Round 92 — desert fogColor (warmer than the default 0x050617)
        fogColor: '#e8c890',
        lightTint: '#ffd166',
        // Round 59 — directional + point light positions
        // (we use generic values; round-105 tests
        // only assert on scene.background + fog.color
        // and fog.near/far, not on the light positions).
        dirLightPos: { x: 15, y: 25, z: 10 },
        pointLightPos: { x: -20, y: 8, z: -10 },
        // Round 60 — light intensities
        dirLightIntensity: 0.8,
        pointLightIntensity: 0.6,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Round 105 — behavioural tests.
// ---------------------------------------------------------------------------

describe('SceneManager — round 105: behavioural tests with mocked THREE', () => {
    describe('setBiomeAtmosphere (round 92: per-biome fogColor drives scene.background + fog.color)', () => {
        test('assigns_scene_background_to_atm_fogColor_integer', () => {
            // The round-92 contract: setBiomeAtmosphere
            // owns `scene.background` and sets it to
            // the per-biome `atm.fogColor` integer.
            // Behavioural test: call the method with
            // a real BiomeAtmosphere, assert the
            // mocked `scene.background.value` equals
            // the expected integer.
            const { manager, scene } = makeSceneManagerWithMockThree();
            const atm = makeBiomeAtmosphere({ fogColor: '#e8c890' });
            // Desert fogColor = 0xe8c890 = 15250064
            const expectedInt = parseInt('e8c890', 16);
            manager.setBiomeAtmosphere(atm);
            // Round 92 — the fog color and the
            // background should both be the per-biome
            // integer. The cast on `scene` works
            // because the mock implements the shape.
            expect((scene.background as MockColor).value).toBe(expectedInt);
        });

        test('assigns_fog_color_to_atm_fogColor_integer', () => {
            // The fog must also match the per-biome
            // `fogColor` — a fog that doesn't match
            // the sky produces a hard line at the
            // fog far distance.
            const { manager, scene } = makeSceneManagerWithMockThree();
            const atm = makeBiomeAtmosphere({ fogColor: '#d8e8f0' });
            // Ice biome fogColor = 0xd8e8f0 = 14205680
            const expectedInt = parseInt('d8e8f0', 16);
            manager.setBiomeAtmosphere(atm);
            expect((scene.fog as { color: MockColor }).color.value).toBe(expectedInt);
        });

        test('different_biomes_produce_different_scene_background (round 92 lock)', () => {
            // A regression that hard-codes a single
            // colour (e.g. "let me just use the
            // default 0x050617 for all biomes")
            // would silently collapse the
            // biome-signature visual. The test calls
            // setBiomeAtmosphere with TWO different
            // biomes and asserts the scene.background
            // value changes between calls.
            const { manager, scene } = makeSceneManagerWithMockThree();
            // First biome: cyberpunk (round 92 hex #0a0a2a)
            const cyberpunk = makeBiomeAtmosphere({ fogColor: '#0a0a2a' });
            manager.setBiomeAtmosphere(cyberpunk);
            const cyberpunkBg = (scene.background as MockColor).value;
            // Second biome: desert (round 92 hex #e8c890)
            const desert = makeBiomeAtmosphere({ fogColor: '#e8c890' });
            manager.setBiomeAtmosphere(desert);
            const desertBg = (scene.background as MockColor).value;
            // The two biomes must produce different
            // scene.background values. A regression
            // that hard-codes a single colour
            // (e.g. the production startup default
            // 0x050617) would fail this assertion.
            expect(cyberpunkBg).not.toBe(desertBg);
            // Pin the exact values for forward-compat
            // (a future round that changes the hex
            // would need to update these literals).
            expect(cyberpunkBg).toBe(0x0a0a2a);
            expect(desertBg).toBe(0xe8c890);
        });

        test('updates_fog_near_and_far_from_atm (round 56 contract)', () => {
            // Round 56 set up the biome-tinted fog
            // near/far. The behavioural test asserts
            // that calling setBiomeAtmosphere with
            // non-default near/far values actually
            // updates `scene.fog.near` and
            // `scene.fog.far` (not just the colour).
            // A regression that drops the near/far
            // writes would silently leave the fog
            // density stuck at the startup default.
            const { manager, scene } = makeSceneManagerWithMockThree();
            const atm = makeBiomeAtmosphere({
                fogNear: 18,
                fogFar: 90,
            });
            manager.setBiomeAtmosphere(atm);
            // The cast: scene.fog is { near, far, color }
            const fog = scene.fog as { near: number; far: number };
            expect(fog.near).toBe(18);
            expect(fog.far).toBe(90);
        });
    });

    describe('onDimensionEntered (round 93: must NOT touch scene.background or fog.color)', () => {
        function makeBlueprint(palette: string[]): DimensionBlueprint {
            // Minimal DimensionBlueprint fixture. Only
            // the `theme.colorPalette` field is read
            // by onDimensionEntered, so the rest is
            // stubbed to satisfy the TS shape.
            return {
                id: 'dim_r105',
                name: 'r105 fixture',
                description: 'r105',
                atomIds: ['tower_defense'],
                atomWeights: { tower_defense: 1 },
                difficulty: 0.5,
                rules: [],
                rewards: [],
                theme: {
                    name: 'r105',
                    visualStyle: 'fantasy',
                    musicMood: 'cheerful',
                    colorPalette: palette,
                },
                timeLimitSecs: 60,
                objectives: [],
            } as unknown as DimensionBlueprint;
        }

        test('does_not_overwrite_scene_background_after_setBiomeAtmosphere (round 93 fix)', () => {
            // The headline round-93 fix: after
            // setBiomeAtmosphere sets the per-biome
            // fogColor on `scene.background`, a
            // subsequent `onDimensionEntered` call
            // must NOT overwrite it. Pre-round-93,
            // onDimensionEntered read
            // `blueprint.theme.colorPalette[0]` (a
            // random WASM-generated colour) and
            // re-assigned scene.background. That
            // raced with the deterministic per-biome
            // fogColor and the random colour won
            // every time.
            const { manager, scene } = makeSceneManagerWithMockThree();
            // Step 1: setBiomeAtmosphere writes the
            // desert fogColor to scene.background.
            const atm = makeBiomeAtmosphere({ fogColor: '#e8c890' });
            manager.setBiomeAtmosphere(atm);
            const beforeEnterBg = (scene.background as MockColor).value;
            expect(beforeEnterBg).toBe(0xe8c890);
            // Step 2: onDimensionEntered is called
            // with a blueprint whose palette[0] is
            // a DIFFERENT colour (e.g. a random
            // WASM-generated value). If the
            // round-93 regression were re-added,
            // the scene.background would silently
            // flip to 0x123456 (the palette[0]
            // value).
            const blueprint = makeBlueprint(['#123456', '#789abc']);
            manager.onDimensionEntered(blueprint);
            const afterEnterBg = (scene.background as MockColor).value;
            // The scene.background must STILL be
            // the per-biome desert colour, not
            // the random palette[0].
            expect(afterEnterBg).toBe(0xe8c890);
        });

        test('does_not_overwrite_fog_color_after_setBiomeAtmosphere (round 93 fix)', () => {
            // Same for fog.color. The pre-round-93
            // write `fog.color = new THREE.Color(
            // palette[0])` would silently flip
            // the fog colour back to the random
            // WASM-generated value.
            const { manager, scene } = makeSceneManagerWithMockThree();
            const atm = makeBiomeAtmosphere({ fogColor: '#d8e8f0' });
            manager.setBiomeAtmosphere(atm);
            const beforeFogColor = (scene.fog as { color: MockColor }).color.value;
            expect(beforeFogColor).toBe(0xd8e8f0);
            const blueprint = makeBlueprint(['#abcdef', '#012345']);
            manager.onDimensionEntered(blueprint);
            const afterFogColor = (scene.fog as { color: MockColor }).color.value;
            expect(afterFogColor).toBe(0xd8e8f0);
        });

        test('still_updates_entityPalette_to_blueprint_palette (round 93 did not over-rotate)', () => {
            // Sanity check: the round-93 fix
            // preserved the entity palette
            // assignment. `onDimensionEntered` is
            // the SOLE owner of the entity palette
            // (cubes pick up the theme's colours).
            // A regression that drops the entity
            // palette would leave every cube at
            // the default rainbow regardless of
            // biome.
            const { manager } = makeSceneManagerWithMockThree();
            const blueprint = makeBlueprint(['#ff6b6b', '#4ecdc4', '#45b7d1']);
            manager.onDimensionEntered(blueprint);
            const entityPalette = (manager as unknown as { entityPalette: number[] }).entityPalette;
            // The entity palette should be the
            // parsed integer form of the blueprint
            // palette. The default rainbow
            // (0xff6b6b, 0xffd166, 0x4ecdc4,
            // 0xa06cd5, 0x06d6a0, 0xef476f,
            // 0x45b7d1) must NOT survive.
            expect(entityPalette).toEqual([0xff6b6b, 0x4ecdc4, 0x45b7d1]);
        });
    });
});

// ---------------------------------------------------------------------------
// Round 93 — file-content regression tests for the same
// round-92/93 fix. These tests lock the fix at the SOURCE —
// they catch a "refactor re-added the writes" regression by
// reading the source file directly. They complement the
// round-105 behavioural tests above (which catch "refactor
// changed the variable name but the assignment still works"
// regressions and verify the actual colour value flowing
// through the call site).
//
// The round-93 file-content tests were the original lock.
// The round-105 behavioural tests are the deeper lock.
// Together they form a two-sided contract: source-level +
// behaviour-level regression coverage for the round-92/93
// fixes (画面优美 / 场景更优).
// ---------------------------------------------------------------------------

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
