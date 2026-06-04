/**
 * GodConsole — small DM-mode prompt + history panel.
 *
 * The console is a 3-row overlay that becomes visible when the
 * player toggles "God mode" (a button in the control bar). The
 * prompt accepts DM commands (`spawn npc ...`, `rule ...`,
 * `event ...`, `dim R C style`) and renders the last N results.
 *
 * The console is engine-agnostic: it takes a DmMode and a few
 * callbacks. The App class wires the callbacks to scene mutation.
 */

import type { DmMode, DmResult } from '../dm/DmMode';

export interface GodConsoleHooks {
    /** Called for any result the player should be notified about. */
    onResult?: (r: DmResult) => void;
}

export class GodConsole {
    private root: HTMLElement;
    private dm: DmMode;
    private hooks: GodConsoleHooks;
    private visible: boolean = false;
    private input: HTMLInputElement | null = null;

    constructor(root: HTMLElement, dm: DmMode, hooks: GodConsoleHooks = {}) {
        this.root = root;
        this.dm = dm;
        this.hooks = hooks;
    }

    isVisible(): boolean { return this.visible; }

    setVisible(v: boolean): void {
        this.visible = v;
        if (v) this.render();
        else this.root.innerHTML = '';
    }

    toggle(): void { this.setVisible(!this.visible); }

    /** External command entry point (also used by the input). */
    submit(line: string): DmResult {
        const r = this.dm.run(line);
        this.hooks.onResult?.(r);
        if (this.visible) this.render();
        return r;
    }

    private render(): void {
        const history = this.dm.getHistory();
        const recent = history.slice(-12).reverse();
        const rows = recent.length === 0
            ? `<div class="god-empty">（暂无命令）</div>`
            : recent.map(r => {
                const ok = r.ok ? '✓' : '✗';
                const cmd = this.cmdLabel(r.cmd);
                const err = r.error ? ` <span class="god-err">${escapeHtml(r.error)}</span>` : '';
                return `<div class="god-row"><span class="god-ok">${ok}</span> <code>${escapeHtml(cmd)}</code>${err}</div>`;
            }).join('');

        this.root.innerHTML = `
            <div class="god-console">
                <div class="god-title">🎲 God Console (DM 模式)</div>
                <div class="god-help">
                    spawn npc "&lt;name&gt;" &lt;personality&gt; · rule &lt;DSL&gt; · event &lt;name&gt; · dim &lt;R&gt; &lt;C&gt; &lt;style&gt;
                </div>
                <div class="god-history">${rows}</div>
                <form class="god-form">
                    <input class="god-input" type="text" placeholder="spawn npc \"墨羽贤者\" wise" autocomplete="off" />
                    <button class="god-submit" type="submit">↵</button>
                </form>
            </div>
        `;
        this.input = this.root.querySelector<HTMLInputElement>('.god-input');
        this.root.querySelector<HTMLFormElement>('.god-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = this.input?.value ?? '';
            if (v.trim().length === 0) return;
            this.submit(v);
            if (this.input) this.input.value = '';
        });
    }

    private cmdLabel(cmd: DmResult['cmd']): string {
        switch (cmd.kind) {
            case 'spawn.npc':   return `spawn npc "${cmd.name}" ${cmd.personality}`;
            case 'spawn.rule':  return `rule ${cmd.dsl}`;
            case 'event':       return `event ${cmd.name}`;
            case 'dimension':   return `dim ${cmd.rows} ${cmd.cols} ${cmd.style}`;
            case 'noop':        return '(noop)';
        }
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
