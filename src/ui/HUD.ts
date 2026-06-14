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
        scalars: {
            npcCount: number;
            bpm: number;
            eventCount: number;
            archetypeHintCount: number;
        } | null,
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

        this.root.innerHTML = `
            <div class="hud-panel hud-stats">
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
            </div>
            <div class="hud-panel hud-dim">
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

        const count = (biomeOn ? 1 : 0)
            + (speakerOn ? 1 : 0)
            + (snapshotOn ? 1 : 0)
            + (moodOn ? 1 : 0)
            + (sceneOn ? 1 : 0)
            + (minimapOn ? 1 : 0)
            + (wasmOn ? 1 : 0)
            + (chainOn ? 1 : 0);
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
        // (p95 climbing) at a glance.
        let wasmRows = '';
        if (wasmOn && s.wasmLatencyStats) {
            const lines = Object.entries(s.wasmLatencyStats.perFn).map(
                ([name, stat]) => `· <b>${escapeHtml(name)}</b>: median <b>${stat.medianMs}</b>ms · p95 <b>${stat.p95Ms}</b>ms · max <b>${stat.maxMs}</b>ms (×${stat.count})`,
            );
            wasmRows = `<div class="hud-wasm-latency">⚡ WASM 延迟 <span style="opacity:0.7">(${s.wasmLatencyStats.totalSamples} 样本)</span><br><span style="font-size:0.85em">${lines.join('<br>')}</span></div>`;
        }

        // Round 73 — build the event-chain row. The chain
        // is already delay-sorted (both `themeToScene` and
        // `synthesizeDmEventChain` guarantee this), so the
        // first entry is the next event. We show "next:
        // <kind> in <delaySecs>s" as the headline and a
        // compact list of all events underneath.
        let chainRows = '';
        if (chainOn && s.lastSceneEventChain) {
            const chain = s.lastSceneEventChain as EventStep[];
            const next = chain[0];
            const allLines = chain.map((e) =>
                `· t+<b>${e.delaySecs}</b>s <b>${escapeHtml(e.kind)}</b>`,
            );
            chainRows = `<div class="hud-event-chain">⏰ next: <b>${escapeHtml(next.kind)}</b> in <b>${next.delaySecs}</b>s <span style="opacity:0.7">(${chain.length} 事件)</span><br><span style="font-size:0.85em">${allLines.join('<br>')}</span></div>`;
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
