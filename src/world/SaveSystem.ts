/**
 * SaveSystem — robust save/load for the entire game state.
 *
 * The existing `WorldState.saveToJSON / loadFromJSON` methods only
 * persisted a subset of fields. This module provides a *complete*
 * snapshot that also covers:
 *   - progression (level, xp, talent points, learned talents)
 *   - epoch state (number, name, active rules, relics, collapse count)
 *   - dimension history
 *   - AI history (only the last N sessions, to keep payload small)
 *
 * Plus an auto-save loop and a small in-memory fallback for tests.
 */

import type { WorldState } from './WorldState';
import { EpochSystem, EpochSnapshot } from './EpochSystem';
import { Progression, ProgressionSnapshot } from '../player/Progression';

export interface SaveSnapshot {
    version: number;
    savedAt: number;
    world: ReturnType<WorldState['saveToJSON']>;
    epoch: EpochSnapshot;
    progression: ProgressionSnapshot;
    /** The dimension history is already inside `world.dimensionHistory`; this is a mirror. */
    aiLastSessions: Array<{ dimensionId: string; difficulty: number; score: number; completed: boolean; ts: number }>;
}

export const SAVE_VERSION = 1;
export const AUTO_SAVE_INTERVAL_MS = 30_000;
export const SAVE_KEY = 'agi_world_save';

export class SaveSystem {
    private worldState: WorldState;
    private epoch: EpochSystem;
    private progression: Progression;
    private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
    /** Bounded ring of recent AI sessions (mirror of BalanceTuner.history). */
    private aiLastSessions: SaveSnapshot['aiLastSessions'] = [];

    constructor(worldState: WorldState, epoch: EpochSystem, progression: Progression) {
        this.worldState = worldState;
        this.epoch = epoch;
        this.progression = progression;
    }

    /** Build a complete snapshot. Pure function, side-effect free. */
    snapshot(): SaveSnapshot {
        return {
            version: SAVE_VERSION,
            savedAt: Date.now(),
            world: this.worldState.saveToJSON() as any,
            epoch: this.epoch.snapshot(),
            progression: this.progression.snapshot(),
            aiLastSessions: this.aiLastSessions.slice(-20),
        };
    }

    /** Persist a snapshot. Uses localStorage when available, otherwise in-memory. */
    persist(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
        const snap = this.snapshot();
        const json = JSON.stringify(snap);
        if (!storage) {
            (SaveSystem._memoryStore as any)[SAVE_KEY] = json;
            return true;
        }
        try {
            storage.setItem(SAVE_KEY, json);
            return true;
        } catch (e) {
            console.warn('SaveSystem.persist failed:', e);
            return false;
        }
    }

    /** Restore from storage. Returns true on success, false otherwise. */
    restore(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
        let json: string | null = null;
        if (storage) {
            try { json = storage.getItem(SAVE_KEY); } catch { return false; }
        } else {
            json = (SaveSystem._memoryStore as any)[SAVE_KEY] ?? null;
        }
        if (!json) return false;
        return this.loadFromJson(json);
    }

    /** Load from a JSON string. Returns true on success. */
    loadFromJson(json: string): boolean {
        try {
            const snap = JSON.parse(json) as SaveSnapshot;
            if (snap.version !== SAVE_VERSION) {
                console.warn(`SaveSystem: version mismatch (have ${snap.version}, want ${SAVE_VERSION})`);
                // We still try — schema is additive so older saves load.
            }
            if (snap.world) this.worldState.loadFromJSON(typeof snap.world === 'string' ? snap.world : JSON.stringify(snap.world));
            if (snap.epoch) this.epoch.load(snap.epoch);
            if (snap.progression) this.applyProgression(snap.progression);
            if (snap.aiLastSessions) this.aiLastSessions = snap.aiLastSessions;
            return true;
        } catch (e) {
            console.warn('SaveSystem.loadFromJson failed:', e);
            return false;
        }
    }

    private applyProgression(snap: ProgressionSnapshot): void {
        this.progression.level = snap.level;
        this.progression.xp = snap.xp;
        this.progression.totalXp = snap.totalXp;
        this.progression.talentPoints = snap.talentPoints;
        this.progression.talents = new Set(snap.talents);
    }

    /** Record an AI session (for save). */
    recordSession(s: { dimensionId: string; difficulty: number; score: number; completed: boolean; ts?: number }): void {
        this.aiLastSessions.push({
            dimensionId: s.dimensionId,
            difficulty: s.difficulty,
            score: s.score,
            completed: s.completed,
            ts: s.ts ?? Date.now(),
        });
        if (this.aiLastSessions.length > 100) {
            this.aiLastSessions = this.aiLastSessions.slice(-100);
        }
    }

    /** Start auto-saving every AUTO_SAVE_INTERVAL_MS. */
    startAutoSave(): void {
        if (this.autoSaveTimer !== null) return;
        this.autoSaveTimer = setInterval(() => {
            this.persist();
        }, AUTO_SAVE_INTERVAL_MS);
    }

    stopAutoSave(): void {
        if (this.autoSaveTimer !== null) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    private static _memoryStore: Record<string, string> = {};
}
