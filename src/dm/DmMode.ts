/**
 * DmMode — "Dungeon Master mode": the player as creator.
 *
 * Extends the PRD's vision that the player is part of the AGI loop
 * (PRD §2.2.A "新玩法" + §2.4 "玩家可输入" by hint). This module
 * gives the player a small vocabulary to author:
 *
 *   - spawn NPC    `dm.spawn npc "骨魂将军" grumpy`
 *   - spawn rule   `dm.rule On(Collide) -> Apply(Damage, 5)`
 *   - trigger event `dm.event weather storm`
 *   - dimension    `dm.dim 12 8 cyberpunk`
 *
 * The mode is a thin parser: it accepts a single-line command,
 * splits it on whitespace, and dispatches to a handler. The
 * handlers are pluggable so the DM can add new verbs at runtime
 * (e.g. a tutorial system could add `dm.tutorial`).
 */

export type DmCommand =
    | { kind: 'spawn.npc';    name: string; personality: string }
    | { kind: 'spawn.rule';   dsl: string }
    | { kind: 'event';        name: string }
    | { kind: 'dimension';    rows: number; cols: number; style: string }
    | { kind: 'noop' };

export interface DmHandlers {
    onSpawnNpc?(cmd: { name: string; personality: string }): void;
    onSpawnRule?(dsl: string): void;
    onEvent?(name: string): void;
    onDimension?(rows: number, cols: number, style: string): void;
}

export interface DmResult {
    ok: boolean;
    cmd: DmCommand;
    error?: string;
}

const VALID_PERSONALITIES = new Set(['cheerful', 'grumpy', 'mysterious', 'wise', 'playful', 'stoic']);

export class DmMode {
    private handlers: DmHandlers;
    private history: DmResult[] = [];
    private maxHistory: number = 50;

    constructor(handlers: DmHandlers = {}) {
        this.handlers = handlers;
    }

    /** Parse and execute a single DM command. */
    run(line: string): DmResult {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            const r: DmResult = { ok: false, cmd: { kind: 'noop' }, error: 'empty command' };
            this.push(r);
            return r;
        }
        const tokens = trimmed.split(/\s+/);
        const head = tokens[0]?.toLowerCase();
        const rest = tokens.slice(1).join(' ');

        let cmd: DmCommand;
        switch (head) {
            case 'spawn':
                cmd = this.parseSpawn(rest);
                break;
            case 'rule':
            case 'dsl':
                cmd = { kind: 'spawn.rule', dsl: rest };
                break;
            case 'event':
                cmd = { kind: 'event', name: rest };
                break;
            case 'dim':
            case 'dimension':
                cmd = this.parseDimension(rest);
                break;
            default:
                cmd = { kind: 'noop' };
        }

        let ok = true;
        let error: string | undefined;
        try {
            switch (cmd.kind) {
                case 'spawn.npc':   this.handlers.onSpawnNpc?.(cmd); break;
                case 'spawn.rule':  this.handlers.onSpawnRule?.(cmd.dsl); break;
                case 'event':       this.handlers.onEvent?.(cmd.name); break;
                case 'dimension':   this.handlers.onDimension?.(cmd.rows, cmd.cols, cmd.style); break;
                case 'noop':        ok = false; error = `unknown command: ${head}`; break;
            }
        } catch (e) {
            ok = false;
            error = (e as Error).message ?? String(e);
        }
        const result: DmResult = { ok, cmd, error };
        this.push(result);
        return result;
    }

    private push(r: DmResult): void {
        this.history.push(r);
        if (this.history.length > this.maxHistory) this.history.shift();
    }

    private parseSpawn(rest: string): DmCommand {
        // Forms:
        //   spawn npc "<name>" <personality>
        //   spawn rule "<dsl>"
        const tokens = this.tokenize(rest);
        const what = tokens[0]?.toLowerCase();
        if (what === 'npc' && tokens.length >= 3) {
            const name = tokens[1].replace(/^"|"$/g, '');
            const personality = tokens[2];
            if (!VALID_PERSONALITIES.has(personality)) {
                // Still return the command; the caller will treat
                // unknown personality as a no-op, and the history
                // captures the attempt.
            }
            return { kind: 'spawn.npc', name, personality };
        }
        if (what === 'rule' && tokens.length >= 2) {
            return { kind: 'spawn.rule', dsl: rest.slice(5) };
        }
        return { kind: 'noop' };
    }

    private parseDimension(rest: string): DmCommand {
        const tokens = rest.split(/\s+/);
        const rows = Number(tokens[0]);
        const cols = Number(tokens[1]);
        const style = tokens[2] ?? 'dungeon';
        if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
            return { kind: 'noop' };
        }
        return { kind: 'dimension', rows: Math.floor(rows), cols: Math.floor(cols), style };
    }

    private tokenize(s: string): string[] {
        // Splits on whitespace but keeps "quoted strings" together.
        const out: string[] = [];
        let cur = '';
        let inStr = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '"') { inStr = !inStr; cur += c; continue; }
            if (!inStr && /\s/.test(c)) {
                if (cur.length > 0) { out.push(cur); cur = ''; }
                continue;
            }
            cur += c;
        }
        if (cur.length > 0) out.push(cur);
        return out;
    }

    getHistory(): DmResult[] { return [...this.history]; }
    lastResult(): DmResult | undefined { return this.history[this.history.length - 1]; }
}
