/**
 * HubController — simple click-to-move + keyboard controller for the
 * 无限次元城 hub.
 *
 * - Arrow keys / WASD: move the camera around the hub plane.
 * - Click on a portal: tell the AIBridge to enter the matching
 *   gameplay atom.
 * - Click on an NPC: trigger NPCDialogueAI.
 * - ESC: cancel any pending selection.
 *
 * The controller doesn't know about Three.js types; it talks to the
 * SceneManager through a small interface so it can be unit-tested.
 */

export interface HubNpcInfo {
    index: number;
    name: string;
    x: number;
    z: number;
}

export interface HubControllerActions {
    /** Move the camera in the world plane. */
    moveCamera(dx: number, dz: number): void;
    /** Move the camera to a specific world position. */
    moveCameraTo(x: number, z: number): void;
    /** Get all NPCs the controller should know about. */
    listNpcs(): HubNpcInfo[];
    /** Get all portal world positions (id, x, z). */
    listPortals(): Array<{ atomId: string; x: number; z: number }>;
    /** Called when the player selects an NPC. */
    onNpcClick(index: number): void;
    /** Called when the player selects a portal. */
    onPortalClick(atomId: string): void;
}

export type HubEvent =
    | { type: 'moved'; x: number; z: number }
    | { type: 'selected-npc'; index: number }
    | { type: 'selected-portal'; atomId: string };

export class HubController {
    private actions: HubControllerActions;
    private listeners: Array<(e: HubEvent) => void> = [];
    private x: number = 0;
    private z: number = 14;
    private speed: number = 4; // world units per second
    private keysDown: Set<string> = new Set();
    private rafHandle: number | null = null;
    private lastTick: number = 0;

    constructor(actions: HubControllerActions) {
        this.actions = actions;
    }

    on(listener: (e: HubEvent) => void): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    /** Start listening for keyboard events. */
    attach(): void {
        if (typeof window === 'undefined') return;
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        this.lastTick = performance.now();
        const loop = () => {
            this.tickMovement();
            this.rafHandle = requestAnimationFrame(loop);
        };
        this.rafHandle = requestAnimationFrame(loop);
    }

    detach(): void {
        if (typeof window === 'undefined') return;
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
        this.rafHandle = null;
        this.keysDown.clear();
    }

    /** Click handler — call this from a click event with the world coord. */
    handleClick(worldX: number, worldZ: number): void {
        // Find closest NPC within 2 units
        let bestNpc: HubNpcInfo | null = null;
        let bestD = 2.5;
        for (const n of this.actions.listNpcs()) {
            const d = Math.hypot(n.x - worldX, n.z - worldZ);
            if (d < bestD) { bestD = d; bestNpc = n; }
        }
        if (bestNpc) {
            this.actions.moveCameraTo(bestNpc.x, bestNpc.z);
            this.x = bestNpc.x; this.z = bestNpc.z;
            this.emit({ type: 'selected-npc', index: bestNpc.index });
            this.actions.onNpcClick(bestNpc.index);
            return;
        }
        // Otherwise check portals
        let bestPortal: { atomId: string; x: number; z: number } | null = null;
        bestD = 2.5;
        for (const p of this.actions.listPortals()) {
            const d = Math.hypot(p.x - worldX, p.z - worldZ);
            if (d < bestD) { bestD = d; bestPortal = p; }
        }
        if (bestPortal) {
            this.actions.moveCameraTo(bestPortal.x, bestPortal.z);
            this.x = bestPortal.x; this.z = bestPortal.z;
            this.emit({ type: 'selected-portal', atomId: bestPortal.atomId });
            this.actions.onPortalClick(bestPortal.atomId);
        }
    }

    private onKeyDown = (e: KeyboardEvent): void => {
        this.keysDown.add(e.key.toLowerCase());
    };

    private onKeyUp = (e: KeyboardEvent): void => {
        this.keysDown.delete(e.key.toLowerCase());
    };

    private tickMovement(): void {
        const now = performance.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        let dx = 0, dz = 0;
        if (this.keysDown.has('arrowup')    || this.keysDown.has('w')) dz -= 1;
        if (this.keysDown.has('arrowdown')  || this.keysDown.has('s')) dz += 1;
        if (this.keysDown.has('arrowleft')  || this.keysDown.has('a')) dx -= 1;
        if (this.keysDown.has('arrowright') || this.keysDown.has('d')) dx += 1;
        if (dx === 0 && dz === 0) return;
        // Normalize diagonal
        const mag = Math.hypot(dx, dz);
        if (mag > 0) { dx /= mag; dz /= mag; }
        this.x += dx * this.speed * dt;
        this.z += dz * this.speed * dt;
        // Clamp
        const maxR = 16;
        this.x = Math.max(-maxR, Math.min(maxR, this.x));
        this.z = Math.max(-maxR, Math.min(maxR, this.z));
        this.actions.moveCamera(dx * this.speed * dt, dz * this.speed * dt);
        this.emit({ type: 'moved', x: this.x, z: this.z });
    }

    private emit(e: HubEvent): void {
        for (const l of this.listeners) l(e);
    }
}
