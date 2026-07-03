/**
 * SceneManager — minimal Three.js scene that hosts the "无限次元城"
 * (Infinite Dimensional City) hub. Renders a ground plane, a starfield,
 * a rotating skybox, and N floating cube portals. When the player
 * enters a dimension, the matching portal glows.
 *
 * Three.js is loaded lazily so the bundle is small when the game
 * runs headless (e.g. tests).
 */

import type { DimensionBlueprint } from '../ai/AIEngine';
import type { BiomeAtmosphere } from './BiomeAtmosphere';
import { clampCamRadius, stepCamRadius, CAM_RADIUS_MIN, CAM_RADIUS_MAX, CAM_RADIUS_STEP, CAM_RADIUS_DEFAULT } from './CameraZoom';

export interface PortalDef {
    atomId: string;
    color: number;
    label: string;
}

const PORTAL_PALETTE: Record<string, number> = {
    match3:        0xff6b6b,
    tower_defense: 0x4ecdc4,
    card:          0xa06cd5,
    puzzle:        0x45b7d1,
    parkour:       0xffd166,
    turn_combat:   0xef476f,
    synthesis:     0x06d6a0,
    shooting:      0xff8fa3,
};

const DEFAULT_PORTALS: PortalDef[] = Object.entries(PORTAL_PALETTE).map(([atomId, color]) => ({
    atomId,
    color,
    label: atomId,
}));

type THREE = any;

export class SceneManager {
    private canvas: HTMLCanvasElement;
    private THREE: THREE | null = null;
    private renderer: any = null;
    private scene: any = null;
    private camera: any = null;
    private portals: Array<{ mesh: any; def: PortalDef }> = [];
    private spawned: any[] = [];
    private floats: any[] = [];
    private dungeon: any[] = [];
    private npcs: any[] = [];
    /**
     * Round 56 — the active ambient particle system, spawned by
     * `setBiomeAtmosphere`. A bundle of three.js Points + a per-vertex
     * velocity buffer + the drift / speed config. `null` between
     * dimensions. Animated in the tick loop.
     */
    private ambientParticles: {
        points: any;
        velocities: Float32Array;
        drift: { x: number; y: number; z: number };
        speed: number;
    } | null = null;
    /**
     * Round 58 — the three scene lights are stored as fields so
     * `setBiomeAtmosphere` can retint the directional / point lights
     * per biome. The ambient light stays constant (it's the
     * "studio fill" of the scene and shouldn't change with mood).
     */
    private ambientLight: any = null;
    private dirLight: any = null;
    private pointLight: any = null;
    /**
     * Round 58 — scroll-to-zoom camera state. The actual radius
     * lerps toward `targetCamRadius` so the wheel feels smooth
     * instead of jittery. Defaults match the previous hardcoded
     * `camRadius = 28` so the first frame is byte-identical.
     */
    private camRadius: number = CAM_RADIUS_DEFAULT;
    private targetCamRadius: number = CAM_RADIUS_DEFAULT;
    /**
     * Stored on the instance so the handler closure can read the
     * current `targetCamRadius` (it doesn't need a ref because the
     * closure captures `this`).
     */
    private wheelHandler: ((ev: WheelEvent) => void) | null = null;
    private avatar: { group: any; body: any; dir: any; aura: any; lastPulse: number } | null = null;
    private rafHandle: number | null = null;
    private resizeHandler: () => void;
    private activeAtomId: string | null = null;
    /**
     * Round 24 — the active entity spawn palette. Defaults to a
     * rainbow; replaced by the mood-tinted palette whenever a
     * dimension is entered (see `onDimensionEntered`).
     */
    private entityPalette: number[] = [0xff6b6b, 0xffd166, 0x4ecdc4, 0xa06cd5, 0x06d6a0, 0xef476f, 0x45b7d1];
    private startedAt: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.resizeHandler = () => this.onResize();
    }

    async start(): Promise<void> {
        const mod = await import('three');
        this.THREE = mod as unknown as THREE;
        const THREE = this.THREE;

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050617);
        this.scene.fog = new THREE.Fog(0x050617, 30, 120);

        this.camera = new THREE.PerspectiveCamera(
            60,
            this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight),
            0.1,
            500,
        );
        this.camera.position.set(0, 12, 28);
        this.camera.lookAt(0, 4, 0);

        // Lights
        this.ambientLight = new THREE.AmbientLight(0xb0aaff, 0.45);
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xff66cc, 0.8);
        this.dirLight.position.set(15, 25, 10);
        this.scene.add(this.dirLight);
        this.pointLight = new THREE.PointLight(0x66ddff, 0.6, 60);
        this.pointLight.position.set(-20, 8, -10);
        this.scene.add(this.pointLight);

        // Ground
        const groundGeo = new THREE.CircleGeometry(40, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x101030,
            metalness: 0.4,
            roughness: 0.6,
            emissive: 0x222244,
            emissiveIntensity: 0.1,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        this.scene.add(ground);

        // Grid overlay
        const grid = new THREE.GridHelper(80, 40, 0x3355ff, 0x112266);
        (grid.material as any).transparent = true;
        (grid.material as any).opacity = 0.4;
        this.scene.add(grid);

        // Starfield (Points)
        const starCount = 600;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const r = 100 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true });
        this.scene.add(new THREE.Points(starGeo, starMat));

        // Portals arranged in a ring
        const radius = 14;
        DEFAULT_PORTALS.forEach((p, i) => {
            const angle = (i / DEFAULT_PORTALS.length) * Math.PI * 2;
            const geo = new THREE.BoxGeometry(1.6, 3.2, 1.6);
            const mat = new THREE.MeshStandardMaterial({
                color: p.color,
                emissive: p.color,
                emissiveIntensity: 0.6,
                metalness: 0.3,
                roughness: 0.4,
            });
            const cube = new THREE.Mesh(geo, mat);
            cube.position.set(Math.cos(angle) * radius, 2.0, Math.sin(angle) * radius);
            cube.userData.atomId = p.atomId;
            this.scene.add(cube);
            this.portals.push({ mesh: cube, def: p });
        });

        window.addEventListener('resize', this.resizeHandler);
        // Round 58 — scroll-to-zoom. The wheel handler updates
        // `targetCamRadius` (clamped to [CAM_RADIUS_MIN, CAM_RADIUS_MAX]
        // via `stepCamRadius`); the actual camera position lerps
        // toward the target in the tick loop for smooth motion.
        this.wheelHandler = (ev: WheelEvent) => {
            // wheel deltaY > 0 means the wheel scrolled DOWN →
            // the user expects that to ZOOM OUT (camera moves
            // away from the centre). The mouse wheel "natural"
            // direction is "scroll down = page goes down = move
            // camera up" in many UIs, so we invert the sign here
            // to match what players actually want.
            const direction = ev.deltaY > 0 ? 1 : -1;
            this.targetCamRadius = stepCamRadius(this.targetCamRadius, direction);
        };
        window.addEventListener('wheel', this.wheelHandler, { passive: true });
        this.startedAt = performance.now();
        this.tick();
    }

    onDimensionEntered(blueprint: DimensionBlueprint): void {
        this.activeAtomId = blueprint.atomIds[0] || null;
        // Round 24 — apply the mood-tinted color palette to the
        // entity spawn pool. The remaining entries are mixed into
        // the entity spawn pool so freshly-spawned cubes pick up
        // the new theme. The mood signal is otherwise invisible to
        // players — this gives the reflexive loop a visible shape.
        //
        // Round 93 — REMOVED the `scene.background` + `fog.color`
        // assignments that used to read `palette[0]`. Those
        // concerns are now owned by `setBiomeAtmosphere` (the
        // round-92 per-biome `fogColor` field), and pre-round-93
        // the two writes collided: `enterNewDimension` calls
        // `setBiomeAtmosphere` first (line 626 in main.ts) and
        // then `onDimensionEntered` (line 704), so the random
        // `palette[0]` overwrote the deterministic per-biome
        // `fogColor` on every dimension enter. Removing the
        // redundant writes here means the per-biome sky+haze
        // always wins, and the entity palette is the only thing
        // `onDimensionEntered` owns.
        if (blueprint.theme?.colorPalette && this.scene) {
            const palette = blueprint.theme.colorPalette;
            this.entityPalette = palette.map((c) => parseInt(c.replace('#', ''), 16));
        }
    }

    onDimensionCleared(): void {
        this.activeAtomId = null;
        // Reset the entity palette to the default rainbow when
        // leaving a dimension.
        this.entityPalette = [0xff6b6b, 0xffd166, 0x4ecdc4, 0xa06cd5, 0x06d6a0, 0xef476f, 0x45b7d1];
        // Round 56 — drop any ambient particles from the previous biome.
        this.clearAmbientParticles();
    }

    /**
     * Round 56 — replace the active ambient particle system with one
     * matching the supplied biome atmosphere. Also nudges the fog's
     * near / far to match the biome's mood. The previous particle
     * system (if any) is removed first.
     *
     * No-op if Three.js hasn't loaded yet (the test environment, for
     * example).
     */
    setBiomeAtmosphere(atm: BiomeAtmosphere): void {
        if (!this.scene || !this.THREE) return;
        const THREE = this.THREE;
        this.clearAmbientParticles();
        // Round 92 — set fog colour + scene background from the
        // per-biome `atm.fogColor`. The two are coupled on purpose:
        // a fog tint that doesn't match the sky produces a hard
        // line at the fog far distance where the colour shifts
        // abruptly. Pre-round-92 both were driven by
        // `blueprint.theme.colorPalette[0]` (the first WASM-
        // generated colour), which was random per dimension. The
        // per-biome `fogColor` makes the sky+haze deterministic
        // and signature to each biome.
        const fogColorInt = parseInt(atm.fogColor.replace('#', ''), 16);
        if (this.scene.fog) {
            this.scene.fog.near = atm.fogNear;
            this.scene.fog.far = atm.fogFar;
            this.scene.fog.color = new THREE.Color(fogColorInt);
        }
        // Round 92 — also set the scene background so the sky
        // matches the fog. Without this, the fog tints the
        // distance while the "sky" beyond shows the bridge
        // blueprint's random first colour — a visible mismatch
        // at the fog far distance.
        this.scene.background = new THREE.Color(fogColorInt);
        // Round 58 — retint the directional light to the biome's
        // signature `lightTint`. The ambient light stays constant
        // (it's the studio fill, not the mood cue). The point
        // light is also retinted so the back-of-scene fill matches.
        const lightColorInt = parseInt(atm.lightTint.replace('#', ''), 16);
        if (this.dirLight) {
            this.dirLight.color = new THREE.Color(lightColorInt);
            // Round 59 — directional light POSITION per biome
            // (e.g. ice = high noon, desert = low side, forest =
            // angled sunbeams). The position is a unit vector ×
            // distance in world units; we feed the raw triple.
            this.dirLight.position.set(atm.dirLightPos.x, atm.dirLightPos.y, atm.dirLightPos.z);
            // Round 60 — directional light INTENSITY per biome
            // (e.g. desert = 0.95 strong sun, space = 0.4 dim
            // star, ice = 0.75 even noon). Replaces the static
            // constructor default of 0.8 with the per-biome value.
            this.dirLight.intensity = atm.dirLightIntensity;
        }
        if (this.pointLight) {
            // The point light gets the same tint at lower
            // intensity so the back-fill doesn't overpower the
            // key light. Keeps the biome's signature readable.
            this.pointLight.color = new THREE.Color(lightColorInt);
            // Round 60 — point light INTENSITY per biome (e.g.
            // ice = 0.7 strong snow fill, space = 0.25 dim
            // vacuum). Replaces the round 58 hardcoded 0.45.
            this.pointLight.intensity = atm.pointLightIntensity;
            // Round 59 — point light position per biome (e.g.
            // dungeon = low / behind, space = high / opposite
            // side). Feeds the back-fill direction.
            this.pointLight.position.set(atm.pointLightPos.x, atm.pointLightPos.y, atm.pointLightPos.z);
        }
        const count = atm.particleCount;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // Distribute over a 40×20×40 box centred on the origin
            positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
            positions[i * 3 + 1] = Math.random() * 16;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
            // Per-particle velocity: drift bias + random walk
            velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.6;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const colorInt = parseInt(atm.particleColor.replace('#', ''), 16);
        const mat = new THREE.PointsMaterial({
            color: colorInt,
            size: atm.particleSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });
        const points = new THREE.Points(geo, mat);
        this.scene.add(points);
        this.ambientParticles = {
            points,
            velocities,
            drift: { ...atm.particleDrift },
            speed: atm.particleSpeed,
        };
    }

    private clearAmbientParticles(): void {
        if (!this.ambientParticles || !this.scene) return;
        this.scene.remove(this.ambientParticles.points);
        // Free GPU buffers
        this.ambientParticles.points.geometry?.dispose?.();
        this.ambientParticles.points.material?.dispose?.();
        this.ambientParticles = null;
    }

    /**
     * Spawn a coloured cube entity at a random in-bounds position. The
     * entity floats up over a few seconds then fades out, so the scene
     * isn't polluted indefinitely.
     */
    spawnEntity(id: number, label: string): void {
        if (!this.scene) return;
        const THREE = this.THREE;
        if (!THREE) return;
        const color = this.entityPalette[id % this.entityPalette.length];
        const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.7,
            metalness: 0.3,
            roughness: 0.4,
            transparent: true,
            opacity: 1.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const r = 4 + Math.random() * 8;
        const a = Math.random() * Math.PI * 2;
        mesh.position.set(Math.cos(a) * r, 1.0 + Math.random() * 2.0, Math.sin(a) * r);
        mesh.userData = { id, label, bornAt: performance.now() };
        this.scene.add(mesh);
        this.spawned.push(mesh);
        if (this.spawned.length > 200) {
            const old = this.spawned.shift();
            if (old) this.scene.remove(old);
        }
    }

    /**
     * Move the camera in the hub by (dx, dy) in world units. Clamps
     * to a comfortable orbit radius so the player can't fly out.
     */
    moveCamera(dx: number, dz: number): void {
        if (!this.camera) return;
        const maxR = 18;
        this.camera.position.x = Math.max(-maxR, Math.min(maxR, this.camera.position.x + dx));
        this.camera.position.z = Math.max(-maxR, Math.min(maxR, this.camera.position.z + dz));
        this.camera.lookAt(0, 4, 0);
    }

    /**
     * Camera position helper (used by the click-to-move controller).
     */
    cameraPosition(): { x: number; y: number; z: number } {
        return this.camera ? { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z } : { x: 0, y: 0, z: 0 };
    }

    /**
     * Move camera to a world position (used when clicking a portal/NPC).
     */
    moveCameraTo(x: number, z: number): void {
        if (!this.camera) return;
        const maxR = 18;
        this.camera.position.x = Math.max(-maxR, Math.min(maxR, x));
        this.camera.position.z = Math.max(-maxR, Math.min(maxR, z));
        this.camera.lookAt(0, 4, 0);
    }

    /**
     * Spawn (or update) a player avatar in the world. A glowing capsule
     * with a small directional indicator on top. The avatar is positioned
     * at the camera so the player always sees their character.
     */
    spawnPlayerAvatar(): void {
        if (!this.scene) return;
        const THREE = this.THREE;
        if (!THREE) return;

        if (this.avatar) {
            // Already exists — re-position to current camera.
            this.updateAvatarPosition();
            return;
        }

        const group = new THREE.Group();

        // Body
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4ecdc4,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.7,
            metalness: 0.4,
            roughness: 0.4,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.0;
        group.add(body);

        // Direction indicator (small forward-pointing cone)
        const dirGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
        const dirMat = new THREE.MeshStandardMaterial({
            color: 0xffd166,
            emissive: 0xffd166,
            emissiveIntensity: 0.8,
        });
        const dir = new THREE.Mesh(dirGeo, dirMat);
        dir.position.set(0, 1.6, 0.5);
        dir.rotation.x = -Math.PI / 2;
        group.add(dir);

        // Aura ring (a flat torus that pulses)
        const auraGeo = new THREE.TorusGeometry(0.7, 0.05, 8, 24);
        const auraMat = new THREE.MeshBasicMaterial({
            color: 0xa06cd5,
            transparent: true,
            opacity: 0.6,
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.05;
        group.add(aura);

        this.scene.add(group);
        this.avatar = { group, body, dir, aura, lastPulse: 0 };
        this.updateAvatarPosition();
    }

    /** Update the avatar's world position from the camera. */
    updateAvatarPosition(): void {
        if (!this.avatar || !this.camera) return;
        const p = this.camera.position;
        this.avatar.group.position.set(p.x, 0, p.z);
        // Face the same direction the camera looks (toward origin).
        const dx = -p.x, dz = -p.z;
        this.avatar.group.rotation.y = Math.atan2(dx, dz);
    }

    /** Pulse the avatar's aura ring (called from the tick). */
    pulseAvatar(now: number): void {
        if (!this.avatar) return;
        if (now - this.avatar.lastPulse < 100) return;
        this.avatar.lastPulse = now;
        const s = 1 + Math.sin(now * 0.005) * 0.1;
        this.avatar.aura.scale.set(s, s, 1);
        const mat = this.avatar.aura.material as any;
        if (mat && 'opacity' in mat) {
            mat.opacity = 0.4 + Math.sin(now * 0.005) * 0.3;
        }
    }

    /**
     * Play the player death animation. The avatar flashes red,
     * then fades out and is replaced by a translucent "ghost"
     * mesh that floats up. After `totalMs` the body is removed
     * and the player can be respawned.
     */
    playDeathAnimation(totalMs: number = 1400): void {
        if (!this.scene || !this.avatar) return;
        const THREE = this.THREE;
        if (!THREE) return;
        // Flash red 3x
        let flashes = 0;
        const flashInterval = setInterval(() => {
            if (!this.avatar) { clearInterval(flashInterval); return; }
            const mat = this.avatar.body.material as any;
            if (mat) {
                mat.emissiveIntensity = flashes % 2 === 0 ? 3.0 : 0.0;
                mat.color.setHex(flashes % 2 === 0 ? 0xff4d6d : 0x4ecdc4);
            }
            flashes += 1;
            if (flashes >= 6) {
                clearInterval(flashInterval);
                this.spawnGhost();
            }
        }, totalMs / 6);
    }

    /** Spawn a translucent ghost avatar that floats up and fades. */
    private spawnGhost(): void {
        if (!this.scene || !this.avatar || !this.THREE) return;
        const THREE = this.THREE;
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
        const bodyMat = new THREE.MeshBasicMaterial({
            color: 0xa06cd5,
            transparent: true,
            opacity: 0.55,
        });
        const ghost = new THREE.Mesh(bodyGeo, bodyMat);
        ghost.position.copy(this.avatar.group.position);
        ghost.position.y += 0.5;
        this.scene.add(ghost);
        const born = performance.now();
        const tick = () => {
            const age = (performance.now() - born) / 1000;
            if (age > 2) {
                this.scene?.remove(ghost);
                return;
            }
            ghost.position.y += 0.01;
            const m = ghost.material as any;
            if (m) m.opacity = Math.max(0, 0.55 - age * 0.3);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    /**
     * Spawn an NPC entity (capsule + name sprite + dialogue bubble).
     * The bubble is hidden by default; call `setNpcDialogue(id, text)`
     * to show a one-liner above the NPC's head.
     */
    spawnNpc(id: number, name: string, position?: { x: number; y: number; z: number }): void {
        if (!this.scene) return;
        const THREE = this.THREE;
        if (!THREE) return;
        const palette = [0xff66cc, 0x06d6a0, 0xffd166, 0xa06cd5, 0x4ecdc4];
        const color = palette[id % palette.length];

        // Body
        const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.4,
            metalness: 0.3,
            roughness: 0.5,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        const p = position ?? { x: 6 + (Math.random() - 0.5) * 4, y: 0, z: 6 + (Math.random() - 0.5) * 4 };
        body.position.set(p.x, 1.0, p.z);
        this.scene.add(body);

        // Name sprite
        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 256; nameCanvas.height = 64;
        const nctx = nameCanvas.getContext('2d');
        if (nctx) {
            nctx.font = 'bold 36px sans-serif';
            nctx.fillStyle = '#ffffff';
            nctx.textAlign = 'center';
            nctx.textBaseline = 'middle';
            nctx.fillText(name, 128, 32);
        }
        const nameTex = new THREE.CanvasTexture(nameCanvas);
        const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
        const nameSprite = new THREE.Sprite(nameMat);
        nameSprite.scale.set(2.5, 0.6, 1.0);
        nameSprite.position.set(p.x, 3.0, p.z);
        this.scene.add(nameSprite);

        // Dialogue bubble (initially hidden)
        const bubbleCanvas = document.createElement('canvas');
        bubbleCanvas.width = 512; bubbleCanvas.height = 128;
        const bctx = bubbleCanvas.getContext('2d');
        const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
        const bubbleMat = new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, opacity: 0 });
        const bubble = new THREE.Sprite(bubbleMat);
        bubble.scale.set(4.0, 1.0, 1.0);
        bubble.position.set(p.x, 3.8, p.z);
        this.scene.add(bubble);

        this.npcs.push({ id, name, body, nameSprite, bubble, bubbleCanvas, bctx, color });
    }

    /**
     * Round 24 — spawn a wave of NPCs themed to the scene. The
     * `archetypeHints` array can be empty (then this is equivalent
     * to spawning `count` plain NPCs at the existing random
     * positions). The function reuses the same colour and capsule
     * geometry as `spawnNpc`; the new field is just the count.
     *
     * Returns the array of spawned `{id, name, archetype}` records so
     * the caller can register them with `NpcRegistry`.
     */
    spawnNpcWave(
        count: number,
        archetypeHints: readonly string[] = [],
    ): Array<{ id: number; name: string; archetype: string }> {
        const spawned: Array<{ id: number; name: string; archetype: string }> = [];
        for (let i = 0; i < count; i++) {
            const archetype = archetypeHints.length > 0
                ? archetypeHints[i % archetypeHints.length]
                : '';
            const id = this.npcs.length + i + 1;
            const name = archetype
                ? `${archetype}·${String(i + 1).padStart(2, '0')}`
                : `游荡者·${String(i + 1).padStart(2, '0')}`;
            this.spawnNpc(id, name);
            spawned.push({ id, name, archetype });
        }
        return spawned;
    }

    /** Update the dialogue bubble for a previously-spawned NPC. */
    setNpcDialogue(id: number, text: string): void {
        const npc = this.npcs.find(n => n.id === id);
        if (!npc || !npc.bctx) return;
        const ctx = npc.bctx;
        ctx.clearRect(0, 0, npc.bubbleCanvas.width, npc.bubbleCanvas.height);
        // Background
        ctx.fillStyle = 'rgba(11, 11, 34, 0.85)';
        ctx.strokeStyle = '#45b7d1';
        ctx.lineWidth = 3;
        const w = npc.bubbleCanvas.width, h = npc.bubbleCanvas.height;
        ctx.fillRect(4, 4, w - 8, h - 8);
        ctx.strokeRect(4, 4, w - 8, h - 8);
        // Text
        ctx.fillStyle = '#e6e8ff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Wrap text to 2 lines
        const words = text.split('');
        const maxCharsPerLine = 18;
        const lines: string[] = [];
        for (let i = 0; i < words.length; i += maxCharsPerLine) {
            lines.push(words.slice(i, i + maxCharsPerLine).join(''));
            if (lines.length === 2) break;
        }
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], w / 2, h / 2 - 18 + i * 36);
        }
        const mat = npc.bubble.material as any;
        if (mat) mat.opacity = 1.0;
        if (npc.bubble.material.map) (npc.bubble.material.map as any).needsUpdate = true;
    }

    /** Hide the dialogue bubble for an NPC. */
    clearNpcDialogue(id: number): void {
        const npc = this.npcs.find(n => n.id === id);
        if (!npc) return;
        const mat = npc.bubble.material as any;
        if (mat) mat.opacity = 0;
    }

    /** Briefly flash an NPC (used for damage feedback). */
    flashNpc(id: number): void {
        const npc = this.npcs.find(n => n.id === id);
        if (!npc) return;
        const mat = npc.body.material as any;
        if (!mat) return;
        // Save original emissive, brighten, then restore in the tick loop.
        if (!npc.body.userData.flashing) {
            npc.body.userData.flashing = true;
            npc.body.userData.flashUntil = performance.now() + 220;
        }
        mat.emissiveIntensity = 2.5;
    }

    /** Hide an NPC entirely (defeat). */
    hideNpc(id: number): void {
        const npc = this.npcs.find(n => n.id === id);
        if (!npc) return;
        npc.body.visible = false;
        npc.nameSprite.visible = false;
        npc.bubble.visible = false;
    }

    /**
     * Render a 2D WFC dungeon into the scene as a mini-3D grid. Floor
     * tiles are flat planes, walls are raised boxes, the spawn and goal
     * get coloured markers. The grid is centred on the origin.
     *
     * If `biome` is supplied (a WfcBiomes palette), its per-tile
     * colour overrides are used; otherwise the default cyberpunk-ish
     * palette is used.
     */
    renderWfcDungeon(grid: number[][], tileSize: number = 1.2, biome?: { tileColors: Record<number, string> }): void {
        if (!this.scene) return;
        const THREE = this.THREE;
        if (!THREE) return;
        // Clear previous dungeon
        for (const obj of this.dungeon) this.scene.remove(obj);
        this.dungeon = [];
        if (grid.length === 0) return;

        const w = grid[0].length, h = grid.length;
        const offX = -w * tileSize / 2;
        const offZ = -h * tileSize / 2;

        // Tile colours (TILE_* from WfcLevelGen). Biome override wins.
        const parseHex = (s: string) => parseInt(s.replace('#', ''), 16);
        const tileColors: Record<number, [number, number]> = {
            0: [biome?.tileColors[0] ? parseHex(biome.tileColors[0]) : 0x101030, 0.1],
            1: [biome?.tileColors[1] ? parseHex(biome.tileColors[1]) : 0x0a0e1d, 2.0],
            2: [biome?.tileColors[2] ? parseHex(biome.tileColors[2]) : 0xa06cd5, 1.5],
            3: [biome?.tileColors[3] ? parseHex(biome.tileColors[3]) : 0xffd166, 0.6],
            4: [biome?.tileColors[4] ? parseHex(biome.tileColors[4]) : 0x06d6a0, 0.2],
            5: [biome?.tileColors[5] ? parseHex(biome.tileColors[5]) : 0xff66cc, 0.2],
            6: [biome?.tileColors[6] ? parseHex(biome.tileColors[6]) : 0xff4d4d, 0.15],
            7: [biome?.tileColors[7] ? parseHex(biome.tileColors[7]) : 0x9c89ff, 1.2],
        };

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const t = grid[y][x];
                const entry = tileColors[t] ?? tileColors[0];
                const [color, height] = entry;
                if (height <= 0.1) {
                    const g = new THREE.PlaneGeometry(tileSize, tileSize);
                    const m = new THREE.MeshStandardMaterial({
                        color,
                        emissive: color,
                        emissiveIntensity: 0.15,
                        metalness: 0.2,
                        roughness: 0.6,
                    });
                    const mesh = new THREE.Mesh(g, m);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(offX + x * tileSize, 0, offZ + y * tileSize);
                    this.scene.add(mesh);
                    this.dungeon.push(mesh);
                } else {
                    const g = new THREE.BoxGeometry(tileSize, height, tileSize);
                    const m = new THREE.MeshStandardMaterial({
                        color,
                        emissive: color,
                        emissiveIntensity: t === 4 || t === 5 ? 0.6 : 0.3,
                        metalness: 0.4,
                        roughness: 0.4,
                    });
                    const mesh = new THREE.Mesh(g, m);
                    mesh.position.set(offX + x * tileSize, height / 2, offZ + y * tileSize);
                    if (t === 4 || t === 5) {
                        mesh.userData = { marker: t === 4 ? 'spawn' : 'goal' };
                    }
                    this.scene.add(mesh);
                    this.dungeon.push(mesh);
                }
            }
        }
    }

    /**
     * Pop a 3D floating-text mesh into the world. We don't load a font;
     * instead we attach a coloured sprite. For text we'd normally use
     * troika-three-text, but to keep zero external deps we use a small
     * canvas-rendered sprite.
     */
    spawnFloatingText(text: string, color: string): void {
        if (!this.scene) return;
        const THREE = this.THREE;
        if (!THREE) return;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 64px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.5, 1.0, 1.0);
        sprite.position.set(0, 3, 0);
        sprite.userData = { bornAt: performance.now() };
        this.scene.add(sprite);
        this.floats.push(sprite);
    }

    private fadeOldSpawned(): void {
        const now = performance.now();
        this.spawned = this.spawned.filter(m => {
            const age = (now - (m.userData?.bornAt ?? 0)) / 1000;
            if (age > 4) {
                this.scene?.remove(m);
                return false;
            }
            // Float up + fade
            m.position.y += 0.01;
            const mat = m.material as any;
            if (mat && 'opacity' in mat) {
                mat.opacity = Math.max(0, 1 - age / 4);
            }
            return true;
        });
        this.floats = this.floats.filter(s => {
            const age = (now - (s.userData?.bornAt ?? 0)) / 1000;
            if (age > 1.5) {
                this.scene?.remove(s);
                return false;
            }
            s.position.y += 0.03;
            const mat = s.material as any;
            if (mat && 'opacity' in mat) {
                mat.opacity = Math.max(0, 1 - age / 1.5);
            }
            return true;
        });
    }

    private onResize(): void {
        if (!this.renderer || !this.camera) return;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
    }

    private tick = (): void => {
        if (!this.renderer || !this.scene || !this.camera) return;
        const t = (performance.now() - this.startedAt) / 1000;

        // Spin portals
        for (const { mesh, def } of this.portals) {
            mesh.rotation.y = t * 0.6;
            const isActive = def.atomId === this.activeAtomId;
            const target = isActive ? 1.6 : 0.4;
            mesh.scale.y += (target - mesh.scale.y) * 0.05;
            const mat = mesh.material as any;
            if (mat && 'emissiveIntensity' in mat) {
                const cur = mat.emissiveIntensity as number;
                mat.emissiveIntensity = cur + (target * 0.5 - cur) * 0.05;
            }
        }

        // Slow camera orbit (radius lerps toward `targetCamRadius`,
        // which the scroll-to-zoom wheel handler updates — round 58).
        this.camRadius += (this.targetCamRadius - this.camRadius) * 0.08;
        this.camera.position.x = Math.cos(t * 0.1) * this.camRadius;
        this.camera.position.z = Math.sin(t * 0.1) * this.camRadius;
        this.camera.lookAt(0, 4, 0);

        this.fadeOldSpawned();
        if (this.avatar) {
            this.updateAvatarPosition();
            this.pulseAvatar(performance.now());
        }
        // NPC flash restore
        const now = performance.now();
        for (const npc of this.npcs) {
            if (npc.body.userData?.flashing && now > (npc.body.userData.flashUntil ?? 0)) {
                const mat = npc.body.material as any;
                if (mat) mat.emissiveIntensity = 0.4;
                npc.body.userData.flashing = false;
            }
        }
        // Round 56 — animate the active ambient particle system.
        this.tickAmbientParticles();
        this.renderer.render(this.scene, this.camera);
        this.rafHandle = requestAnimationFrame(this.tick);
    };

    private tickAmbientParticles(): void {
        if (!this.ambientParticles) return;
        const ap = this.ambientParticles;
        const dt = 1 / 60; // approximation; requestAnimationFrame cadence
        const positions = ap.points.geometry.attributes.position.array as Float32Array;
        const v = ap.velocities;
        const count = v.length / 3;
        const drift = ap.drift;
        const speed = ap.speed;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            // velocity = random walk + drift bias
            positions[idx + 0] += (v[idx + 0] * 0.05 + drift.x * speed) * dt;
            positions[idx + 1] += (v[idx + 1] * 0.05 + drift.y * speed) * dt;
            positions[idx + 2] += (v[idx + 2] * 0.05 + drift.z * speed) * dt;
            // Wrap around so particles never escape the play area
            if (positions[idx + 0] >  20) positions[idx + 0] = -20;
            if (positions[idx + 0] < -20) positions[idx + 0] =  20;
            if (positions[idx + 1] >  16) positions[idx + 1] =   0;
            if (positions[idx + 1] <   0) positions[idx + 1] =  16;
            if (positions[idx + 2] >  20) positions[idx + 2] = -20;
            if (positions[idx + 2] < -20) positions[idx + 2] =  20;
        }
        ap.points.geometry.attributes.position.needsUpdate = true;
    }

    dispose(): void {
        if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
        window.removeEventListener('resize', this.resizeHandler);
        if (this.wheelHandler) {
            window.removeEventListener('wheel', this.wheelHandler);
            this.wheelHandler = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        this.portals = [];
        this.spawned = [];
        this.floats = [];
        this.dungeon = [];
        this.npcs = [];
    }
}
