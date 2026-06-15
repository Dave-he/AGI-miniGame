/**
 * SettingsPanel tests.
 */

import { SettingsPanel, SettingsPanelHooks, Difficulty, DebounceWindow } from '../ui/SettingsPanel';
import { I18n } from '../i18n/I18n';
import { GameAudio } from '../audio/GameAudio';
import { NullAudioService } from '../audio/AudioService';

function make() {
    document.body.innerHTML = '<div id="set"></div>';
    const root = document.getElementById('set')!;
    const i18n = new I18n();
    const audio = new GameAudio(new NullAudioService());
    let current: Difficulty = 'normal';
    const diffs: Difficulty[] = [];
    // Round 111 — track debounce changes + current
    // window for the new onDebounceChange /
    // getCurrentDebounce hooks.
    let currentDebounce: DebounceWindow = 500;
    const debounceChanges: DebounceWindow[] = [];
    const hooks: SettingsPanelHooks = {
        onDifficultyChange: (d) => { diffs.push(d); current = d; },
        getCurrentDifficulty: () => current,
        onDebounceChange: (ms) => { debounceChanges.push(ms); currentDebounce = ms; },
        getCurrentDebounce: () => currentDebounce,
    };
    const p = new SettingsPanel(root, i18n, audio, hooks);
    return {
        root, i18n, audio, p, diffs, getCurrent: () => current,
        debounceChanges, getCurrentDebounce: () => currentDebounce,
    };
}

describe('SettingsPanel', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_locale'); } catch { /* noop */ }
    });

    test('initial render shows the title and 3 difficulty buttons', () => {
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-diff');
        expect(btns.length).toBe(3);
    });

    test('clicking a difficulty button fires onDifficultyChange', () => {
        const { root, diffs } = make();
        const hard = root.querySelector<HTMLButtonElement>('[data-diff="hard"]')!;
        hard.click();
        expect(diffs).toEqual(['hard']);
    });

    test('mute toggle calls audio.setMuted', () => {
        const { root, audio } = make();
        const btn = root.querySelector<HTMLButtonElement>('.set-mute')!;
        expect(audio.isMuted()).toBe(false);
        btn.click();
        expect(audio.isMuted()).toBe(true);
    });

    test('locale switcher flips I18n locale', () => {
        const { root, i18n } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-locale="en-US"]')!;
        btn.click();
        expect(i18n.getLocale()).toBe('en-US');
    });

    // ---------------------------------------------------------------
    // Round 111 — debounce window tests.
    // The new row has 4 buttons (0/500/1000/2000ms).
    // The current button gets the `is-active` class
    // (mirror of the difficulty row).
    // Clicking fires `onDebounceChange(ms)`.
    // ---------------------------------------------------------------

    test('initial_render_shows_4_debounce_buttons (round 111)', () => {
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-debounce');
        expect(btns.length).toBe(4);
        const labels = Array.from(btns).map(b => b.textContent);
        // I18n default locale is en-US, so
        // labels are Off / 500ms (default) /
        // 1000ms / 2000ms.
        expect(labels[0]).toContain('Off');
        expect(labels[1]).toContain('500ms');
        expect(labels[2]).toContain('1000ms');
        expect(labels[3]).toContain('2000ms');
    });

    test('clicking_0ms_button_fires_onDebounceChange_with_0 (round 111 disable)', () => {
        // Player wants to disable debouncing
        // entirely (the "I really want to
        // save twice" workflow).
        const { root, debounceChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="0"]')!;
        btn.click();
        expect(debounceChanges).toEqual([0]);
    });

    test('clicking_1000ms_button_fires_onDebounceChange_with_1000 (round 111)', () => {
        const { root, debounceChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="1000"]')!;
        btn.click();
        expect(debounceChanges).toEqual([1000]);
    });

    test('clicking_2000ms_button_fires_onDebounceChange_with_2000 (round 111)', () => {
        const { root, debounceChanges, getCurrentDebounce } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="2000"]')!;
        btn.click();
        expect(debounceChanges).toEqual([2000]);
        // The getCurrentDebounce hook also
        // reflects the new value, so a
        // re-render would mark 2000 as
        // is-active.
        expect(getCurrentDebounce()).toBe(2000);
    });

    test('clicking_same_button_twice_fires_onDebounceChange_twice (round 111 idempotent)', () => {
        // Setting the same value twice is
        // allowed (the App's applySettings
        // is idempotent). A regression that
        // short-circuits the same-value
        // case would break this test.
        const { root, debounceChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="500"]')!;
        btn.click();
        btn.click();
        expect(debounceChanges).toEqual([500, 500]);
    });
});
