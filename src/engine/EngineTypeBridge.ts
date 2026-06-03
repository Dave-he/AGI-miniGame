/**
 * EngineTypeBridge — TypeScript types that mirror cocos4-rust's
 * `agi_minigame::dsl::ast` so the TS layer can talk about the
 * engine's AST statically.
 *
 * The Rust source of truth is in
 *   cocos4-rust/src/agi_minigame/dsl/ast.rs
 *   cocos4-rust/src/agi_minigame/dsl/parser.rs
 *
 * When the engine is wired in via WASM, the runtime values come
 * straight from the Rust side; this file just gives the TS layer
 * the static type information so a single `parseDSL(dsl)` call can
 * be typed correctly and the resulting AST can be passed to other
 * TS modules without a cast.
 */

export type EngineEventKind = 'Collide' | 'Timer' | 'Spawn' | 'PlayerHit';
export type EngineActionKind = 'Damage' | 'Heal' | 'Spawn' | 'SpawnEntity';

export interface EngineArg {
    Number?: number;
    Str?: string;
}

export interface EngineEvent {
    kind: EngineEventKind;
    arg: EngineArg | null;
}

export interface EngineAction {
    kind: EngineActionKind;
    args: EngineArg[];
}

export interface EngineRule {
    event: EngineEvent;
    actions: EngineAction[];
}

/** Mirror of the Rust `EventKind::from_str` and `ActionKind::from_str`. */
export const ENGINE_EVENT_KINDS: readonly EngineEventKind[] =
    Object.freeze(['Collide', 'Timer', 'Spawn', 'PlayerHit']);
export const ENGINE_ACTION_KINDS: readonly EngineActionKind[] =
    Object.freeze(['Damage', 'Heal', 'Spawn', 'SpawnEntity']);

/** Parse a number or string arg, mirroring the Rust parser's tolerance. */
export function parseEngineArg(token: string): EngineArg | null {
    const t = token.trim();
    if (t.length === 0) return null;
    if (t.startsWith('"') && t.endsWith('"')) {
        return { Str: t.slice(1, -1) };
    }
    const n = Number(t);
    if (Number.isFinite(n)) return { Number: n };
    return { Str: t };
}

/** Render an arg back to a string for the DSL line. */
export function renderEngineArg(a: EngineArg): string {
    if (typeof a.Number === 'number') {
        return Number.isInteger(a.Number) ? String(a.Number) : a.Number.toFixed(4).replace(/\.?0+$/, '');
    }
    if (typeof a.Str === 'string') {
        return `"${a.Str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return '""';
}

/** Render a full rule back to a DSL line (matches Rust formatter). */
export function renderEngineRule(rule: EngineRule): string {
    const ev = `On(${rule.event.kind}${rule.event.arg ? `, ${renderEngineArg(rule.event.arg)}` : ''})`;
    const acts = rule.actions.map(a => {
        const inner = a.args.length === 0 ? '' : `, ${a.args.map(renderEngineArg).join(', ')}`;
        return `Apply(${a.kind}${inner})`;
    }).join(', ');
    return `${ev} -> ${acts}`;
}

/** Heuristic cost, mirroring Rust's `Rule::mutation_cost`. */
export function engineMutationCost(rule: EngineRule): number {
    let cost = 1;
    for (const a of rule.actions) {
        switch (a.kind) {
            case 'Damage':      cost += 1; break;
            case 'Heal':        cost += 1; break;
            case 'Spawn':       cost += 2; break;
            case 'SpawnEntity': cost += 3; break;
        }
    }
    return cost;
}

/** Coerce a TS rule from any source into a strict EngineRule. */
export function toEngineRule(input: {
    event: { kind: string; arg?: unknown };
    actions: Array<{ kind: string; args: unknown[] }>;
}): EngineRule | { error: string } {
    if (!ENGINE_EVENT_KINDS.includes(input.event.kind as EngineEventKind)) {
        return { error: `unknown event kind: ${input.event.kind}` };
    }
    const actions: EngineAction[] = [];
    for (const a of input.actions) {
        if (!ENGINE_ACTION_KINDS.includes(a.kind as EngineActionKind)) {
            return { error: `unknown action kind: ${a.kind}` };
        }
        const args: EngineArg[] = [];
        for (const raw of a.args) {
            if (typeof raw === 'number') args.push({ Number: raw });
            else if (typeof raw === 'string') args.push({ Str: raw });
            else return { error: `unsupported arg type: ${typeof raw}` };
        }
        actions.push({ kind: a.kind as EngineActionKind, args });
    }
    return {
        event: {
            kind: input.event.kind as EngineEventKind,
            arg: input.event.arg === undefined || input.event.arg === null
                ? null
                : typeof input.event.arg === 'number'
                    ? { Number: input.event.arg as number }
                    : { Str: String(input.event.arg) },
        },
        actions,
    };
}
