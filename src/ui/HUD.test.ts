/**
 * HUD tests — verify the I18n integration.
 */

import { HUD } from '../ui/HUD';
import { I18n } from '../i18n/I18n';

function makeHud() {
    document.body.innerHTML = '<div id="hud"></div>';
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    return { hud, i18n, root };
}

describe('HUD (I18n integration)', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_locale'); } catch { /* noop */ }
    });

    test('renders with the active locale by default', () => {
        const { root } = makeHud();
        // The HUD should contain at least one of the localized labels.
        const text = root.textContent ?? '';
        expect(text.length).toBeGreaterThan(0);
    });

    test('switching locale re-renders the HUD', () => {
        const { root, i18n } = makeHud();
        const startText = root.textContent ?? '';
        i18n.setLocale(i18n.getLocale() === 'en-US' ? 'zh-CN' : 'en-US');
        const endText = root.textContent ?? '';
        // The body should differ between locales.
        expect(startText).not.toBe(endText);
    });

    test('setState(logLines) populates the console', () => {
        const { root, hud } = makeHud();
        hud.log('hello world');
        expect(root.querySelectorAll('.hud-log-line').length).toBe(1);
    });

    test('clicking the language toggle flips the locale', () => {
        const { root, i18n } = makeHud();
        const start = i18n.getLocale();
        const btn = root.querySelector<HTMLButtonElement>('.hud-lang');
        expect(btn).toBeTruthy();
        btn?.click();
        const end = i18n.getLocale();
        expect(end).not.toBe(start);
    });
});
