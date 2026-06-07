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
        return `
            <div class="hud-recovery-banner" role="status">
                <span>[scene] 自动恢复: 旧渲染失败 (<b>${escapeHtml(banner.code)}</b>) → 进入新维度 <b>#${escapeHtml(banner.biome ?? '—')}</b></span>
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

        const count = (biomeOn ? 1 : 0) + (speakerOn ? 1 : 0) + (snapshotOn ? 1 : 0) + (moodOn ? 1 : 0) + (sceneOn ? 1 : 0);
        if (count === 0) return '';

        const emojiOrder: string[] = [];
        if (biomeOn) emojiOrder.push('↩');
        if (speakerOn) emojiOrder.push('🗣');
        if (snapshotOn) emojiOrder.push('🧠');
        if (moodOn) emojiOrder.push('🎭');
        if (sceneOn) emojiOrder.push('🎬');

        // sessionStorage may be absent in non-browser test envs;
        // guard with a typeof check before reading. The key
        // 'hud-memories-open' is intentionally short — there is
        // only one collapsible surface in the HUD.
        const persistedOpen = (typeof sessionStorage !== 'undefined')
            ? sessionStorage.getItem('hud-memories-open') === '1'
            : false;
        const openAttr = persistedOpen ? ' open' : '';

        return `
            <details class="hud-memories"${openAttr}>
                <summary>${emojiOrder.join('')} <b>${count}</b> 条记忆 · 点击展开</summary>
                ${biomeOn
                    ? `<div class="hud-biome-remembered">↩ 上次离开 <b>#${escapeHtml(s.lastBiome!)}</b></div>`
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
