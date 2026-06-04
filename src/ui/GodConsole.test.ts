/**
 * GodConsole tests.
 */

import { GodConsole } from '../ui/GodConsole';
import { DmMode, DmHandlers } from '../dm/DmMode';

function make() {
    document.body.innerHTML = '<div id="god"></div>';
    const root = document.getElementById('god')!;
    const calls: string[] = [];
    const handlers: DmHandlers = {
        onSpawnNpc: c => calls.push(`npc:${c.name}`),
        onSpawnRule: dsl => calls.push(`rule:${dsl}`),
    };
    const dm = new DmMode(handlers);
    const gc = new GodConsole(root, dm);
    return { root, dm, gc, calls };
}

describe('GodConsole', () => {
    test('starts hidden', () => {
        const { gc } = make();
        expect(gc.isVisible()).toBe(false);
    });

    test('setVisible(true) renders the prompt', () => {
        const { root, gc } = make();
        gc.setVisible(true);
        expect(root.querySelector('.god-console')).toBeTruthy();
    });

    test('submit() dispatches the command and shows the result', () => {
        const { gc, calls, root } = make();
        gc.setVisible(true);
        const r = gc.submit('spawn npc "墨羽贤者" wise');
        expect(r.ok).toBe(true);
        expect(calls).toEqual(['npc:墨羽贤者']);
        // The history row appears.
        expect(root.textContent).toContain('墨羽贤者');
    });

    test('unknown command is rendered with an error marker', () => {
        const { gc, root } = make();
        gc.setVisible(true);
        const r = gc.submit('banana');
        expect(r.ok).toBe(false);
        expect(root.textContent).toContain('✗');
    });

    test('toggle flips visibility', () => {
        const { gc } = make();
        expect(gc.isVisible()).toBe(false);
        gc.toggle();
        expect(gc.isVisible()).toBe(true);
        gc.toggle();
        expect(gc.isVisible()).toBe(false);
    });

    test('history grows with multiple submits', () => {
        const { gc, root } = make();
        gc.setVisible(true);
        gc.submit('event alpha');
        gc.submit('event beta');
        gc.submit('event gamma');
        const rows = root.querySelectorAll('.god-row');
        expect(rows.length).toBe(3);
    });
});
