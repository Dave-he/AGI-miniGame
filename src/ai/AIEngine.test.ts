/**
 * Unit tests for the four AI brains.
 *
 * Run with: `npx jest src/ai/AIEngine.test.ts`
 */

import { AIEngine, GameplayCombinerAI, ContentGeneratorAI, SmartWorldAI } from '../ai/AIEngine';
import { combineMemes, compileFallback, parseDSL, toEngineJSON } from '../dsl/MemeCompiler';

describe('AIEngine — 4 super-brains', () => {
    test('GameplayCombinerAI classifies stages correctly', () => {
        const ai = new GameplayCombinerAI();
        expect(ai.classifyStage(1)).toBe('novice');
        expect(ai.classifyStage(4)).toBe('novice');
        expect(ai.classifyStage(5)).toBe('mid');
        expect(ai.classifyStage(14)).toBe('mid');
        expect(ai.classifyStage(15)).toBe('late');
        expect(ai.classifyStage(99)).toBe('late');
    });

    test('GameplayCombinerAI suggestion excludes shoot on loss streak', () => {
        const ai = new GameplayCombinerAI();
        const s = ai.suggest(20, 5);
        expect(s.excluded).toContain('shooting');
    });

    test('ContentGeneratorAI produces theme + prompts', () => {
        const ai = new ContentGeneratorAI(42);
        const t = ai.generate('mid', ['tower_defense', 'card'], 0.6);
        expect(t.themeName).toMatch(/·/);
        expect(t.artPrompt.length).toBeGreaterThan(20);
        expect(t.bgmPrompt).toContain('BGM');
        expect(['cyberpunk', 'fantasy', 'space', 'underwater', 'desert', 'dungeon'])
            .toContain(t.visualStyle);
    });

    test('SmartWorldAI rolls an event', () => {
        const ai = new SmartWorldAI(7);
        const evt = ai.rollEvent(5, 0);
        expect(evt).not.toBeNull();
        expect(evt!.name.length).toBeGreaterThan(0);
        expect(evt!.npcLine.length).toBeGreaterThan(0);
    });

    test('SmartWorldAI biases positive on loss streak', () => {
        const ai = new SmartWorldAI(7);
        const positive = ['weather', 'merchant', 'shrine', 'festival'];
        const positiveCount = Array.from({ length: 30 }, () => ai.rollEvent(2, 5))
            .filter(e => e && positive.includes(e.kind)).length;
        // Should be > 50% positive kinds on loss streak
        expect(positiveCount).toBeGreaterThan(15);
    });

    test('AIEngine wires all 4 AIs and generateDimension is a string', () => {
        const engine = new AIEngine(123);
        const dim = engine.generateDimension({
            minAtoms: 2,
            maxAtoms: 3,
            difficultyRange: [0.4, 0.7],
            playerLevel: 8,
            preferredTypes: [],
            excludedTypes: [],
            rewardMultiplier: 1.0,
        });
        expect(dim.id).toMatch(/^dim_/);
        expect(dim.atomIds.length).toBeGreaterThanOrEqual(2);
        expect(dim.theme.visualStyle).toBeTruthy();
    });
});

describe('MemeCompiler', () => {
    test('combineMemes builds a prompt with the meme names', () => {
        const r = combineMemes(['Fire', 'Speed']);
        expect(r.prompt).toContain('Fire');
        expect(r.prompt).toContain('Speed');
        expect(r.prompt).toMatch(/On\(Collide|Timer|Spawn|PlayerHit\)/);
    });

    test('parseDSL handles a simple collision rule', () => {
        const rule = parseDSL('On(Collide) -> Apply(Damage, 10)');
        expect(rule.event.kind).toBe('Collide');
        expect(rule.actions).toHaveLength(1);
        expect(rule.actions[0].kind).toBe('Damage');
        expect(rule.actions[0].args[0]).toBe(10);
    });

    test('parseDSL handles a timer + spawn combo', () => {
        const rule = parseDSL('On(Timer, 1) -> Apply(Spawn, "Fireball", 5)');
        expect(rule.event.kind).toBe('Timer');
        expect(rule.event.arg).toBe(1);
        expect(rule.actions[0].kind).toBe('Spawn');
        expect(rule.actions[0].args).toEqual(['Fireball', 5]);
    });

    test('toEngineJSON is serialisable', () => {
        const rule = parseDSL('On(Collide) -> Apply(Damage, 10)');
        const json = toEngineJSON(rule);
        expect(() => JSON.stringify(json)).not.toThrow();
        expect(JSON.parse(JSON.stringify(json)).event.kind).toBe('Collide');
    });

    test('compileFallback is deterministic and produces a valid rule', () => {
        const rule = compileFallback(['Fire', 'Speed']);
        expect(rule.actions.length).toBeGreaterThan(0);
        // round-trip through parseDSL
        const dslLine = `On(${rule.event.kind}${rule.event.arg !== undefined ? `, ${rule.event.arg}` : ''}) -> ${rule.actions.map(a => `Apply(${a.kind}${a.args.length ? `, ${a.args.join(', ')}` : ''})`).join(', ')}`;
        const reparsed = parseDSL(dslLine);
        expect(reparsed.event.kind).toBe(rule.event.kind);
    });
});

// Round 22 — NpcMind ↔ BalanceTuner reflexive loop. These tests
// mirror the Rust suite in src/agi_minigame/ai_engine.rs `tests`
// 1-to-1 so engine ↔ game divergence surfaces immediately.
import { BalanceTuner } from './AIEngine';
import { defaultDisposition } from '../world/NpcMind';
import type { NpcDisposition } from '../world/NpcMind';

describe('BalanceTuner mood bias (round 22)', () => {
    test('neutral disposition produces zero bias', () => {
        expect(BalanceTuner.moodBias(defaultDisposition())).toBe(0);
    });

    test('high fear lowers difficulty', () => {
        const scared: NpcDisposition = { friendly: 0, fear: 0.7, trust: 0 };
        expect(BalanceTuner.moodBias(scared)).toBeCloseTo(-0.10, 6);
    });

    test('friendly + trusting raises difficulty', () => {
        const beloved: NpcDisposition = { friendly: 0.8, fear: 0, trust: 0.5 };
        expect(BalanceTuner.moodBias(beloved)).toBeCloseTo(0.08, 6);
    });

    test('friendly alone (low trust) gives no bonus', () => {
        const liked: NpcDisposition = { friendly: 0.8, fear: 0, trust: 0.1 };
        expect(BalanceTuner.moodBias(liked)).toBe(0);
    });

    test('hated player eases difficulty', () => {
        const hated: NpcDisposition = { friendly: -0.5, fear: 0, trust: 0 };
        expect(BalanceTuner.moodBias(hated)).toBeCloseTo(-0.05, 6);
    });

    test('mood branches stack', () => {
        const nightmare: NpcDisposition = { friendly: -0.5, fear: 0.7, trust: 0 };
        expect(BalanceTuner.moodBias(nightmare)).toBeCloseTo(-0.15, 6);
    });

    test('suggestWithMood equals plain when neutral', () => {
        const t = new BalanceTuner();
        for (let i = 0; i < 6; i++) {
            t.recordResult({ playerLevel: 5, dimensionId: 'd1', difficulty: 0.5, score: 1000, durationSecs: 100, completed: i % 2 === 0 });
        }
        expect(t.suggestDifficultyWithMood(5, defaultDisposition()))
            .toBeCloseTo(t.suggestDifficulty(5), 6);
    });

    test('suggestWithMood clamps at floor', () => {
        const t = new BalanceTuner();
        const nightmare: NpcDisposition = { friendly: -1, fear: 1, trust: 0 };
        const d = t.suggestDifficultyWithMood(1, nightmare);
        expect(d).toBeGreaterThanOrEqual(0.1);
        expect(d).toBeLessThanOrEqual(1.0);
    });

    test('suggestWithMood clamps at ceiling', () => {
        const t = new BalanceTuner();
        const adored: NpcDisposition = { friendly: 1, fear: 0, trust: 1 };
        const d = t.suggestDifficultyWithMood(50, adored);
        expect(d).toBeLessThanOrEqual(1.0);
        expect(d).toBeGreaterThanOrEqual(0.1);
    });

    test('suggestWithMood actually moves difficulty', () => {
        const t = new BalanceTuner();
        const level = 5;
        const scared: NpcDisposition = { friendly: 0, fear: 0.9, trust: 0 };
        const adored: NpcDisposition = { friendly: 0.9, fear: 0, trust: 0.5 };
        const plain = t.suggestDifficulty(level);
        expect(t.suggestDifficultyWithMood(level, scared)).toBeLessThan(plain);
        expect(t.suggestDifficultyWithMood(level, adored)).toBeGreaterThan(plain);
    });
});
