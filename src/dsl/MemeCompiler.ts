/**
 * MemeCompiler — the TypeScript side of the AGI ↔ engine pipeline.
 *
 * - combineMemes:  given the player's collected meme fragments, build the
 *                  prompt that will be sent to the LLM.
 * - parseDSL:      validate the DSL string the LLM returns before we hand
 *                  it to the Rust engine. Mirrors the grammar accepted by
 *                  `cocos4-rust/src/agi_minigame` and the dsl::parser in
 *                  `AGI-miniGame/src/dsl/parser.rs`.
 * - toEngineJSON:  convert the parsed rule into a JSON value-map the Rust
 *                  AtomContext can ingest.
 *
 * Grammar (subset, mirrors Rust parser):
 *   rule        := event "->" action ("," action)*
 *   event       := "On(" eventKind ("," eventArg)? ")"
 *   eventKind   := "Collide" | "Timer" | "Spawn" | "PlayerHit"
 *   action      := "Apply(" actionKind ("," arg ("," arg)?)? ")"
 *   actionKind  := "Damage" | "Heal" | "Spawn" | "SpawnEntity"
 *   arg         := number | string
 */

export type Meme = 'Fire' | 'Speed' | 'Life' | 'Gravity' | 'Shield' | 'Time' | 'Create';

export type DslEventKind = 'Collide' | 'Timer' | 'Spawn' | 'PlayerHit';
export type DslActionKind = 'Damage' | 'Heal' | 'Spawn' | 'SpawnEntity';

export interface DslEvent {
    kind: DslEventKind;
    arg?: number | string;
}

export interface DslAction {
    kind: DslActionKind;
    args: (number | string)[];
}

export interface DslRule {
    event: DslEvent;
    actions: DslAction[];
}

export interface MemePrompt {
    memes: Meme[];
    prompt: string;
}

const MEME_LIBRARY: Record<Meme, string> = {
    Fire:    '火焰伤害，燃烧效果',
    Speed:   '移动速度与攻击速度',
    Life:    '生命回复与最大 HP',
    Gravity: '重力方向与强度',
    Shield:  '护盾与减伤',
    Time:    '时间膨胀 / 减速',
    Create:  '生成新实体 / 召唤',
};

/** Step 1: build the prompt for the LLM. */
export function combineMemes(memes: Meme[]): MemePrompt {
    if (memes.length === 0) {
        throw new Error('combineMemes requires at least one meme');
    }
    const traits = memes.map(m => MEME_LIBRARY[m] || m).join('、');
    const prompt =
        `你是一名 AGI 游戏设计师。玩家提供了以下模因碎片：${memes.join(' + ')}。\n` +
        `它们分别代表：${traits}。\n` +
        `请输出 1 条游戏规则 DSL（不超过 1 行），语法严格遵循：\n` +
        `  On(<Event>[, <num>]) -> Apply(<Action>[, <num | "name">])\n` +
        `其中 Event ∈ {Collide, Timer, Spawn, PlayerHit}；\n` +
        `Action ∈ {Damage, Heal, Spawn, SpawnEntity}。\n` +
        `只输出 DSL 一行代码，不要解释。`;

    return { memes, prompt };
}

/** Step 2: parse a single-line DSL rule. */
export function parseDSL(line: string): DslRule {
    const cleaned = line.trim().replace(/;$/, '');
    if (!cleaned) throw new Error('empty DSL');

    const arrowIdx = cleaned.indexOf('->');
    if (arrowIdx < 0) {
        throw new Error(`missing "->" in DSL: ${line}`);
    }
    const eventPart = cleaned.slice(0, arrowIdx).trim();
    const actionsPart = cleaned.slice(arrowIdx + 2).trim();

    const event = parseEvent(eventPart);
    const actions = splitTopLevel(actionsPart, ',').map(s => s.trim()).filter(Boolean).map(parseAction);

    return { event, actions };
}

function parseEvent(src: string): DslEvent {
    const inside = unwrapParens(src, 'On');
    const tokens = splitTopLevel(inside, ',');
    if (tokens.length === 0) throw new Error(`event missing kind: ${src}`);
    const kind = tokens[0] as DslEventKind;
    if (!['Collide', 'Timer', 'Spawn', 'PlayerHit'].includes(kind)) {
        throw new Error(`unknown event kind: ${kind}`);
    }
    const arg = tokens[1] !== undefined ? parseArg(tokens[1]) : undefined;
    return { kind, arg };
}

function parseAction(src: string): DslAction {
    // First token is the action kind, rest are the args (inside parentheses).
    // We support two DSL forms for ergonomics:
    //   1) bare:   Damage(10)
    //   2) wrapped: Apply(Damage, 10)   ← the form described in the docstring
    const open = src.indexOf('(');
    if (open < 0) throw new Error(`action missing parens: ${src}`);
    let kind = src.slice(0, open).trim();
    let inside = src.slice(open + 1, src.lastIndexOf(')'));

    if (kind === 'Apply') {
        // Apply(<ActionKind>, <arg>, ...)
        const tokens = splitTopLevel(inside, ',');
        if (tokens.length === 0) throw new Error(`Apply needs a kind: ${src}`);
        kind = tokens[0].trim();
        inside = tokens.slice(1).join(',');
    }

    if (!['Damage', 'Heal', 'Spawn', 'SpawnEntity'].includes(kind)) {
        throw new Error(`unknown action kind: ${kind}`);
    }
    const argTokens = splitTopLevel(inside, ',');
    return { kind: kind as DslActionKind, args: argTokens.map(parseArg) };
}

function parseArg(t: string): number | string {
    const s = t.trim();
    if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1);
    }
    const n = Number(s);
    if (!Number.isNaN(n) && s !== '') return n;
    return s;
}

function unwrapParens(src: string, head: string): string {
    if (!src.startsWith(head + '(')) {
        throw new Error(`expected ${head}(...) but got: ${src}`);
    }
    if (!src.endsWith(')')) {
        throw new Error(`unbalanced parens: ${src}`);
    }
    return src.slice(head.length + 1, -1);
}

function splitTopLevel(src: string, sep: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    let inString = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '"') inString = !inString;
        if (!inString) {
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === sep && depth === 0) {
                out.push(cur);
                cur = '';
                continue;
            }
        }
        cur += c;
    }
    if (cur.length) out.push(cur);
    return out;
}

/** Step 3: convert the rule into a JSON value-map the Rust engine can ingest. */
export function toEngineJSON(rule: DslRule): Record<string, unknown> {
    return {
        event: {
            kind: rule.event.kind,
            arg: rule.event.arg ?? null,
        },
        actions: rule.actions.map(a => ({
            kind: a.kind,
            args: a.args,
        })),
    };
}

/** Convenience: full pipeline from memes to a JSON rule (without the LLM call). */
export function compileFallback(memes: Meme[]): DslRule {
    // Deterministic fallback that does NOT call the LLM — used in tests and
    // when offline. Picks an action from the first meme and the event from
    // the most common combination.
    const has = (m: Meme) => memes.includes(m);
    let rule: DslRule;
    if (has('Fire') && has('Speed')) {
        rule = { event: { kind: 'Timer', arg: 1 }, actions: [{ kind: 'Spawn', args: ['Fireball', 10] }] };
    } else if (has('Gravity')) {
        rule = { event: { kind: 'PlayerHit' }, actions: [{ kind: 'Spawn', args: ['GravityWell', 1] }] };
    } else if (has('Life')) {
        rule = { event: { kind: 'Timer', arg: 5 }, actions: [{ kind: 'Heal', args: [25] }] };
    } else if (has('Shield')) {
        rule = { event: { kind: 'Collide' }, actions: [{ kind: 'Spawn', args: ['Shield', 1] }] };
    } else {
        rule = { event: { kind: 'Collide' }, actions: [{ kind: 'Damage', args: [10] }] };
    }
    return rule;
}
