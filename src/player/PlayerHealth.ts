/**
 * PlayerHealth — HP / death / revive system.
 *
 * The player starts each epoch at maxHp. Damage (from traps,
 * monsters, failed dimensions, etc.) reduces HP. When HP hits 0 the
 * player enters the "dead" state, the EpochSystem is forced into
 * a 大坍缩, and a new epoch begins — the player revives at 1 HP
 * inside the next epoch (the in-fiction reason: 大坍缩 resets the
 * world).
 *
 * The system is engine-agnostic: it talks to EpochSystem and the
 * Analytics service through a small interface so it can be
 * unit-tested.
 */

import type { Analytics } from '../analytics/Analytics';

export interface HealthHooks {
    onDeath?: (epochAtDeath: number) => void;
    onRevive?: (newEpoch: number) => void;
    onDamage?: (amount: number, hp: number) => void;
}

export interface HealthDeps {
    epochTriggerCollapse: () => void;
    /** Optional analytics — every death / revive is recorded. */
    analytics?: Analytics;
}

export class PlayerHealth {
    private maxHp: number = 100;
    private hp: number = 100;
    private alive: boolean = true;
    private deathCount: number = 0;
    private totalDamage: number = 0;
    private hooks: HealthHooks;
    private deps: HealthDeps;

    constructor(deps: HealthDeps, hooks: HealthHooks = {}) {
        this.deps = deps;
        this.hooks = hooks;
    }

    getHp(): number { return this.hp; }
    getMaxHp(): number { return this.maxHp; }
    isAlive(): boolean { return this.alive; }
    getDeathCount(): number { return this.deathCount; }
    getTotalDamage(): number { return this.totalDamage; }
    hpPct(): number { return this.hp / this.maxHp; }

    /** Reset the player to full HP at the start of a new epoch. */
    reviveToFull(): void {
        this.hp = this.maxHp;
        this.alive = true;
        this.hooks.onRevive?.(-1);
    }

    /** Take damage. Returns the new HP (0 if just killed). */
    takeDamage(amount: number): number {
        if (!this.alive) return 0;
        const before = this.hp;
        this.hp = Math.max(0, this.hp - amount);
        this.totalDamage += (before - this.hp);
        this.hooks.onDamage?.(amount, this.hp);
        this.deps.analytics?.track('player.damaged', { amount, hp: this.hp });
        if (this.hp === 0) this.die();
        return this.hp;
    }

    /** Heal back some HP. */
    heal(amount: number): number {
        if (!this.alive) return 0;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this.hp;
    }

    /** Force-kill the player (e.g. for a debug command). */
    kill(): void { if (this.alive) this.die(); }

    private die(): void {
        this.alive = false;
        this.deathCount += 1;
        this.deps.analytics?.track('player.died', { deathCount: this.deathCount, totalDamage: this.totalDamage });
        this.hooks.onDeath?.(this.deathCount);
        // Trigger the world reset.
        try { this.deps.epochTriggerCollapse(); } catch { /* swallow */ }
        // Revive inside the new epoch at 1 HP.
        this.hp = 1;
        this.alive = true;
        this.hooks.onRevive?.(this.deathCount);
    }
}
