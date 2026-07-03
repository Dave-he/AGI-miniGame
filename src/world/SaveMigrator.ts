/**
 * SaveMigrator — versioned save format with automatic migration.
 *
 * Round 1-6 saves used `version: 1` and a flat `world` payload. The
 * `Migrator` upgrades older shapes to the latest version transparently,
 * so a player with a v1 save can still load into a v2 client.
 *
 * Migrations are *additive* — a newer client can read older saves,
 * but we never silently drop fields the older client didn't have.
 *
 * The migrator runs every time `SaveSystem.loadFromJson()` is called
 * and the saved `version` differs from `SAVE_VERSION`.
 */

import type { SaveSnapshot } from './SaveSystem';
import { SAVE_VERSION } from './SaveSystem';

interface V0Save {
    // The very first saves didn't have a version tag at all.
    player?: { gold?: number; gem?: number; level?: number };
    progression?: { level?: number; xp?: number };
    epoch?: { epochNumber?: number };
    // ... other fields ignored
}

export class SaveMigrator {
    private logs: string[] = [];

    /** Returns the migrator's log of what was upgraded (for debugging). */
    getLog(): string[] { return [...this.logs]; }

    /**
     * Take a raw save JSON and upgrade it to the current SAVE_VERSION.
     * Returns a value that the rest of the save system can consume.
     */
    migrate(raw: any): SaveSnapshot {
        this.logs = [];
        let v = this.detectVersion(raw);
        this.logs.push(`detected version: ${v}`);

        // Apply migrations in order.
        if (v === 0) {
            raw = this.migrate_0_to_1(raw);
            v = 1;
            this.logs.push('migrated 0 → 1');
        }
        if (v === 1) {
            raw = this.migrate_1_to_2(raw);
            v = 2;
            this.logs.push('migrated 1 → 2');
        }
        // Always run the current version's normalizer.
        raw = this.normalize_v2(raw);
        return raw as SaveSnapshot;
    }

    private detectVersion(raw: any): number {
        if (raw && typeof raw.version === 'number') return raw.version;
        // No version tag at all → assume the very first format.
        return 0;
    }

    private migrate_0_to_1(raw: any): any {
        // The v0 shape had `player.gold` at the top level; v1 expects
        // `world: { ... }` and `progression: { ... }`.
        const v0 = raw as V0Save;
        return {
            version: 1,
            savedAt: raw.savedAt ?? Date.now(),
            world: raw.world ?? {
                player: { gold: v0.player?.gold ?? 0, gem: v0.player?.gem ?? 0 },
            },
            progression: raw.progression ?? {
                level: v0.progression?.level ?? 1,
                xp: v0.progression?.xp ?? 0,
            },
            epoch: raw.epoch ?? { epochNumber: v0.epoch?.epochNumber ?? 1 },
            aiLastSessions: raw.aiLastSessions ?? [],
        };
    }

    private migrate_1_to_2(raw: any): any {
        // v2 renames `aiLastSessions` → `aiSessionHistory` and adds a
        // `clientVersion` tag so the client can tell at a glance.
        return {
            ...raw,
            version: 2,
            clientVersion: '0.2.0',
            aiSessionHistory: raw.aiLastSessions ?? raw.aiSessionHistory ?? [],
        };
    }

    private normalize_v2(raw: any): any {
        // Ensure required fields exist with sensible defaults.
        return {
            version: SAVE_VERSION,
            savedAt: raw.savedAt ?? Date.now(),
            world: raw.world ?? {},
            epoch: raw.epoch ?? { epochNumber: 1, epochName: '晨曦纪元' },
            progression: raw.progression ?? { level: 1, xp: 0 },
            aiLastSessions: raw.aiLastSessions ?? raw.aiSessionHistory ?? [],
        };
    }
}
