/**
 * TutorialOverlay tests.
 */

import { TutorialOverlay, TUTORIAL_STEPS } from '../ui/TutorialOverlay';

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

describe('TutorialOverlay', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_tutorial_done'); } catch { /* noop */ }
    });

    test('starts not complete', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        expect(t.isComplete()).toBe(false);
    });

    test('notify(advanceOn event) advances step', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.notify(TUTORIAL_STEPS[0].advanceOn[0]);
        // Now on step 1
        t.notify(TUTORIAL_STEPS[1].advanceOn[0]);
        // Now on step 2
        t.notify(TUTORIAL_STEPS[2].advanceOn[0]);
        // Now on step 3
        t.notify(TUTORIAL_STEPS[3].advanceOn[0]);
        // After 4 advances, should be complete
        expect(t.isComplete()).toBe(true);
    });

    test('notify(wrong event) does not advance', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.notify('not-in-step-0');
        expect(t.isComplete()).toBe(false);
    });

    test('skip() makes complete', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.skip();
        expect(t.isComplete()).toBe(true);
    });

    test('render() updates the DOM', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        t.render();
        expect(r.querySelector('.tut-card')).toBeTruthy();
    });

    test('listener receives the current step', () => {
        const r = makeRoot();
        const t = new TutorialOverlay(r);
        const seen: string[] = [];
        t.on(s => seen.push(s.id));
        t.render();
        expect(seen[0]).toBe(TUTORIAL_STEPS[0].id);
    });
});
