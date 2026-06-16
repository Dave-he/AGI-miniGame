/**
 * SettingsPanel tests.
 */

import { SettingsPanel, SettingsPanelHooks, Difficulty, DebounceWindow, DEBOUNCE_PRESETS, VOLUME_PRESETS, SceneSpeedPreset, SCENE_SPEED_PRESETS } from '../ui/SettingsPanel';
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
    // Round 161 — track scene speed changes
    // + current preset for the new
    // onSceneSpeedChange /
    // getCurrentSceneSpeed hooks.
    let currentSceneSpeed: SceneSpeedPreset = 1;
    const sceneSpeedChanges: SceneSpeedPreset[] = [];
    const hooks: SettingsPanelHooks = {
        onDifficultyChange: (d) => { diffs.push(d); current = d; },
        getCurrentDifficulty: () => current,
        onDebounceChange: (ms) => { debounceChanges.push(ms); currentDebounce = ms; },
        getCurrentDebounce: () => currentDebounce,
        onSceneSpeedChange: (sp) => { sceneSpeedChanges.push(sp); currentSceneSpeed = sp; },
        getCurrentSceneSpeed: () => currentSceneSpeed,
    };
    const p = new SettingsPanel(root, i18n, audio, hooks);
    return {
        root, i18n, audio, p, diffs, getCurrent: () => current,
        debounceChanges, getCurrentDebounce: () => currentDebounce,
        sceneSpeedChanges, getCurrentSceneSpeed: () => currentSceneSpeed,
    };
}

describe('SettingsPanel', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_locale'); } catch { /* noop */ }
        try { localStorage.removeItem('agi_muted'); } catch { /* noop */ }
        try { localStorage.removeItem('agi_volume'); } catch { /* noop */ }
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

    // =========================================================
    // Round 157 — audio volume knob.
    //
    // 8 tests pinning the volume
    // state machine + the localStorage
    // round-trip + the SettingsPanel
    // UI hooks. Companion to the
    // round-127 mute toggle: mute is
    // a boolean "I want no sound"
    // state, volume is the continuous
    // "how loud" state. The 2 are
    // independent — you can be muted
    // at any volume, and unmuted at
    // any volume.
    // =========================================================

    test('initial_render_shows_4_volume_buttons_round_157', () => {
        // The new volume row has
        // 4 buttons (off / low /
        // med / high), mirroring
        // the round-111 debounce
        // row's "is-active highlight
        // on the active preset"
        // pattern. The data-volume
        // attribute is set to the
        // numeric value as a string
        // ("0" / "0.25" / "0.5" /
        // "1").
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-volume');
        expect(btns.length).toBe(4);
        const dataAttrs = Array.from(btns).map(b => b.getAttribute('data-volume'));
        expect(dataAttrs).toEqual(['0', '0.25', '0.5', '1']);
    });

    test('volume_buttons_are_ordered_off_low_med_high_round_157', () => {
        // Pin the canonical
        // ordering: off → low →
        // med → high maps to
        // numeric 0 → 0.25 →
        // 0.5 → 1.0. The active
        // preset is the closest
        // match to the current
        // volume (not the
        // index-based match), so
        // the order is purely
        // UI / i18n.
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-volume');
        const labels = Array.from(btns).map(b => b.textContent);
        // en-US default: Off / Low / Med / High
        expect(labels[0]).toContain('Off');
        expect(labels[1]).toContain('Low');
        expect(labels[2]).toContain('Med');
        expect(labels[3]).toContain('High');
    });

    test('VOLUME_PRESETS_is_exported_with_4_values_round_157', () => {
        // Importing the constant
        // directly from the
        // SettingsPanel module
        // lets external callers
        // (e.g. App-level tests)
        // avoid duplicating the
        // canonical ordering.
        expect(VOLUME_PRESETS).toEqual([0, 0.25, 0.5, 1.0]);
    });

    test('clicking_low_volume_button_calls_audio_setVolume_with_0_25_round_157', () => {
        // The click handler
        // parses the data-volume
        // attribute as a
        // number, narrows to
        // VolumePreset (the 4
        // allowed values), and
        // calls GameAudio.setVolume.
        const { root, audio } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-volume="0.25"]')!;
        btn.click();
        expect(audio.getVolume()).toBe(0.25);
    });

    test('clicking_high_volume_button_makes_it_is_active_round_157', () => {
        // After clicking the
        // High button, re-render
        // moves the is-active
        // class. The Off / Low /
        // Med buttons lose it.
        const { root } = make();
        const high = root.querySelector<HTMLButtonElement>('[data-volume="1"]')!;
        high.click();
        // Re-query after re-render
        // (the click handler
        // calls this.render()).
        const high2 = root.querySelector<HTMLButtonElement>('[data-volume="1"]')!;
        const off2 = root.querySelector<HTMLButtonElement>('[data-volume="0"]')!;
        const low2 = root.querySelector<HTMLButtonElement>('[data-volume="0.25"]')!;
        const med2 = root.querySelector<HTMLButtonElement>('[data-volume="0.5"]')!;
        expect(high2.classList.contains('is-active')).toBe(true);
        expect(off2.classList.contains('is-active')).toBe(false);
        expect(low2.classList.contains('is-active')).toBe(false);
        expect(med2.classList.contains('is-active')).toBe(false);
    });

    test('setVolume_writes_agi_volume_to_localStorage_round_157', () => {
        // The SettingsPanel
        // click handler calls
        // GameAudio.setVolume
        // which persists the
        // post-clamp value to
        // localStorage. So a
        // page reload will
        // restore the same
        // volume.
        const { root, audio } = make();
        const high = root.querySelector<HTMLButtonElement>('[data-volume="1"]')!;
        high.click();
        expect(audio.getVolume()).toBe(1.0);
        expect(localStorage.getItem('agi_volume')).toBe('1');
        const off = root.querySelector<HTMLButtonElement>('[data-volume="0"]')!;
        off.click();
        expect(audio.getVolume()).toBe(0);
        expect(localStorage.getItem('agi_volume')).toBe('0');
    });

    test('GameAudio_constructor_restores_volume_from_localStorage_round_157', () => {
        // Simulate a previous
        // session where the
        // player set the
        // volume to high.
        // A new GameAudio
        // should boot at
        // volume=1.
        localStorage.setItem('agi_volume', '0.5');
        const audio = new GameAudio(new NullAudioService());
        expect(audio.getVolume()).toBe(0.5);
    });

    test('GameAudio_constructor_falls_back_to_default_volume_for_missing_storage_round_157', () => {
        // No `agi_volume` key
        // set. Default is the
        // round-1 0.4 "polite"
        // master gain.
        const audio = new GameAudio(new NullAudioService());
        expect(audio.getVolume()).toBe(0.4);
    });

    test('GameAudio_constructor_falls_back_to_default_volume_for_malformed_storage_round_157', () => {
        // Garbage value (e.g.
        // an old app version
        // wrote something
        // else). Loaders
        // should reject
        // anything that
        // doesn't parse as a
        // number.
        localStorage.setItem('agi_volume', 'banana');
        const audio = new GameAudio(new NullAudioService());
        expect(audio.getVolume()).toBe(0.4);
    });

    test('GameAudio_setVolume_clamps_out_of_range_values_round_157', () => {
        // The service is
        // total: NaN,
        // negative, > 1 are
        // all pinned to the
        // nearest bound.
        // This protects the
        // UI from bugs (a
        // regression that
        // sends a raw
        // number without
        // bounds-checking
        // would otherwise
        // produce a gain
        // outside [0, 1] and
        // break the Web Audio
        // contract).
        const audio = new GameAudio(new NullAudioService());
        audio.setVolume(-1);
        expect(audio.getVolume()).toBe(0);
        audio.setVolume(5);
        expect(audio.getVolume()).toBe(1);
        audio.setVolume(NaN);
        expect(audio.getVolume()).toBe(0.4);
        audio.setVolume(0.5);
        expect(audio.getVolume()).toBe(0.5);
    });

    // =========================================================
    // Round 161 — scene speed
    // cycle (N key + 4-button
    // SettingsPanel row).
    //
    // The new row has 4
    // buttons (0.5x / 1x /
    // 2x / 4x) mirroring the
    // N key cycle. The
    // current preset gets
    // the `is-active`
    // class. Clicking fires
    // `onSceneSpeedChange(sp)`.
    // Mirrors the round-111
    // debounce + round-157
    // volume row pattern
    // (1 row, 4 buttons,
    // is-active highlight,
    // onChange hook).
    // =========================================================

    test('initial_render_shows_4_scene_speed_buttons_round_161', () => {
        // The new scene-speed
        // row has 4 buttons
        // (0.5x / 1x / 2x /
        // 4x), mirroring the
        // round-111 debounce
        // row's is-active
        // highlight pattern.
        // The data-scene-speed
        // attribute is set to
        // the numeric value
        // as a string ("0.5"
        // / "1" / "2" / "4").
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-scene-speed');
        expect(btns.length).toBe(4);
        const labels = Array.from(btns).map(b => b.textContent);
        // I18n default locale
        // is en-US, so labels
        // are 0.5x (slow) / 1x
        // (normal) / 2x (fast)
        // / 4x (turbo).
        expect(labels[0]).toContain('0.5x');
        expect(labels[1]).toContain('1x');
        expect(labels[2]).toContain('2x');
        expect(labels[3]).toContain('4x');
    });

    test('scene_speed_buttons_are_ordered_0.5_1_2_4_round_161', () => {
        // The canonical ordering
        // from SCENE_SPEED_PRESETS
        // is monotonically
        // increasing. A
        // regression that
        // shuffled the array
        // would put "turbo"
        // 4x before "slow"
        // 0.5x and confuse the
        // player.
        const { root } = make();
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-scene-speed');
        const dataAttrs = Array.from(btns).map(b => b.getAttribute('data-scene-speed'));
        expect(dataAttrs).toEqual(['0.5', '1', '2', '4']);
    });

    test('SCENE_SPEED_PRESETS_is_exported_with_4_values_round_161', () => {
        // Importing the
        // constant directly
        // from the
        // SettingsPanel module
        // lets external
        // callers (e.g.
        // App-level tests)
        // avoid duplicating
        // the canonical
        // ordering. A
        // regression that
        // dropped the export
        // would force the
        // App's cycleSceneSpeed
        // to redefine the
        // cycle sequence.
        expect(SCENE_SPEED_PRESETS).toEqual([0.5, 1, 2, 4]);
    });

    test('default_scene_speed_preset_highlights_1x_button_round_161', () => {
        // Fresh SettingsPanel
        // with the round-161
        // getCurrentSceneSpeed
        // hook returning 1
        // (the round-1 default
        // update rate). The
        // 1x button gets the
        // is-active class; the
        // other 3 do not.
        const { root } = make();
        const active = root.querySelectorAll<HTMLButtonElement>('.set-scene-speed.is-active');
        expect(active.length).toBe(1);
        expect(active[0].getAttribute('data-scene-speed')).toBe('1');
    });

    test('clicking_0.5x_button_fires_onSceneSpeedChange_with_0.5_round_161', () => {
        // Player wants slow
        // mode (half speed)
        // for atmospheric
        // appreciation.
        const { root, sceneSpeedChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-scene-speed="0.5"]')!;
        btn.click();
        expect(sceneSpeedChanges).toEqual([0.5]);
    });

    test('clicking_4x_button_fires_onSceneSpeedChange_with_4_round_161', () => {
        // Player wants turbo
        // mode (4x) to skip
        // through scene
        // generation.
        const { root, sceneSpeedChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-scene-speed="4"]')!;
        btn.click();
        expect(sceneSpeedChanges).toEqual([4]);
    });

    test('clicking_2x_button_twice_fires_onSceneSpeedChange_twice_round_161', () => {
        // Idempotency check:
        // clicking the same
        // button twice should
        // fire the callback
        // twice (the App
        // decides whether to
        // short-circuit, not
        // the panel). A
        // regression that
        // deduped identical
        // clicks would break
        // the round-111
        // debounce / round-157
        // volume symmetry.
        const { root, sceneSpeedChanges } = make();
        const btn = root.querySelector<HTMLButtonElement>('[data-scene-speed="2"]')!;
        btn.click();
        btn.click();
        expect(sceneSpeedChanges).toEqual([2, 2]);
    });

    test('scene_speed_row_hidden_when_hooks_omitted_round_161', () => {
        // The scene-speed row
        // must be hidden when
        // the App omits the 2
        // scene-speed hooks —
        // mirrors the
        // round-111
        // debounce-row
        // "hidden when hooks
        // not provided"
        // contract. A
        // regression that
        // always rendered the
        // row would render
        // dead buttons.
        document.body.innerHTML = '<div id="set"></div>';
        const root = document.getElementById('set')!;
        const i18n = new I18n();
        const audio = new GameAudio(new NullAudioService());
        // NO onSceneSpeedChange /
        // getCurrentSceneSpeed
        // hooks provided.
        new SettingsPanel(root, i18n, audio, {});
        const btns = root.querySelectorAll<HTMLButtonElement>('.set-scene-speed');
        expect(btns.length).toBe(0);
    });
});
