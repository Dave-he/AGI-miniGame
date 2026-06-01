/**
 * AIBridge tests.
 */

import { AIBridge, ATOM_MANIFEST } from '../gameplay/AIBridge';
import { AIEngine } from '../ai/AIEngine';
import { GameplayManager } from '../gameplay/GameplayManager';
import { WorldState } from '../world/WorldState';

describe('AIBridge', () => {
    function make() {
        const ai = new AIEngine(7);
        const gameplay = new GameplayManager();
        const ws = new WorldState('test-player', 'Tester');
        return { bridge: new AIBridge(ai, gameplay, ws), ai, gameplay, ws };
    }

    test('manifest exposes all 8 atoms', () => {
        expect(ATOM_MANIFEST.length).toBe(8);
        const ids = new Set(ATOM_MANIFEST.map(a => a.id));
        expect(ids.has('match3')).toBe(true);
        expect(ids.has('tower_defense')).toBe(true);
    });

    test('planAndLoad returns a suggestion + loaded modules', async () => {
        const { bridge, gameplay } = make();
        const r = await bridge.planAndLoad({ playerLevel: 3 });
        expect(r.atomIds.length).toBeGreaterThan(0);
        expect(r.blueprint.id).toMatch(/^dim_/);
        // Atoms in the blueprint that have a TS factory should be loaded.
        const registered = new Set(['match3', 'tower_defense', 'card', 'parkour', 'puzzle']);
        for (const id of r.atomIds.filter(a => registered.has(a))) {
            expect(gameplay.getModule(id)).toBeDefined();
        }
    });

    test('planAndLoad honours loss-streak exclusion', async () => {
        const { bridge } = make();
        const r = await bridge.planAndLoad({ playerLevel: 20, recentLossCount: 5 });
        // shooting is excluded by the AI when the player is on a losing streak
        expect(r.suggestion.excluded).toContain('shooting');
        // And it should not appear in the chosen atom ids
        expect(r.atomIds).not.toContain('shooting');
    });

    test('recordRunCompletion updates WorldState + AI history', async () => {
        const { bridge, ws, ai } = make();
        await bridge.planAndLoad({ playerLevel: 5 });
        const before = ai.tuner['history']?.length ?? 0;
        bridge.recordRunCompletion(1500, [
            { itemId: 'gold', quantity: 120 },
            { itemId: 'gem',  quantity: 5 },
        ], 90);
        const after = ai.tuner['history']?.length ?? 0;
        expect(after).toBeGreaterThanOrEqual(before);
        expect(ws.getGold()).toBe(120);
        expect(ws.getGem()).toBe(5);
    });
});
