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
    private rafHandle: number | null = null;
    private resizeHandler: () => void;
    private activeAtomId: string | null = null;
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
        const ambient = new THREE.AmbientLight(0xb0aaff, 0.45);
        this.scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xff66cc, 0.8);
        dir.position.set(15, 25, 10);
        this.scene.add(dir);
        const back = new THREE.PointLight(0x66ddff, 0.6, 60);
        back.position.set(-20, 8, -10);
        this.scene.add(back);

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
        this.startedAt = performance.now();
        this.tick();
    }

    onDimensionEntered(blueprint: DimensionBlueprint): void {
        this.activeAtomId = blueprint.atomIds[0] || null;
    }

    onDimensionCleared(): void {
        this.activeAtomId = null;
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
        const palette = [0xff6b6b, 0xffd166, 0x4ecdc4, 0xa06cd5, 0x06d6a0, 0xef476f, 0x45b7d1];
        const color = palette[id % palette.length];
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

    /**
     * Render a 2D WFC dungeon into the scene as a mini-3D grid. Floor
     * tiles are flat planes, walls are raised boxes, the spawn and goal
     * get coloured markers. The grid is centred on the origin.
     */
    renderWfcDungeon(grid: number[][], tileSize: number = 1.2): void {
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

        // Tile colours (TILE_* from WfcLevelGen)
        const tileColors: Record<number, [number, number]> = {
            0: [0x101030, 0.1],  // floor
            1: [0x0a0e1d, 2.0],  // wall
            2: [0xa06cd5, 1.5],  // door
            3: [0xffd166, 0.6],  // chest
            4: [0x06d6a0, 0.2],  // spawn
            5: [0xff66cc, 0.2],  // goal
        };

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const t = grid[y][x];
                const entry = tileColors[t] ?? tileColors[0];
                const [color, height] = entry;
                if (height <= 0.1) {
                    // Floor plane
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
                    // Wall / door / chest
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

        // Slow camera orbit
        const camRadius = 28;
        this.camera.position.x = Math.cos(t * 0.1) * camRadius;
        this.camera.position.z = Math.sin(t * 0.1) * camRadius;
        this.camera.lookAt(0, 4, 0);

        this.fadeOldSpawned();
        this.renderer.render(this.scene, this.camera);
        this.rafHandle = requestAnimationFrame(this.tick);
    };

    dispose(): void {
        if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
        window.removeEventListener('resize', this.resizeHandler);
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
