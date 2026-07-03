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

/**
 * Round 29 — local wrapper that the NpcMind constructor calls
 * when an archetype is supplied. We don't import the round-27
 * `archetypeInitialDisposition` helper directly from
 * NpcFactory here, because NpcFactory imports NPCProfile (and
 * transitively a few scene/AI modules). Keeping the table
 * locally in this lower-level file avoids a circular import
 * and lets the canonical disposition rules travel with the
 * class that actually owns the disposition state.
 *
 * The table mirrors `cocos4-rust/src/agi_minigame/npc.rs`'s
 * `archetype_initial_disposition`. If anyone changes the
 * values on one side, the round-29 integration test
 * (`archetype_initial_disposition_matches_engine_table`)
 * pins the cross-layer contract.
 */
function applyArchetypeDefault(archetype: string): NpcDisposition {
    switch (archetype) {
        case 'mage':
            return { friendly: 0.0, fear: 0.0, trust: 0.1 };
        case 'merchant':
            return { friendly: 0.4, fear: 0.0, trust: 0.0 };
        case 'guard':
            return { friendly: -0.1, fear: 0.1, trust: 0.2 };
        case 'rogue':
            return { friendly: -0.2, fear: 0.3, trust: -0.1 };
        case 'shaman':
            return { friendly: 0.0, fear: 0.2, trust: 0.0 };
        case 'peasant':
            return { friendly: 0.1, fear: 0.2, trust: 0.0 };
        default:
            return defaultDisposition();
    }
}

/**
 * Round 34 (extended in round 38) — archetype → topic boost
 * table. Returns the archetype's preference weight for each
 * topic, where higher means more likely to be picked. Used as
 * the weighting vector for the NEUTRAL fallback in
 * `suggestTopic`.
 *
 * Round 38 brings the TS table into 1:1 alignment with the
 * engine's 11-archetype set (cocos4-rust/src/agi_minigame/
 * npc.rs::archetype_topic_boost). The values for the 6
 * round-34 archetypes (merchant, guard, rogue, shaman,
 * peasant) are TS-only legacy entries that the engine maps
 * to None (flat weights); the 11 canonical archetypes share
 * the same 4-vector on both layers so the same input →
 * same suggestion.
 */
function archetypeTopicBoost(archetype: string | undefined): Record<string, number> {
    if (!archetype) return { greeting: 1, lore: 1, trade: 1, quest: 1 };
    switch (archetype) {
        // 11 canonical archetypes — values mirror
        // cocos4-rust/src/agi_minigame/npc.rs::archetype_topic_boost
        case 'robot':     return { greeting: 1, lore: 3, trade: 1, quest: 1 };
        case 'mage':      return { greeting: 1, lore: 3, trade: 0, quest: 2 };
        case 'beast':     return { greeting: 1, lore: 1, trade: 0, quest: 3 };
        case 'astronaut': return { greeting: 1, lore: 2, trade: 1, quest: 2 };
        case 'alien':     return { greeting: 1, lore: 2, trade: 0, quest: 3 };
        case 'siren':     return { greeting: 3, lore: 1, trade: 1, quest: 1 };
        case 'diver':     return { greeting: 2, lore: 1, trade: 2, quest: 1 };
        case 'scorpion':  return { greeting: 1, lore: 0, trade: 0, quest: 3 };
        case 'nomad':     return { greeting: 2, lore: 1, trade: 2, quest: 2 };
        case 'skeleton':  return { greeting: 0, lore: 1, trade: 0, quest: 3 };
        case 'lich':      return { greeting: 0, lore: 3, trade: 0, quest: 1 };
        // TS-only legacy entries (round 34 archetypes) —
        // the engine maps these to None (flat weights), but
        // the TS keeps distinct profiles for game-side UX.
        case 'merchant':  return { greeting: 1, lore: 1, trade: 3, quest: 1 };
        case 'guard':     return { greeting: 1, lore: 0, trade: 0, quest: 1 };
        case 'rogue':     return { greeting: 1, lore: 1, trade: 2, quest: 3 };
        case 'shaman':    return { greeting: 2, lore: 3, trade: 0, quest: 1 };
        case 'peasant':   return { greeting: 2, lore: 1, trade: 1, quest: 2 };
        default:
            return { greeting: 1, lore: 1, trade: 1, quest: 1 };
    }
}

/**
 * Round 34 — weighted deterministic pick. Returns the entry
 * of `pool` that covers the weighted range containing the
 * deterministic target index (seed + entry_count) % total.
 * Same inputs → same output (no rng call, just modular
 * arithmetic), so tests can pin specific picks.
 */
function pickWeighted(
    pool: string[],
    weights: Record<string, number>,
    seed: number,
    entryCount: number,
): string {
    const total = pool.reduce((acc, t) => acc + (weights[t] ?? 1), 0);
    if (total <= 0) return pool[0];
    const target = ((seed >>> 0) + entryCount) % total;
    let acc = 0;
    for (const t of pool) {
        acc += (weights[t] ?? 1);
        if (target < acc) return t;
    }
    return pool[pool.length - 1];
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
 * Round 48 — per-NPC memory + disposition snapshot. Captures the
 * canonical "what the world remembers about each NPC" state for
 * cross-save persistence and rehydration. The Rust-side
 * `NpcMindSnapshot` struct (in `cocos4-rust/src/agi_minigame/
 * npc.rs`) is the mirror of this interface; field names + types
 * match 1:1 so the round-40 serialized payload can be rehydrated
 * into a live `NpcMind` via `NpcMind.rehydrate` without
 * translation.
 *
 * The archetype field is `string | null` (not `string | undefined`)
 * to match the round-40 save shape — `JSON.stringify` would
 * otherwise drop undefined fields, but null round-trips as
 * `null` so the load side can detect "explicitly empty" vs
 * "field missing."
 */
export interface NpcMindSnapshot {
    id: string;
    archetype: string | null;
    disposition: NpcDisposition;
    entries: NpcMemorySnapshotEntry[];
}

export interface NpcMemorySnapshotEntry {
    kind: NpcMemoryKind;
    summary: string;
    turn: number;
    weight: number;
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
    /** Round 29 — archetype tag (e.g. 'mage', 'merchant'). Optional. */
    private _archetype: string | undefined;

    constructor(
        id: NpcId,
        capacity: number = NpcMind.DEFAULT_CAPACITY,
        archetype?: string,
    ) {
        this._id = id;
        this._capacity = capacity < 0 ? 0 : capacity;
        // Round 29 — if the caller passes an archetype, seed the
        // initial disposition from the round-27 archetype helper
        // (canonical in the engine; mirrored in NpcFactory). The
        // helper is imported lazily to avoid a hard cycle through
        // the higher-level NPCProfile machinery.
        if (archetype) {
            this._archetype = archetype;
            const init = applyArchetypeDefault(archetype);
            this._disposition = init;
        }
    }

    /**
     * Round 48 — build a NpcMind from a persisted
     * NpcMindSnapshot. Capacity adapts to the snapshot's
     * entry count (clamped to a minimum of DEFAULT_CAPACITY)
     * so the rehydrated ring never wraps entries the snapshot
     * had room for.
     *
     * Critically, the rehydrated `disposition` is taken
     * VERBATIM from the snapshot — we do NOT call
     * `applyArchetypeDefault` here, because the snapshot's
     * disposition is the "last-known live state" (e.g. the
     * round-27 "high-difficulty clear → +0.6 trust"
     * broadcasts) and overwriting it with the archetype
     * baseline would discard that history. The round-21/29
     * constructor path stays the canonical "fresh boot"
     * path; this factory is the canonical "rehydrate from
     * save" path.
     *
     * Mirrors the Rust `NpcMind::rehydrate` 1:1; the engine
     * round-trip test
     * (`snapshot_to_mind_round_trip_is_byte_identical`) pins
     * the cross-layer invariant.
     */
    static rehydrate(snap: NpcMindSnapshot): NpcMind {
        const cap = Math.max(snap.entries.length, NpcMind.DEFAULT_CAPACITY);
        // Round 48 — bypass the constructor's archetype-init
        // path by setting the private fields directly via a
        // minimal shape. We don't have a "no-archetype-init"
        // constructor flag, so we use a sentinel: build with
        // no archetype, then patch in the disposition +
        // archetype from the snapshot.
        const m = new NpcMind(snap.id, cap);
        // Cast: the constructor's `if (archetype)` branch was
        // skipped because we passed no archetype, so
        // _archetype is undefined. We need to set it to
        // either the snapshot's string or undefined to match
        // the snapshot's "null → undefined" convention.
        (m as any)._archetype = snap.archetype ?? undefined;
        (m as any)._disposition = { ...snap.disposition };
        // Push entries in the snapshot's order (oldest first,
        // newest last — matches `recent(n)`'s return order).
        for (const e of snap.entries) {
            // The snapshot's `weight` was already clamped at
            // construction time (round-21), so we trust the
            // stored value. Defensive clamp in case a hand-
            // crafted save slipped an out-of-range weight
            // through.
            m._entries.push({
                kind: e.kind,
                summary: e.summary,
                turn: e.turn,
                weight: clamp1(e.weight),
            });
        }
        return m;
    }

    id(): NpcId { return this._id; }
    archetype(): string | undefined { return this._archetype; }
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
     * (mood, last_kind, seed, archetype). Mirror of Rust
     * NpcMind::suggest_topic.
     *
     * Round 34 — the NEUTRAL fallback is now weighted by the
     * NPC's archetype so a mage leans toward 'lore' and a
     * merchant toward 'trade' even when no specific mood rule
     * fires.
     */
    suggestTopic(seed: number): string {
        const mood = this.mood();
        const last = this._entries[this._entries.length - 1]?.kind;
        const NEUTRAL = ['greeting', 'lore', 'trade', 'quest'];
        if (mood === 'happy' && last === 'received_gift') return 'trade';
        if (mood === 'happy' && last === 'dialogue') return 'quest';
        if (mood === 'happy') return 'greeting';
        if (mood === 'hostile') return 'combat';
        if (mood === 'uneasy' && last === 'hostility') return 'farewell';
        if (mood === 'uneasy' && last === 'witnessed_event') return 'lore';
        if (mood === 'uneasy') return 'farewell';
        if (mood === 'neutral' && last === 'heard_about_dimension') return 'lore';
        // Weighted NEUTRAL fallback — round 34 archetype bias.
        return pickWeighted(NEUTRAL, archetypeTopicBoost(this._archetype),
                            seed, this._entries.length);
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

    /**
     * Round 53 — empty the registry of all minds. Called
     * by `App.loadGame` when the round-48 NpcMind
     * rehydration path throws (a corrupted snapshot or a
     * kind-string mismatch). The recovery policy is:
     * reset the live NPC roster so the next `broadcast` /
     * `averageDisposition` is well-defined, and continue
     * rendering the round-49/50 scene snapshot from the
     * same biome/seed (the scene blueprint is still
     * valid; only the NPC identity layer is corrupted).
     * Unlike `loadFromSnapshots`, this method does NOT
     * deep-copy or rehydrate anything — it is a hard
     * reset to empty state. Does not throw on an
     * already-empty registry.
     */
    clear(): void {
        this._minds.length = 0;
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

    /**
     * Round 48 — replace the registry's contents with minds
     * rehydrated from a list of `NpcMindSnapshot`s. Each
     * snapshot is rebuilt via `NpcMind.rehydrate` and inserted
     * in order.
     *
     * The replace is FULL — any minds present in `this` are
     * dropped. This matches the round-48 semantic "snapshot is
     * the new source of truth at app boot, not a delta" and
     * is the right behavior for save→reload (the snapshot
     * reflects the last live state).
     *
     * Idempotent: running twice with the same input produces
     * the same registry state.
     *
     * Mirrors the Rust `NpcRegistry::load_from_snapshots_into`
     * 1:1; the engine test
     * (`registry_load_from_snapshots_into_is_idempotent`) pins
     * the cross-layer invariant.
     */
    loadFromSnapshots(snapshots: NpcMindSnapshot[]): void {
        this._minds.length = 0;
        for (const snap of snapshots) {
            this._minds.push(NpcMind.rehydrate(snap));
        }
    }
}
