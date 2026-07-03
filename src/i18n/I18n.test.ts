/**
 * I18n tests.
 */

import { I18n, Locale } from '../i18n/I18n';

describe('I18n', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_locale'); } catch { /* noop */ }
    });

    test('default locale is one of the supported ones', () => {
        const i = new I18n();
        expect(['zh-CN', 'en-US']).toContain(i.getLocale());
    });

    test('switching to en-US changes translations', () => {
        const i = new I18n();
        i.setLocale('en-US');
        expect(i.t('hud.gold')).toBe('Gold');
        expect(i.t('scene.enter')).toBe('Enter dimension');
    });

    test('switching to zh-CN changes translations', () => {
        const i = new I18n();
        i.setLocale('zh-CN');
        expect(i.t('hud.gold')).toBe('金币');
    });

    test('params are interpolated', () => {
        const i = new I18n();
        i.setLocale('en-US');
        expect(i.t('tut.step', { n: 2 })).toBe('Step 2');
        expect(i.t('epoch.next', { n: 7 })).toBe('Enter Epoch 7');
    });

    test('unknown key falls back to the key itself', () => {
        const i = new I18n();
        expect(i.t('not.a.key')).toBe('not.a.key');
    });

    test('onChange listener fires when locale actually changes', () => {
        const i = new I18n();
        const start = i.getLocale();
        const target: Locale = start === 'en-US' ? 'zh-CN' : 'en-US';
        const seen: string[] = [];
        i.onChange(l => seen.push(l));
        i.setLocale(target);
        expect(seen).toEqual([target]);
    });

    test('persists across instances via localStorage', () => {
        const i1 = new I18n();
        i1.setLocale('en-US');
        const i2 = new I18n();
        expect(i2.getLocale()).toBe('en-US');
    });
});
