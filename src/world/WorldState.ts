import { PlayerProfile, PlayerProgression } from '../player/PlayerProfile';
import { Wallet, CurrencyType } from '../economy/Wallet';
import { Inventory, InventoryItem, Reward } from '../economy/Inventory';
import type { BiomeId } from '../ai/SceneGen';
import type { NpcDisposition, NpcMemoryKind } from './NpcMind';

export interface DimensionInfo {
    dimensionId: string;
    gameplayTypes: string[];
    sessionStart: number;
    score: number;
    /**
     * Round 31 — the biome tag for this dimension, derived from
     * the WFC scaffold (round 24). Optional for back-compat with
     * dimensionInfo records that predate the WFC integration.
     */
    biome?: BiomeId;
}

/**
 * Round 40 — per-NPC memory snapshot. Captures the
 * canonical "what the world remembers about each NPC"
 * state for cross-save persistence. The live NpcRegistry
 * is rebuilt on app startup, so this is a *snapshot* for
 * HUD prompts and analytics rather than a rehydration
 * source.
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

export interface DimensionRecord {
    dimensionId: string;
    gameplayTypes: string[];
    startTime: number;
    endTime: number;
    score: number;
    rewardsEarned: Reward[];
}

export interface WorldEvent {
    eventId: string;
    name: string;
    description: string;
    startTime: number;
    endTime: number;
    isActive: boolean;
    modifiers: Record<string, any>;
}

export interface Announcement {
    id: string;
    title: string;
    content: string;
    timestamp: number;
}

export interface SeasonInfo {
    seasonId: string;
    name: string;
    startDate: number;
    endDate: number;
    theme: string;
    bonusMultiplier: number;
}

export interface PlayerStats {
    level: number;
    experience: number;
    gold: number;
    gem: number;
    energy: number;
    dimensionCount: number;
}

export class WorldState {
    public player: PlayerProfile;
    public progression: PlayerProgression;
    public wallet: Wallet;
    public inventory: Inventory;
    public activeDimension: DimensionInfo | null = null;
    public dimensionHistory: DimensionRecord[] = [];
    public worldEvents: WorldEvent[] = [];
    public announcements: Announcement[] = [];
    public seasonInfo: SeasonInfo | null = null;
    public globalData: Map<string, any> = new Map();

    constructor(accountId: string, displayName?: string) {
        this.player = new PlayerProfile(accountId, displayName);
        this.progression = new PlayerProgression();
        this.wallet = new Wallet();
        this.inventory = new Inventory(100);
    }

    setActiveDimension(dimensionId: string, gameplayTypes: string[], biome?: BiomeId): void {
        this.activeDimension = {
            dimensionId,
            gameplayTypes,
            sessionStart: Date.now(),
            score: 0,
            biome,
        };
        // Round 31 — record the biome on the running tally so the
        // last-visited biome can be queried even after
        // clearActiveDimension.
        if (biome) this.lastBiome = biome;
        this.progression.recordDimensionVisit(dimensionId);
    }

    /**
     * Round 31 — most recent biome the player entered. Persists
     * across `clearActiveDimension()` calls so the HUD can still
     * show "你刚从 #forest 归来" after the run is over.
     */
    public lastBiome: BiomeId | null = null;

    /**
     * Round 35 — snapshot of `NpcRegistry.averageDisposition()`.
     * The NpcRegistry itself is rebuilt on app startup via
     * `NpcFactory`, so it can't be fully round-tripped; but
     * the average disposition is the *signal* the world's
     * downstream consumers care about (scene_gen, narration,
     * balance_tuner), so persisting it lets the HUD show
     * "集体情绪: friendly 0.4 / fear 0 / trust 0.2" across
     * sessions instead of resetting to 0/0/0 every reload.
     *
     * The App keeps this in sync on every NpcRegistry
     * broadcast / remember (see `App.recordDimensionOutcome`
     * and the like). The field defaults to null for fresh
     * WorldStates.
     */
    public lastNpcDisposition: NpcDisposition | null = null;

    /**
     * Round 36 — last NPC that spoke via the round-33
     * individual narration pool. The HUD can show
     * "你刚才听见了 hostile_1 说：…" after a reload, instead
     * of the default "无人说话" placeholder. Also records
     * the speaker's disposition at the time of speech so the
     * "敬畏 / 恐惧 / 友善" tone survives the save → reload
     * cycle.
     */
    public lastSpeakerId: string | null = null;
    public lastSpeakerDisposition: NpcDisposition | null = null;

    /**
     * Round 40 — per-NPC memory snapshot. Each entry is a
     * `(id, archetype, disposition, entries)` tuple taken
     * from a live `NpcMind` at save time. The live registry
     * is rebuilt on app startup via `NpcFactory`, so this
     * snapshot is *informational* — the HUD log can show
     * "world remembers 5 NPC minds" — rather than a
     * rehydration source. (Full rehydration is a separate,
     * larger task; round 40 just closes the persistence
     * half.)
     */
    public npcMindsSnapshot: NpcMindSnapshot[] = [];

    /**
     * Round 40 — replace the snapshot. Called from
     * `App.syncNpcMindsSnapshot()` after every NpcRegistry
     * broadcast.
     */
    updateNpcMindsSnapshot(snapshot: NpcMindSnapshot[]): void {
        this.npcMindsSnapshot = snapshot;
    }

    /**
     * Round 47 — last SceneBlueprint's user-visible
     * scalars (npcCount, bpm, eventCount, archetypeHintCount).
     * The full `SceneBlueprint` includes WFC tile weights
     * (a `[u8; 8]` array) which are not user-facing, so
     * we persist only the fields the HUD prompt needs.
     * The live SceneBlueprint is rebuilt on the next
     * `enterNewDimension`, so this is *informational* —
     * the HUD prompt reads it for "上次在 #forest 里有
     * N 个 NPC, BPM T, M 个事件" continuity.
     */
    public lastSceneNpcCount: number | null = null;
    public lastSceneBpm: number | null = null;
    public lastSceneEventCount: number | null = null;
    public lastSceneArchetypeHintCount: number | null = null;

    /**
     * Round 47 — replace the SceneBlueprint scalars.
     * Called from `App.enterNewDimension()` after every
     * successful `themeToScene` call.
     */
    updateLastSceneBlueprint(scalars: {
        npcCount: number;
        bpm: number;
        eventCount: number;
        archetypeHintCount: number;
    } | null): void {
        if (!scalars) {
            this.lastSceneNpcCount = null;
            this.lastSceneBpm = null;
            this.lastSceneEventCount = null;
            this.lastSceneArchetypeHintCount = null;
        } else {
            this.lastSceneNpcCount = scalars.npcCount;
            this.lastSceneBpm = scalars.bpm;
            this.lastSceneEventCount = scalars.eventCount;
            this.lastSceneArchetypeHintCount = scalars.archetypeHintCount;
        }
    }

    clearActiveDimension(): DimensionInfo | null {
        const dim = this.activeDimension;
        this.activeDimension = null;
        return dim;
    }

    recordDimensionComplete(dimensionId: string, score: number, rewards: Reward[]): void {
        this.progression.recordDimensionComplete(score);

        for (const reward of rewards) {
            if (reward.itemId === 'gold') {
                this.wallet.addCurrency('gold', reward.quantity);
            } else if (reward.itemId === 'gem') {
                this.wallet.addCurrency('gem', reward.quantity);
            } else {
                const item: InventoryItem = {
                    itemId: reward.itemId,
                    name: reward.itemId,
                    quantity: reward.quantity,
                    maxStack: 99,
                };
                this.inventory.addItem(item);
            }
        }

        this.player.addExperience(Math.floor(score / 10));

        this.dimensionHistory.push({
            dimensionId,
            gameplayTypes: this.activeDimension?.gameplayTypes || [],
            startTime: this.activeDimension?.sessionStart || Date.now(),
            endTime: Date.now(),
            score,
            rewardsEarned: rewards,
        });

        this.activeDimension = null;
    }

    addGold(amount: number): void {
        this.wallet.addCurrency('gold', amount);
    }

    addGem(amount: number): void {
        this.wallet.addCurrency('gem', amount);
    }

    spendGold(amount: number): boolean {
        return this.wallet.spendCurrency('gold', amount);
    }

    spendGem(amount: number): boolean {
        return this.wallet.spendCurrency('gem', amount);
    }

    getGold(): number {
        return this.wallet.getBalance('gold');
    }

    getGem(): number {
        return this.wallet.getBalance('gem');
    }

    getEnergy(): number {
        return this.wallet.getBalance('energy');
    }

    spendEnergy(amount: number): boolean {
        return this.wallet.spendCurrency('energy', amount);
    }

    addInventoryItem(itemId: string, name: string, quantity: number): boolean {
        const item: InventoryItem = {
            itemId,
            name,
            quantity,
            maxStack: 99,
        };
        return this.inventory.addItem(item) > 0;
    }

    hasItem(itemId: string, minQuantity: number = 1): boolean {
        return this.inventory.hasItem(itemId, minQuantity);
    }

    getInventory(): Inventory {
        return this.inventory;
    }

    addWorldEvent(event: WorldEvent): void {
        this.worldEvents.push(event);
    }

    getActiveEvents(): WorldEvent[] {
        return this.worldEvents.filter(e => e.isActive);
    }

    removeEvent(eventId: string): void {
        this.worldEvents = this.worldEvents.filter(e => e.eventId !== eventId);
    }

    addAnnouncement(announcement: Announcement): void {
        this.announcements.push(announcement);
    }

    setGlobal(key: string, value: any): void {
        this.globalData.set(key, value);
    }

    getGlobal<T>(key: string): T | undefined {
        return this.globalData.get(key) as T | undefined;
    }

    getPlayerStats(): PlayerStats {
        return {
            level: this.player.level,
            experience: this.player.experience,
            gold: this.getGold(),
            gem: this.getGem(),
            energy: this.getEnergy(),
            dimensionCount: this.dimensionHistory.length,
        };
    }

    saveToJSON(): string {
        return JSON.stringify({
            player: this.player.toJSON(),
            progression: this.progression,
            wallet: this.wallet.getAllBalances(),
            inventory: this.inventory.getAllItems(),
            dimensionHistory: this.dimensionHistory,
            // Round 32 — persist the round-31 lastBiome so the
            // "你刚从 #forest 归来" HUD prompt survives a save
            // → reload cycle. (Back-compat: omitted when null,
            // older saves won't trip the loadFromJSON check.)
            lastBiome: this.lastBiome ?? undefined,
            // Also persist the active dimension's biome when
            // present. activeDimension is otherwise *not* saved
            // because it represents a transient session pointer;
            // the biome alone is enough to remember the world
            // context.
            activeDimensionBiome: this.activeDimension?.biome,
            // Round 35 — persist the round-22 NpcRegistry
            // average disposition so the world's mood signal
            // (friendly / fear / trust) survives a save → reload
            // cycle. The NpcRegistry itself is rebuilt on
            // startup, so this is a *snapshot* the App keeps
            // in sync; the HUD prompt "集体情绪: friendly 0.4
            // / fear 0 / trust 0.2" reads from this field.
            lastNpcDisposition: this.lastNpcDisposition ?? undefined,
            // Round 36 — persist the round-33 individual
            // speaker id + disposition so the HUD can show
            // "你刚才听见了 hostile_1 说：…" after a reload.
            lastSpeakerId: this.lastSpeakerId ?? undefined,
            lastSpeakerDisposition: this.lastSpeakerDisposition ?? undefined,
            // Round 40 — persist the per-NPC memory
            // snapshot. An empty list round-trips as `[]`
            // (not undefined) so a save that never saw a
            // broadcast is still a valid input to load.
            npcMindsSnapshot: this.npcMindsSnapshot,
            // Round 47 — persist the SceneBlueprint
            // scalars. Null fields are omitted (undefined)
            // so a save that never entered a dimension
            // stays compact.
            lastSceneNpcCount: this.lastSceneNpcCount ?? undefined,
            lastSceneBpm: this.lastSceneBpm ?? undefined,
            lastSceneEventCount: this.lastSceneEventCount ?? undefined,
            lastSceneArchetypeHintCount: this.lastSceneArchetypeHintCount ?? undefined,
        });
    }

    loadFromJSON(json: string): boolean {
        try {
            const data = JSON.parse(json);
            
            this.player = Object.assign(new PlayerProfile(data.player.accountId), data.player);
            this.progression = Object.assign(new PlayerProgression(), data.progression);
            
            const balances = data.wallet || {};
            this.wallet = new Wallet();
            for (const [currency, amount] of Object.entries(balances)) {
                this.wallet.addCurrency(currency, amount as number);
            }
            
            this.inventory = new Inventory(100);
            if (data.inventory) {
                for (const item of data.inventory) {
                    this.inventory.addItem(item);
                }
            }
            
            this.dimensionHistory = data.dimensionHistory || [];

            // Round 32 — restore the round-31 lastBiome so a
            // reload (or a hand-crafted save) brings back the
            // "你刚从 #biome 归来" signal. Older saves that
            // don't carry the field simply reset to null.
            this.lastBiome = (data.lastBiome as BiomeId | null | undefined) ?? null;
            // If we have a stale activeDimensionBiome in the
            // save, restore it onto a re-constructed active dim.
            // (We deliberately don't re-create the full
            // activeDimension; that field is session-scoped.)
            if (data.activeDimensionBiome) {
                this.activeDimension = this.activeDimension ?? {
                    dimensionId: 'restored',
                    gameplayTypes: [],
                    sessionStart: Date.now(),
                    score: 0,
                    biome: data.activeDimensionBiome as BiomeId,
                };
                if (this.activeDimension) {
                    this.activeDimension.biome = data.activeDimensionBiome as BiomeId;
                }
            }

            // Round 35 — restore the round-22 NpcRegistry
            // average-disposition snapshot. Older saves (pre
            // round 35) don't carry the field, in which case
            // we leave it null (the App's next NpcRegistry
            // broadcast will refresh it).
            this.lastNpcDisposition = (data.lastNpcDisposition as NpcDisposition | null | undefined) ?? null;
            // Round 36 — restore the round-33 individual
            // speaker id + disposition snapshot.
            this.lastSpeakerId = (data.lastSpeakerId as string | null | undefined) ?? null;
            this.lastSpeakerDisposition =
                (data.lastSpeakerDisposition as NpcDisposition | null | undefined) ?? null;
            // Round 40 — restore the per-NPC memory snapshot.
            // Older saves (pre round 40) don't carry it; we
            // default to an empty list.
            this.npcMindsSnapshot = Array.isArray(data.npcMindsSnapshot)
                ? data.npcMindsSnapshot as NpcMindSnapshot[]
                : [];
            // Round 47 — restore the SceneBlueprint scalars.
            // Older saves (pre round 47) don't carry the
            // fields; null is the back-compat default.
            this.lastSceneNpcCount =
                typeof data.lastSceneNpcCount === 'number' ? data.lastSceneNpcCount : null;
            this.lastSceneBpm =
                typeof data.lastSceneBpm === 'number' ? data.lastSceneBpm : null;
            this.lastSceneEventCount =
                typeof data.lastSceneEventCount === 'number' ? data.lastSceneEventCount : null;
            this.lastSceneArchetypeHintCount =
                typeof data.lastSceneArchetypeHintCount === 'number'
                    ? data.lastSceneArchetypeHintCount
                    : null;

            return true;
        } catch (e) {
            console.error('Failed to load WorldState from JSON:', e);
            return false;
        }
    }

    saveToStorage(key: string = 'agi_world_state'): void {
        try {
            localStorage.setItem(key, this.saveToJSON());
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }

    loadFromStorage(key: string = 'agi_world_state'): boolean {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                return this.loadFromJSON(data);
            }
            return false;
        } catch (e) {
            console.warn('Failed to load from localStorage:', e);
            return false;
        }
    }
}
