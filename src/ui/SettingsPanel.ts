/**
 * SettingsPanel — runtime configuration overlay.
 *
 *   - audio mute toggle (calls GameAudio.setMuted)
 *   - difficulty selector (easy / normal / hard) — adjusts the
 *     AIEngine's BalanceTuner target win rate
 *   - language switcher (zh-CN / en-US) — wraps the I18n singleton
 *
 * The panel is fully self-contained: pass in the I18n, GameAudio,
 * and a difficulty setter callback.
 */

import type { I18n, Locale } from '../i18n/I18n';
import type { GameAudio } from '../audio/GameAudio';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SettingsPanelHooks {
    onDifficultyChange: (d: Difficulty) => void;
    getCurrentDifficulty: () => Difficulty;
}

export class SettingsPanel {
    private root: HTMLElement;
    private i18n: I18n;
    private audio: GameAudio;
    private hooks: SettingsPanelHooks;

    constructor(root: HTMLElement, i18n: I18n, audio: GameAudio, hooks: SettingsPanelHooks) {
        this.root = root;
        this.i18n = i18n;
        this.audio = audio;
        this.hooks = hooks;
        this.render();
    }

    refresh(): void { this.render(); }

    private t(key: string, params?: any): string {
        return this.i18n.t(key, params);
    }

    private render(): void {
        const locales: Locale[] = ['zh-CN', 'en-US'];
        const localeRow = locales.map(l => {
            const cur = this.i18n.getLocale() === l;
            return `<button class="set-locale ${cur ? 'is-active' : ''}" data-locale="${l}">${l}</button>`;
        }).join('');

        const diff: Difficulty = this.hooks.getCurrentDifficulty();
        const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
        const diffRow = difficulties.map(d => {
            const cur = diff === d;
            return `<button class="set-diff ${cur ? 'is-active' : ''}" data-diff="${d}">${this.t(`settings.diff.${d}`)}</button>`;
        }).join('');

        const muted = this.audio.isMuted();
        const muteLabel = muted ? this.t('audio.unmute') : this.t('audio.mute');

        this.root.innerHTML = `
            <div class="settings-panel">
                <div class="set-title">${escapeHtml(this.t('settings.title'))}</div>
                <div class="set-section-label">${escapeHtml(this.t('settings.audio'))}</div>
                <div class="set-row">
                    <button class="set-mute ${muted ? 'is-active' : ''}" data-action="mute">${escapeHtml(muteLabel)}</button>
                </div>
                <div class="set-section-label">${escapeHtml(this.t('settings.difficulty'))}</div>
                <div class="set-row">${diffRow}</div>
                <div class="set-section-label">${escapeHtml(this.t('settings.language'))}</div>
                <div class="set-row">${localeRow}</div>
            </div>
        `;

        this.root.querySelector('.set-mute')?.addEventListener('click', () => {
            this.audio.setMuted(!muted);
            this.render();
        });
        this.root.querySelectorAll<HTMLButtonElement>('.set-diff').forEach(btn => {
            btn.addEventListener('click', () => {
                const d = btn.getAttribute('data-diff') as Difficulty | null;
                if (d) {
                    this.hooks.onDifficultyChange(d);
                    this.render();
                }
            });
        });
        this.root.querySelectorAll<HTMLButtonElement>('.set-locale').forEach(btn => {
            btn.addEventListener('click', () => {
                const l = btn.getAttribute('data-locale') as Locale | null;
                if (l) {
                    this.i18n.setLocale(l);
                    this.render();
                }
            });
        });
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
