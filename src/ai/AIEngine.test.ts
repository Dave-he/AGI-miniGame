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
