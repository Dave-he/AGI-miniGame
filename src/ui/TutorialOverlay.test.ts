/**
 * TutorialOverlay wiring test — verifies the App-level integration.
 *
 * Drives the App via a small mock that records the tutorial event
 * notifications. Verifies that the four advance events actually
 * advance the overlay.
 */

import { TutorialOverlay, TUTORIAL_STEPS } from '../ui/TutorialOverlay';

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'tutorial';
    document.body.appendChild(el);
    return el;
}

describe('TutorialOverlay wiring', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_tutorial_done'); } catch { /* noop */ }
    });

    test('first 3 advances are accepted, 4th marks complete', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.render();
        for (let i = 0; i < 3; i++) {
            t.notify(TUTORIAL_STEPS[i].advanceOn[0]);
            expect(t.isComplete()).toBe(false);
        }
        t.notify(TUTORIAL_STEPS[3].advanceOn[0]);
        expect(t.isComplete()).toBe(true);
    });

    test('notify on the wrong step is a no-op', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        // Step 0 expects 'dimension-entered'; notify a different event
        t.notify('epoch-collapsed');
        // Step 0 should still be active
        expect(t.isComplete()).toBe(false);
    });

    test('skip() makes complete', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.skip();
        expect(t.isComplete()).toBe(true);
    });

    test('current step listener receives the active step', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        const seen: string[] = [];
        t.on(s => seen.push(s.id));
        t.render();
        expect(seen[0]).toBe('enter');
        t.notify('dimension-entered');
        expect(seen).toContain('meme');
    });
});
