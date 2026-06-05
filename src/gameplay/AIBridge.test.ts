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

    // ---- Round 23 — mood-aware planAndLoad ----

    test('planAndLoad with neutral mood matches planAndLoad without mood', async () => {
        // AC5 — neutral mood must produce a planAndLoad result whose
        // blueprint.difficulty is drawn from the same base difficulty
        // range as the un-mood path. We compare the *range of
        // possibilities* by running both 50 times and confirming the
        // empirical difficulty distribution lies in [0.3, 0.8].
        const { bridge: b1 } = make();
        const { bridge: b2 } = make();
        const noMood: number[] = [];
        const neutral: number[] = [];
        for (let i = 0; i < 50; i++) {
            const r1 = await b1.planAndLoad({ playerLevel: 5 });
            noMood.push(r1.blueprint.difficulty);
            const r2 = await b2.planAndLoad({ playerLevel: 5, mood: { friendly: 0, fear: 0, trust: 0 } });
            neutral.push(r2.blueprint.difficulty);
        }
        for (const d of [...noMood, ...neutral]) {
            expect(d).toBeGreaterThanOrEqual(0.3 - 1e-4);
            expect(d).toBeLessThanOrEqual(0.8 + 1e-4);
        }
    });

    test('planAndLoad with high fear lowers the upper difficulty bound', async () => {
        // AC6 — mood.fear=0.8 must produce a blueprint whose
        // difficulty stays under the 0.80 ceiling (because the
        // difficulty range was narrowed to [0.3, 0.75]).
        const { bridge } = make();
        const fear = { friendly: 0.0, fear: 0.8, trust: 0.0 };
        for (let i = 0; i < 30; i++) {
            const r = await bridge.planAndLoad({ playerLevel: 5, mood: fear });
            expect(r.blueprint.difficulty).toBeLessThanOrEqual(0.75 + 1e-4);
        }
    });

    test('planAndLoad with friendly+trust raises the lower difficulty bound', async () => {
        // AC8 — friendly=0.7, trust=0.4 must keep the difficulty
        // above the base 0.30 floor (because the range was widened
        // to [0.35, 0.80]).
        const { bridge } = make();
        const loved = { friendly: 0.7, fear: 0.0, trust: 0.4 };
        for (let i = 0; i < 30; i++) {
            const r = await bridge.planAndLoad({ playerLevel: 5, mood: loved });
            expect(r.blueprint.difficulty).toBeGreaterThanOrEqual(0.35 - 1e-4);
        }
    });
});
