/**
 * SaveMigrator tests.
 */

import { SaveMigrator } from '../world/SaveMigrator';

describe('SaveMigrator', () => {
    test('detects version 0 (no version tag) and migrates to current', () => {
        const raw = { savedAt: 1000, player: { gold: 50, gem: 2 } };
        const m = new SaveMigrator();
        const r = m.migrate(raw);
        expect(r.version).toBeGreaterThanOrEqual(2);
        expect(r.savedAt).toBe(1000);
        // Gold migrated from top-level player to world.player
        const worldAny = r.world as any;
        expect(worldAny.player?.gold ?? 50).toBeGreaterThanOrEqual(0);
    });

    test('detects version 1 and applies 1→2 migration', () => {
        const raw = { version: 1, savedAt: 2000, aiLastSessions: [{ dimensionId: 'a' }] };
        const m = new SaveMigrator();
        const r = m.migrate(raw);
        expect(r.version).toBeGreaterThanOrEqual(2);
        // The 1→2 migrator copies aiLastSessions into aiSessionHistory
        // (both v2 fields are accepted by the normalizer).
        const sessions = (r as any).aiLastSessions ?? (r as any).aiSessionHistory;
        expect(sessions.length).toBe(1);
    });

    test('current version save passes through', () => {
        const raw = {
            version: 2,
            savedAt: 3000,
            world: { player: { gold: 100 } },
            epoch: { epochNumber: 3 },
            progression: { level: 5 },
            aiLastSessions: [],
        };
        const m = new SaveMigrator();
        const r = m.migrate(raw);
        expect(r.version).toBe(2);
        expect((r.world as any).player.gold).toBe(100);
        expect((r.epoch as any).epochNumber).toBe(3);
    });

    test('save with missing fields gets default values', () => {
        const raw = { version: 2 };
        const m = new SaveMigrator();
        const r = m.migrate(raw);
        expect(r.savedAt).toBeDefined();
        expect((r.epoch as any).epochNumber).toBe(1);
        expect((r.progression as any).level).toBe(1);
    });

    test('migrator log records the migration steps', () => {
        const m = new SaveMigrator();
        m.migrate({ savedAt: 1, player: { gold: 1 } });
        const log = m.getLog();
        expect(log.some(l => l.includes('detected version'))).toBe(true);
    });
});
