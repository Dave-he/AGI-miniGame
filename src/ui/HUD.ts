/**
 * HUD — minimal cyberpunk-styled overlay.
 *
 * PRD §3:
 *   - 赛博朋克 3D 风格: 深色 + 霓虹渐变 (蓝紫粉)
 *   - 实时 AI 数据面板: 玩法组合、提示词、平衡数值
 *   - 控制台级日志系统: 终端样式，剧情分支/参数调整
 */

import type { DimensionBlueprint } from '../ai/AIEngine';
import type { WorldEventDraft } from '../ai/SmartWorldAI';
import type { I18n } from '../i18n/I18n';
import type { NpcDisposition } from '../world/NpcMind';
import type { WasmLatencySummary } from '../analytics/WasmLatencyStats';
import type { EventStep } from '../ai/SceneGen';
import type { SceneScalars } from '../ai/SceneScalars';
import type { ActionDebouncer } from '../utils/ActionDebouncer';

export interface HUDState {
    dimension: DimensionBlueprint | null;
    playerLevel: number;
    gold: number;
    gem: number;
    score: number;
    worldEvent: WorldEventDraft | null;
    logLines: string[];
    /**
     * Round 43 — the round-31/round-32 lastBiome snapshot.
     * Optional (HUDs that aren't bound to a WorldState
     * leave it null). When set, the HUD renders a
     * "上次离开 #biome" prompt at the top of the stats
     * panel so a player who reloads the page sees the
     * world's "where I last was" continuity.
     */
    lastBiome?: string | null;
    /**
     * Round 87 — the round-58 BiomeAtmosphere accent
     * color for the current biome. Optional (HUDs that
     * aren't bound to a WorldState leave it null).
     * When set, the HUD applies it as the dim panel's
     * left-border color so the player sees the biome's
     * color identity at a glance. Tied to the
     * `setLastBiomeAccent` setter — the App resolves
     * biome → color via `getBiomeAtmosphere` and pushes
     * it here. Decoupled from the scene module: HUD
     * doesn't import `BiomeAtmosphere` itself.
     */
    lastBiomeAccent?: string | null;
    /**
     * Round 44 — the round-33/36 lastSpeaker snapshot.
     * Optional; when set, the HUD renders a
     * "你刚才听见了 <id> 说：…" line in the stats panel
     * header so the player sees which NPC spoke.
     */
    lastSpeakerId?: string | null;
    lastSpeakerBranch?: 'fear' | 'friendly' | 'hostile' | 'neutral' | null;
    lastSpeakerDisposition?: NpcDisposition | null;
    /**
     * Round 45 — derived counters from the round-40
     * per-NPC memory snapshot. Optional; when set, the
     * HUD renders a "🧠 N 个 NPC 记住了 K 段记忆" line
     * in the stats panel.
     */
    npcMindsSnapshotCount?: number;
    npcMindsSnapshotMemories?: number;
    /**
     * Round 46 — the round-22/35 lastNpcDisposition
     * snapshot (NpcRegistry.averageDisposition()).
     * Optional; when set, the HUD renders a
     * "集体情绪: friendly X / fear Y / trust Z" line
     * in the stats panel.
     */
    lastNpcDisposition?: NpcDisposition | null;
    /**
     * Round 47 — the round-24 `themeToScene` output's
     * four user-visible scalars, persisted by
     * `WorldState.updateLastSceneBlueprint`. Optional;
     * when any one is set, the HUD renders a
     * "🎬 上次维度: NPC×N · BPM T · M 事件 · K archetype"
     * line in the stats panel so the player sees the
     * scene structure carried across `enterNewDimension`
     * and `save → reload`.
     */
    lastSceneNpcCount?: number | null;
    lastSceneBpm?: number | null;
    lastSceneEventCount?: number | null;
    lastSceneArchetypeHintCount?: number | null;
    /**
     * Round 53 — non-modal recovery banner. Set by
     * `showRecoveryBanner(code, biome)` when the
     * rehydrate pipeline fails. Auto-hides after 5s
     * (or via the dismiss button). Renders above the
     * round-51 `<details class="hud-memories">` block
     * with neon-pink styling.
     */
    recoveryBanner?: {
        code: string;
        biome: string | null;
        visible: boolean;
    } | null;
    /**
     * Round 64 — the round-63 lastMinimap snapshot.
     * 80×60 PNG data URL of the last dimension's WFC
     * grid + biome palette. When set, the HUD renders
     * a small image inside the round-51 memories
     * block, just under the "上次离开 #biome" line.
     */
    lastMinimap?: string | null;
    /**
     * Round 69 — the round-68 wasm.latency event stream
     * aggregated by WasmLatencyStats. When set (and
     * non-empty), the HUD renders a `⚡` row in the
     * round-51 memories block showing the per-fn
     * (count, median, p95, max) breakdown. Null when
     * no WASM calls have been observed yet (fresh boot
     * or the analytics bus has not fired any `wasm.latency`
     * events).
     */
    wasmLatencyStats?: WasmLatencySummary | null;
    /**
     * Round 73 — the round-72 lastSceneEventChain full
     * timeline. When set (and non-empty), the HUD renders
     * a `⏰` row in the round-51 memories block showing
     * the next scheduled event ("next: <kind> in <delay>s")
     * and a compact list of all events. The 3-5 chain
     * comes from `themeToScene` (non-DM) or
     * `synthesizeDmEventChain` (DM, round 71). Null when
     * no dimension has been entered yet.
     */
    lastSceneEventChain?: EventStep[] | null;
    /**
     * Round 79 — lifetime count of successful
     * `rollbackToLastGood()` invocations (the round-54
     * inline "🔙 回滚" button inside the recovery banner).
     * When set and > 0, the HUD renders a `🛟` row in
     * the round-51 memories block showing
     * "回滚了 N 次" so the player can see how often the
     * auto-recovery path was needed. Hidden when null
     * or 0 (fresh boot, legacy save, or a save that
     * never saw a recoverable failure).
     */
    rollbackCount?: number | null;
    /**
     * Round 146 — the 4 `ActionDebouncer` instances
     * (loadGame / saveGame / rollWorldEvent / enterAtom).
     * When set (and non-empty), the HUD renders a
     * debouncer mini-strip in the round-51 memories
     * block showing each debouncer's current status
     * ("可触发" / "屏蔽中" + a compact "Ns/Nms" countdown)
     * so the player can see at a glance "is save on
     * cooldown?" without opening the round-128 debug
     * panel. The 4 statuses are derived from the
     * debouncers themselves (no separate bookkeeping
     * needed) — the same `msSinceLastFire` + `windowSizeMs`
     * accessors the round-128/130/145 panel reads.
     *
     * Optional: when omitted, the strip is hidden
     * entirely (the round-51/87/128/130/145/79 default
     * layout for HUDs that aren't bound to debouncers).
     */
    debouncers?: ReadonlyArray<{
        debouncer: ActionDebouncer;
        chineseLabel: string;
    }> | null;
    /**
     * Round 147 — the player's essential hotkey
     * bindings, shown as a compact hint strip in
     * the HUD's `hud-stats` panel. Each binding is
     * `{ key, action, group? }` where `key` is the
     * keyboard key (e.g. "P", "Q", "R"), `action`
     * is the human-readable Chinese label (e.g.
     * "设置", "代码", "回滚"), and `group` is an
     * optional section label (e.g. "面板",
     * "系统"). When the array is set + non-empty,
     * the HUD renders a `hud-hotkeys` strip at the
     * bottom of the stats panel so the player
     * always sees the controls (操控性好). Mirrors
     * the BINDING_DESCRIPTIONS source of truth in
     * main.ts — the host passes the same data to
     * the round-120 keyboard help modal AND the
     * HUD's quick-strip.
     *
     * Optional: when omitted, the strip is hidden
     * (the round-1/2/3/.../146 default layout for
     * HUDs that don't want hotkey hints).
     */
    hotkeys?: ReadonlyArray<{
        key: string;
        action: string;
        group?: string;
    }> | null;
    /**
     * Round 150 — biome-
     * contextual hotkey
     * bindings. When set
     * + non-empty, the
     * HUD renders a
     * SECOND hotkey
     * strip BELOW the
     * round-147 base
     * strip, prefixed
     * with a small
     * `—— ${biomeLabel} ——`
     * header so the
     * player can tell
     * the two strips
     * apart at a glance.
     *
     * Used for
     * biome-specific
     * shortcuts (e.g.
     * `Q` for 仙侠
     * "符箓", `Y` for
     * 赛博 "黑客"). The
     * host pushes a
     * different list
     * per dimension /
     * biome via
     * `setBiomeHotkeys`
     * — when the player
     * enters a new
     * biome, the strip
     * auto-updates.
     *
     * Optional: when
     * omitted (or empty
     * array), the
     * biome strip is
     * hidden (back to
     * the round-147
     * layout for HUDs
     * that don't want
     * contextual
     * hints).
     */
    biomeHotkeys?: ReadonlyArray<{
        key: string;
        action: string;
        group?: string;
    }> | null;
    /**
     * Round 150 — the
     * Chinese label for
     * the current biome
     * (e.g. "仙侠",
     * "赛博", "冰原").
     * Used as the
     * header for the
     * biome hotkey
     * strip. When
     * `biomeHotkeys`
     * is set, this
     * label is also
     * shown.
     */
    biomeHotkeyLabel?: string | null;
    /**
     * Round 152 — compact HUD mode. When `true`, the
     * secondary strips inside the round-51 memories
     * block collapse their per-row detail lists
     * (e.g. the per-fn WASM latency breakdown, the
     * full event-chain timeline, the debouncer
     * mini-strip's countdown cells) and render only
     * the headline row. Designed for players who
     * want the stats panel to take up less screen
     * real estate (操控性好 + 画面优美 — the stats
     * panel sits in the top-right corner and a tall
     * panel can occlude the Three.js scene).
     *
     * Default `false` (round-150/151 layout, all
     * detail rows visible). Toggled at runtime via
     * `setCompact(value)` and persisted to
     * localStorage key `agi_hud_compact` so a player
     * who enables it on a visit doesn't have to
     * re-enable it on the next page load. The `H`
     * key in main.ts toggles this.
     *
     * The compact mode does NOT affect: the round-87
     * biome-accent dim-panel border, the round-147/150
     * hotkey strips (those are already compact by
     * design), the round-128 debug overlay, or any
     * of the round-1..146 always-visible rows. It's
     * a strict opt-in sub-set of the memories block.
     */
    compact?: boolean;
    /**
     * Round 153 — HUD fade-mode master toggle. When
     * `true`, the round-152 `.hud-stats` panel
     * auto-fades to a low opacity (0.25, set in
     * style.css `.hud-stats.hud-fading`) after
     * `hudFadeIdleMs` of key/click inactivity, and
     * instantly re-shows on any input event.
     * Designed for players who want an unobstructed
     * view of the Three.js scene during long
     * playthroughs (操控性好 + 画面优美 — the
     * round-1 stats panel is always-on by default
     * and can occlude the scene on smaller windows).
     *
     * Default `false` (round-152 layout, panel
     * always fully visible). Toggled at runtime via
     * `setFadeEnabled(value)` and persisted to
     * localStorage key `agi_hud_fade`. The `F` key
     * in main.ts toggles this.
     *
     * When `hudFadeEnabled === false`, the
     * `hudFadeIdledAt` field is irrelevant (the
     * render skips the `hud-fading` class even if
     * the idle timer has fired). The host can
     * disable fade-mode mid-session via
     * `setFadeEnabled(false)` and the panel snaps
     * back to fully visible on the next render.
     */
    hudFadeEnabled?: boolean;
    /**
     * Round 153 — the timestamp (in `performance.now()`
     * units) at which the HUD's input idle timer
     * started. `null` means the panel is currently
     * NOT idle (either fade-mode is disabled, or an
     * input event recently reset the timer). The
     * host (typically `App` in main.ts) calls
     * `hud.notifyInput()` on every keydown / click,
     * which sets this to `null` (clears the idle
     * state) and triggers a re-render.
     *
     * The idle-detection itself is driven by
     * `hud.tickIdle(now)`: the host calls this on
     * every animation frame with the current
     * `performance.now()`. If
     * `now - lastInputAt >= hudFadeIdleMs`, the
     * host sets `hudFadeIdledAt = now` to flip the
     * panel into the `hud-fading` class.
     *
     * Optional: when omitted, the panel is treated
     * as "not idle" (fully visible).
     */
    hudFadeIdledAt?: number | null;
    /**
     * Round 153 — the inactivity threshold (in
     * milliseconds) before the HUD panel fades.
     * Default `3000` ms (3 seconds). Configurable
     * for tests (so they don't have to wait 3
     * real seconds) and for future SettingsPanel
     * integration (a slider the player can drag).
     * Optional; when omitted, the render falls
     * back to the round-153 default of 3000.
     */
    hudFadeIdleMs?: number;
    /**
     * Round 154 — HUD corner-snap position. The
     * stats panel sits in the top-right corner by
     * default (round-1 layout), but right-handed
     * players often prefer top-left and one-handed
     * mobile players prefer bottom-right. The
     * `K` key cycles through 4 corners
     * (`tl → tr → br → bl → tl`) and the
     * preference is persisted to localStorage key
     * `agi_hud_corner`.
     *
     * Optional; when omitted, the render falls
     * back to the round-1 default of `'tr'`
     * (top-right).
     */
    hudCorner?: 'tl' | 'tr' | 'br' | 'bl';
}

export class HUD {
    private root: HTMLElement;
    private i18n: I18n;
    private state: HUDState;
    private langBtn: HTMLButtonElement | null = null;
    /**
     * Round 53 — handle to the auto-hide timer for
     * the recovery banner. Stored on the instance
     * (not state) so render() — which clones the
     * state object — does not interfere with the
     * timeout. `null` means no banner is currently
     * active.
     */
    private recoveryBannerTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(root: HTMLElement, i18n: I18n) {
        this.root = root;
        this.i18n = i18n;
        this.state = {
            dimension: null,
            playerLevel: 1,
            gold: 0,
            gem: 0,
            score: 0,
            worldEvent: null,
            logLines: [],
        };
        this.i18n.onChange(() => this.render());
        // Round 154 — apply the corner-snap
        // class on construction so the root
        // element carries the right
        // `hud-corner-*` modifier from the
        // start (matches the round-1
        // top-right default when no state
        // has been pushed yet).
        this.applyCornerClass();
        this.render();
    }

    setState(patch: Partial<HUDState>): void {
        this.state = { ...this.state, ...patch };
        this.render();
    }

    /**
     * Round 43 — push the round-32 lastBiome snapshot
     * into the HUD. Distinct from setState because the
     * lastBiome is a *persistent* signal, not a per-frame
     * game state, and the App only needs to refresh it
     * once per save → reload.
     */
    setLastBiome(biome: string | null): void {
        this.state = { ...this.state, lastBiome: biome };
        this.render();
    }

    /**
     * Round 87 — push the current biome's accent color
     * (typically the round-58 `getBiomeAtmosphere(biome).particleColor`
     * or `.lightTint`) into the HUD. The HUD applies it
     * as the dim panel's left-border color so the
     * player's eye is drawn to the "current biome"
     * signal every time the panel renders. Pass `null`
     * to clear the accent (e.g. on a fresh game where
     * no biome has been entered yet).
     *
     * **Why a separate setter from `setLastBiome`**: the
     * two are conceptually distinct — `lastBiome` is a
     * world-state snapshot (the round-43 "where I last
     * was" prompt), while `lastBiomeAccent` is a
     * presentation hint derived from the biome's
     * atmosphere. Splitting them keeps the HUD decoupled
     * from the scene module: the App resolves
     * biome → color and pushes it; the HUD just renders.
     */
    setLastBiomeAccent(color: string | null): void {
        this.state = { ...this.state, lastBiomeAccent: color };
        this.render();
    }

    /**
     * Round 64 — push the round-63 lastMinimap snapshot
     * (80×60 PNG data URL) into the HUD. The image is
     * rendered inside the round-51 memories block so
     * the player sees a visual preview of their last
     * visited dimension (survives save → reload because
     * the WorldState already persists it).
     *
     * Pass `null` to hide the image (e.g. on a fresh
     * game where no dimension has been entered yet, or
     * on pre-round-63 saves that don't carry the field).
     */
    setMinimap(dataUrl: string | null): void {
        this.state = { ...this.state, lastMinimap: dataUrl };
        this.render();
    }

    /**
     * Round 44 — push the round-36 lastSpeaker snapshot
     * (id + branch + disposition) into the HUD. The
     * stats panel renders "你刚才听见了 <id> 说：…"
     * after a narration that picked a specific speaker.
     */
    setLastSpeaker(speaker: { id: string; branch: 'fear' | 'friendly' | 'hostile' | 'neutral'; disposition: { friendly: number; fear: number; trust: number } } | null): void {
        this.state = {
            ...this.state,
            lastSpeakerId: speaker?.id ?? null,
            lastSpeakerBranch: speaker?.branch ?? null,
            lastSpeakerDisposition: speaker?.disposition ?? null,
        };
        this.render();
    }

    /**
     * Round 45 — push the round-40 per-NPC memory
     * snapshot into the HUD. The stats panel renders a
     * small line "🧠 N 个 NPC 记住了 K 段记忆" so
     * the player can see the cross-save memory tally.
     */
    setNpcMindsSnapshot(snapshot: ReadonlyArray<{ entries: ReadonlyArray<unknown> }>): void {
        const minds = snapshot.length;
        const memories = snapshot.reduce((acc, m) => acc + m.entries.length, 0);
        this.state = {
            ...this.state,
            npcMindsSnapshotCount: minds,
            npcMindsSnapshotMemories: memories,
        };
        this.render();
    }

    /**
     * Round 46 — push the round-22/35 lastNpcDisposition
     * (the NpcRegistry.averageDisposition() snapshot)
     * into the HUD. The stats panel renders a small
     * "集体情绪: friendly X / fear Y / trust Z" line
     * so the player can see the world's mood signal
     * without opening the NpcMind panel.
     */
    setLastNpcDisposition(disp: { friendly: number; fear: number; trust: number } | null): void {
        this.state = {
            ...this.state,
            lastNpcDisposition: disp ? { ...disp } : null,
        };
        this.render();
    }

    /**
     * Round 47 — push the round-24 `themeToScene` output's
     * four user-visible scalars (npcCount, bpm, eventCount,
     * archetypeHintCount) into the HUD. The stats panel
     * renders a "🎬 上次维度: NPC×N · BPM T · M 事件 · K
     * archetype" line so the player sees the scene
     * structure carried across `enterNewDimension` and
     * `save → reload`. Passing `null` clears all four
     * fields at once (callers don't have to enumerate).
     */
    setLastSceneBlueprint(
        scalars: SceneScalars | null,
    ): void {
        if (!scalars) {
            this.state = {
                ...this.state,
                lastSceneNpcCount: null,
                lastSceneBpm: null,
                lastSceneEventCount: null,
                lastSceneArchetypeHintCount: null,
            };
        } else {
            this.state = {
                ...this.state,
                lastSceneNpcCount: scalars.npcCount,
                lastSceneBpm: scalars.bpm,
                lastSceneEventCount: scalars.eventCount,
                lastSceneArchetypeHintCount: scalars.archetypeHintCount,
            };
        }
        this.render();
    }

    /**
     * Round 69 — push the round-68 `wasm.latency` event
     * stream's per-fn aggregation into the HUD. Pushed
     * by `App.wasmLatencyStats.onSummary(...)` (set up in
     * the App constructor right after `new WasmLatencyStats()`).
     * The render call is throttled inside the aggregator
     * (bounded ring buffer + listener-bypass on no-change),
     * so this method can be called on every WASM event
     * without measurable cost.
     *
     * Passing `null` clears the row (e.g. on a fresh boot
     * where no WASM calls have been observed yet).
     */
    setWasmLatencyStats(stats: WasmLatencySummary | null): void {
        if (!stats) {
            this.state = { ...this.state, wasmLatencyStats: null };
        } else {
            this.state = { ...this.state, wasmLatencyStats: stats };
        }
        this.render();
    }

    /**
     * Round 73 — push the round-72 lastSceneEventChain full
     * timeline into the HUD. The non-DM path gets the chain
     * from `SceneBlueprint.eventChain`; the DM path gets it
     * from `synthesizeDmEventChain` (round 71); the rollback
     * path restores it from `backup.blueprint.eventChain`.
     *
     * The HUD renders a `⏰` row in the round-51 memories
     * block showing the next scheduled event (smallest
     * `delaySecs`) plus a compact list of all events. The
     * row stays hidden when the chain is null or empty.
     *
     * Passing `null` clears the row (e.g. on a hard reset
     * or when the App's loadFromJSON path found a save that
     * pre-dates round 72 with no fallback chain).
     *
     * The array is defensive-cloned so a caller that mutates
     * the source after storing it (the round-49 snapshot
     * pattern) doesn't leak into the HUD. Mirrors the
     * round-72 WorldState setter.
     */
    setLastSceneEventChain(chain: EventStep[] | null): void {
        if (!chain) {
            this.state = { ...this.state, lastSceneEventChain: null };
        } else {
            this.state = {
                ...this.state,
                lastSceneEventChain: chain.map(e => ({
                    kind: e.kind,
                    delaySecs: e.delaySecs,
                    payload: e.payload,
                })),
            };
        }
        this.render();
    }

    /**
     * Round 79 — push the round-79 lifetime rollback
     * count into the HUD. The persistent-memories
     * block (round-51 `<details>`) renders a `🛟` row
     * with the value when it's non-null and > 0. Pass
     * `null` to clear (e.g. on a hard-reset or when a
     * legacy save without the field is loaded).
     *
     * The setter does NOT clamp negative inputs — a
     * negative count is a developer error and we want
     * it to surface visibly rather than be silently
     * zeroed.
     */
    setRollbackCount(count: number | null): void {
        this.state = { ...this.state, rollbackCount: count };
        this.render();
    }

    /**
     * Round 146 — push the 4 `ActionDebouncer` instances
     * into the HUD. The round-51 `<details>` memories
     * block renders a debouncer mini-strip showing each
     * debouncer's current status ("可触发" / "屏蔽中" +
     * a compact "Ns/Nms" countdown) when the array is
     * set and non-empty. The strip gives the player a
     * single-glance "is save on cooldown?" read directly
     * in the gameplay HUD, without opening the round-128
     * debug panel.
     *
     * The 4 statuses are derived from the debouncers
     * themselves (the same `msSinceLastFire` +
     * `windowSizeMs` accessors the round-128/130/145
     * debug panel reads) so the host doesn't need to
     * track them separately. The strip auto-refreshes
     * on every `setDebouncers` / `setState` / `log`
     * call (and via the existing round-130 panel
     * auto-refresh path).
     *
     * Pass `null` to clear the strip (e.g. on a hard
     * reset or when no debouncers exist yet).
     */
    setDebouncers(debouncers: ReadonlyArray<{ debouncer: ActionDebouncer; chineseLabel: string }> | null): void {
        if (debouncers == null) {
            this.state = { ...this.state, debouncers: null };
        } else {
            // Defensive copy — the caller may mutate the source
            // array after storing (the round-130 snapshot
            // pattern), and the HUD's render() reads
            // `debouncer.msSinceLastFire` live so the
            // references themselves must stay live.
            this.state = {
                ...this.state,
                debouncers: debouncers.map((d) => ({
                    debouncer: d.debouncer,
                    chineseLabel: d.chineseLabel,
                })),
            };
        }
        this.render();
    }

    /**
     * Round 147 — push the player's essential hotkey
     * bindings into the HUD. The `hud-stats` panel
     * renders a compact `<div class="hud-hotkeys">`
     * strip showing each binding as `[key] action`
     * (e.g. `[P] 设置 · [Q] 代码 · [R] 回滚`) at the
     * bottom of the panel so the player always sees
     * the controls without opening the round-120
     * keyboard help modal.
     *
     * Mirrors the BINDING_DESCRIPTIONS / PANEL_TOGGLE_
     * DESCRIPTIONS source of truth in main.ts. The
     * host can pass any subset (e.g. just the
     * "essentials" — settings / codex / rollback /
     * stats) so the strip stays compact.
     *
     * Pass `null` to clear the strip.
     */
    setHotkeys(hotkeys: ReadonlyArray<{ key: string; action: string; group?: string }> | null): void {
        if (hotkeys == null) {
            this.state = { ...this.state, hotkeys: null };
        } else {
            // Defensive copy so a caller that mutates the
            // source array after storing (the round-130
            // snapshot pattern) doesn't leak into the HUD.
            this.state = {
                ...this.state,
                hotkeys: hotkeys.map((h) => ({
                    key: h.key,
                    action: h.action,
                    group: h.group,
                })),
            };
        }
        this.render();
    }

    /**
     * Round 150 — push
     * biome-contextual
     * hotkey bindings
     * into the HUD.
     * Renders a second
     * hotkey strip
     * BELOW the round-
     * 147 base strip
     * (or, when
     * `setHotkeys`
     * wasn't called,
     * just the biome
     * strip alone) —
     * prefixed with a
     * `—— ${biomeLabel}
     * ——` header so the
     * player can tell
     * the two strips
     * apart at a glance.
     *
     * Pass `null` for
     * either arg to
     * clear the
     * corresponding
     * piece:
     *   - `null` hotkeys
     *     → strip
     *     hidden
     *   - `null` label
     *     → header
     *     hidden (just
     *     the strip
     *     renders)
     *
     * The host (App)
     * is expected to
     * call this on
     * dimension change
     * with the new
     * biome's bindings.
     */
    setBiomeHotkeys(
        biomeLabel: string | null,
        hotkeys: ReadonlyArray<{ key: string; action: string; group?: string }> | null,
    ): void {
        if (hotkeys == null) {
            this.state = { ...this.state, biomeHotkeys: null, biomeHotkeyLabel: null };
        } else {
            // Defensive copy mirrors the round-147
            // setHotkeys pattern.
            this.state = {
                ...this.state,
                biomeHotkeys: hotkeys.map((h) => ({
                    key: h.key,
                    action: h.action,
                    group: h.group,
                })),
                biomeHotkeyLabel: biomeLabel,
            };
        }
        this.render();
    }

    /**
     * Round 152 — toggle the compact HUD mode.
     * When `compact === true`, the round-51 memories
     * block collapses its per-row detail lists
     * (WASM latency per-fn lines, event-chain
     * timeline, debouncer mini-strip countdowns)
     * into a single headline row per item. The
     * round-87 dim-panel border, round-147/150
     * hotkey strips, and round-1..146 always-
     * visible rows are unaffected.
     *
     * The setter is the canonical write path: the
     * `H` key in main.ts calls this directly + the
     * localStorage persistence is done at the call
     * site (so a non-browser test env can call
     * `setCompact(true)` without crashing on
     * `typeof localStorage` checks).
     */
    setCompact(compact: boolean): void {
        this.state = { ...this.state, compact };
        this.render();
    }

    /**
     * Read-only accessor mirroring the `getState()`
     * pattern. Returns the current `compact` flag
     * (default `false` if never set).
     */
    isCompact(): boolean {
        return this.state.compact === true;
    }

    /**
     * Round 153 — enable / disable the HUD fade mode.
     * When `enabled === true`, the `.hud-stats` panel
     * auto-fades to low opacity after
     * `state.hudFadeIdleMs` (default 3000 ms) of
     * input inactivity, and re-shows instantly on
     * any `notifyInput()` call. When `false`, the
     * panel is always fully visible (round-152
     * default).
     *
     * Calling this with `enabled === true` resets
     * `state.hudFadeIdledAt` to `null` (the panel
     * starts fully visible and the host begins
     * counting idle time on the next animation
     * frame). Calling with `false` clears the
     * idle state immediately and the next render
     * drops the `hud-fading` class.
     *
     * The localStorage persistence is done at the
     * call site (mirrors the round-152
     * setCompact pattern) so a non-browser test
     * env can call `setFadeEnabled(true)` without
     * crashing on `typeof localStorage` checks.
     */
    setFadeEnabled(enabled: boolean): void {
        this.state = {
            ...this.state,
            hudFadeEnabled: enabled,
            // Reset the idle state on every toggle.
            // Re-enabling starts the countdown
            // fresh; disabling clears any in-
            // progress idle state.
            hudFadeIdledAt: null,
        };
        this.render();
    }

    /**
     * Read-only accessor mirroring the
     * `isCompact()` pattern. Returns the current
     * `hudFadeEnabled` flag (default `false` if
     * never set).
     */
    isFadeEnabled(): boolean {
        return this.state.hudFadeEnabled === true;
    }

    /**
     * Round 153 — called by the host (typically
     * `App` in main.ts) on every keydown /
     * mouseclick. Resets the input-idle timer:
     * the panel snaps back to fully visible on
     * the next render (the `hud-fading` class
     * is dropped), and `hud.tickIdle(now)` will
     * not re-flip it until `hudFadeIdleMs` of
     * silence elapses again.
     *
     * Idempotent + cheap (one assignment +
     * conditional re-render). Safe to call on
     * every keystroke.
     */
    notifyInput(): void {
        if (this.state.hudFadeIdledAt !== null) {
            this.state = { ...this.state, hudFadeIdledAt: null };
            this.render();
        }
    }

    /**
     * Round 153 — called by the host on every
     * animation frame. If the input idle timer
     * has elapsed (now - lastInputAt >=
     * hudFadeIdleMs), this flips the panel into
     * the fading state (sets `hudFadeIdledAt =
     * now` + re-renders).
     *
     * The `now` argument is in `performance.now()`
     * units (typically the host's
     * `requestAnimationFrame` timestamp). The
     * host is expected to track the timestamp
     * of the last `notifyInput()` call itself
     * and only call `tickIdle` when the gap
     * exceeds the threshold.
     *
     * Returns `true` if the panel transitioned
     * to fading on this tick, `false` otherwise
     * (including when fade-mode is disabled or
     * the threshold hasn't elapsed yet).
     */
    tickIdle(now: number, lastInputAt: number | null): boolean {
        if (!this.isFadeEnabled()) return false;
        if (this.state.hudFadeIdledAt !== null) return false;
        if (lastInputAt === null) return false;
        const threshold = this.state.hudFadeIdleMs ?? 3000;
        if (now - lastInputAt >= threshold) {
            this.state = { ...this.state, hudFadeIdledAt: now };
            this.render();
            return true;
        }
        return false;
    }

    /**
     * Read-only accessor mirroring the
     * `isCompact()` / `isFadeEnabled()` pattern.
     * Returns the current `hudFadeIdledAt`
     * timestamp (or `null` if not currently
     * idle). The host uses this to decide
     * whether to re-render after a `notifyInput`.
     */
    isFading(): boolean {
        return this.state.hudFadeIdledAt !== null
            && this.state.hudFadeIdledAt !== undefined;
    }

    /**
     * Round 154 — set the HUD corner-snap
     * position. The stats panel CSS class
     * `hud-corner-${corner}` is applied to the
     * root element so the player can pin the
     * panel to any of the 4 screen corners.
     *
     * Defaults to `'tr'` (top-right) when the
     * state field is omitted — that matches the
     * round-1 layout. Persisting the player's
     * preference is the call-site's
     * responsibility (mirrors the round-152
     * `setCompact` pattern) so a non-browser
     * test env can call `setCorner('tl')`
     * without crashing on `typeof localStorage`.
     */
    setCorner(corner: 'tl' | 'tr' | 'br' | 'bl'): void {
        this.state = { ...this.state, hudCorner: corner };
        this.applyCornerClass();
        this.render();
    }

    /**
     * Read-only accessor mirroring the
     * `isCompact()` / `isFadeEnabled()` pattern.
     * Returns the current corner-snap value
     * (default `'tr'` when never set).
     */
    getCorner(): 'tl' | 'tr' | 'br' | 'bl' {
        return this.state.hudCorner ?? 'tr';
    }

    /**
     * Round 154 — cycle the HUD corner through
     * the 4-corner sequence `tl → tr → br → bl → tl`.
     * Returns the new corner so the host can
     * persist it. Designed to be wired directly
     * to the `K` key shortcut — one keystroke
     * to pick a new corner, no sub-menu needed.
     */
    cycleCorner(): 'tl' | 'tr' | 'br' | 'bl' {
        const order: Array<'tl' | 'tr' | 'br' | 'bl'> = ['tl', 'tr', 'br', 'bl'];
        const current = this.getCorner();
        const idx = order.indexOf(current);
        const next = order[(idx + 1) % order.length];
        this.setCorner(next);
        return next;
    }

    /**
     * Round 154 — apply the
     * `hud-corner-${corner}` CSS class to the
     * root element. Internal helper for
     * `setCorner` and the constructor. The
     * 4 corner classes are defined in
     * `index.html`'s `<style>` block (alongside
     * the round-1 `#hud-root { top: 0; right: 0; ...}`
     * rule that this method overrides).
     */
    private applyCornerClass(): void {
        const corner = this.getCorner();
        const baseClass = 'panel';
        // Strip any prior corner class so we
        // don't accumulate stale variants on
        // repeated toggles.
        this.root.className = `${baseClass} hud-corner-${corner}`;
    }

    /**
     * Round 53 — push a non-modal recovery banner into
     * the HUD. Called by `App.recoverFromRenderFailure`
     * when loadGame's rehydrate pipeline failed and the
     * recovery orchestrator took over (typically by
     * calling `enterNewDimension` to replace the broken
     * scene). The banner shows the error code (e.g.
     * `ERR_SCENE_RENDER`) and the new biome id, and
     * auto-hides after 5 seconds. A dismiss button lets
     * the player hide it sooner. Subsequent calls during
     * the 5s window replace the active banner (the most
     * recent recovery is the one that matters).
     */
    showRecoveryBanner(code: string, biome: string | null): void {
        if (this.recoveryBannerTimer !== null) {
            clearTimeout(this.recoveryBannerTimer);
        }
        this.state = {
            ...this.state,
            recoveryBanner: { code, biome: biome ?? null, visible: true },
        };
        this.render();
        // Auto-hide after 5 seconds. The timer is
        // stored on the instance (not the state) so
        // render() — which clones the state object —
        // does not interfere with the timeout. In
        // jsdom tests we use jest.useFakeTimers() to
        // control this.
        this.recoveryBannerTimer = setTimeout(() => {
            this.state = {
                ...this.state,
                recoveryBanner: this.state.recoveryBanner
                    ? { ...this.state.recoveryBanner, visible: false }
                    : null,
            };
            this.recoveryBannerTimer = null;
            this.render();
        }, 5000);
    }

    /**
     * Round 54 — immediately hide the recovery banner.
     * Called by `App.rollbackToLastGood()` after a
     * successful rollback (the banner's purpose is to
     * announce the auto-recovery, which is now void).
     * Distinct from the dismiss ✕ button (which only
     * hides) and from the 5s auto-hide (which is
     * time-based, not action-based). The auto-hide
     * timer is cleared so the banner stays hidden
     * without re-firing.
     */
    hideRecoveryBanner(): void {
        if (this.recoveryBannerTimer !== null) {
            clearTimeout(this.recoveryBannerTimer);
            this.recoveryBannerTimer = null;
        }
        this.state = {
            ...this.state,
            recoveryBanner: this.state.recoveryBanner
                ? { ...this.state.recoveryBanner, visible: false }
                : null,
        };
        this.render();
    }

    /**
     * Round 54 — inject the App's rollback callback
     * into the HUD so the recovery banner can render
     * an inline "🔙 回滚" button. Passing `null` is
     * the default (round 51-53 behavior — no button
     * rendered). The HUD does not import the App
     * class; the callback signature is `() => void` so
     * the caller can wire any rollback behavior
     * without HUD needing to know the implementation.
     * The render() output gates on both the handler
     * being non-null AND the worldState
     * `hasFailedSnapshot()` check (passed via
     * `setBackupAvailable(true|false)`) — without a
     * recoverable backup, no button.
     */
    private rollbackHandler: (() => void) | null = null;
    private backupAvailable: boolean = false;

    setRollbackHandler(handler: (() => void) | null): void {
        this.rollbackHandler = handler;
    }

    /**
     * Round 54 — tell the HUD whether a recoverable
     * `lastFailedSnapshot` exists. The HUD cannot
     * query WorldState directly (would be a cycle —
     * WorldState knows nothing about HUD; HUD knows
     * nothing about WorldState), so App calls this in
     * the same render cycle that calls setLastBiome
     * / setLastSceneBlueprint etc. Cheap (one bool
     * flag, no snapshot copy).
     */
    setBackupAvailable(available: boolean): void {
        this.backupAvailable = available;
    }

    /**
     * Read-only snapshot of the current HUD state. Replaces the
     * `(this.hud as any).state` hack that callers used before round
     * 26 to peek at `dimension`, `worldEvent`, etc. without
     * triggering a re-render.
     */
    getState(): Readonly<HUDState> {
        return this.state;
    }

    log(line: string): void {
        const ts = new Date().toISOString().slice(11, 19);
        this.state.logLines.push(`[${ts}] ${line}`);
        if (this.state.logLines.length > 40) this.state.logLines.shift();
        this.render();
    }

    /**
     * Round 53 — render the optional recovery banner
     * above the persistent-memories `<details>` block.
     * Returns an empty string when no banner is active,
     * so the round-51 `<details>` block stays the first
     * visual element when the player is not in recovery
     * state. The banner shows the error code (e.g.
     * `ERR_SCENE_RENDER`) and the new biome id (e.g.
     * `#forest`) so the player can see "I just got
     * moved to a different world". A dismiss button
     * hides it immediately. The auto-hide timer is set
     * in `showRecoveryBanner`, not here — this helper
     * is read-only.
     */
    private renderRecoveryBanner(): string {
        const banner = this.state.recoveryBanner;
        if (!banner || !banner.visible) return '';
        // Round 54 — render the inline "🔙 回滚" button
        // when the App has injected a rollback handler
        // AND a recoverable lastFailedSnapshot exists.
        // Without a backup, the button is omitted (no
        // point offering rollback to nothing).
        const rollbackBtn = (this.rollbackHandler !== null && this.backupAvailable)
            ? `<button class="hud-recovery-rollback" type="button" aria-label="Rollback to last good state">🔙 回滚到上次</button>`
            : '';
        return `
            <div class="hud-recovery-banner" role="status">
                <span>[scene] 自动恢复: 旧渲染失败 (<b>${escapeHtml(banner.code)}</b>) → 进入新维度 <b>#${escapeHtml(banner.biome ?? '—')}</b></span>
                ${rollbackBtn}
                <button class="hud-recovery-dismiss" type="button" aria-label="Dismiss recovery banner">✕</button>
            </div>
        `;
    }

    private render(): void {
        const s = this.state;
        const dimName = s.dimension?.name ?? '—';
        const dimAtoms = s.dimension?.atomIds.join(' · ') ?? '—';
        const dimTheme = s.dimension?.theme.visualStyle ?? '—';
        const evt = s.worldEvent;
        const evtName = evt ? `${evt.isPositive ? '🟢' : '🔴'} ${evt.name}` : '—';

        const logText = s.logLines.length === 0
            ? `<div class="hud-log-empty">${escapeHtml(this.i18n.t('hud.console'))} …</div>`
            : s.logLines.map(l => `<div class="hud-log-line">${escapeHtml(l)}</div>`).join('');

        const otherLocale: 'zh-CN' | 'en-US' = this.i18n.getLocale() === 'zh-CN' ? 'en-US' : 'zh-CN';
        const langLabel = this.i18n.getLocale() === 'zh-CN' ? 'EN' : '中';

        // Round 147 — the hotkey
        // strip is on when the
        // array is set + non-empty.
        // A null (no bindings
        // provided) or empty array
        // (legacy save, hard reset)
        // both keep the strip
        // hidden so the HUD
        // doesn't render a useless
        // row.
        const hotkeysOn = Array.isArray(s.hotkeys)
            && (s.hotkeys as ReadonlyArray<unknown>).length > 0;
        // Round 150 — biome-contextual hotkey strip (shown
        // BELOW the base strip). Mirrors the same gate
        // pattern (array + non-empty).
        const biomeHotkeysOn = Array.isArray(s.biomeHotkeys)
            && (s.biomeHotkeys as ReadonlyArray<unknown>).length > 0;

        // Round 153 — compute whether the
        // `.hud-stats` panel should be in the
        // `hud-fading` state. Two conditions
        // must both hold: (1) `hudFadeEnabled`
        // is true (master toggle), and (2)
        // `hudFadeIdledAt` is non-null (the
        // host's `tickIdle()` has flipped the
        // panel into idle). When either is
        // false, the panel renders fully
        // visible (round-152 default).
        const fadeOn = s.hudFadeEnabled === true
            && s.hudFadeIdledAt !== null
            && s.hudFadeIdledAt !== undefined;
        const statsCls = fadeOn
            ? 'hud-panel hud-stats hud-stats-fading'
            : 'hud-panel hud-stats';

        this.root.innerHTML = `
            <div class="${statsCls}">
                <div class="hud-title-row">
                    <span class="hud-title">${escapeHtml(this.i18n.t('hud.stats'))}</span>
                    <button class="hud-lang" type="button" data-locale="${otherLocale}">${langLabel}</button>
                </div>
                ${this.renderRecoveryBanner()}
                ${this.renderPersistentMemories(s)}
                <div class="hud-row"><span>${escapeHtml(this.i18n.t('hud.level'))}</span><b>${s.playerLevel}</b></div>
                <div class="hud-row"><span>${escapeHtml(this.i18n.t('hud.gold'))}</span><b>${s.gold}</b></div>
                <div class="hud-row"><span>${escapeHtml(this.i18n.t('hud.gem'))}</span><b>${s.gem}</b></div>
                <div class="hud-row"><span>Score</span><b>${s.score}</b></div>
                ${hotkeysOn && s.hotkeys
                    ? renderHotkeysStrip(s.hotkeys as ReadonlyArray<{ key: string; action: string; group?: string }>)
                    : ''}
                ${biomeHotkeysOn && s.biomeHotkeys
                    ? renderBiomeHotkeysStrip(
                        s.biomeHotkeyLabel ?? null,
                        s.biomeHotkeys as ReadonlyArray<{ key: string; action: string; group?: string }>,
                    )
                    : ''}
            </div>
            <div class="hud-panel hud-dim" style="${s.lastBiomeAccent ? `--biome-accent: ${escapeHtml(s.lastBiomeAccent)};` : ''}">
                <div class="hud-title">${escapeHtml(this.i18n.t('hud.dim'))}</div>
                <div class="hud-dim-name">${escapeHtml(dimName)}</div>
                <div class="hud-row"><span>玩法</span><b>${escapeHtml(dimAtoms)}</b></div>
                <div class="hud-row"><span>主题</span><b>${escapeHtml(dimTheme)}</b></div>
                <div class="hud-row"><span>事件</span><b>${escapeHtml(evtName)}</b></div>
            </div>
            <div class="hud-panel hud-log">
                <div class="hud-title">${escapeHtml(this.i18n.t('hud.console'))}</div>
                <div class="hud-log-body">${logText}</div>
            </div>
        `;

        this.langBtn = this.root.querySelector<HTMLButtonElement>('.hud-lang');
        this.langBtn?.addEventListener('click', () => {
            const target = this.langBtn?.getAttribute('data-locale');
            if (target === 'zh-CN' || target === 'en-US') {
                this.i18n.setLocale(target);
            }
        });

        // Round 53 — wire the recovery banner dismiss
        // button. The banner auto-hides after 5s (timer
        // in showRecoveryBanner), but the player can
        // hide it sooner. The click handler clears the
        // timer and flips the `visible` flag.
        const dismissBtn = this.root.querySelector<HTMLButtonElement>('.hud-recovery-dismiss');
        dismissBtn?.addEventListener('click', () => {
            if (this.recoveryBannerTimer !== null) {
                clearTimeout(this.recoveryBannerTimer);
                this.recoveryBannerTimer = null;
            }
            this.state = {
                ...this.state,
                recoveryBanner: this.state.recoveryBanner
                    ? { ...this.state.recoveryBanner, visible: false }
                    : null,
            };
            this.render();
        });

        // Round 54 — wire the inline "🔙 回滚" button.
        // The button only renders when `setRollbackHandler`
        // was called with a non-null handler AND a
        // recoverable `lastFailedSnapshot` exists, so
        // the querySelector may return null and that is
        // a normal case (no rollback affordance needed).
        const rollbackBtn = this.root.querySelector<HTMLButtonElement>('.hud-recovery-rollback');
        rollbackBtn?.addEventListener('click', () => {
            if (this.rollbackHandler) {
                this.rollbackHandler();
            }
        });

        // Round 51 — wire the persistent-memories <details> toggle to
        // sessionStorage so the expanded/collapsed state survives
        // intra-tab reloads but resets on a fresh tab (sessionStorage
        // is per-tab by spec).
        const detailsEl = this.root.querySelector<HTMLDetailsElement>('.hud-memories');
        if (detailsEl) {
            this.setupMemoriesToggle(detailsEl);
        }
    }

    /**
     * Round 51 — render the five persistent prompt lines
     * (lastBiome ↩ / lastSpeaker 🗣 / npcSnapshot 🧠 /
     * lastNpcDisposition 🎭 / lastSceneBlueprint 🎬) inside a
     * single `<details>`/`<summary>` block. The summary shows a
     * compact emoji+count of how many fields are currently set;
     * the body preserves the original five divs verbatim so the
     * round-43/44/45/46/47 HUD contract is unchanged.
     *
     * Round 64 added a 6th (🗺 minimap) and round 69 added a
     * 7th (⚡ wasm-latency). The summary count, emoji strip,
     * and per-row guards all scale automatically with the
     * boolean flags below.
     *
     * Returns an empty string when no fields are set (the
     * `<details>` block is then absent from the DOM, matching
     * the pre-round-51 behavior where each line was an
     * independent guard).
     */
    private renderPersistentMemories(s: HUDState): string {
        // Per-field vote: a field "counts" if it has a non-null
        // value (or, for npcMindsSnapshotCount, a non-zero count).
        const biomeOn = s.lastBiome != null;
        const speakerOn = s.lastSpeakerId != null;
        const snapshotOn = (s.npcMindsSnapshotCount ?? 0) > 0;
        const moodOn = s.lastNpcDisposition != null;
        const sceneOn = s.lastSceneNpcCount != null
            || s.lastSceneBpm != null
            || s.lastSceneEventCount != null
            || s.lastSceneArchetypeHintCount != null;
        const minimapOn = s.lastMinimap != null;
        // Round 69 — the wasm latency row is "on" when stats
        // exist AND at least one fn has a non-zero count. A
        // zero-count stats object (immediately after reset, or
        // after a typo where the aggregator wired up but no
        // events fired yet) shouldn't pull the row in.
        const wasmOn = (s.wasmLatencyStats?.perFn
            ? Object.keys(s.wasmLatencyStats.perFn).length > 0
            : false);
        // Round 73 — the event-chain row is "on" when the
        // chain is a non-empty array. An empty array (e.g. a
        // round-49 partial save where the loader didn't have
        // a chain to recover) shouldn't pull the row in.
        const chainOn = Array.isArray(s.lastSceneEventChain)
            && (s.lastSceneEventChain as EventStep[]).length > 0;
        // Round 79 — the rollback-count row is "on" when
        // the count is a positive number. A null (legacy
        // save / not-yet-set), 0 (fresh boot), or negative
        // (shouldn't happen, but treat as off) all keep
        // the row hidden so the player only sees the row
        // when the save has actually triggered ≥ 1
        // rollback.
        const rollbackOn = typeof s.rollbackCount === 'number' && s.rollbackCount > 0;
        // Round 146 — the debouncer mini-strip is "on"
        // when the debouncers array is set AND non-empty.
        // A null (no App-level debouncers) or empty array
        // (legacy save, hard reset) both keep the strip
        // hidden so the HUD doesn't render a useless row.
        const debouncersOn = Array.isArray(s.debouncers)
            && (s.debouncers as ReadonlyArray<unknown>).length > 0;

        const count = (biomeOn ? 1 : 0)
            + (speakerOn ? 1 : 0)
            + (snapshotOn ? 1 : 0)
            + (moodOn ? 1 : 0)
            + (sceneOn ? 1 : 0)
            + (minimapOn ? 1 : 0)
            + (wasmOn ? 1 : 0)
            + (chainOn ? 1 : 0)
            + (rollbackOn ? 1 : 0)
            + (debouncersOn ? 1 : 0);
        if (count === 0) return '';

        const emojiOrder: string[] = [];
        if (biomeOn) emojiOrder.push('↩');
        if (speakerOn) emojiOrder.push('🗣');
        if (snapshotOn) emojiOrder.push('🧠');
        if (moodOn) emojiOrder.push('🎭');
        if (sceneOn) emojiOrder.push('🎬');
        if (minimapOn) emojiOrder.push('🗺');
        if (wasmOn) emojiOrder.push('⚡');
        if (chainOn) emojiOrder.push('⏰');
        if (rollbackOn) emojiOrder.push('🛟');
        if (debouncersOn) emojiOrder.push('⏱');

        // sessionStorage may be absent in non-browser test envs;
        // guard with a typeof check before reading. The key
        // 'hud-memories-open' is intentionally short — there is
        // only one collapsible surface in the HUD.
        const persistedOpen = (typeof sessionStorage !== 'undefined')
            ? sessionStorage.getItem('hud-memories-open') === '1'
            : false;
        const openAttr = persistedOpen ? ' open' : '';

        // Round 69 — build the per-fn WASM latency lines.
        // One `<div>` per active fn, in insertion order. The
        // number format is "median Xms · p95 Yms · max Zms
        // (×N samples)" so the player can spot a regression
        // (p95 climbing) at a glance. Round 74: the
        // dimmed count suffix and the compact per-fn list
        // moved from inline `style="..."` to the
        // `.hud-memories-row-count` and
        // `.hud-memories-row-detail` classes (see
        // style.css). Round 152: when `s.compact === true`,
        // the per-fn detail list is dropped and only the
        // headline row renders.
        let wasmRows = '';
        if (wasmOn && s.wasmLatencyStats) {
            const detail = s.compact
                ? ''
                : `<br><span class="hud-memories-row-detail">${
                    Object.entries(s.wasmLatencyStats.perFn).map(
                        ([name, stat]) => `· <b>${escapeHtml(name)}</b>: median <b>${stat.medianMs}</b>ms · p95 <b>${stat.p95Ms}</b>ms · max <b>${stat.maxMs}</b>ms (×${stat.count})`,
                    ).join('<br>')
                }</span>`;
            wasmRows = `<div class="hud-wasm-latency">⚡ WASM 延迟 <span class="hud-memories-row-count">(${s.wasmLatencyStats.totalSamples} 样本)</span>${detail}</div>`;
        }

        // Round 73 — build the event-chain row. The chain
        // is already delay-sorted (both `themeToScene` and
        // `synthesizeDmEventChain` guarantee this), so the
        // first entry is the next event. We show "next:
        // <kind> in <delaySecs>s" as the headline and a
        // compact list of all events underneath. Round 74:
        // the dimmed count suffix and the compact list use
        // the same `.hud-memories-row-*` classes as the
        // `⚡` row above. Round 86 — appended a kind-
        // distribution summary (e.g. "spawn_wave ×2,
        // echo_lore ×1") so the player can see the
        // composition of their current scene's events at
        // a glance, without scanning the compact list.
        // Round 152: when `s.compact === true`, the
        // full per-event timeline is dropped and only
        // the headline row + the kind-distribution
        // summary render.
        let chainRows = '';
        if (chainOn && s.lastSceneEventChain) {
            const chain = s.lastSceneEventChain as EventStep[];
            const next = chain[0];
            const dist = summarizeEventKinds(chain);
            const distLine = dist
                ? ` · 分布: <b>${dist}</b>`
                : '';
            const detail = s.compact
                ? ''
                : `<br><span class="hud-memories-row-detail">${
                    chain.map((e) =>
                        `· t+<b>${e.delaySecs}</b>s <b>${escapeHtml(e.kind)}</b>`,
                    ).join('<br>')
                }</span>`;
            chainRows = `<div class="hud-event-chain">⏰ next: <b>${escapeHtml(next.kind)}</b> in <b>${next.delaySecs}</b>s <span class="hud-memories-row-count">(${chain.length} 事件${distLine})</span>${detail}</div>`;
        }

        return `
            <details class="hud-memories"${openAttr}>
                <summary>${emojiOrder.join('')} <b>${count}</b> 条记忆 · 点击展开</summary>
                ${biomeOn
                    ? `<div class="hud-biome-remembered">↩ 上次离开 <b>#${escapeHtml(s.lastBiome!)}</b></div>`
                    : ''}
                ${s.lastMinimap
                    ? `<div class="hud-minimap-row"><img class="hud-minimap" src="${escapeHtml(s.lastMinimap)}" alt="minimap of #${escapeHtml(s.lastBiome ?? '?')}" width="80" height="60" /></div>`
                    : ''}
                ${speakerOn
                    ? `<div class="hud-speaker-remembered">🗣 你刚才听见了 <b>${escapeHtml(s.lastSpeakerId!)}</b> 说${s.lastSpeakerBranch ? ` <span class="hud-speaker-branch hud-speaker-${escapeHtml(String(s.lastSpeakerBranch))}">[${escapeHtml(String(s.lastSpeakerBranch))}]</span>` : ''}</div>`
                    : ''}
                ${snapshotOn
                    ? `<div class="hud-npc-snapshot">🧠 <b>${s.npcMindsSnapshotCount}</b> 个 NPC 记住了 <b>${s.npcMindsSnapshotMemories}</b> 段记忆</div>`
                    : ''}
                ${moodOn
                    ? `<div class="hud-npc-mood">🎭 集体情绪: friendly <b>${s.lastNpcDisposition!.friendly.toFixed(2)}</b> / fear <b>${s.lastNpcDisposition!.fear.toFixed(2)}</b> / trust <b>${s.lastNpcDisposition!.trust.toFixed(2)}</b></div>`
                    : ''}
                ${sceneOn
                    ? `<div class="hud-scene-blueprint">🎬 上次维度: NPC×<b>${s.lastSceneNpcCount ?? '—'}</b> · BPM <b>${s.lastSceneBpm ?? '—'}</b> · <b>${s.lastSceneEventCount ?? '—'}</b> 事件 · <b>${s.lastSceneArchetypeHintCount ?? '—'}</b> archetype</div>`
                    : ''}
                ${wasmRows}
                ${chainRows}
                ${rollbackOn
                    ? `<div class="hud-rollback-count">🛟 回滚了 <b>${s.rollbackCount}</b> 次</div>`
                    : ''}
                ${debouncersOn && s.debouncers
                    ? renderDebouncerStrip(s.debouncers as ReadonlyArray<{ debouncer: ActionDebouncer; chineseLabel: string }>, s.compact === true)
                    : ''}
            </details>
        `;
    }

    /**
     * Round 51 — wire the persistent-memories `<details>` element
     * to a `toggle` event listener that persists its open/closed
     * state in sessionStorage. We rely on the spec-defined
     * `ToggleEvent.newState` string ('open' | 'closed') rather
     * than reading `detailsEl.open` so the handler is decoupled
     * from DOM state and works the same way in jest (where
     * dispatchEvent does fire toggle but click on <summary> may
     * not auto-fire).
     */
    private setupMemoriesToggle(detailsEl: HTMLDetailsElement): void {
        if (typeof sessionStorage === 'undefined') return;
        detailsEl.addEventListener('toggle', (e) => {
            const newState = (e as ToggleEvent).newState;
            if (newState === 'open' || newState === 'closed') {
                sessionStorage.setItem('hud-memories-open', newState === 'open' ? '1' : '0');
            }
        });
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Round 86 — summarize an event chain's kind distribution.
 *
 * Walks the chain, counts occurrences of each `kind`,
 * and returns a compact "kind ×count, kind ×count" string
 * (e.g. "spawn_wave ×2, echo_lore ×1"). The order is
 * first-appearance (the order the events were scheduled),
 * so the player sees the most "upcoming" kind first.
 *
 * Returns an empty string for an empty chain so the
 * caller can skip the distribution line entirely.
 */
function summarizeEventKinds(chain: ReadonlyArray<EventStep>): string {
    if (chain.length === 0) return '';
    const counts = new Map<string, number>();
    for (const e of chain) {
        counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    }
    // First-appearance order — Map preserves insertion order.
    const parts: string[] = [];
    for (const [kind, count] of counts) {
        parts.push(`${escapeHtml(kind)} ×${count}`);
    }
    return parts.join(', ');
}

/**
 * Round 146 — render the
 * 4-debouncer mini-strip
 * in the round-51
 * `<details>` memories
 * block. Renders as a
 * single
 * `<div class="hud-debouncer-strip">`
 * with one
 * `<span>` cell per
 * debouncer showing:
 *
 *   可触发 · 5/0.5s | 屏蔽中 300/500ms · …
 *
 * Status derivation:
 *   - A debouncer that
 *     has NEVER fired
 *     (msSinceLastFire is
 *     Infinity) is
 *     "可触发" (open) —
 *     the first call
 *     always passes.
 *   - A debouncer that
 *     has fired and the
 *     elapsed time
 *     exceeds the window
 *     is "可触发" (open)
 *     — next call will
 *     pass.
 *   - A debouncer that
 *     has fired and the
 *     elapsed time is
 *     still inside the
 *     window is "屏蔽中"
 *     (shielding) — next
 *     call will be
 *     short-circuited.
 *
 * The status class
 * (`is-open` /
 * `is-shielding`) lets
 * CSS style the cell
 * with a different
 * background / glow so
 * the player can see
 * the cooldown without
 * reading the label.
 *
 * The 4 cells are
 * pipe-separated to
 * match the round-145
 * derived-summary
 * footer's visual
 * rhythm.
 */
function renderDebouncerStrip(
    debouncers: ReadonlyArray<{ debouncer: ActionDebouncer; chineseLabel: string }>,
    compact: boolean = false,
): string {
    const cells = debouncers.map((info) => {
        const d = info.debouncer;
        const sinceMs = d.msSinceLastFire;
        const window = d.windowSizeMs;
        // Mirror the round-128 `isDebouncing` derivation: a
        // never-stamped debouncer is "open" (not shielding).
        const isShielding = Number.isFinite(sinceMs) && sinceMs < window;
        const statusClass = isShielding ? 'is-shielding' : 'is-open';
        const statusLabel = isShielding ? '屏蔽中' : '可触发';
        // Compact countdown: when shielding, show
        // "<sinceMs>/<window>ms" so the player sees the
        // exact cooldown. When open, show "5/0.5s" style
        // (the round-128 window header) so the row is
        // visually stable. Round 152: when `compact`
        // is true, the per-cell countdown span is
        // dropped (the status label alone is enough
        // to convey state at a glance).
        const countdown = compact
            ? ''
            : (isShielding
                ? `${Math.round(sinceMs)}/${window}ms`
                : `${window}ms 可用`);
        const countdownSpan = compact
            ? ''
            : `<span class="hud-debouncer-strip-countdown">${countdown}</span>`;
        return `
            <span class="hud-debouncer-strip-cell ${statusClass}">
                <span class="hud-debouncer-strip-label">${escapeHtml(info.chineseLabel)}</span>
                <span class="hud-debouncer-strip-status">${statusLabel}</span>
                ${countdownSpan}
            </span>
        `;
    });
    // Pipe-separated (mirrors the round-145 derived-
    // summary footer). When there's only 1 cell, no
    // separator is rendered.
    const cellsWithSeps: string[] = [];
    debouncers.forEach((_, i) => {
        cellsWithSeps.push(cells[i]);
        if (i < debouncers.length - 1) {
            cellsWithSeps.push('<span class="hud-debouncer-strip-sep">|</span>');
        }
    });
    // Round 152: when compact, also tag the strip
    // wrapper with `hud-debouncer-strip-compact` so
    // a future CSS rule can tighten the row height.
    const cls = compact ? 'hud-debouncer-strip hud-debouncer-strip-compact' : 'hud-debouncer-strip';
    return `<div class="${cls}">${cellsWithSeps.join('')}</div>`;
}

/**
 * Round 147 — render
 * the hotkey hint
 * strip in the
 * `hud-stats` panel.
 * Renders as a
 * single
 * `<div class="hud-hotkeys">`
 * with one
 * `<span class="hud-hotkey">`
 * per binding showing:
 *
 *   [P] 设置 · [Q] 代码 · [R] 回滚 · [T] 状态
 *
 * Each hotkey shows
 * the keyboard key
 * inside an inline
 * `<kbd>` element so
 * CSS can style it as
 * a key cap (e.g.
 * rounded box + mono
 * font), and the
 * Chinese action
 * label after it.
 *
 * The optional
 * `group` field is
 * rendered as a small
 * section divider
 * (e.g. "面板" / "系统")
 * so the strip stays
 * scannable when the
 * host passes a longer
 * list of bindings.
 *
 * Hotkeys are dot-
 * separated (·) to
 * match the round-145
 * derived-summary
 * footer's visual
 * rhythm and the
 * existing HUD row
 * separators.
 */
function renderHotkeysStrip(
    hotkeys: ReadonlyArray<{ key: string; action: string; group?: string }>,
): string {
    // Single-pass: for each
    // binding, optionally
    // prepend a group label
    // (only when the group
    // field changes from the
    // previous binding's), then
    // the binding itself, then
    // a dot separator (omitted
    // after the last binding).
    const parts: string[] = [];
    hotkeys.forEach((h, i) => {
        const prevGroup = i > 0 ? hotkeys[i - 1].group : undefined;
        if (h.group && h.group !== prevGroup) {
            parts.push(`<span class="hud-hotkey-group">${escapeHtml(h.group)}</span>`);
        }
        parts.push(`
            <span class="hud-hotkey">
                <kbd class="hud-hotkey-key">${escapeHtml(h.key)}</kbd>
                <span class="hud-hotkey-action">${escapeHtml(h.action)}</span>
            </span>
        `);
        if (i < hotkeys.length - 1) {
            parts.push('<span class="hud-hotkey-sep">·</span>');
        }
    });
    return `<div class="hud-hotkeys">${parts.join('')}</div>`;
}

/**
 * Round 150 — render
 * a biome-contextual
 * hotkey strip with
 * a `—— ${label} ——`
 * header. The strip
 * itself reuses the
 * round-147 single-
 * pass layout (so the
 * visual rhythm is
 * consistent between
 * the base strip and
 * the biome strip).
 *
 * The header is shown
 * only when `label`
 * is non-null +
 * non-empty. When
 * null, the strip is
 * just the bindings
 * (the host can
 * optionally push a
 * label-less strip
 * for biomes with no
 * dedicated label).
 *
 * Uses distinct CSS
 * classes (`hud-hotkeys-
 * biome` / `hud-hotkey-
 * biome-label`) so the
 * stylesheet can
 * visually distinguish
 * the two strips (e.g.
 * the biome strip uses
 * a slightly different
 * background tint that
 * picks up the round-
 * 87 biome accent).
 */
function renderBiomeHotkeysStrip(
    label: string | null,
    hotkeys: ReadonlyArray<{ key: string; action: string; group?: string }>,
): string {
    const header = (label != null && label !== '')
        ? `<div class="hud-hotkey-biome-label">—— ${escapeHtml(label)} ——</div>`
        : '';
    const parts: string[] = [];
    hotkeys.forEach((h, i) => {
        const prevGroup = i > 0 ? hotkeys[i - 1].group : undefined;
        if (h.group && h.group !== prevGroup) {
            parts.push(`<span class="hud-hotkey-group">${escapeHtml(h.group)}</span>`);
        }
        parts.push(`
            <span class="hud-hotkey">
                <kbd class="hud-hotkey-key">${escapeHtml(h.key)}</kbd>
                <span class="hud-hotkey-action">${escapeHtml(h.action)}</span>
            </span>
        `);
        if (i < hotkeys.length - 1) {
            parts.push('<span class="hud-hotkey-sep">·</span>');
        }
    });
    return `<div class="hud-hotkeys hud-hotkeys-biome">${header}${parts.join('')}</div>`;
}
