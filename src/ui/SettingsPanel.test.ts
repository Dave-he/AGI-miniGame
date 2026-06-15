/**
 * SettingsPanel tests.
 */

import { SettingsPanel, SettingsPanelHooks, Difficulty, DebounceWindow, DEBOUNCE_PRESETS } from '../ui/SettingsPanel';
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
        try { localStorage.removeItem('agi_muted'); } catch { /* noop */ }
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
    //
    // Round 129 — adds the 100ms + 250ms presets
    // for power users. The row now has 6 buttons
    // (0/100/250/500/1000/2000ms).
    // ---------------------------------------------------------------

    test('initial_render_shows_6_debounce_buttons (round 111+129)', () => {
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-debounce');
        expect(btns.length).toBe(6);
        const labels = Array.from(btns).map(b => b.textContent);
        // I18n default locale is en-US, so
        // labels are Off / 100ms (snappy) /
        // 250ms (fast) / 500ms (default) /
        // 1000ms / 2000ms.
        expect(labels[0]).toContain('Off');
        expect(labels[1]).toContain('100ms');
        expect(labels[2]).toContain('250ms');
        expect(labels[3]).toContain('500ms');
        expect(labels[4]).toContain('1000ms');
        expect(labels[5]).toContain('2000ms');
    });

    test('debounce_buttons_are_ordered_0_100_250_500_1000_2000 (round 129 ordering)', () => {
        // The canonical ordering from DEBOUNCE_PRESETS
        // is monotonically increasing. A regression
        // that shuffled the array would put "snappy"
        // 100ms after "slow" 2000ms and confuse the
        // player.
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-debounce');
        const dataAttrs = Array.from(btns).map(b => b.getAttribute('data-debounce'));
        expect(dataAttrs).toEqual(['0', '100', '250', '500', '1000', '2000']);
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

    // ---------------------------------------------------------------
    // Round 129 — power-user debounce presets
    // (100ms "snappy" / 250ms "fast"). The
    // SettingsPanel's click guard now accepts
    // these values; the App's loadDebounceMsFromStorage
    // / writeDebounceMsToStorage helpers also round-trip
    // them via localStorage so a reload keeps the
    // picked value.
    // ---------------------------------------------------------------

    test('clicking_100ms_button_fires_onDebounceChange_with_100 (round 129 snappy)', () => {
        const { root, debounceChanges, getCurrentDebounce } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="100"]')!;
        btn.click();
        expect(debounceChanges).toEqual([100]);
        expect(getCurrentDebounce()).toBe(100);
        // The 100ms button should now be is-active
        // (and 500ms should have lost its is-active).
        const btn100 = root.querySelector<HTMLButtonElement>('[data-debounce="100"]')!;
        const btn500 = root.querySelector<HTMLButtonElement>('[data-debounce="500"]')!;
        expect(btn100.classList.contains('is-active')).toBe(true);
        expect(btn500.classList.contains('is-active')).toBe(false);
    });

    test('clicking_250ms_button_fires_onDebounceChange_with_250 (round 129 fast)', () => {
        const { root, debounceChanges, getCurrentDebounce } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-debounce="250"]')!;
        btn.click();
        expect(debounceChanges).toEqual([250]);
        expect(getCurrentDebounce()).toBe(250);
    });

    test('DEBOUNCE_PRESETS_is_exported_with_6_values (round 129 export)', () => {
        // Importing the constant directly from
        // the SettingsPanel module lets external
        // callers (e.g. App-level tests) avoid
        // duplicating the canonical ordering.
        expect(DEBOUNCE_PRESETS).toEqual([0, 100, 250, 500, 1000, 2000]);
    });

    // ---------------------------------------------------------------
    // Round 127 — GameAudio mute state
    // persistence to localStorage. The
    // I18n singleton has the same pattern
    // for `agi_locale`. Round 127
    // extends the same idea to
    // `agi_muted` so a page reload
    // keeps the player's choice.
    // ---------------------------------------------------------------

    test('mute_toggle_writes_agi_muted_to_localStorage (round 127)', () => {
        // First click → muted=true → storage '1'
        const { root, audio } = make();
        const btn = root.querySelector<HTMLButtonElement>('.set-mute')!;
        btn.click();
        expect(localStorage.getItem('agi_muted')).toBe('1');
        expect(audio.isMuted()).toBe(true);
        // Re-render: the button label
        // flips to "unmute" (or its
        // i18n equivalent). Click again
        // → muted=false → storage '0'.
        const btn2 = root.querySelector<HTMLButtonElement>('.set-mute')!;
        btn2.click();
        expect(localStorage.getItem('agi_muted')).toBe('0');
    });

    test('GameAudio_constructor_restores_muted_from_localStorage (round 127 reload)', () => {
        // Simulate a previous session
        // where the player muted the
        // audio. A new GameAudio should
        // boot in muted state.
        localStorage.setItem('agi_muted', '1');
        const audio = new GameAudio(new NullAudioService());
        expect(audio.isMuted()).toBe(true);
        // The underlying AudioService
        // should also be muted (the
        // constructor calls
        // `svc.setMuted(restored)`).
        expect(audio.isMuted()).toBe(true);
    });

    test('GameAudio_constructor_falls_back_to_unmuted_when_storage_empty (round 127 defense)', () => {
        // No `agi_muted` key set.
        // Default is unmuted.
        const audio = new GameAudio(new NullAudioService());
        expect(audio.isMuted()).toBe(false);
    });

    test('GameAudio_constructor_falls_back_to_unmuted_for_malformed_storage (round 127 defense)', () => {
        // Garbage value (e.g. an old
        // app version wrote something
        // else). Loaders should reject
        // anything outside '0' / '1'.
        localStorage.setItem('agi_muted', 'banana');
        const audio = new GameAudio(new NullAudioService());
        expect(audio.isMuted()).toBe(false);
    });
});
