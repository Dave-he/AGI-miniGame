/**
 * SettingsPanel — runtime configuration overlay.
 *
 *   - audio mute toggle (calls GameAudio.setMuted)
 *   - audio volume preset (off / low / med / high) —
 *     round 157: calls GameAudio.setVolume; persisted
 *     to localStorage so the choice survives a page
 *     reload
 *   - difficulty selector (easy / normal / hard) — adjusts the
 *     AIEngine's BalanceTuner target win rate
 *   - language switcher (zh-CN / en-US) — wraps the I18n singleton
 *   - action debounce window (0 / 100 / 250 / 500 / 1000 / 2000 ms) —
 *     round 111: applies to all 4 ActionDebouncer instances
 *     on the App via the `onDebounceChange` callback.
 *     Round 129 adds the 100 / 250 presets for power users who
 *     want finer-grained responsiveness between the default
 *     500ms and the 0ms "I really want to spam-tap" extreme.
 *   - scene speed preset (0.5x / 1x / 2x / 4x) — round 161:
 *     cycles the scene's update rate. Slow speeds (0.5x)
 *     let the player appreciate the scene atmosphere
 *     (画面优美); fast speeds (2x / 4x) let the player skip
 *     through scene generation and see the variety quickly
 *     (场景更优). The N key cycles through the same 4
 *     presets. Persisted to localStorage so the choice
 *     survives a page reload.
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
 *
 * Round 129 — adds the 100ms + 250ms presets for power
 * users. 100ms is a "snappy but still safe" choice (close
 * to the human double-tap floor of ~80-120ms); 250ms is
 * a "fast but not snappy" choice that keeps accidental
 * scroll-wheel spam from firing world-event rolls while
 * letting intentional bursts through quickly.
 */
export type DebounceWindow = 0 | 100 | 250 | 500 | 1000 | 2000;

/**
 * Round 157 — the 4 audio volume presets exposed in the
 * SettingsPanel. Companion to the round-127 mute toggle:
 * mute is the boolean "I want no sound" state, volume is
 * the continuous "how loud" state. The 4 presets were
 * chosen to give meaningful coverage of the [0, 1] range
 * without forcing the player to drag a slider:
 *   - 0   = off (effectively mutes; the round-127 mute
 *           button also still works for hard-mute)
 *   - 0.25 = low (late-night play; the procedural SFX
 *           are still audible but unobtrusive)
 *   - 0.5  = med (default — same as the round-1 0.4
 *           "polite" master gain, rounded to the nearest
 *           0.05 for clean UI values)
 *   - 1.0  = high (full master gain; for players with
 *           headphones on small speakers or anyone who
 *           wants the procedural SFX to really cut through)
 *
 * The API is open — `GameAudio.setVolume` accepts any
 * value in [0, 1] — but the panel only exposes these
 * 4 presets for clean UI / clean tests.
 */
export type VolumePreset = 0 | 0.25 | 0.5 | 1.0;

/**
 * Round 157 — canonical ordering of the volume presets
 * rendered in the SettingsPanel's volume row. Kept as a
 * separate const so the click-handler guard and the render
 * pass share the same source of truth (avoids drift if
 * the type grows).
 */
export const VOLUME_PRESETS: readonly VolumePreset[] =
    [0, 0.25, 0.5, 1.0];

/**
 * Round 129 — canonical ordering of the debounce presets
 * rendered in the SettingsPanel's debounce row. Kept as a
 * separate const so the click-handler guard and the render
 * pass share the same source of truth (avoids drift if
 * the type grows again).
 */
export const DEBOUNCE_PRESETS: readonly DebounceWindow[] =
    [0, 100, 250, 500, 1000, 2000];

/**
 * Round 161 — the 4 scene
 * speed presets exposed
 * in the SettingsPanel's
 * scene-speed row. The
 * presets are a scene-
 * update multiplier
 * applied to the
 * Three.js render loop's
 * delta-time:
 *   - 0.5  = slow (half
 *            speed —
 *            atmospheric
 *            appreciation)
 *   - 1    = normal
 *            (default —
 *            matches the
 *            round-1
 *            1-frame-per-
 *            tick rate)
 *   - 2    = fast (2x —
 *            quick scene
 *            preview)
 *   - 4    = turbo (4x —
 *            skip through
 *            long
 *            transitions
 *            fast)
 *
 * The 4 presets give
 * meaningful coverage of
 * the [0.25, 4] range
 * without forcing the
 * player to drag a slider.
 * 0.5x is the floor
 * (anything slower would
 * feel broken); 4x is
 * the ceiling (anything
 * faster would skip
 * animations).
 *
 * The API is open — the
 * scene-speed multiplier
 * could be any positive
 * number — but the panel
 * only exposes these 4
 * presets for clean UI /
 * clean tests.
 */
export type SceneSpeedPreset = 0.5 | 1 | 2 | 4;

/**
 * Round 161 — canonical
 * ordering of the scene
 * speed presets rendered
 * in the SettingsPanel's
 * scene-speed row. The
 * 4-element const is the
 * source of truth for the
 * click-handler guard +
 * the render pass +
 * the `cycleSceneSpeed`
 * App method (which uses
 * the same sequence to
 * pick the next preset on
 * N key press).
 */
export const SCENE_SPEED_PRESETS: readonly SceneSpeedPreset[] =
    [0.5, 1, 2, 4];

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
    /**
     * Round 161 — called when the player picks a new
     * scene speed preset (via the 4-button row in the
     * settings panel). The App applies the new
     * multiplier to the scene's update loop and
     * persists it to localStorage
     * (`agi_scene_speed`). The same callback is fired
     * by the N key cycle, so the panel + the keyboard
     * shortcut stay in sync via the same hook.
     */
    onSceneSpeedChange?: (multiplier: SceneSpeedPreset) => void;
    getCurrentSceneSpeed?: () => SceneSpeedPreset;
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
                const debounceRow = DEBOUNCE_PRESETS.map(ms => {
                    const cur = curDebounce === ms;
                    return `<button class="set-debounce ${cur ? 'is-active' : ''}" data-debounce="${ms}">${escapeHtml(this.t(`settings.debounce.${ms}`))}</button>`;
                }).join('');
                return `
                    <div class="set-section-label">${escapeHtml(this.t('settings.debounce'))}</div>
                    <div class="set-row">${debounceRow}</div>
                `;
            })()
            : '';

        // Round 161 — optional
        // scene-speed row,
        // hidden when the App
        // doesn't provide a
        // scene-speed concept.
        // The main.ts
        // construction
        // provides both hooks,
        // so the row renders
        // by default. The 4
        // buttons mirror the
        // N-key cycle
        // sequence (0.5x → 1x
        // → 2x → 4x).
        const sceneSpeedSection = this.hooks.onSceneSpeedChange && this.hooks.getCurrentSceneSpeed
            ? (() => {
                const curSpeed: SceneSpeedPreset = this.hooks.getCurrentSceneSpeed!();
                const sceneSpeedRow = SCENE_SPEED_PRESETS.map(sp => {
                    const cur = curSpeed === sp;
                    return `<button class="set-scene-speed ${cur ? 'is-active' : ''}" data-scene-speed="${sp}">${escapeHtml(this.t(`settings.sceneSpeed.${sp}`))}</button>`;
                }).join('');
                return `
                    <div class="set-section-label">${escapeHtml(this.t('settings.sceneSpeed'))}</div>
                    <div class="set-row">${sceneSpeedRow}</div>
                `;
            })()
            : '';

        const muted = this.audio.isMuted();
        const muteLabel = muted ? this.t('audio.unmute') : this.t('audio.mute');
        // Round 157 — volume row.
        // The active preset is the
        // closest match to the current
        // master volume (since the API
        // accepts any value in [0, 1]
        // but the UI only exposes 4
        // discrete presets, we have
        // to find the closest one).
        // The volume is independent
        // from the mute state (the
        // round-127 mute button
        // hard-mutes everything
        // regardless of volume).
        const currentVolume = this.audio.getVolume();
        const volumeRow = VOLUME_PRESETS.map(v => {
            const cur = Math.abs(currentVolume - v) < 1e-6;
            return `<button class="set-volume ${cur ? 'is-active' : ''}" data-volume="${v}">${escapeHtml(this.t(`settings.volume.${v}`))}</button>`;
        }).join('');

        this.root.innerHTML = `
            <div class="settings-panel">
                <div class="set-title">${escapeHtml(this.t('settings.title'))}</div>
                <div class="set-section-label">${escapeHtml(this.t('settings.audio'))}</div>
                <div class="set-row">
                    <button class="set-mute ${muted ? 'is-active' : ''}" data-action="mute">${escapeHtml(muteLabel)}</button>
                </div>
                <div class="set-volume-row">
                    <div class="set-section-label">${escapeHtml(this.t('settings.volume'))}</div>
                    <div class="set-row">${volumeRow}</div>
                </div>
                ${diffSection}
                <div class="set-section-label">${escapeHtml(this.t('settings.language'))}</div>
                <div class="set-row">${localeRow}</div>
                ${debounceSection}
                ${sceneSpeedSection}
            </div>
        `;

        this.root.querySelector('.set-mute')?.addEventListener('click', () => {
            this.audio.setMuted(!muted);
            this.render();
        });
        // Round 157 — volume click handler.
        // Reads the `data-volume` attribute
        // (set to "0" / "0.25" / "0.5" /
        // "1"), parses to number, narrows
        // to `VolumePreset`, and calls
        // `GameAudio.setVolume` (which
        // persists to localStorage). The
        // click also re-renders so the
        // active-preset highlight updates.
        this.root.querySelectorAll<HTMLButtonElement>('.set-volume').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-volume');
                const v = raw == null ? NaN : Number(raw);
                const isValidVolume =
                    v === 0 || v === 0.25 || v === 0.5 || v === 1.0;
                if (isValidVolume) {
                    this.audio.setVolume(v);
                    this.render();
                }
            });
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
        // 0/100/250/500/1000/2000 as a string), parses to
        // number, narrows to `DebounceWindow`, and
        // calls the App's `onDebounceChange` callback
        // (which forwards to `applyDebounceSettings`).
        // Round 129 — extended the guard to include the
        // new 100/250 power-user presets.
        this.root.querySelectorAll<HTMLButtonElement>('.set-debounce').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-debounce');
                const ms = raw == null ? NaN : Number(raw);
                const isValidDebounceWindow =
                    ms === 0 || ms === 100 || ms === 250 ||
                    ms === 500 || ms === 1000 || ms === 2000;
                if (isValidDebounceWindow && this.hooks.onDebounceChange) {
                    this.hooks.onDebounceChange(ms);
                    this.render();
                }
            });
        });
        // Round 161 — scene
        // speed click
        // handler. Reads the
        // `data-scene-speed`
        // attribute (set to
        // "0.5" / "1" / "2" /
        // "4" as a string),
        // parses to number,
        // narrows to
        // `SceneSpeedPreset`,
        // and calls the
        // App's
        // `onSceneSpeedChange`
        // callback. The same
        // callback is fired
        // by the N key
        // cycle, so the panel
        // + the keyboard
        // shortcut stay in
        // sync via the same
        // hook.
        this.root.querySelectorAll<HTMLButtonElement>('.set-scene-speed').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-scene-speed');
                const sp = raw == null ? NaN : Number(raw);
                const isValidSceneSpeed =
                    sp === 0.5 || sp === 1 || sp === 2 || sp === 4;
                if (isValidSceneSpeed && this.hooks.onSceneSpeedChange) {
                    this.hooks.onSceneSpeedChange(sp);
                    this.render();
                }
            });
        });
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
