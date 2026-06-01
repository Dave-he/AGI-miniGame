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
    }
}
