/**
 * I18n — minimal bilingual (zh-CN / en-US) catalog with a tiny
 * interpolation helper.
 *
 * The catalog is intentionally compact: HUD labels, tutorial copy,
 * NPC dialogue topics, save/load errors, and a handful of error
 * messages. Anything not in the catalog falls back to the key, so
 * this module never throws and never silently returns the wrong
 * language.
 *
 * Default language is auto-detected from `navigator.language`. The
 * active language is stored in localStorage so the player's choice
 * (or the first-run auto-detect) is preserved across sessions.
 */

export type Locale = 'zh-CN' | 'en-US';

export const CATALOG: Record<Locale, Record<string, string>> = {
    'zh-CN': {
        'app.title':             'AGI-miniGame · 无限次元城',
        'app.tagline':           '基于玩家行为与实时生成的游戏元宇宙引擎',

        'hud.stats':             '玩家数据',
        'hud.dim':               '当前次元',
        'hud.console':           '控制台',
        'hud.level':             '等级',
        'hud.gold':              '金币',
        'hud.gem':               '钻石',
        'hud.energy':            '体力',

        'epoch.title':           '纪元',
        'epoch.collapse':        '触发大坍缩',
        'epoch.next':            '进入纪元 {n}',

        'tut.step':              '第 {n} 步',
        'tut.remaining':         '剩余 {n} 步',
        'tut.skip':              '跳过教程',
        'tut.complete':          '教程完成！',

        'inv.title':             '背包',
        'inv.empty':             '背包空空如也',
        'inv.use':               '使用',
        'inv.drop':              '丢弃',

        'scene.enter':           '进入次元',
        'scene.event':           '世界事件',
        'scene.dsl':             '模因→DSL',
        'scene.collapse':        '大坍缩',
        'scene.complete':        '完成试炼',
        'scene.save':            '存档',
        'scene.load':            '读档',
        'scene.talk':            '对话',

        'npc.greeting':          '你好',
        'npc.farewell':          '再见',

        'audio.mute':            '静音',
        'audio.unmute':          '取消静音',

        'settings.title':        '设置',
        'settings.audio':        '音效',
        'settings.difficulty':   '难度',
        'settings.language':      '语言',
        'settings.diff.easy':    '简单',
        'settings.diff.normal':  '普通',
        'settings.diff.hard':    '困难',
        'settings.debounce':     '防抖窗口',
        'settings.debounce.0':   '关闭',
        'settings.debounce.100': '100ms (极速)',
        'settings.debounce.250': '250ms (快速)',
        'settings.debounce.500': '500ms (默认)',
        'settings.debounce.1000':'1000ms',
        'settings.debounce.2000':'2000ms',
        // Round 157 — audio volume
        // presets. 4 buttons (off /
        // low / med / high) in the
        // SettingsPanel volume row.
        // The 4 values map to
        // GameAudio.setVolume(0/0.25
        // /0.5/1.0) and are
        // independent from the
        // round-127 mute toggle
        // (mute hard-mutes
        // regardless of volume).
        'settings.volume':       '音量',
        'settings.volume.0':     '关闭',
        'settings.volume.0.25':  '低',
        'settings.volume.0.5':   '中',
        'settings.volume.1':     '高',

        'stats.title':           '统计',
        'stats.counters':        '计数器',
        'stats.recent':          '最近事件',
        'stats.empty':           '暂无数据',

        'sys.save.ok':           '存档已保存',
        'sys.save.fail':         '存档保存失败',
        'sys.load.ok':           '读档成功',
        'sys.load.empty':        '没有可恢复的存档',
    },
    'en-US': {
        'app.title':             'AGI-miniGame · Infinite Dimensional City',
        'app.tagline':           'A behaviour-driven real-time game multiverse',

        'hud.stats':             'Player',
        'hud.dim':               'Current Dimension',
        'hud.console':           'Console',
        'hud.level':             'Lv',
        'hud.gold':              'Gold',
        'hud.gem':               'Gem',
        'hud.energy':            'Energy',

        'epoch.title':           'Epoch',
        'epoch.collapse':        'Trigger the Great Collapse',
        'epoch.next':            'Enter Epoch {n}',

        'tut.step':              'Step {n}',
        'tut.remaining':         '{n} steps left',
        'tut.skip':              'Skip tutorial',
        'tut.complete':          'Tutorial complete!',

        'inv.title':             'Inventory',
        'inv.empty':             'Empty',
        'inv.use':               'Use',
        'inv.drop':              'Drop',

        'scene.enter':           'Enter dimension',
        'scene.event':           'World event',
        'scene.dsl':             'Meme → DSL',
        'scene.collapse':        'Collapse',
        'scene.complete':        'Complete run',
        'scene.save':            'Save',
        'scene.load':            'Load',
        'scene.talk':            'Talk',

        'npc.greeting':          'Hello',
        'npc.farewell':          'Goodbye',

        'audio.mute':            'Mute',
        'audio.unmute':          'Unmute',

        'settings.title':        'Settings',
        'settings.audio':        'Audio',
        'settings.difficulty':   'Difficulty',
        'settings.language':      'Language',
        'settings.diff.easy':    'Easy',
        'settings.diff.normal':  'Normal',
        'settings.diff.hard':    'Hard',
        'settings.debounce':     'Debounce window',
        'settings.debounce.0':   'Off',
        'settings.debounce.100': '100ms (snappy)',
        'settings.debounce.250': '250ms (fast)',
        'settings.debounce.500': '500ms (default)',
        'settings.debounce.1000':'1000ms',
        'settings.debounce.2000':'2000ms',
        // Round 157 — audio volume
        // presets. 4 buttons in the
        // SettingsPanel volume row.
        'settings.volume':       'Volume',
        'settings.volume.0':     'Off',
        'settings.volume.0.25':  'Low',
        'settings.volume.0.5':   'Med',
        'settings.volume.1':     'High',

        'stats.title':           'Stats',
        'stats.counters':        'Counters',
        'stats.recent':          'Recent',
        'stats.empty':           'No data yet',

        'sys.save.ok':           'Save successful',
        'sys.save.fail':         'Save failed',
        'sys.load.ok':           'Save loaded',
        'sys.load.empty':        'No save to load',
    },
};

const STORAGE_KEY = 'agi_locale';

function detect(): Locale {
    if (typeof navigator === 'undefined') return 'zh-CN';
    const lang = (navigator.language || '').toLowerCase();
    if (lang.startsWith('en')) return 'en-US';
    return 'zh-CN';
}

export class I18n {
    private locale: Locale;
    private listeners: Array<(l: Locale) => void> = [];

    constructor() {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'zh-CN' || stored === 'en-US') {
                this.locale = stored;
            } else {
                this.locale = detect();
            }
        } else {
            this.locale = 'zh-CN';
        }
    }

    getLocale(): Locale { return this.locale; }

    setLocale(l: Locale): void {
        if (this.locale === l) return;
        this.locale = l;
        if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
        }
        for (const fn of this.listeners) fn(l);
    }

    /** Subscribe to locale changes. */
    onChange(fn: (l: Locale) => void): () => void {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    /** Resolve a key to the current locale's string. Falls back to en-US, then to the key. */
    t(key: string, params?: Record<string, string | number>): string {
        const cur = CATALOG[this.locale][key]
            ?? CATALOG['en-US'][key]
            ?? key;
        if (!params) return cur;
        return cur.replace(/\{(\w+)\}/g, (_m, k) => String(params[k] ?? `{${k}}`));
    }
}
