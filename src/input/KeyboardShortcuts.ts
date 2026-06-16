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
    | { kind: 'toggle-debug-overlay' }
    // Round 132 — Z key toggles
    // the EventLog panel
    // (`#event-log-root`, populated
    // by round-132
    // `renderEventLogPanel`). The
    // panel renders the 50-event
    // ring buffer from
    // `Analytics.recent` — the
    // chronological log of "what
    // just happened in this
    // session" (dimension enter
    // / complete, tutorial step,
    // item use, save, DM
    // commands, WASM latency
    // events, etc). The Z letter
    // was free in the panel-
    // toggle group + sits
    // naturally next to the QWERTY
    // row housing the other
    // toggle keys. This is the
    // 13th entry in the round-131
    // data-driven
    // `PANEL_TOGGLE_BINDINGS`
    // table.
    | { kind: 'toggle-event-log' }
    // Round 133 — K key toggles
    // the DslCodex panel
    // (`#dsl-codex-root`,
    // populated by round-133
    // `renderDslCodexPanel`).
    // The panel renders the
    // AGI's most recently
    // generated / hot-
    // reloaded `DslRule`
    // (the round-15/16
    // `MemeCompiler` output)
    // as a small codex
    // showing the source
    // DSL + the parsed AST
    // breakdown. K is
    // mnemonic-friendly
    // (K for "Codex") +
    // was free in the
    // panel-toggle group
    // (no pre-existing K
    // mapping in routeKey).
    // 14th entry in the
    // round-131 data-
    // driven
    // `PANEL_TOGGLE_BINDINGS`
    // table.
    | { kind: 'toggle-dsl-codex' }
    // Round 137 — I key toggles
    // the Inventory panel
    // (`#inventory-root`,
    // populated by the pre-
    // existing `InventoryUI`
    // module that round 137
    // finally wires into the
    // App). The panel renders
    // the player's current
    // inventory (the round-20
    // Vault's on-hand items)
    // as a list with kind
    // icons + a detail pane
    // with "使用" / "丢弃"
    // action buttons. I is
    // mnemonic for "Inventory"
    // + was free in the panel-
    // toggle group (no pre-
    // existing I mapping in
    // routeKey). The 15th
    // entry in the round-131
    // data-driven
    // `PANEL_TOGGLE_BINDINGS`
    // table. Adding it
    // required exactly 1 row
    // here + 1 entry in the
    // `routeKey` switch + 1
    // entry in the
    // `KeyboardAction` union.
    // Everything else
    // (wrapper method body +
    // bind() entry +
    // BINDING_DESCRIPTIONS
    // row + help-overlay
    // 15th row + mount point
    // + button) follows
    // automatically.
    | { kind: 'toggle-inventory' }
    // Round 152 — toggle the round-152 HUD compact
    // mode. The `H` key flips the `compact` flag on
    // the HUD's state (the per-row detail lists in
    // the round-51 memories block collapse to
    // headlines only). Unlike the panel-toggle
    // family, `toggle-hud-compact` does NOT mount
    // or unmount a `<div>` — the HUD's render is
    // idempotent on `compact` so the toggle is
    // cheap (one boolean flip + re-render).
    | { kind: 'toggle-hud-compact' }
    // Round 153 — toggle the round-153 HUD fade
    // mode. The `J` key flips the `hudFadeEnabled`
    // flag; the `.hud-stats` panel then auto-fades
    // to 0.25 opacity after `hudFadeIdleMs` of
    // key/click inactivity. Like round-152's
    // `toggle-hud-compact`, this is a strict
    // boolean flip + re-render — no DOM mount /
    // unmount, no panel toggle. Note: `F` is
    // already taken by the round-21 vault
    // toggle, so we use `J` (the next free
    // letter after H).
    | { kind: 'toggle-hud-fade' }
    // Round 154 — cycle the HUD corner
    // through the 4-corner sequence
    // `tl → tr → br → bl → tl`. C is the
    // next free letter after J (which
    // round 153 bound to fade); K is
    // already taken by the round-130 DSL
    // codex toggle. C reads as "Corner".
    // One keystroke picks a new corner —
    // no sub-menu needed.
    | { kind: 'cycle-hud-corner' }
    // Round 155 — toggle the always-on-top
    // pin flag. When enabled, the
    // `#hud-root` z-index jumps from
    // 10 → 10000 so the HUD stays
    // clickable above fullscreen
    // Three.js canvases. X reads as
    // "eXtra on top" / "X-ray" (see
    // through the scene). One keystroke
    // — no sub-menu needed.
    | { kind: 'toggle-hud-pinned' }
    // Round 156 — toggle HUD click-through
    // mode. When enabled, the `#hud-root`
    // gets `pointer-events: none` so
    // mouse clicks on the HUD area pass
    // through to the 3D scene beneath.
    // The HUD remains visible (read-only)
    // — companion to round-155 pin:
    // pinned controls stacking (HUD stays
    // above scene), click-through controls
    // interaction (scene stays clickable
    // through HUD). They can be enabled
    // together. Y is the next free letter
    // after X (which round 155 bound to
    // pin). Y reads as "bYpass".
    | { kind: 'toggle-hud-click-through' };

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
    // Round 132 — the Z key
    // toggles the EventLog
    // panel
    // (`#event-log-root`).
    // The panel renders
    // the 50-event ring
    // buffer from
    // `Analytics.recent` —
    // the chronological
    // log of "what just
    // happened in this
    // session". The Z key
    // is the 13th panel-
    // toggle in the
    // round-131 data-driven
    // `PANEL_TOGGLE_BINDINGS`
    // table. Z is mnemonic-
    // friendly (was free
    // in the panel-toggle
    // group, no pre-
    // existing Z mapping
    // in routeKey).
    { key: 'Z',    action: '切换事件日志面板 (50 条最近事件)' },
    // Round 133 — the K key
    // toggles the DslCodex
    // panel
    // (`#dsl-codex-root`).
    // The panel renders
    // the AGI's most
    // recently generated
    // / hot-reloaded
    // `DslRule` (the
    // round-15/16
    // `MemeCompiler`
    // output) as a
    // codex. K is
    // mnemonic-friendly
    // (K for "Codex")
    // + was free in the
    // panel-toggle group.
    // The 14th entry in
    // the round-131 data-
    // driven
    // `PANEL_TOGGLE_BINDINGS`
    // table.
    { key: 'K',    action: '切换 DSL 法典面板 (最近生成的规则)' },
    // Round 137 — I key toggles
    // the Inventory panel
    // (`#inventory-root`,
    // populated by the pre-
    // existing `InventoryUI`
    // module that round 137
    // finally wires into the
    // App). The 15th panel-
    // toggle in the
    // round-131 data-driven
    // `PANEL_TOGGLE_BINDINGS`
    // table. I is mnemonic
    // for "Inventory" + was
    // free in the panel-toggle
    // group (no pre-existing
    // I mapping in routeKey).
    { key: 'I',    action: '切换背包面板 (使用/丢弃物品)' },
    // Round 152 — H key toggles HUD compact mode.
    // Hides the per-row detail lists in the
    // round-51 memories block (WASM latency
    // per-fn lines, event-chain timeline,
    // debouncer mini-strip countdowns). The
    // compact flag persists in localStorage so
    // it survives page reloads. The `H` key
    // was chosen because all other single
    // letters (P/Q/W/T/R/V/B/N/D/Z/K/I) are
    // already taken by panel-toggles.
    { key: 'H',    action: '切换 HUD 紧凑模式 (隐藏记忆块明细)' },
    // Round 153 — J key toggles HUD fade mode.
    // After 3s of key/click inactivity, the
    // round-1 stats panel fades to 0.25
    // opacity (and snaps back to 1.0 on any
    // input). F reads as "Fade" and was the
    // next free letter after H. The fade
    // flag persists in localStorage so it
    // survives page reloads.
    { key: 'J',    action: '切换 HUD 淡出模式 (空闲 3s 后隐藏)' },
    // Round 154 — C key cycles the HUD
    // through the 4-corner sequence
    // (top-left → top-right → bottom-right
    // → bottom-left → top-left). Lets
    // right-handed / left-handed /
    // one-handed-mobile players pick the
    // corner that doesn't occlude their
    // mouse or dominant-hand finger. The
    // preference persists in localStorage
    // (`agi_hud_corner`) so it survives
    // page reloads. (K is taken by the
    // round-130 DSL codex toggle; C reads
    // as "Corner".)
    { key: 'C',    action: '切换 HUD 角落 (左上 → 右上 → 右下 → 左下)' },
    // Round 155 — X key toggles the
    // always-on-top pin flag. When
    // enabled, the HUD z-index jumps
    // from 10 to 10000 so the panel
    // stays clickable above fullscreen
    // Three.js canvases (操控性好 — the
    // player can keep an eye on stats
    // even when a fullscreen scene
    // claims pointer-events). The
    // preference persists in
    // localStorage (`agi_hud_pinned`)
    // so it survives page reloads.
    { key: 'X',    action: '切换 HUD 置顶 (z-index 跳到 10000 防被覆盖)' },
    // Round 156 — Y key toggles HUD
    // click-through mode. When enabled,
    // mouse clicks on the HUD area pass
    // through to the 3D scene beneath
    // (HUD stays visible but read-only).
    // Companion to X: pinned controls
    // stacking (HUD above scene), click
    // through controls interaction
    // (scene clickable through HUD).
    // Both can be enabled together for a
    // see-everything-and-click-everything
    // layout. The preference persists in
    // localStorage (`agi_hud_click_through`)
    // so it survives page reloads.
    { key: 'Y',    action: '切换 HUD 穿透 (pointer-events: none 透传至场景)' },
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
 *
 * Round 131 — the 12-row
 * list is now a projection
 * of the new
 * `PANEL_TOGGLE_BINDINGS`
 * table (the single source
 * of truth for the
 * 12 panel-toggle keys:
 * keyboard letter + DOM id
 * + log label + help-section
 * action + method name +
 * mouse-button id). The
 * table is what the App
 * uses to (1) wire its 12
 * `toggleX()` 1-line wrapper
 * methods, (2) bind the 12
 * mouse buttons, and
 * (3) derive this help-
 * section projection. Any
 * future toggle addition
 * (round-131+ follow-up
 * candidates like Z / K /
 * I keys) now adds ONE row
 * to `PANEL_TOGGLE_BINDINGS`
 * and the rest of the
 * surface follows.
 */
export interface PanelToggleBinding {
    /** Keyboard letter (e.g. 'P'). Routes through routeKey() case-insensitively. */
    key: string;
    /** KeyboardAction `kind` string (e.g. 'toggle-settings'). Used by panelToggleMethodByKind. */
    kind: string;
    /** DOM id of the panel's mount point (e.g. 'settings-root'). Used by togglePanel(rootId, ...). */
    panelId: string;
    /** Chinese log label used in the open/close log line (e.g. '设置浮层'). */
    label: string;
    /** Short action text shown in the 3rd help-overlay section (e.g. '设置 (声音/语言/防抖窗口)'). */
    action: string;
    /** Public method name on the App class (e.g. 'toggleSettings'). */
    methodName: string;
    /** Mouse-button DOM id (e.g. 'btn-settings'). Used by the bootstrap bind() loop. */
    buttonId: string;
}

/**
 * Round 131 — single source of truth for the
 * 12 panel-toggle keyboard shortcuts + their
 * corresponding mouse buttons. The 12 wrapper
 * methods on App, the 12 bind() calls in the
 * bootstrap, and `PANEL_TOGGLE_DESCRIPTIONS`
 * are all derived from this table.
 *
 * Adding a new panel-toggle (round-131+
 * follow-up) means adding one row here +
 * the corresponding `routeKey` switch case +
 * the corresponding `KeyboardAction` union
 * member (TypeScript unions can't be generated
 * from runtime data). Everything else flows
 * automatically.
 *
 * The 12 entries are intentionally in QWERTY
 * order (P / Q / W / T / F / M / V / B / G / N
 * / O / D) so a `find()` lookup is fast and
 * a future `keyof PanelToggleBinding[]` index
 * is deterministic. Round 120 / 121 / 128
 * 8 / 11 / 12-key growth is reflected here.
 */
export const PANEL_TOGGLE_BINDINGS: ReadonlyArray<PanelToggleBinding> = [
    // P — settings (round 111 + 112)
    { key: 'P', kind: 'toggle-settings',          panelId: 'settings-root',      label: '设置浮层',         action: '设置 (声音/语言/防抖窗口)', methodName: 'toggleSettings',         buttonId: 'btn-settings' },
    // Q — stats (round 63/64 + 113)
    // Note: kind 'toggle-stats' but method name has extra 'Panel' suffix
    // — the explicit `kind` field in the table makes the (kind → method)
    // mapping data, not derived string-munging.
    { key: 'Q', kind: 'toggle-stats',             panelId: 'stats-root',         label: '统计面板',         action: '统计面板',                  methodName: 'toggleStatsPanel',       buttonId: 'btn-stats' },
    // W — progression (round 65 + 113)
    { key: 'W', kind: 'toggle-progression',       panelId: 'progression-root',   label: '进度面板',         action: '进度面板',                  methodName: 'toggleProgression',      buttonId: 'btn-progression' },
    // T — tutorial (round 86+ + 114)
    { key: 'T', kind: 'toggle-tutorial',          panelId: 'tutorial-root',      label: '教程浮层',         action: '教程面板',                  methodName: 'toggleTutorial',         buttonId: 'btn-tutorial' },
    // F — vault (round 20 + 114)
    { key: 'F', kind: 'toggle-vault',             panelId: 'vault-root',         label: '档案库面板',       action: '档案库面板',                methodName: 'toggleVault',            buttonId: 'btn-vault' },
    // M — NPC mind (round 21 + 114)
    { key: 'M', kind: 'toggle-npc-mind',         panelId: 'npc-mind-root',      label: 'NPC 心智面板',    action: 'NPC 心智面板',              methodName: 'toggleNpcMind',          buttonId: 'btn-npc-mind' },
    // V — achievements (round 22 + 115)
    { key: 'V', kind: 'toggle-achievements',     panelId: 'achievements-root',  label: '成就面板',         action: '成就面板',                  methodName: 'toggleAchievements',     buttonId: 'btn-achievements' },
    // B — biome library (round 23 + 119)
    { key: 'B', kind: 'toggle-biome-library',    panelId: 'biome-library-root', label: '生物群系图鉴',     action: '生物群系图鉴',              methodName: 'toggleBiomeLibrary',     buttonId: 'btn-biome-library' },
    // G — DM God console panel (round 66 + 121)
    { key: 'G', kind: 'toggle-god-console-panel',panelId: 'god-root',           label: 'DM God 控制台',   action: 'DM God 控制台',             methodName: 'toggleGodConsolePanel',  buttonId: 'btn-god-panel' },
    // N — economy (round 25 + 121)
    { key: 'N', kind: 'toggle-economy',          panelId: 'economy-root',       label: '经济面板',         action: '经济面板 (货币/库存)',     methodName: 'toggleEconomy',          buttonId: 'btn-economy' },
    // O — epoch (round 65 + 121)
    { key: 'O', kind: 'toggle-epoch',            panelId: 'epoch-root',         label: '纪元面板',         action: '纪元面板',                  methodName: 'toggleEpoch',            buttonId: 'btn-epoch' },
    // D — debug overlay (round 128)
    { key: 'D', kind: 'toggle-debug-overlay',    panelId: 'debug-overlay-root', label: '调试信息',         action: '调试信息面板 (4 防抖器)',  methodName: 'toggleDebugOverlay',     buttonId: 'btn-debug-overlay' },
    // Round 132 — Z key toggles
    // the EventLog panel
    // (`#event-log-root`,
    // populated by round-132
    // `renderEventLogPanel`).
    // The panel renders the
    // 50-event ring buffer
    // from `Analytics.recent`
    // — the chronological
    // log of "what just
    // happened in this
    // session" (dimension
    // enter / complete,
    // tutorial step, item
    // use, save, DM
    // commands, WASM
    // latency events, etc).
    // Z is mnemonic-friendly
    // — the Z letter was
    // free in the panel-
    // toggle group (no
    // pre-existing Z mapping
    // in routeKey), and
    // Z sits naturally next
    // to the QWERTY row
    // housing the other
    // toggle keys. This
    // is the 13th entry in
    // the round-131 data-
    // driven `PANEL_TOGGLE_BINDINGS`
    // table — adding it
    // required exactly 1
    // row here + 1 entry in
    // the `routeKey` switch
    // + 1 entry in the
    // `KeyboardAction` union
    // (TypeScript unions
    // can't be generated
    // from runtime data).
    // Everything else
    // (wrapper method body
    // + bind() entry +
    // BINDING_DESCRIPTIONS
    // row + help-overlay
    // 13th row + mount point
    // + button) follows
    // automatically.
    { key: 'Z', kind: 'toggle-event-log',        panelId: 'event-log-root',     label: '事件日志',         action: '事件日志面板 (50 条最近事件)', methodName: 'toggleEventLog',         buttonId: 'btn-event-log' },
    // Round 133 — K key toggles
    // the DslCodex panel
    // (`#dsl-codex-root`,
    // populated by round-133
    // `renderDslCodexPanel`).
    // The panel renders the
    // AGI's most recently
    // generated / hot-
    // reloaded `DslRule`
    // (the round-15/16
    // `MemeCompiler` output)
    // as a small codex
    // showing the source DSL
    // + the parsed AST
    // breakdown. K is
    // mnemonic-friendly
    // (K for "Codex") +
    // the K letter was
    // free in the panel-
    // toggle group. The
    // status badge in the
    // title surfaces the
    // round-48 hot-reload
    // outcome (accepted /
    // rejected by
    // frequency-limit /
    // format-error). This
    // is the 14th entry in
    // the round-131 data-
    // driven `PANEL_TOGGLE_BINDINGS`
    // table. Adding it
    // required exactly 1
    // row here + 1 entry
    // in the `routeKey`
    // switch + 1 entry in
    // the `KeyboardAction`
    // union. Everything
    // else (wrapper method
    // body + bind() entry
    // + BINDING_DESCRIPTIONS
    // row + help-overlay
    // 14th row + mount
    // point + button)
    // follows automatically.
    { key: 'K', kind: 'toggle-dsl-codex',        panelId: 'dsl-codex-root',     label: 'DSL 法典',         action: 'DSL 法典面板 (最近生成的规则)', methodName: 'toggleDslCodex',         buttonId: 'btn-dsl-codex' },
    // Round 137 — I key toggles
    // the Inventory panel
    // (`#inventory-root`,
    // populated by the pre-
    // existing `InventoryUI`
    // module that round 137
    // finally wires into the
    // App). The panel renders
    // the player's on-hand
    // items with kind icons
    // (🧪 consumable /
    // ⚔️ equipment /
    // 🔑 key /
    // 📜 lore /
    // 💰 currency) +
    // a detail pane with
    // "使用" / "丢弃"
    // action buttons. The
    // pre-existing
    // `InventoryUI.use()`
    // method handles the
    // "use" semantics for
    // each kind (consumable
    // → heal, key → place-
    // specific, currency
    // → not directly
    // usable, etc). I is
    // mnemonic for
    // "Inventory" + was
    // free in the panel-
    // toggle group (no
    // pre-existing I
    // mapping in routeKey).
    // This is the 15th
    // entry in the
    // round-131 data-
    // driven
    // `PANEL_TOGGLE_BINDINGS`
    // table — the data-
    // driven pattern has
    // now been triple-
    // validated (rounds
    // 132 + 133 + 137 all
    // added their panel-
    // toggles with exactly
    // 1 row here + 1
    // routeKey case + 1
    // KeyboardAction union
    // member, no other
    // wiring).
    { key: 'I', kind: 'toggle-inventory',        panelId: 'inventory-root',     label: '背包面板',         action: '背包面板 (使用/丢弃物品)',  methodName: 'toggleInventory',        buttonId: 'btn-inventory' },
];

/**
 * Round 131 — `PANEL_TOGGLE_DESCRIPTIONS` is
 * now a projection of `PANEL_TOGGLE_BINDINGS`.
 * Kept as a separate `const` (not just an
 * `export const … = …`) so the existing
 * imports in main.ts + main.test.ts continue
 * to work without churn. The shape (`{ key,
 * action }`) is preserved so the round-120 /
 * 121 / 128 reverse-coverage tests still pass.
 */
export const PANEL_TOGGLE_DESCRIPTIONS: ReadonlyArray<{ key: string; action: string }> =
    PANEL_TOGGLE_BINDINGS.map((b) => ({ key: b.key, action: b.action }));

/**
 * Round 131 — fast O(1) lookup helpers for
 * `PANEL_TOGGLE_BINDINGS`. The map keys are
 * case-folded so case-insensitive lookups
 * (matching the routeKey 'p' | 'P' contract)
 * work without a scan.
 */
const PANEL_TOGGLE_BINDINGS_BY_KEY: ReadonlyMap<string, PanelToggleBinding> =
    new Map(PANEL_TOGGLE_BINDINGS.map((b) => [b.key.toLowerCase(), b] as const));

const PANEL_TOGGLE_BINDINGS_BY_METHOD: ReadonlyMap<string, PanelToggleBinding> =
    new Map(PANEL_TOGGLE_BINDINGS.map((b) => [b.methodName, b] as const));

const PANEL_TOGGLE_BINDINGS_BY_BUTTON: ReadonlyMap<string, PanelToggleBinding> =
    new Map(PANEL_TOGGLE_BINDINGS.map((b) => [b.buttonId, b] as const));

/**
 * Round 131 — look up a panel-toggle binding
 * by its keyboard letter. Case-insensitive
 * (matches routeKey's case-insensitive
 * routing). Returns undefined for unknown
 * keys.
 */
export function panelToggleBindingByKey(key: string): PanelToggleBinding | undefined {
    return PANEL_TOGGLE_BINDINGS_BY_KEY.get(key.toLowerCase());
}

/**
 * Round 131 — look up a panel-toggle binding
 * by its public method name
 * (e.g. 'toggleSettings'). Returns undefined
 * for unknown methods.
 */
export function panelToggleBindingByMethod(methodName: string): PanelToggleBinding | undefined {
    return PANEL_TOGGLE_BINDINGS_BY_METHOD.get(methodName);
}

/**
 * Round 131 — look up a panel-toggle binding
 * by its mouse-button DOM id
 * (e.g. 'btn-settings'). Returns undefined
 * for unknown button ids.
 */
export function panelToggleBindingByButton(buttonId: string): PanelToggleBinding | undefined {
    return PANEL_TOGGLE_BINDINGS_BY_BUTTON.get(buttonId);
}

/**
 * Round 131 — derive the App method name
 * (e.g. 'toggleSettings') from a
 * `KeyboardAction` `kind` string
 * (e.g. 'toggle-settings'). Returns
 * undefined for kinds that don't match a
 * panel-toggle entry (e.g. 'toggle-help'
 * uses `app.toggleHelp()`, not the
 * round-117 `togglePanel` helper).
 *
 * This lets the bootstrap keydown switch
 * collapse 12 `case 'toggle-X':
 * app.toggleX(); break;` arms into a
 * single lookup arm (used in the
 * round-131 refactor of main.ts).
 *
 * The mapping is a direct table lookup by
 * the `kind` field (round 131: the kind
 * is now a per-row field, not a derived
 * string). An earlier version tried to
 * derive the method name by camelCasing
 * the kind suffix (e.g. 'toggle-stats' →
 * 'toggleStats') but that broke for the
 * `toggle-stats → toggleStatsPanel` pair
 * (the method has an extra 'Panel'
 * suffix that doesn't appear in the
 * kind). The explicit per-row `kind`
 * field avoids the brittleness.
 */
const PANEL_TOGGLE_BINDINGS_BY_KIND: ReadonlyMap<string, PanelToggleBinding> =
    new Map(PANEL_TOGGLE_BINDINGS.map((b) => [b.kind, b] as const));

export function panelToggleMethodByKind(kind: string): string | undefined {
    const b = PANEL_TOGGLE_BINDINGS_BY_KIND.get(kind);
    return b ? b.methodName : undefined;
}

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
        // Round 132 — Z key toggles
        // the EventLog panel
        // (`#event-log-root`). The
        // panel is the keyboard
        // counterpart to the
        // round-132
        // `btn-event-log` mouse
        // button. Both routes (Z
        // keyboard + btn-event-log
        // mouse) call
        // `app.toggleEventLog()`
        // which uses the
        // round-117 `togglePanel`
        // helper. The case-
        // insensitive mirror
        // matches the round-85
        // R / round-91 ` /
        // round-112 P /
        // round-128 D
        // conventions.
        case 'z':
        case 'Z':
            return { kind: 'toggle-event-log' };
        // Round 133 — K key toggles
        // the DslCodex panel
        // (`#dsl-codex-root`). The
        // panel is the keyboard
        // counterpart to the
        // round-133
        // `btn-dsl-codex` mouse
        // button. Both routes (K
        // keyboard + btn-dsl-codex
        // mouse) call
        // `app.toggleDslCodex()`
        // which uses the
        // round-117 `togglePanel`
        // helper. The case-
        // insensitive mirror
        // matches the round-85
        // R / round-91 ` /
        // round-112 P /
        // round-128 D /
        // round-132 Z
        // conventions.
        case 'k':
        case 'K':
            return { kind: 'toggle-dsl-codex' };
        // Round 137 — I key toggles
        // the Inventory panel
        // (`#inventory-root`,
        // populated by the pre-
        // existing `InventoryUI`
        // module that round 137
        // finally wires into the
        // App). The case-
        // insensitive mirror
        // matches the round-85
        // R / round-91 ` /
        // round-112 P /
        // round-128 D /
        // round-132 Z /
        // round-133 K
        // conventions.
        case 'i':
        case 'I':
            return { kind: 'toggle-inventory' };
        // Round 152 — H key toggles HUD compact mode.
        // We picked `H` because it's a free key
        // (P/Q/W/T/R/V/B/N/D/Z/K/I are all panel-
        // toggles or action keys; H is the next
        // unclaimed letter). H also reads as
        // "Hide" → "hide the detail rows".
        case 'h':
        case 'H':
            return { kind: 'toggle-hud-compact' };
        // Round 153 — J key toggles HUD fade mode.
        // J is the next free letter after H (F is
        // already taken by the round-21 vault
        // toggle). Same pattern as
        // `toggle-hud-compact` — no panel mount /
        // unmount, just a boolean flip.
        case 'j':
        case 'J':
            return { kind: 'toggle-hud-fade' };
        // Round 154 — C key cycles the HUD
        // corner through the 4-corner
        // sequence `tl → tr → br → bl → tl`.
        // C is the next free letter after J
        // (which round 153 bound to fade);
        // K is already taken by the
        // round-130 DSL codex toggle. C
        // reads as "Corner". Same pattern as
        // `toggle-hud-fade` — one keystroke,
        // no sub-menu.
        case 'c':
        case 'C':
            return { kind: 'cycle-hud-corner' };
        // Round 155 — X key toggles the
        // always-on-top pin flag. X is
        // the next free letter after C
        // (which round 154 bound to
        // corner cycling). X reads as
        // "eXtra on top". Same pattern
        // as the other HUD toggles —
        // one keystroke, no sub-menu.
        case 'x':
        case 'X':
            return { kind: 'toggle-hud-pinned' };
        // Round 156 — Y key toggles HUD
        // click-through mode. Y is the
        // next free letter after X
        // (which round 155 bound to
        // pin). Y reads as "bYpass"
        // (clicks bypass the HUD onto
        // the scene). Same pattern as
        // the other HUD toggles — one
        // keystroke, no sub-menu.
        case 'y':
        case 'Y':
            return { kind: 'toggle-hud-click-through' };
        default:
            return null;
    }
}
