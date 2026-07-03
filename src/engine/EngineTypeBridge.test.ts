/**
 * EngineTypeBridge tests.
 */

import {
    parseEngineArg, renderEngineArg, renderEngineRule,
    engineMutationCost, toEngineRule,
    EngineRule,
} from '../engine/EngineTypeBridge';

describe('EngineTypeBridge', () => {
    test('parseEngineArg handles numbers and quoted strings', () => {
        expect(parseEngineArg('42')).toEqual({ Number: 42 });
        expect(parseEngineArg('3.14')).toEqual({ Number: 3.14 });
        expect(parseEngineArg('"Fireball"')).toEqual({ Str: 'Fireball' });
        expect(parseEngineArg('')).toBeNull();
    });

    test('renderEngineArg round-trips through parseEngineArg', () => {
        for (const orig of [{ Number: 7 }, { Number: 0.5 }, { Str: 'Fireball' }, { Str: 'hello world' }]) {
            const r = renderEngineArg(orig);
            const back = parseEngineArg(r);
            expect(back).toEqual(orig);
        }
    });

    test('renderEngineRule matches the expected DSL shape', () => {
        const rule: EngineRule = {
            event: { kind: 'Collide', arg: null },
            actions: [{ kind: 'Damage', args: [{ Number: 10 }] }],
        };
        expect(renderEngineRule(rule)).toBe('On(Collide) -> Apply(Damage, 10)');
    });

    test('renderEngineRule with string arg', () => {
        const rule: EngineRule = {
            event: { kind: 'Timer', arg: { Number: 1 } },
            actions: [{ kind: 'Spawn', args: [{ Str: 'Fireball' }, { Number: 5 }] }],
        };
        expect(renderEngineRule(rule)).toBe('On(Timer, 1) -> Apply(Spawn, "Fireball", 5)');
    });

    test('engineMutationCost matches the Rust implementation', () => {
        const rule: EngineRule = {
            event: { kind: 'Collide', arg: null },
            actions: [
                { kind: 'Damage', args: [] },
                { kind: 'Heal', args: [] },
                { kind: 'Spawn', args: [] },
                { kind: 'SpawnEntity', args: [] },
            ],
        };
        // base 1 + 1 + 1 + 2 + 3 = 8
        expect(engineMutationCost(rule)).toBe(8);
    });

    test('toEngineRule coerces from a loose shape', () => {
        const r = toEngineRule({
            event: { kind: 'Collide', arg: null },
            actions: [{ kind: 'Damage', args: [10] }],
        });
        expect('error' in r).toBe(false);
        if ('error' in r) return;
        expect(r.actions[0].args[0]).toEqual({ Number: 10 });
    });

    test('toEngineRule rejects unknown event kind', () => {
        const r = toEngineRule({
            event: { kind: 'Foo', arg: null },
            actions: [],
        });
        expect('error' in r).toBe(true);
    });

    test('toEngineRule rejects unknown action kind', () => {
        const r = toEngineRule({
            event: { kind: 'Collide', arg: null },
            actions: [{ kind: 'Foo', args: [] }],
        });
        expect('error' in r).toBe(true);
    });
});
