/**
 * Benchmark — light throughput measurements for the AGI loop.
 *
 * Run with `npx jest --testPathPattern=Benchmark`. The test asserts
 * only that the operations complete inside a soft SLA (e.g. 1000 AI
 * dimension generations under 5 seconds on a dev machine) — it
 * doesn't fail on slow CI, only on catastrophic regression.
 *
 * Useful for catching performance regressions across iterations:
 *   "Last round, 1000 dimensions took 1.2s; this round 3.5s —
 *    someone accidentally added an O(n^2) loop."
 */

import { AIEngine } from '../ai/AIEngine';
import { parseDSL, compileFallback } from '../dsl/MemeCompiler';
import { DslExecutor } from '../scene/DslExecutor';
import { EpochSystem } from '../world/EpochSystem';

class MockScene {
    spawnEntity() { /* noop */ }
    spawnFloatingText() { /* noop */ }
}

describe('AGI benchmark (soft SLAs)', () => {
    test('AIEngine.generateDimension: 200 iterations under 5s', () => {
        const ai = new AIEngine(1);
        const start = Date.now();
        for (let i = 0; i < 200; i++) {
            ai.generateDimension({
                minAtoms: 2, maxAtoms: 4, difficultyRange: [0.3, 0.8],
                playerLevel: 5, preferredTypes: [], excludedTypes: [], rewardMultiplier: 1.0,
            });
        }
        const elapsed = Date.now() - start;
        // Soft SLA: 5s. Realistic on a dev machine: < 1s.
        expect(elapsed).toBeLessThan(5000);
    });

    test('DSL parse: 5000 lines under 2s', () => {
        const start = Date.now();
        let ok = 0;
        for (let i = 0; i < 5000; i++) {
            try {
                const r = compileFallback(['Fire', 'Speed']);
                const dsl = `On(${r.event.kind}${r.event.arg !== undefined ? `, ${r.event.arg}` : ''}) -> ${r.actions.map(a => `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`).join(', ')}`;
                parseDSL(dsl);
                ok += 1;
            } catch { /* ignore */ }
        }
        const elapsed = Date.now() - start;
        expect(ok).toBe(5000);
        expect(elapsed).toBeLessThan(2000);
    });

    test('DslExecutor: 2000 Spawn rules under 2s', () => {
        const exec = new DslExecutor(new MockScene() as any, { log: () => {} });
        const rule = parseDSL('On(Collide) -> Apply(Spawn, "X", 1)');
        const start = Date.now();
        for (let i = 0; i < 2000; i++) {
            exec.apply(rule);
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    test('EpochSystem.advance: 100 transitions under 2s', () => {
        const epoch = new EpochSystem(1);
        const start = Date.now();
        for (let i = 0; i < 100; i++) {
            // Add 8 rules to force a collapse
            for (let j = 0; j < 8; j++) {
                epoch.addRule({
                    id: `r_${i}_${j}`,
                    name: `r_${i}_${j}`,
                    description: 'bench',
                    kind: 'modifier',
                    params: { x: 1 },
                    addedAt: 0,
                });
            }
        }
        const elapsed = Date.now() - start;
        // After 100 rounds of 8 rules = 800 addRule calls + ~100 collapses
        expect(epoch.epochNumber).toBeGreaterThan(1);
        expect(elapsed).toBeLessThan(2000);
    });
});
