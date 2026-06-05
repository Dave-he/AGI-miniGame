/**
 * DimensionVault — TypeScript mirror of the cocos4-rust
 * `agi_minigame::vault::DimensionVault`.
 *
 * The vault is the AGI's "memory" of visited dimensions. It is a
 * bounded ring buffer that the game layer fills on every
 * `enterNewDimension()` and reads from when (a) showing the
 * "recent worlds" UI, and (b) deciding which blueprint to run next.
 *
 * The class is engine-agnostic: it never mutates the world state,
 * runs dimensions, or schedules events. It only answers three
 * questions:
 *
 *   1. What did the player just play?        → `recent(limit)`
 *   2. Did they ever see this id, and how?   → `lastOutcomeFor(id)`
 *   3. Which candidate should we run next?   → `suggestNext(...)`
 *
 * Round 20 introduces this alongside the Rust implementation; the
 * two APIs are kept deliberately symmetric so the game layer can
 * switch from a pure-TS vault (default) to a WASM-backed vault
 * (future) by swapping the constructor.
 */

import type { DimensionBlueprint } from '../ai/AIEngine';

export type DimensionOutcome = 'completed' | 'failed' | 'abandoned';

export interface VaultEntry {
    blueprintId: string;
    blueprintName: string;
    themeName: string;
    visualStyle: string;
    difficulty: number;
    outcome: DimensionOutcome;
    timestampMs: number;
}

export interface VaultStats {
    totalVisits: number;
    distinctThemes: number;
    distinctBlueprints: number;
    completed: number;
    failed: number;
    abandoned: number;
    completionRate: number;
}

const OUTCOME_SUCCESS: ReadonlyArray<DimensionOutcome> = ['completed'];

function isSuccess(o: DimensionOutcome): boolean {
    return OUTCOME_SUCCESS.includes(o);
}

function entryFromBlueprint(
    bp: DimensionBlueprint,
    outcome: DimensionOutcome,
    timestampMs: number,
): VaultEntry {
    return {
        blueprintId: bp.id,
        blueprintName: bp.name,
        themeName: bp.theme.name,
        visualStyle: bp.theme.visualStyle,
        difficulty: bp.difficulty,
        outcome,
        timestampMs,
    };
}

export const DEFAULT_VAULT_CAPACITY = 64;

export class DimensionVault {
    private readonly capacity: number;
    private readonly entries: VaultEntry[] = [];

    constructor(capacity: number = DEFAULT_VAULT_CAPACITY) {
        this.capacity = Math.max(0, capacity | 0);
    }

    /** Maximum number of entries the vault can hold. */
    getCapacity(): number {
        return this.capacity;
    }

    /** Number of entries currently stored. */
    len(): number {
        return this.entries.length;
    }

    /** `true` when the vault has no entries. */
    isEmpty(): boolean {
        return this.entries.length === 0;
    }

    /** Append a visit. Drops the oldest entry when the vault is full. */
    record(blueprint: DimensionBlueprint, outcome: DimensionOutcome, timestampMs: number = Date.now()): void {
        if (this.capacity === 0) return;
        const entry = entryFromBlueprint(blueprint, outcome, timestampMs);
        if (this.entries.length >= this.capacity) {
            this.entries.shift();
        }
        this.entries.push(entry);
    }

    /**
     * Most recent visits in chronological order (oldest first, newest
     * last). `limit == 0` returns an empty array. `limit >= len()`
     * returns everything.
     */
    recent(limit: number): VaultEntry[] {
        const n = Math.min(Math.max(0, limit | 0), this.entries.length);
        if (n === 0) return [];
        return this.entries.slice(this.entries.length - n);
    }

    /** Last visit outcome for a given blueprint id, or `null`. */
    lastOutcomeFor(blueprintId: string): DimensionOutcome | null {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (this.entries[i].blueprintId === blueprintId) {
                return this.entries[i].outcome;
            }
        }
        return null;
    }

    /** Most recent themes (newest first). */
    recentThemes(n: number): string[] {
        return this.recent(n).map(e => e.themeName).reverse();
    }

    /**
     * Pick a blueprint the player has not seen in the last
     * `avoidWindow` visits. Falls back to a deterministic seed-based
     * pick from the candidate pool when every candidate is in the
     * window. Returns `null` for an empty candidate pool.
     */
    suggestNext(
        candidates: ReadonlyArray<DimensionBlueprint>,
        avoidWindow: number = 3,
        seed: number = 0,
    ): DimensionBlueprint | null {
        if (candidates.length === 0) return null;

        const recentIds = new Set(this.recent(Math.max(0, avoidWindow | 0)).map(e => e.blueprintId));
        const fresh = candidates.filter(bp => !recentIds.has(bp.id));
        if (fresh.length > 0) {
            return fresh[seed % fresh.length];
        }

        // Every candidate was seen recently. Pick the one whose most
        // recent visit is *oldest*. We use a sentinel `Number.POSITIVE_INFINITY`
        // for never-seen candidates so they outrank seen ones.
        const ranked = candidates
            .map((bp, i) => {
                let pos = Number.POSITIVE_INFINITY;
                for (let j = this.entries.length - 1; j >= 0; j--) {
                    if (this.entries[j].blueprintId === bp.id) {
                        pos = (this.entries.length - 1) - j;
                        break;
                    }
                }
                return { i, pos };
            })
            .sort((a, b) => {
                // Largest position first (oldest recent visit wins).
                if (a.pos !== b.pos) return b.pos - a.pos;
                return a.i - b.i;
            });
        return candidates[ranked[seed % ranked.length].i];
    }

    /** Aggregate stats over the whole vault. */
    stats(): VaultStats {
        const themes = new Set<string>();
        const blueprints = new Set<string>();
        let completed = 0;
        let failed = 0;
        let abandoned = 0;
        for (const e of this.entries) {
            themes.add(e.themeName);
            blueprints.add(e.blueprintId);
            if (e.outcome === 'completed') completed++;
            else if (e.outcome === 'failed') failed++;
            else abandoned++;
        }
        const total = this.entries.length;
        return {
            totalVisits: total,
            distinctThemes: themes.size,
            distinctBlueprints: blueprints.size,
            completed,
            failed,
            abandoned,
            completionRate: total === 0 ? 0 : completed / total,
        };
    }

    /** Drop every entry. The capacity is preserved. */
    clear(): void {
        this.entries.length = 0;
    }

    /** Snapshot every entry (oldest first) — handy for tests. */
    snapshot(): VaultEntry[] {
        return this.entries.slice();
    }
}

export const __test_internals = {
    entryFromBlueprint,
    isSuccess,
};
