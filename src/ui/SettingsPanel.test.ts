/**
 * SettingsPanel tests.
 */

import { SettingsPanel, SettingsPanelHooks, Difficulty } from '../ui/SettingsPanel';
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
    const hooks: SettingsPanelHooks = {
        onDifficultyChange: (d) => { diffs.push(d); current = d; },
        getCurrentDifficulty: () => current,
    };
    const p = new SettingsPanel(root, i18n, audio, hooks);
    return { root, i18n, audio, p, diffs, getCurrent: () => current };
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
});
