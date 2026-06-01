/**
 * SaveSystem tests.
 */

import { SaveSystem, SAVE_VERSION } from '../world/SaveSystem';
import { WorldState } from '../world/WorldState';
import { EpochSystem } from '../world/EpochSystem';
import { Progression } from '../player/Progression';

function makeRigs() {
    const ws = new WorldState('tester', 'Tester');
    const epoch = new EpochSystem(1);
    const prog = new Progression();
    const save = new SaveSystem(ws, epoch, prog);
    return { ws, epoch, prog, save };
}

class MemoryStorage {
    private data = new Map<string, string>();
    getItem(k: string) { return this.data.get(k) ?? null; }
    setItem(k: string, v: string) { this.data.set(k, v); }
    removeItem(k: string) { this.data.delete(k); }
    clear() { this.data.clear(); }
}

describe('SaveSystem', () => {
    test('snapshot round-trip preserves world, epoch, and progression', () => {
        const { ws, epoch, prog, save } = makeRigs();
        ws.addGold(50);
        epoch.addRule({
            id: 'r1', name: 'r1', description: 'd1', kind: 'modifier', params: { x: 1 }, addedAt: 0,
        });
        prog.addXp(200);
        const snap = save.snapshot();
        expect(snap.version).toBe(SAVE_VERSION);
        expect(snap.world).toContain('"gold":50');
        expect(snap.progression.totalXp).toBe(200);

        // Restore into fresh rigs
        const ws2 = new WorldState('tester', 'Tester');
        const epoch2 = new EpochSystem(1);
        const prog2 = new Progression();
        const save2 = new SaveSystem(ws2, epoch2, prog2);
        const ok = save2.loadFromJson(JSON.stringify(snap));
        expect(ok).toBe(true);
        expect(ws2.getGold()).toBe(50);
        expect(epoch2.activeRules.length).toBe(1);
        expect(prog2.totalXp).toBe(200);
    });

    test('persist + restore through a Storage implementation', () => {
        const storage = new MemoryStorage();
        const { ws, epoch, prog, save } = makeRigs();
        ws.addGem(7);
        const ok = save.persist(storage as any);
        expect(ok).toBe(true);
        const ws2 = new WorldState('tester', 'Tester');
        const epoch2 = new EpochSystem(1);
        const prog2 = new Progression();
        const save2 = new SaveSystem(ws2, epoch2, prog2);
        const restored = save2.restore(storage as any);
        expect(restored).toBe(true);
        expect(ws2.getGem()).toBe(7);
    });

    test('startAutoSave + stopAutoSave toggle the interval', () => {
        jest.useFakeTimers();
        const { save } = makeRigs();
        save.startAutoSave();
        save.startAutoSave(); // idempotent
        jest.advanceTimersByTime(31_000);
        save.stopAutoSave();
        jest.useRealTimers();
    });

    test('recordSession caps to last 100', () => {
        const { save } = makeRigs();
        for (let i = 0; i < 150; i++) {
            save.recordSession({ dimensionId: `d${i}`, difficulty: 0.5, score: i, completed: i % 2 === 0 });
        }
        const snap = save.snapshot();
        expect(snap.aiLastSessions.length).toBe(20); // snapshot slices to 20
    });
});
