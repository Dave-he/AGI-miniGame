/**
 * KeyboardShortcuts — round 57 in-game keyboard router.
 *
 * The 3D scene + HUD are mouse/touch-driven by default; the main.ts
 * had zero keyboard handlers. This module gives the App a small
 * deterministic routing table so a `keydown` event can be translated
 * into a semantic action that the App can dispatch.
 *
 * The router is pure (no DOM, no Three.js, no App import) so it
 * stays unit-testable in jsdom.
 *
 * Bindings (round 57):
 *   1 — enter match3
 *   2 — enter tower_defense
 *   3 — enter card
 *   4 — enter puzzle
 *   5 — enter parkour
 *   6 — enter turn_combat
 *   7 — enter synthesis
 *   8 — enter shooting
 *   Esc     — abandon current dimension
 *   Space   — re-roll a fresh random dimension
 *            (round 96: ev.key ' ', 'Space' doc label,
 *             'Spacebar' legacy alias all route)
 *   ?       — toggle help overlay
 *   S       — save game
 *   L       — load game
 *   E       — roll a world event
 *   R       — rollback to last good state (round 85)
 *   `/~     — toggle DM God console (round 91)
 *   P       — toggle settings overlay (round 112)
 *   Q       — toggle stats panel (round 113)
 *   W       — toggle progression panel (round 113)
 *   T       — toggle tutorial overlay (round 114)
 *   F       — toggle vault panel (round 114)
 *   M       — toggle NPC mind panel (round 114)
 *   V       — toggle achievements panel (round 115)
 *   B       — toggle biome library panel (round 119)
 *   G       — toggle DM God console panel (round 121, keyboard counterpart to round-66 `btn-god`)
 *   N       — toggle economy panel (round 121, N = Numbers = currencies)
 *   O       — toggle epoch panel (round 121, O = the 3rd remaining panel-toggle key)
 *
 * Anything else is ignored (returns `null`). The mapping is locked
 * by the index.html help overlay and the 8-portal palette in
 * `SceneManager.PORTAL_PALETTE` — keep the two in sync.
 */

export type KeyboardAction =
    | { kind: 'enter-atom'; atomId: string; index: number }
    | { kind: 'abandon' }
    | { kind: 'reroll' }
    | { kind: 'toggle-help' }
    | { kind: 'save' }
    | { kind: 'load' }
    | { kind: 'event' }
    | { kind: 'rollback' }
    | { kind: 'toggle-dm-console' }
    | { kind: 'toggle-settings' }
    | { kind: 'toggle-stats' }
    | { kind: 'toggle-progression' }
    | { kind: 'toggle-vault' }
    | { kind: 'toggle-npc-mind' }
    | { kind: 'toggle-tutorial' }
    | { kind: 'toggle-achievements' }
    | { kind: 'toggle-biome-library' }
    | { kind: 'toggle-god-console-panel' }
    | { kind: 'toggle-economy' }
    | { kind: 'toggle-epoch' }
    // Round 128 — D key toggles the
    // DebugOverlay panel
    // (`#debug-overlay-root`). The
    // panel shows the 4
    // `ActionDebouncer` instances'
    // runtime state (window / ms
    // since last stamp / is the
    // debouncer currently
    // swallowing calls). The D
    // mnemonic stands for "Debug"
    // — the panel is meant for
    // QA + dev debugging, not
    // regular players. The Q key
    // already shows round-40
    // StatsPanel (the player-
    // facing aggregate stats),
    // so D is the developer-
    // facing counterpart.
    | { kind: 'toggle-debug-overlay' };

/**
 * 8 portal atomIds in display order — the same order used by
 * `SceneManager.PORTAL_PALETTE` and the on-screen ring of cubes.
 * Indices are 0-based and the number keys 1..8 map to (index + 1).
 */
export const PORTAL_ATOMS: readonly string[] = [
    'match3',       // 1
    'tower_defense',// 2
    'card',         // 3
    'puzzle',       // 4
    'parkour',      // 5
    'turn_combat',  // 6
    'synthesis',    // 7
    'shooting',     // 8
];

/**
 * Canonical one-line description for each binding — rendered in
 * the help overlay and used by tests.
 */
export const BINDING_DESCRIPTIONS: ReadonlyArray<{ key: string; action: string }> = [
    { key: '1', action: '进入 match3 (三消)' },
    { key: '2', action: '进入 tower_defense (塔防)' },
    { key: '3', action: '进入 card (卡牌)' },
    { key: '4', action: '进入 puzzle (解谜)' },
    { key: '5', action: '进入 parkour (跑酷)' },
    { key: '6', action: '进入 turn_combat (回合战斗)' },
    { key: '7', action: '进入 synthesis (合成)' },
    { key: '8', action: '进入 shooting (射击)' },
    { key: 'Esc',  action: '放弃当前维度' },
    { key: 'Space', action: '重 roll 一个随机维度' },
    { key: '?',    action: '切换帮助浮层' },
    { key: 'S',    action: '保存游戏' },
    { key: 'L',    action: '读取存档' },
    { key: 'E',    action: '触发一次世界事件' },
    { key: 'R',    action: '回滚到上次成功的状态' },
    // Round 91 — the backtick/tilde key toggles the DM
    // God console. The DM console is the entry point for
    // `dm run <cmd>` lines that drive the round-66
    // `onDimension` callback (and the round-87
    // `setLastBiomeAccent` wiring it transitively
    // triggers). Showing `~/`` in the help overlay as a
    // single entry reflects that the two key outputs
    // share the same physical key — `ev.key` is `` ` ``
    // unshifted and `~` shifted, but both are routed
    // to the same action.
    //
    // Round 95 — the `key` field is `'`/~'` (slash-
    // separated) rather than just `'`` so the help
    // overlay visibly documents both shift-states.
    // Pre-round-95 the rendered text was just `'``,
    // and a player reading the help overlay would
    // not know that `~` is also accepted. The
    // round-91 alias relationship is now visible at
    // the contract level — the `routeKey` switch
    // still handles `'`` and `~` independently, and
    // the BINDING_DESCRIPTIONS entry documents both.
    { key: '`/~',  action: '切换 DM God 控制台' },
    // Round 112 — the P key toggles the
    // settings overlay. This is the
    // keyboard counterpart to the
    // round-111 SettingsPanel — a panel
    // that lives in the DOM at
    // `<div id="settings-root">` but is
    // hidden by default (no inline
    // button opens it). The P shortcut
    // is the primary way to open it
    // (the help overlay will be the
    // secondary way once a "Settings"
    // row is wired into the controls
    // bar — round-112 also adds the
    // button alongside the P key).
    { key: 'P',    action: '打开设置 (声音 / 语言 / 防抖窗口)' },
    // Round 113 — the Q key toggles
    // the stats panel (`#stats-root`,
    // populated by round-63/64's
    // StatsPanel). Stats is the
    // small debugging overlay that
    // shows Analytics counters +
    // recent events. QWERTY order
    // P / Q / W keeps the toggle
    // shortcuts grouped together
    // (P = settings, Q = stats,
    // W = progression).
    { key: 'Q',    action: '切换统计面板' },
    // Round 113 — the W key toggles
    // the progression panel
    // (`#progression-root`, populated
    // by round-65's ProgressionUI).
    // Progression is the core
    // gameplay panel (XP bar +
    // talent tree) — always visible
    // by default; W hides it for
    // screenshot / focus mode.
    { key: 'W',    action: '切换进度面板' },
    // Round 114 — the F / M / T
    // shortcuts complete the
    // panel-toggle group. The keys
    // are intentionally spread out
    // (F / M / T not adjacent) so
    // the muscle memory doesn't
    // conflict with the P / Q / W
    // row from round-112/113.
    //
    //   T = tutorial
    //   F = vault (round-20 vault
    //       panel showing past
    //       dimension visits)
    //   M = NPC mind (round-21
    //       panel showing the
    //       collective NPC
    //       disposition + per-NPC
    //       memory)
    //
    // The tutorial panel is shown
    // on-demand by the App (via
    // `tutorial.notify` calls) and
    // stays visible after a player
    // dismisses its notifications.
    // The T shortcut lets the
    // player re-open the
    // notification history
    // (read-only — TutorialOverlay
    // tracks its own visibility
    // state, so T is a manual
    // toggle rather than a
    // notify trigger).
    { key: 'T',    action: '切换教程面板' },
    { key: 'F',    action: '切换档案库面板' },
    { key: 'M',    action: '切换 NPC 心智面板' },
    // Round 115 — the V key toggles
    // the achievements panel
    // (`#achievements-root`). The
    // achievements list is sourced
    // from `PlayerProfile.achievements`
    // (a `string[]` of unlocked
    // achievement ids, populated
    // via `addAchievement(id)`).
    // V is a single-letter
    // shortcut in the row beneath
    // the round-112/113 P/Q/W
    // group + the round-114 T/F/M
    // group — same case-insensitive
    // mirror convention
    // (lowercase + shifted both
    // route to the same action).
    { key: 'V',    action: '切换成就面板' },
    // Round 119 — the B key toggles
    // the biome library panel
    // (`#biome-library-root`).
    // The panel shows the 6
    // biomes (cyberpunk / forest
    // / desert / ice / space /
    // dungeon) from
    // `WfcBiomes.BIOMES` with
    // the current biome
    // highlighted. The B key
    // extends the 7-key
    // round-112-115 panel-
    // toggle group to 8 keys.
    { key: 'B',    action: '切换生物群系图鉴' },
    // Round 121 — the G key
    // toggles the DM God
    // console panel
    // (`#god-root`). This is
    // the keyboard counterpart
    // to the round-66 `btn-god`
    // button. The God console
    // is the entry point for
    // `dm run <cmd>` lines that
    // drive the round-66
    // onDimension callback (and
    // the round-87
    // setLastBiomeAccent
    // wiring). The G key is a
    // separate panel-toggle
    // action from the round-91
    // `~/`` key (which toggles
    // the same panel but was
    // registered as a distinct
    // keyboard action —
    // `toggle-dm-console` —
    // because the round-91
    // backtick alias predates
    // the round-117 panel-toggle
    // helper). The G key
    // routes to a fresh
    // `toggle-god-console-panel`
    // kind that reuses the
    // round-117 `togglePanel`
    // helper, so the log
    // message format matches
    // the other 10 panel-toggle
    // keys.
    { key: 'G',    action: '切换 DM God 控制台面板' },
    // Round 121 — the N key
    // toggles the economy
    // panel (`#economy-root`).
    // The economy panel shows
    // currencies (gold / gems
    // / dust) + inventory
    // counts (the round-25
    // EconomyPanel). The N
    // mnemonic stands for
    // "Numbers" — the panel
    // shows numerical currency
    // counts. N is a free
    // letter key (E is taken
    // by `roll world event`,
    // L by `load game`, etc.)
    // and is in the QWERTY
    // row beneath the
    // round-112-115 P/Q/W/T/F/M
    // group.
    { key: 'N',    action: '切换经济面板' },
    // Round 121 — the O key
    // toggles the epoch
    // panel (`#epoch-root`).
    // The epoch panel shows
    // the current epoch
    // number + epoch name +
    // epoch rules added via
    // `epoch.addRule()` (the
    // round-65 EpochPanel). O
    // is the 3rd new
    // panel-toggle key in the
    // round-121 batch (along
    // with G and N). The O
    // letter doesn't have a
    // strong mnemonic fit for
    // "epoch" but is a free
    // QWERTY key + completes
    // the 11-key panel-toggle
    // group with the 3
    // always-on HUD-tier
    // panels that lacked a
    // keyboard shortcut
    // (god-console / economy
    // / epoch).
    { key: 'O',    action: '切换纪元面板' },
    // Round 128 — the D key
    // toggles the DebugOverlay
    // panel (`#debug-overlay-root`).
    // The panel shows the 4
    // ActionDebouncer instances'
    // runtime state — which
    // debouncer is currently
    // blocking, how long since
    // the last stamp, current
    // window size. Developer +
    // QA tool, not for regular
    // players (the Q key's
    // StatsPanel is the
    // player-facing aggregate
    // stats counterpart).
    { key: 'D',    action: '切换调试信息面板 (4 个防抖器)' },
];

/**
 * Round 120 — concentrated
 * panel-toggle subset of
 * `BINDING_DESCRIPTIONS`. The
 * 8 keys that toggle the
 * always-visible + on-demand
 * panel overlays (rounds
 * 112-119) are listed here
 * separately so the help
 * overlay (rendered when
 * the player presses `?`)
 * can show them in a
 * dedicated visually-
 * distinct section. The
 * player can scan the
 * 8-row block instead of
 * hunting through the full
 * 24-row `BINDING_DESCRIPTIONS`
 * list.
 *
 * Round 121 — extended from
 * 8 to 11 keys to include
 * the G / N / O keys for
 * the god-console / economy
 * / epoch panels (the 3
 * always-on HUD-tier
 * panels that lacked a
 * keyboard shortcut). The
 * 3 new keys round out
 * the 11-key panel-toggle
 * group to cover every
 * always-visible + on-demand
 * panel in the HUD.
 *
 * The 11 keys are the
 * round-112-121 panel-toggle
 * shortcuts in QWERTY
 * order. The labels are
 * short (one Chinese word
 * + 1-2 descriptors) so the
 * section reads as a
 * quick-reference card.
 *
 * Round 128 — extended from
 * 11 to 12 keys to include
 * the D key for the
 * DebugOverlay panel (the
 * developer + QA overlay
 * showing the 4
 * ActionDebouncer instances'
 * runtime state). D is a
 * natural mnemonic for
 * "Debug" + a free QWERTY
 * key. 12-key panel-toggle
 * group is now complete.
 *
 * Kept in `KeyboardShortcuts.ts`
 * (rather than `main.ts`)
 * so the contract is
 * co-located with the
 * source-of-truth routing
 * table. Any future toggle
 * addition would add one
 * row here + the
 * corresponding BINDING_DESCRIPTIONS
 * row.
 */
export const PANEL_TOGGLE_DESCRIPTIONS: ReadonlyArray<{ key: string; action: string }> = [
    { key: 'P', action: '设置 (声音/语言/防抖窗口)' },
    { key: 'Q', action: '统计面板' },
    { key: 'W', action: '进度面板' },
    { key: 'T', action: '教程面板' },
    { key: 'F', action: '档案库面板' },
    { key: 'M', action: 'NPC 心智面板' },
    { key: 'V', action: '成就面板' },
    { key: 'B', action: '生物群系图鉴' },
    { key: 'G', action: 'DM God 控制台' },
    { key: 'N', action: '经济面板 (货币/库存)' },
    { key: 'O', action: '纪元面板' },
    { key: 'D', action: '调试信息面板 (4 防抖器)' },
];

/**
 * Round 59 — mouse / pointer bindings, rendered as a second
 * section in the help overlay (separated from the keyboard list
 * by a visual divider). These are not routed by `routeKey` —
 * they're a documentation-only surface so the player knows the
 * pointer can do more than the visible HUD buttons suggest.
 */
export const MOUSE_BINDINGS: ReadonlyArray<{ key: string; action: string }> = [
    { key: '左键点击 portal', action: '进入该 portal 对应 atom' },
    { key: '左键点击 NPC',    action: '与 NPC 对话 / 触发 NPC 事件' },
    { key: '左键点击 HUD 按钮', action: '触发对应操作 (进入 / 失败 / 事件 / 模因…)' },
    { key: '鼠标滚轮',         action: '缩放 orbit 相机 (round 58)' },
    { key: '左键拖动 canvas',  action: '移动相机视角 (相机平移)' },
];

/**
 * Translate a single keydown into a semantic action. Returns null
 * when the key is not bound so callers can decide what to do
 * (typically: ignore, or let the event bubble to the browser).
 *
 * @param key The KeyboardEvent.key string. Pass already-normalized
 *           input — the function does not handle layout-specific
 *           variants.
 */
export function routeKey(key: string): KeyboardAction | null {
    // Digit row — 1..8 → portal entry.
    if (key >= '1' && key <= '8') {
        const idx = parseInt(key, 10) - 1;
        const atomId = PORTAL_ATOMS[idx];
        if (atomId) {
            return { kind: 'enter-atom', atomId, index: idx };
        }
    }
    switch (key) {
        case 'Escape':
        case 'Esc':
            return { kind: 'abandon' };
        // Round 96 — the spacebar ev.key is a literal
        // ' ' character, but BINDING_DESCRIPTIONS
        // displays the human-readable label 'Space'.
        // We accept all three forms (' ', 'Space',
        // 'Spacebar') so the round-95 reverse
        // coverage test can pin every BINDING_DESCRIPTIONS
        // row as routable. The 'Space' case is never
        // triggered in modern browsers (ev.key is
        // always ' ') but it closes the documentation-
        // vs-ev.key contract gap.
        case ' ':
        case 'Space':
        case 'Spacebar':
            return { kind: 'reroll' };
        case '?':
            return { kind: 'toggle-help' };
        case 's':
        case 'S':
            return { kind: 'save' };
        case 'l':
        case 'L':
            return { kind: 'load' };
        case 'e':
        case 'E':
            return { kind: 'event' };
        case 'r':
        case 'R':
            return { kind: 'rollback' };
        // Round 91 — backtick/tilde toggles the DM God
        // console. Both `ev.key` outputs (` and ~) route
        // to the same action so the player doesn't have
        // to remember which keyboard layout shift-state
        // they're in. The DM console is the entry point
        // for `dm run <cmd>` lines that drive the
        // round-66 onDimension callback + round-87
        // setLastBiomeAccent wiring.
        case '`':
        case '~':
            return { kind: 'toggle-dm-console' };
        // Round 112 — the P key toggles
        // the settings overlay. The
        // shortcut is the primary way
        // to open the round-111
        // SettingsPanel since the panel
        // has no inline button by
        // default. Both 'p' and 'P' are
        // routed (case-insensitive) to
        // match the round-85 R / round-91
        // ` convention.
        case 'p':
        case 'P':
            return { kind: 'toggle-settings' };
        // Round 113 — Q key toggles
        // the stats panel. Both
        // lowercase 'q' and shifted
        // 'Q' route to the same
        // action (case-insensitive
        // mirror of round-85 R /
        // round-91 ` / round-112 P).
        case 'q':
        case 'Q':
            return { kind: 'toggle-stats' };
        // Round 113 — W key toggles
        // the progression panel.
        // Same case-insensitive
        // convention as Q above.
        case 'w':
        case 'W':
            return { kind: 'toggle-progression' };
        // Round 114 — F / M / T
        // shortcuts. All 3 use
        // case-insensitive
        // mirror convention
        // (lowercase + shifted
        // both route to the
        // same action).
        case 't':
        case 'T':
            return { kind: 'toggle-tutorial' };
        case 'f':
        case 'F':
            return { kind: 'toggle-vault' };
        case 'm':
        case 'M':
            return { kind: 'toggle-npc-mind' };
        // Round 115 — V key toggles
        // the achievements panel.
        // Same case-insensitive
        // mirror convention as
        // T / F / M above.
        case 'v':
        case 'V':
            return { kind: 'toggle-achievements' };
        // Round 119 — B key toggles
        // the biome library panel.
        // Same case-insensitive
        // mirror convention as
        // V above.
        case 'b':
        case 'B':
            return { kind: 'toggle-biome-library' };
        // Round 121 — G key
        // toggles the DM God
        // console panel
        // (`#god-root`). The G
        // key is the keyboard
        // counterpart to the
        // round-66 `btn-god`
        // mouse button. Both
        // routes (G keyboard +
        // btn-god mouse) call
        // `app.toggleGodConsolePanel()`
        // which uses the
        // round-117 `togglePanel`
        // helper. The existing
        // `~/`` key (round-91)
        // still routes to the
        // separate
        // `toggle-dm-console`
        // action that calls
        // `godConsole.toggle()`
        // (the DM console's
        // own visibility
        // method, not the
        // round-117 helper) so
        // the backtick shortcut
        // keeps its
        // pre-round-121 log
        // format. The G key
        // uses the standard
        // `[kb] ${label}已打开`
        // / `[kb] ${label}已关闭`
        // format.
        case 'g':
        case 'G':
            return { kind: 'toggle-god-console-panel' };
        // Round 121 — N key
        // toggles the economy
        // panel (`#economy-root`).
        // The economy panel
        // shows currencies
        // (gold / gems / dust)
        // + inventory counts
        // (the round-25
        // EconomyPanel). N
        // stands for "Numbers".
        case 'n':
        case 'N':
            return { kind: 'toggle-economy' };
        // Round 121 — O key
        // toggles the epoch
        // panel (`#epoch-root`).
        // The epoch panel shows
        // the current epoch
        // number + epoch name +
        // epoch rules added via
        // `epoch.addRule()` (the
        // round-65 EpochPanel).
        case 'o':
        case 'O':
            return { kind: 'toggle-epoch' };
        // Round 128 — D key toggles the
        // DebugOverlay panel
        // (`#debug-overlay-root`). The
        // panel is the developer-facing
        // counterpart to the Q key's
        // StatsPanel — it shows the 4
        // ActionDebouncer instances'
        // runtime state so QA + devs
        // can answer "why didn't my save
        // fire?" without digging through
        // the source. The case-
        // insensitive mirror matches
        // the round-85 R / round-91 `
        // / round-119 B conventions.
        case 'd':
        case 'D':
            return { kind: 'toggle-debug-overlay' };
        default:
            return null;
    }
}
