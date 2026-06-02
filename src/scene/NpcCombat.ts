/**
 * NpcCombat — simple 3D combat between the player and an NPC.
 *
 * Each NPC spawned in the SceneManager has an HP value. When the
 * player attacks (e.g. by clicking the NPC and pressing space, or
 * by issuing a DSL `Damage` action), the NPC takes damage. When HP
 * hits 0 the NPC is "defeated" (mesh + dialogue bubble hidden).
 *
 * The combat system is engine-agnostic — it talks to the
 * SceneManager through a small interface so it can be unit-tested.
 */

export interface CombatNpcState {
    index: number;
    name: string;
    hp: number;
    maxHp: number;
    alive: boolean;
}

export interface NpcCombatActions {
    /** Take a hit (visual feedback — flash, shake). */
    flashNpc(index: number): void;
    /** Hide the NPC (mesh + bubble) when defeated. */
    hideNpc(index: number): void;
    /** Show a floating text over the NPC. */
    floatOverNpc(index: number, text: string, color: string): void;
    /** Set the NPC's dialogue bubble text (or clear it). */
    setNpcDialogue(index: number, text: string): void;
    clearNpcDialogue(index: number): void;
}

export interface NpcCombatCallbacks {
    onDefeated?: (index: number, name: string) => void;
    onDamage?:    (index: number, name: string, amount: number, hp: number) => void;
}

export class NpcCombat {
    private npcs: Map<number, CombatNpcState> = new Map();
    private actions: NpcCombatActions;
    private cb: NpcCombatCallbacks;
    private damageFlashMs: number = 220;

    constructor(actions: NpcCombatActions, cb: NpcCombatCallbacks = {}) {
        this.actions = actions;
        this.cb = cb;
    }

    /** Register an NPC for combat tracking. */
    register(index: number, name: string, maxHp: number = 30): void {
        this.npcs.set(index, { index, name, hp: maxHp, maxHp, alive: true });
    }

    listAll(): CombatNpcState[] {
        return Array.from(this.npcs.values());
    }

    get(index: number): CombatNpcState | undefined {
        return this.npcs.get(index);
    }

    /** Deal damage to the NPC. Returns the new HP (0 if just defeated). */
    attack(index: number, amount: number): number {
        const n = this.npcs.get(index);
        if (!n || !n.alive) return 0;
        n.hp = Math.max(0, n.hp - amount);
        this.actions.flashNpc(index);
        this.actions.floatOverNpc(index, `-${amount}`, '#ff4d6d');
        this.cb.onDamage?.(index, n.name, amount, n.hp);
        if (n.hp <= 0) {
            n.alive = false;
            this.actions.hideNpc(index);
            this.actions.clearNpcDialogue(index);
            this.cb.onDefeated?.(index, n.name);
            return 0;
        }
        return n.hp;
    }

    /** Heal an NPC. */
    heal(index: number, amount: number): number {
        const n = this.npcs.get(index);
        if (!n || !n.alive) return 0;
        n.hp = Math.min(n.maxHp, n.hp + amount);
        this.actions.floatOverNpc(index, `+${amount}`, '#06d6a0');
        return n.hp;
    }

    /** Reset for a new round (revive all NPCs). */
    resetAll(): void {
        for (const n of this.npcs.values()) {
            n.hp = n.maxHp;
            n.alive = true;
        }
    }

    /** Bind the standard "attack on click" handler for the 3D scene. */
    static buildClickHandler(combat: NpcCombat): (index: number) => void {
        return (index: number) => {
            const n = combat.get(index);
            if (!n || !n.alive) return;
            const dmg = 5 + Math.floor(Math.random() * 6);
            combat.attack(index, dmg);
        };
    }
}
