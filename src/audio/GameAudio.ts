/**
 * GameAudio — thin glue between the AudioService and game events.
 *
 * Maps high-level game events (DSL applied, level up, epoch collapse,
 * NPC click, ...) to specific AudioCues. Lets the rest of the code
 * stay free of audio concerns.
 */

import type { AudioService, AudioCue } from './AudioService';
import type { BiomeAudio } from './BiomeAudio';
import type { BiomeId } from '../world/WfcBiomes';

export type GameAudioEvent =
    | 'dsl.applied' | 'dsl.rejected'
    | 'level.up' | 'epoch.collapsed'
    | 'npc.clicked' | 'dimension.entered'
    | 'dimension.completed' | 'dimension.failed'
    | 'item.used' | 'item.dropped'
    | 'save.persisted' | 'save.loaded'
    | 'trap.hit' | 'chest.opened' | 'shrine.blessed';

const EVENT_TO_CUE: Record<GameAudioEvent, AudioCue> = {
    'dsl.applied':         'spawn',
    'dsl.rejected':        'damage',
    'level.up':            'levelup',
    'epoch.collapsed':     'epoch',
    'npc.clicked':         'npc',
    'dimension.entered':   'spawn',
    'dimension.completed': 'chest',
    'dimension.failed':    'trap',
    'item.used':           'heal',
    'item.dropped':        'damage',
    'save.persisted':      'click',
    'save.loaded':         'shrine',
    'trap.hit':            'trap',
    'chest.opened':        'chest',
    'shrine.blessed':      'shrine',
};

export class GameAudio {
    private svc: AudioService;
    private muted: boolean = false;
    /**
     * Round 157 — master volume in
     * [0, 1]. Mirrors the
     * `AudioService.volume` field.
     * Updated via `setVolume`; read
     * via `getVolume`. Persisted to
     * localStorage so the player's
     * choice survives a page reload
     * (same pattern as the muted
     * flag).
     */
    private volume: number = 0.4;

    constructor(svc: AudioService) {
        this.svc = svc;
        // Round 127 — restore the muted state
        // from localStorage so the player's
        // choice survives a page reload. The
        // I18n singleton has the same pattern
        // for `agi_locale`. Defaults to
        // unmuted when the key is missing or
        // the storage is unavailable (SSR /
        // private mode / quota errors).
        const restored = readMutedFromStorage();
        if (restored != null) {
            this.muted = restored;
            this.svc.setMuted(restored);
        }
        // Round 157 — restore the master
        // volume from localStorage (the
        // 4-preset UI: off / low / med /
        // high). Defaults to 0.4 (the
        // round-1 "polite" default) when
        // the key is missing or storage is
        // unavailable.
        const restoredVolume = readVolumeFromStorage();
        if (restoredVolume != null) {
            this.volume = restoredVolume;
            this.svc.setVolume(restoredVolume);
        }
    }

    /** Fire a cue for a high-level game event. No-op if muted. */
    fire(event: GameAudioEvent): void {
        if (this.muted) return;
        const cue = EVENT_TO_CUE[event];
        if (cue) this.svc.playCue(cue);
    }

    /** Map a hot-reload controller event to a game audio event. */
    fireHotReload(state: 'compiling' | 'shielded' | 'applied' | 'rejected'): void {
        switch (state) {
            case 'applied':  this.fire('dsl.applied'); break;
            case 'rejected': this.fire('dsl.rejected'); break;
            case 'compiling': case 'shielded': /* no sound for charging phases */ break;
        }
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.svc.setMuted(muted);
        // Round 127 — persist the player's
        // choice so a page reload doesn't
        // reset to unmuted. try/catch wraps
        // the write because localStorage can
        // throw in private mode / quota
        // exceeded.
        writeMutedToStorage(muted);
    }
    isMuted(): boolean { return this.muted; }

    /**
     * Round 157 — set the master volume
     * in [0, 1]. The SettingsPanel
     * exposes 4 presets (off=0, low=0.25,
     * med=0.5, high=1.0) but the API
     * accepts any value in [0, 1]. The
     * value is persisted to localStorage
     * so a page reload doesn't reset to
     * the round-1 default of 0.4. The
     * service handles the clamp contract
     * (NaN, negative, > 1 are pinned to
     * the nearest bound).
     */
    setVolume(volume: number): void {
        this.svc.setVolume(volume);
        this.volume = this.svc.getVolume();
        // Round 157 — persist the
        // player's choice. The 4-preset
        // UI sends clean values, but we
        // persist the post-clamp value
        // (so a future read sees the
        // exact value that's in effect).
        writeVolumeToStorage(this.volume);
    }
    /**
     * Round 157 — read the current
     * master volume (range [0, 1]).
     * Used by the SettingsPanel to
     * highlight the active preset.
     */
    getVolume(): number { return this.volume; }

    /**
     * Round 61 — switch the ambient drone to the given biome's
     * audio config. Thin pass-through to AudioService. The App
     * calls this alongside `scene.setBiomeAtmosphere` so the
     * audio + visual atmosphere change in lockstep.
     */
    setBiomeAmbient(biome: string | BiomeId, audio: BiomeAudio): void {
        this.svc.setBiomeAmbient(biome, audio);
    }

    /**
     * Round 61 — stop the ambient drone immediately. Called when
     * the player leaves a dimension.
     */
    stopAmbient(): void {
        this.svc.stopAmbient();
    }

    /**
     * Round 61 — diagnostic: which biome's ambient is active?
     * Returns null when no ambient is playing.
     */
    getActiveBiome(): string | null {
        return this.svc.getActiveBiome();
    }

    /**
     * Round 62 — start the per-biome intermittent SFX loop
     * (the "events" layer on top of the round 61 ambient
     * drone). Pass-through to AudioService.
     */
    setBiomeSfx(biome: string | BiomeId, audio: BiomeAudio): void {
        this.svc.setBiomeSfx(biome, audio);
    }

    /**
     * Round 62 — stop the SFX loop. Pass-through.
     */
    stopBiomeSfx(): void {
        this.svc.stopBiomeSfx();
    }

    /**
     * Round 62 — diagnostic: is the SFX loop active for the
     * given biome? Pass-through.
     */
    isSfxActive(biome: string | BiomeId): boolean {
        return this.svc.isSfxActive(biome);
    }
}

// Round 127 — localStorage persistence for
// the muted flag. Mirrors the
// `agi_locale` pattern in
// `i18n/I18n.ts` (lines 149, 164, 181).
// The key is namespaced under `agi_` so
// future AGI-miniGame settings can share
// the same prefix.
const MUTED_STORAGE_KEY = 'agi_muted';

function readMutedFromStorage(): boolean | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(MUTED_STORAGE_KEY);
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
        return null;
    } catch {
        return null;
    }
}

function writeMutedToStorage(muted: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(MUTED_STORAGE_KEY, muted ? '1' : '0');
    } catch {
        // localStorage can throw in
        // private browsing mode or when
        // the quota is exceeded. Swallow
        // — the in-memory state is
        // already updated.
    }
}

// Round 157 — localStorage persistence
// for the master volume. Same pattern
// as the muted flag: separate
// namespaced key (`agi_volume`),
// typeof guard for non-browser test
// envs, try/catch swallow for SSR /
// private mode / quota errors.
// Stored as a JSON number string so
// the full [0, 1] range is preserved
// (the 4-preset UI sends 0/0.25/0.5
// /1.0, but the API supports any
// value between).
const VOLUME_STORAGE_KEY = 'agi_volume';

function readVolumeFromStorage(): number | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
        if (raw == null) return null;
        const parsed = Number(raw);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeVolumeToStorage(volume: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
        // localStorage can throw in
        // private browsing mode or when
        // the quota is exceeded. Swallow
        // — the in-memory state is
        // already updated.
    }
}
