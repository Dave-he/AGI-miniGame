/**
 * DmMode tests.
 */

import { DmMode, DmHandlers } from '../dm/DmMode';

function make() {
    const calls: string[] = [];
    const handlers: DmHandlers = {
        onSpawnNpc: c => calls.push(`npc:${c.name}:${c.personality}`),
        onSpawnRule: dsl => calls.push(`rule:${dsl}`),
        onEvent: name => calls.push(`event:${name}`),
        onDimension: (r, c, s) => calls.push(`dim:${r}x${c}:${s}`),
    };
    const dm = new DmMode(handlers);
    return { dm, calls };
}

describe('DmMode', () => {
    test('spawn npc with quoted name and personality', () => {
        const { dm, calls } = make();
        const r = dm.run('spawn npc "骨魂将军" grumpy');
        expect(r.ok).toBe(true);
        expect(calls).toEqual(['npc:骨魂将军:grumpy']);
    });

    test('rule dispatches a DSL line', () => {
        const { dm, calls } = make();
        const r = dm.run('rule On(Collide) -> Apply(Damage, 5)');
        expect(r.ok).toBe(true);
        expect(calls).toEqual(['rule:On(Collide) -> Apply(Damage, 5)']);
    });

    test('event dispatches by name', () => {
        const { dm, calls } = make();
        dm.run('event weather storm');
        expect(calls).toEqual(['event:weather storm']);
    });

    test('dimension parses rows cols style', () => {
        const { dm, calls } = make();
        dm.run('dim 12 8 cyberpunk');
        expect(calls).toEqual(['dim:12x8:cyberpunk']);
    });

    test('unknown command returns noop with error', () => {
        const { dm, calls } = make();
        const r = dm.run('banana split');
        expect(r.ok).toBe(false);
        expect(calls).toEqual([]);
        expect(r.error).toContain('unknown command');
    });

    test('empty command is an error', () => {
        const { dm, calls } = make();
        const r = dm.run('   ');
        expect(r.ok).toBe(false);
        expect(calls).toEqual([]);
    });

    test('history records every run', () => {
        const { dm } = make();
        dm.run('event a');
        dm.run('event b');
        dm.run('event c');
        expect(dm.getHistory().length).toBe(3);
        expect(dm.lastResult()?.cmd).toEqual({ kind: 'event', name: 'c' });
    });

    test('handler exception is caught and reported', () => {
        const dm = new DmMode({ onEvent: () => { throw new Error('boom'); } });
        const r = dm.run('event whatever');
        expect(r.ok).toBe(false);
        expect(r.error).toBe('boom');
    });
});
