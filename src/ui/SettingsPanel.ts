/**
 * SettingsPanel — runtime configuration overlay.
 *
 *   - audio mute toggle (calls GameAudio.setMuted)
 *   - difficulty selector (easy / normal / hard) — adjusts the
 *     AIEngine's BalanceTuner target win rate
 *   - language switcher (zh-CN / en-US) — wraps the I18n singleton
 *   - action debounce window (0 / 500 / 1000 / 2000 ms) —
 *     round 111: applies to all 4 ActionDebouncer instances
 *     on the App via the `onDebounceChange` callback
 *
 * The panel is fully self-contained: pass in the I18n, GameAudio,
 * and a difficulty setter callback.
 */

import type { I18n, Locale } from '../i18n/I18n';
import type { GameAudio } from '../audio/GameAudio';

export type Difficulty = 'easy' | 'normal' | 'hard';

/**
 * Round 111 — the 4 action-debounce window presets exposed
 * in the SettingsPanel. The 4th value (2000ms) gives the
 * player a slow-input mode (good for screenshotting the
 * atmosphere without the next tap interrupting). The 1st
 * value (0ms) disables debouncing entirely (the "I really
 * want to save twice" workflow mentioned in the
 * round-108 JSDoc).
 */
export type DebounceWindow = 0 | 500 | 1000 | 2000;

export interface SettingsPanelHooks {
    /**
     * Optional — the App doesn't have a
     * global difficulty concept (each
     * dimension rolls its own difficulty
     * in the blueprint). The difficulty
     * row is hidden when these hooks
     * are not provided.
     */
    onDifficultyChange?: (d: Difficulty) => void;
    getCurrentDifficulty?: () => Difficulty;
    /**
     * Round 111 — called when the player picks a new
     * debounce window. The App applies the new window
     * to all 4 `ActionDebouncer` instances
     * (`debouncerLoadGame`, `debouncerSaveGame`,
     * `debouncerRollWorldEvent`, `debouncerEnterAtom`).
     */
    onDebounceChange?: (ms: DebounceWindow) => void;
    getCurrentDebounce?: () => DebounceWindow;
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

        // Optional difficulty row — hidden when
        // the App doesn't provide a difficulty
        // concept. Round 111 makes these hooks
        // optional; the AGI-miniGame App has no
        // global difficulty (each dimension rolls
        // its own) so the main.ts construction
        // omits these.
        const diffSection = this.hooks.onDifficultyChange && this.hooks.getCurrentDifficulty
            ? (() => {
                const diff: Difficulty = this.hooks.getCurrentDifficulty!();
                const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
                const diffRow = difficulties.map(d => {
                    const cur = diff === d;
                    return `<button class="set-diff ${cur ? 'is-active' : ''}" data-diff="${d}">${this.t(`settings.diff.${d}`)}</button>`;
                }).join('');
                return `
                    <div class="set-section-label">${escapeHtml(this.t('settings.difficulty'))}</div>
                    <div class="set-row">${diffRow}</div>
                `;
            })()
            : '';

        // Optional debounce row — hidden when
        // the App doesn't provide a debounce
        // concept. The main.ts construction
        // provides both hooks, so the row
        // renders by default.
        const debounceSection = this.hooks.onDebounceChange && this.hooks.getCurrentDebounce
            ? (() => {
                const curDebounce: DebounceWindow = this.hooks.getCurrentDebounce!();
                const debounceOptions: DebounceWindow[] = [0, 500, 1000, 2000];
                const debounceRow = debounceOptions.map(ms => {
                    const cur = curDebounce === ms;
                    return `<button class="set-debounce ${cur ? 'is-active' : ''}" data-debounce="${ms}">${escapeHtml(this.t(`settings.debounce.${ms}`))}</button>`;
                }).join('');
                return `
                    <div class="set-section-label">${escapeHtml(this.t('settings.debounce'))}</div>
                    <div class="set-row">${debounceRow}</div>
                `;
            })()
            : '';

        const muted = this.audio.isMuted();
        const muteLabel = muted ? this.t('audio.unmute') : this.t('audio.mute');

        this.root.innerHTML = `
            <div class="settings-panel">
                <div class="set-title">${escapeHtml(this.t('settings.title'))}</div>
                <div class="set-section-label">${escapeHtml(this.t('settings.audio'))}</div>
                <div class="set-row">
                    <button class="set-mute ${muted ? 'is-active' : ''}" data-action="mute">${escapeHtml(muteLabel)}</button>
                </div>
                ${diffSection}
                <div class="set-section-label">${escapeHtml(this.t('settings.language'))}</div>
                <div class="set-row">${localeRow}</div>
                ${debounceSection}
            </div>
        `;

        this.root.querySelector('.set-mute')?.addEventListener('click', () => {
            this.audio.setMuted(!muted);
            this.render();
        });
        this.root.querySelectorAll<HTMLButtonElement>('.set-diff').forEach(btn => {
            btn.addEventListener('click', () => {
                const d = btn.getAttribute('data-diff') as Difficulty | null;
                if (d && this.hooks.onDifficultyChange) {
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
        // Round 111 — debounce window click handler.
        // Reads the `data-debounce` attribute (set to
        // 0/500/1000/2000 as a string), parses to
        // number, narrows to `DebounceWindow`, and
        // calls the App's `onDebounceChange` callback
        // (which forwards to `applyDebounceSettings`).
        this.root.querySelectorAll<HTMLButtonElement>('.set-debounce').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-debounce');
                const ms = raw == null ? NaN : Number(raw);
                if ((ms === 0 || ms === 500 || ms === 1000 || ms === 2000) && this.hooks.onDebounceChange) {
                    this.hooks.onDebounceChange(ms);
                    this.render();
                }
            });
        });
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
