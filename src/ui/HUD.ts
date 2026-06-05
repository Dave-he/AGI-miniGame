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
}

export class HUD {
    private root: HTMLElement;
    private i18n: I18n;
    private state: HUDState;
    private langBtn: HTMLButtonElement | null = null;

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
                ${s.lastBiome
                    ? `<div class="hud-biome-remembered">↩ 上次离开 <b>#${escapeHtml(s.lastBiome)}</b></div>`
                    : ''}
                ${s.lastSpeakerId
                    ? `<div class="hud-speaker-remembered">🗣 你刚才听见了 <b>${escapeHtml(s.lastSpeakerId)}</b> 说${s.lastSpeakerBranch ? ` <span class="hud-speaker-branch hud-speaker-${escapeHtml(String(s.lastSpeakerBranch))}">[${escapeHtml(String(s.lastSpeakerBranch))}]</span>` : ''}</div>`
                    : ''}
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
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
