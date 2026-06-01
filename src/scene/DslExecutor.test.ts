/**
 * DslExecutor tests — runs without a real Three.js scene by using a
 * minimal mock that records the calls.
 */

import { DslExecutor, DslEventSink } from '../scene/DslExecutor';
import { parseDSL } from '../dsl/MemeCompiler';

class MockScene {
    public spawned: Array<{ id: number; label: string }> = [];
    public floats: Array<{ text: string; color: string }> = [];
    spawnEntity(id: number, label: string) { this.spawned.push({ id, label }); }
    spawnFloatingText(text: string, color: string) { this.floats.push({ text, color }); }
}

describe('DslExecutor', () => {
    function make() {
        const scene = new MockScene();
        const log: string[] = [];
        const events = { playerDamage: [] as number[], entitySpawns: [] as Array<{ id: number; label: string; count: number }>, modifiers: [] as Array<{ name: string; value: any }> };
        const sink: DslEventSink = {
            log: (line) => log.push(line),
            onPlayerDamage: (n) => events.playerDamage.push(n),
            onEntitySpawn: (id, label, count) => events.entitySpawns.push({ id, label, count }),
            onWorldModifier: (name, value) => events.modifiers.push({ name, value }),
        };
        const exec = new DslExecutor(scene as any, sink);
        return { exec, scene, log, events };
    }

    test('Damage action spawns a red floating number and fires onPlayerDamage', () => {
        const { exec, scene, events } = make();
        exec.apply(parseDSL('On(Collide) -> Apply(Damage, 25)'));
        expect(events.playerDamage).toEqual([25]);
        expect(scene.floats).toEqual([{ text: '-25', color: '#ff4d6d' }]);
    });

    test('Heal action spawns a green floating number', () => {
        const { exec, scene } = make();
        exec.apply(parseDSL('On(Collide) -> Apply(Heal, 7)'));
        expect(scene.floats[0].text).toBe('+7');
        expect(scene.floats[0].color).toBe('#06d6a0');
    });

    test('Spawn action spawns N entities with monotonically increasing ids', () => {
        const { exec, scene, events } = make();
        exec.apply(parseDSL('On(Timer, 1) -> Apply(Spawn, "Fireball", 3)'));
        expect(scene.spawned.length).toBe(3);
        expect(scene.spawned.map(s => s.label)).toEqual(['Fireball', 'Fireball', 'Fireball']);
        expect(scene.spawned[0].id).toBeLessThan(scene.spawned[1].id);
        expect(events.entitySpawns[0].count).toBe(3);
    });

    test('multiple actions in one rule are applied in order', () => {
        const { exec, scene, events } = make();
        exec.apply(parseDSL('On(Collide) -> Apply(Damage, 4), Apply(Heal, 2)'));
        expect(events.playerDamage).toEqual([4]);
        expect(scene.floats.length).toBe(2);
    });

    test('PlayerHit event captures a world modifier', () => {
        const { exec, events } = make();
        exec.apply(parseDSL('On(PlayerHit, 5) -> Apply(Damage, 3)'));
        expect(events.modifiers).toEqual([{ name: 'PlayerHit intensity', value: 5 }]);
    });

    test('getModifiers returns observed world modifiers', () => {
        const { exec } = make();
        exec.apply(parseDSL('On(PlayerHit, 10) -> Apply(Damage, 1)'));
        expect(exec.getModifiers()[0]).toEqual({ name: 'PlayerHit intensity', value: 10 });
    });
});
