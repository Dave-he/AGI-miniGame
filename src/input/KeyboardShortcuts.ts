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
 *   ?       — toggle help overlay
 *   S       — save game
 *   L       — load game
 *   E       — roll a world event
 *   R       — rollback to last good state (round 85)
 *   `/~     — toggle DM God console (round 91)
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
    | { kind: 'toggle-dm-console' };

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
    { key: '`',    action: '切换 DM God 控制台' },
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
        case ' ':
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
        default:
            return null;
    }
}
