/**
 * NpcMind — TypeScript mirror of the cocos4-rust
 * `agi_minigame::npc::NpcMind` + `NpcRegistry`.
 *
 * The mind is a bounded ring of memories per NPC plus a 3-axis
 * disposition vector (friendly / fear / trust). Together they let
 * the game layer route each NPCDialogueAI call through a
 * personality-aware filter: a player who keeps gifting a merchant
 * will be greeted with `trade`; a player who keeps attacking the
 * NPC's faction will be met with `combat` instead.
 *
 * Round 21 introduces this alongside the Rust implementation; the
 * two APIs are kept deliberately symmetric so the game layer can
 * switch from a pure-TS mind (default) to a WASM-backed mind
 * (future) by swapping the constructor.
 *
 * The class is engine-agnostic: no scene, no LLM, no timers.
 */

export type NpcId = string;

export type NpcMemoryKind =
    | 'dialogue'
    | 'witnessed_event'
    | 'heard_about_dimension'
    | 'received_gift'
    | 'hostility';

export interface NpcMemoryEntry {
    kind: NpcMemoryKind;
    /** Short, free-form summary the game layer writes in. */
    summary: string;
    /** Monotonic turn counter (or millis) the caller assigns. */
    turn: number;
    /** `[-1.0, 1.0]` weight that biases disposition shifts. */
    weight: number;
}

export interface NpcDisposition {
    friendly: number;
    fear: number;
    trust: number;
}

export type NpcMood = 'happy' | 'neutral' | 'uneasy' | 'hostile';

/** Clamp a number into the unit interval [-1, 1]. */
function clamp1(x: number): number {
    if (x > 1.0) return 1.0;
    if (x < -1.0) return -1.0;
    return x;
}

/** Default empty disposition — every axis at 0. */
export function defaultDisposition(): NpcDisposition {
    return { friendly: 0, fear: 0, trust: 0 };
}

/** Construct an entry with the weight clamped at construction time. */
export function makeEntry(
    kind: NpcMemoryKind,
    summary: string,
    turn: number,
    weight: number,
): NpcMemoryEntry {
    return { kind, summary, turn, weight: clamp1(weight) };
}

/**
 * Per-NPC memory + disposition. Mirror of the Rust NpcMind.
 */
export class NpcMind {
    /** Default capacity — 32 memories per NPC. */
    static readonly DEFAULT_CAPACITY = 32;

    private readonly _id: NpcId;
    private readonly _capacity: number;
    private readonly _entries: NpcMemoryEntry[] = [];
    private _disposition: NpcDisposition = defaultDisposition();

    constructor(id: NpcId, capacity: number = NpcMind.DEFAULT_CAPACITY) {
        this._id = id;
        this._capacity = capacity < 0 ? 0 : capacity;
    }

    id(): NpcId { return this._id; }
    len(): number { return this._entries.length; }
    isEmpty(): boolean { return this._entries.length === 0; }
    capacity(): number { return this._capacity; }
    disposition(): NpcDisposition { return { ...this._disposition }; }

    /**
     * Append a memory and absorb its weight into disposition. The
     * kind decides which axis the weight moves — matches the Rust
     * `remember`:
     *
     *   - dialogue              → friendly += w * 0.25
     *   - witnessed_event       → fear     += w * 0.15
     *   - heard_about_dimension → trust    += w * 0.10
     *   - received_gift         → friendly += w * 0.40, trust += w * 0.30
     *   - hostility             → friendly -= |w| * 0.50, fear += |w| * 0.60
     */
    remember(entry: NpcMemoryEntry): void {
        if (this._capacity === 0) return;
        const w = entry.weight;
        const d = this._disposition;
        switch (entry.kind) {
            case 'dialogue':
                d.friendly = clamp1(d.friendly + w * 0.25);
                break;
            case 'witnessed_event':
                d.fear = clamp1(d.fear + w * 0.15);
                break;
            case 'heard_about_dimension':
                d.trust = clamp1(d.trust + w * 0.10);
                break;
            case 'received_gift':
                d.friendly = clamp1(d.friendly + w * 0.40);
                d.trust    = clamp1(d.trust    + w * 0.30);
                break;
            case 'hostility': {
                const aw = Math.abs(w);
                d.friendly = clamp1(d.friendly - aw * 0.50);
                d.fear     = clamp1(d.fear     + aw * 0.60);
                break;
            }
        }
        if (this._entries.length === this._capacity) {
            this._entries.shift();
        }
        this._entries.push(entry);
    }

    /** Most recent memories, newest last. Mirrors DimensionVault.recent. */
    recent(limit: number): NpcMemoryEntry[] {
        const n = Math.min(limit, this._entries.length);
        if (n <= 0) return [];
        return this._entries.slice(this._entries.length - n).map(e => ({ ...e }));
    }

    /** Filter the ring by kind, newest last. */
    recallByKind(kind: NpcMemoryKind): NpcMemoryEntry[] {
        return this._entries.filter(e => e.kind === kind).map(e => ({ ...e }));
    }

    /** Manually clamp-shift the disposition. */
    shiftDisposition(df: number, dfear: number, dtrust: number): void {
        this._disposition = {
            friendly: clamp1(this._disposition.friendly + df),
            fear:     clamp1(this._disposition.fear     + dfear),
            trust:    clamp1(this._disposition.trust    + dtrust),
        };
    }

    /**
     * Coarse-grained mood label. Thresholds match Rust exactly:
     *   - happy:    friendly >= 0.40 && fear <= 0.30
     *   - hostile:  fear     >= 0.60 && friendly <= 0
     *   - uneasy:   fear     >= 0.30 || friendly <= -0.20
     *   - neutral:  otherwise
     */
    mood(): NpcMood {
        const { friendly, fear } = this._disposition;
        if (friendly >= 0.40 && fear <= 0.30) return 'happy';
        if (fear >= 0.60 && friendly <= 0) return 'hostile';
        if (fear >= 0.30 || friendly <= -0.20) return 'uneasy';
        return 'neutral';
    }

    /**
     * Suggest a topic the NPC should bring up next. Deterministic on
     * (mood, last_kind, seed). Mirror of Rust NpcMind::suggest_topic.
     */
    suggestTopic(seed: number): string {
        const mood = this.mood();
        const last = this._entries[this._entries.length - 1]?.kind;
        const NEUTRAL = ['greeting', 'lore', 'trade', 'quest'];
        const idx = (((seed >>> 0) + this._entries.length) >>> 0) % NEUTRAL.length;
        if (mood === 'happy' && last === 'received_gift') return 'trade';
        if (mood === 'happy' && last === 'dialogue') return 'quest';
        if (mood === 'happy') return 'greeting';
        if (mood === 'hostile') return 'combat';
        if (mood === 'uneasy' && last === 'hostility') return 'farewell';
        if (mood === 'uneasy' && last === 'witnessed_event') return 'lore';
        if (mood === 'uneasy') return 'farewell';
        if (mood === 'neutral' && last === 'heard_about_dimension') return 'lore';
        return NEUTRAL[idx];
    }

    /** Drop every memory and reset disposition. */
    clear(): void {
        this._entries.length = 0;
        this._disposition = defaultDisposition();
    }
}

/** Many minds, keyed by NpcId. */
export class NpcRegistry {
    private readonly _minds: NpcMind[] = [];

    len(): number { return this._minds.length; }
    isEmpty(): boolean { return this._minds.length === 0; }

    /** Insert or replace a mind keyed by id. */
    insert(mind: NpcMind): void {
        const i = this._minds.findIndex(m => m.id() === mind.id());
        if (i >= 0) this._minds[i] = mind;
        else this._minds.push(mind);
    }

    get(id: string): NpcMind | undefined {
        return this._minds.find(m => m.id() === id);
    }

    /** Iterate every mind in insertion order. */
    iter(): NpcMind[] {
        return [...this._minds];
    }

    /** Append the same memory to every NPC's ring. */
    broadcast(template: NpcMemoryEntry): void {
        for (const m of this._minds) {
            m.remember({ ...template });
        }
    }

    /** Aggregate disposition averaged across all minds. */
    averageDisposition(): NpcDisposition {
        if (this._minds.length === 0) return defaultDisposition();
        let f = 0, fr = 0, t = 0;
        for (const m of this._minds) {
            const d = m.disposition();
            f += d.friendly; fr += d.fear; t += d.trust;
        }
        const n = this._minds.length;
        return { friendly: f / n, fear: fr / n, trust: t / n };
    }
}
