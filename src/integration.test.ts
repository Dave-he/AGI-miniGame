/**
 * End-to-end integration test that exercises the full AGI loop:
 *   1) LLM client returns a DSL from memes
 *   2) DslExecutor applies it to the scene
 *   3) EpochSystem absorbs the resulting world rule
 *   4) Save/load round-trips
 *
 * The test is framework-agnostic: it uses minimal mocks for the
 * SceneManager interface (since Three.js isn't directly accessible
 * in jest).
 */

import { MockLLMClient } from './ai/LLMClient';
import { DslExecutor, DslEventSink } from './scene/DslExecutor';
import { EpochSystem } from './world/EpochSystem';
import { SaveSystem } from './world/SaveSystem';
import { WorldState } from './world/WorldState';
import { Progression } from './player/Progression';
import { HotReloadController, DEFAULT_HOT_RELOAD_CONFIG } from './scene/HotReloadController';
import { parseDSL } from './dsl/MemeCompiler';
import { ATOM_MANIFEST } from './gameplay/AIBridge';
import { AIEngine } from './ai/AIEngine';
import { GameplayManager } from './gameplay/GameplayManager';
import { AIBridge } from './gameplay/AIBridge';

class MockScene {
    public spawned: Array<{ id: number; label: string }> = [];
    public floats: Array<{ text: string; color: string }> = [];
    spawnEntity(id: number, label: string) { this.spawned.push({ id, label }); }
    spawnFloatingText(text: string, color: string) { this.floats.push({ text, color }); }
}

describe('AGI integration: hub → LLM → DSL → scene → epoch → save/load', () => {
    test('full happy path', async () => {
        // -- 1. Player drops some memes into the compile slot
        const memes = ['Fire', 'Speed', 'Create'] as const;

        // -- 2. LLM returns a DSL
        const llm = new MockLLMClient(1234);
        const completion = await llm.complete({
            system: 'You are an AGI that emits DSL.',
            user: `碎片：${memes.join(' + ')}`,
            seed: 7,
        });
        expect(completion.dsl).toBeDefined();
        // Round-trip: the DSL must parse and the rule must have at least one action
        const parsed = parseDSL(completion.dsl!);
        expect(parsed.actions.length).toBeGreaterThan(0);

        // -- 3. Hot reload applies the rule
        const scene = new MockScene();
        const sink: DslEventSink = { log: () => {} };
        const exec = new DslExecutor(scene as any, sink);
        const ctrl = new HotReloadController(exec, { ...DEFAULT_HOT_RELOAD_CONFIG, compileTimeMs: 1, shieldTimeMs: 1 });
        const accepted = ctrl.begin(completion.dsl!);
        expect(accepted).toBe(true);
        // Wait for the apply
        await new Promise(r => setTimeout(r, 30));
        // After 30ms the rule should have been applied (either as spawn / damage / heal)
        const totalEffects = scene.spawned.length + scene.floats.length;
        expect(totalEffects).toBeGreaterThan(0);

        // -- 4. Epoch absorbs the resulting world rule
        const epoch = new EpochSystem(99);
        const log: string[] = [];
        // Simulate a DslExecutor.onWorldModifier → EpochSystem.addRule
        for (let i = 0; i < 8; i++) {
            const r = epoch.addRule({
                id: `rule_${i}`,
                name: `AGI Rule ${i}`,
                description: 'integration test rule',
                kind: 'modifier',
                params: { intensity: i + 1 },
                addedAt: Date.now(),
            });
            log.push(`add ${i}: collapsed=${r.collapsed}`);
        }
        // After 8 rules the epoch should have collapsed
        expect(epoch.epochNumber).toBeGreaterThan(1);
        expect(epoch.relics.length).toBeGreaterThan(0);

        // -- 5. Save and load round-trip
        const ws = new WorldState('tester', 'Tester');
        const prog = new Progression();
        const save = new SaveSystem(ws, epoch, prog);
        ws.addGold(123);
        const snap = save.snapshot();
        const ws2 = new WorldState('tester', 'Tester');
        const epoch2 = new EpochSystem(1);
        const prog2 = new Progression();
        const save2 = new SaveSystem(ws2, epoch2, prog2);
        save2.loadFromJson(JSON.stringify(snap));
        expect(ws2.getGold()).toBe(123);
        expect(epoch2.epochNumber).toBe(epoch.epochNumber);
    });

    test('AI bridge + LLM produces a valid dimension that loads atom modules', async () => {
        const ai = new AIEngine(42);
        const llm = new MockLLMClient(42);
        const gm = new GameplayManager();
        const ws = new WorldState('tester', 'Tester');
        const bridge = new AIBridge(ai, gm, ws);

        // First, the AI picks a combination
        const suggestion = await bridge.planAndLoad({ playerLevel: 6 });
        expect(suggestion.atomIds.length).toBeGreaterThan(0);
        // Every chosen atom must be in the engine manifest
        for (const id of suggestion.atomIds) {
            expect(ATOM_MANIFEST.find(a => a.id === id)).toBeDefined();
        }

        // Then the LLM produces a DSL from the chosen combo
        const completion = await llm.complete({
            system: 's',
            user: `碎片：${suggestion.atomIds.join(' + ')}`,
            seed: 13,
        });
        expect(completion.dsl).toBeDefined();
        expect(() => parseDSL(completion.dsl!)).not.toThrow();
    });
});
