/**
 * AudioService — short procedural SFX via the Web Audio API.
 *
 * No external assets: every cue is synthesized from oscillators +
 * filtered noise. The service is engine-agnostic and can be replaced
 * with a real sample bank by overriding `playCue()`.
 *
 * Cue types (PRD-aligned):
 *   - 'spawn'      short rising pluck
 *   - 'damage'     harsh square-wave stab
 *   - 'heal'       soft sine bloom
 *   - 'epoch'      long two-tone collapse
 *   - 'levelup'    ascending arpeggio
 *   - 'npc'        wood-block tick
 *   - 'trap'       sub-bass thud
 *   - 'chest'      bright bell
 *   - 'shrine'     ambient pad
 *   - 'click'      UI blip
 *
 * Round 61 — per-biome ambient loop. The `setBiomeAmbient` method
 * takes a BiomeAudio config and starts (or crossfades to) a
 * long-running drone tuned to the biome's mood. The drone is a
 * 2-oscillator stack (root + optional perfect fifth) with a
 * fade-in / fade-out envelope. Calling `setBiomeAmbient` twice
 * with different configs fades the old one out and the new one
 * in (no abrupt cut).
 */

import type { BiomeAudio } from './BiomeAudio';
import type { BiomeId } from '../world/WfcBiomes';

export type AudioCue =
    | 'spawn' | 'damage' | 'heal' | 'epoch' | 'levelup'
    | 'npc' | 'trap' | 'chest' | 'shrine' | 'click';

export interface AudioService {
    playCue(cue: AudioCue): void;
    setMuted(muted: boolean): void;
    isMuted(): boolean;
    /**
     * Round 61 — switch the ambient drone to the given biome's
     * audio config. Calling twice with the same biome is a no-op
     * (no audible glitch). Calling with a different biome
     * crossfades between the two.
     */
    setBiomeAmbient(biome: string | BiomeId, audio: BiomeAudio): void;
    /**
     * Round 61 — stop the current ambient drone immediately
     * (no fade). Used when leaving a dimension.
     */
    stopAmbient(): void;
    /**
     * Round 61 — diagnostic: which biome's ambient is currently
     * playing? Returns null when no ambient is active. Used by
     * tests and HUD logs.
     */
    getActiveBiome(): string | null;
}

export class WebAudioService implements AudioService {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private muted: boolean = false;
    /**
     * Round 61 — the active ambient drone, if any. A bundle of
     * the gain node (so we can fade it) + the current biome id
     * (so we can detect same-biome no-op). The oscillators
     * themselves are kept on the GainNode chain via Web Audio's
     * native reference; we don't need to track them separately.
     */
    private ambient: {
        gain: GainNode;
        biome: string;
    } | null = null;

    constructor() {
        // Lazy: don't touch AudioContext until the first user gesture.
    }

    private ensureCtx(): AudioContext | null {
        if (this.ctx) return this.ctx;
        if (typeof window === 'undefined') return null;
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        try {
            this.ctx = new Ctor();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.muted ? 0 : 0.4;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            return null;
        }
        return this.ctx;
    }

    playCue(cue: AudioCue): void {
        const ctx = this.ensureCtx();
        if (!ctx || !this.masterGain) return;
        // Web Audio requires a user gesture to start the context.
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const builder = CUE_BUILDERS[cue];
        if (builder) builder(ctx, this.masterGain);
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.4;
        // The ambient drone rides on the master gain, so the
        // existing muted = 0 path is enough. No additional
        // per-ambient mute handling needed.
    }

    isMuted(): boolean { return this.muted; }

    /**
     * Round 61 — switch the ambient drone to the supplied biome
     * audio config. Same-biome calls are a no-op (the drone is
     * already playing). Different-biome calls fade the old
     * drone out, then start the new one with a fade-in.
     */
    setBiomeAmbient(biome: string | BiomeId, audio: BiomeAudio): void {
        const ctx = this.ensureCtx();
        if (!ctx || !this.masterGain) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        // Same biome — no audible change needed.
        if (this.ambient && this.ambient.biome === biome) return;
        // Fade out the old drone, then start the new one.
        const fadeOutDur = this.ambient ? this.ambient.gain : null;
        const oldFadeOutSecs = audio.fadeOut;
        if (this.ambient) {
            const oldGain = this.ambient.gain;
            const now = ctx.currentTime;
            oldGain.gain.cancelScheduledValues(now);
            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + oldFadeOutSecs);
            // Disconnect after the fade so the old oscillators
            // stop consuming CPU.
            setTimeout(() => {
                try { oldGain.disconnect(); } catch { /* already disconnected */ }
            }, oldFadeOutSecs * 1000 + 50);
        }
        // Build the new drone.
        const newGain = ctx.createGain();
        newGain.gain.value = 0;
        newGain.connect(this.masterGain);
        // Root oscillator
        const osc1 = ctx.createOscillator();
        osc1.type = audio.waveform;
        osc1.frequency.value = audio.baseFreq;
        osc1.connect(newGain);
        osc1.start();
        // Optional fifth overtone
        if (audio.withFifth) {
            const osc2 = ctx.createOscillator();
            osc2.type = audio.waveform;
            osc2.frequency.value = audio.baseFreq * 1.5;
            osc2.connect(newGain);
            osc2.start();
        }
        // Fade in
        const now = ctx.currentTime;
        newGain.gain.setValueAtTime(0, now);
        newGain.gain.linearRampToValueAtTime(audio.gain, now + audio.fadeIn);
        this.ambient = { gain: newGain, biome: String(biome) };
    }

    /**
     * Round 61 — stop the active ambient drone immediately. The
     * next `setBiomeAmbient` call will start a fresh drone.
     */
    stopAmbient(): void {
        if (!this.ambient) return;
        const ctx = this.ctx;
        if (ctx) {
            const now = ctx.currentTime;
            this.ambient.gain.gain.cancelScheduledValues(now);
            this.ambient.gain.gain.setValueAtTime(this.ambient.gain.gain.value, now);
            this.ambient.gain.gain.linearRampToValueAtTime(0, now + 0.05);
            setTimeout(() => {
                try { this.ambient?.gain.disconnect(); } catch { /* noop */ }
            }, 100);
        }
        this.ambient = null;
    }

    /**
     * Round 61 — diagnostic: which biome's ambient drone is
     * currently active? Returns null when no ambient is playing.
     */
    getActiveBiome(): string | null {
        return this.ambient ? this.ambient.biome : null;
    }
}

type Builder = (ctx: AudioContext, out: AudioNode) => void;

const CUE_BUILDERS: Record<AudioCue, Builder> = {
    spawn:   (ctx, out) => pluck(ctx, out, 880, 0.18, 'triangle'),
    damage:  (ctx, out) => pluck(ctx, out, 110, 0.20, 'square', 0.4),
    heal:    (ctx, out) => bloom(ctx, out, 523, 1.4),
    epoch:   (ctx, out) => twoTone(ctx, out, 220, 110, 1.2),
    levelup: (ctx, out) => arpeggio(ctx, out, [523, 659, 784, 1046], 0.10),
    npc:     (ctx, out) => pluck(ctx, out, 440, 0.06, 'sine', 0.5),
    trap:    (ctx, out) => thud(ctx, out, 0.25),
    chest:   (ctx, out) => bell(ctx, out, 988, 0.6),
    shrine:  (ctx, out) => pad(ctx, out, 330, 1.0),
    click:   (ctx, out) => pluck(ctx, out, 1200, 0.04, 'sine', 0.3),
};

function now(ctx: AudioContext): number { return ctx.currentTime; }

function pluck(ctx: AudioContext, out: AudioNode, freq: number, dur: number, type: OscillatorType = 'sine', gain: number = 0.6): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, now(ctx));
    g.gain.linearRampToValueAtTime(gain, now(ctx) + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now(ctx) + dur);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(now(ctx) + dur + 0.01);
}

function bloom(ctx: AudioContext, out: AudioNode, freq: number, dur: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now(ctx));
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now(ctx) + dur);
    g.gain.setValueAtTime(0, now(ctx));
    g.gain.linearRampToValueAtTime(0.5, now(ctx) + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now(ctx) + dur);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(now(ctx) + dur + 0.01);
}

function twoTone(ctx: AudioContext, out: AudioNode, f1: number, f2: number, dur: number): void {
    pluck(ctx, out, f1, dur * 0.5, 'sawtooth', 0.4);
    setTimeout(() => pluck(ctx, out, f2, dur * 0.5, 'sawtooth', 0.4), dur * 500);
}

function arpeggio(ctx: AudioContext, out: AudioNode, freqs: number[], step: number): void {
    for (let i = 0; i < freqs.length; i++) {
        setTimeout(() => pluck(ctx, out, freqs[i], step * 1.5, 'triangle', 0.5), i * step * 1000);
    }
}

function thud(ctx: AudioContext, out: AudioNode, dur: number): void {
    // Low oscillator + noise burst
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now(ctx));
    osc.frequency.exponentialRampToValueAtTime(40, now(ctx) + dur);
    g.gain.setValueAtTime(0.7, now(ctx));
    g.gain.exponentialRampToValueAtTime(0.001, now(ctx) + dur);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(now(ctx) + dur + 0.01);
}

function bell(ctx: AudioContext, out: AudioNode, freq: number, dur: number): void {
    pluck(ctx, out, freq, dur, 'sine', 0.5);
    pluck(ctx, out, freq * 2, dur, 'sine', 0.25);
    pluck(ctx, out, freq * 3, dur * 0.6, 'sine', 0.15);
}

function pad(ctx: AudioContext, out: AudioNode, freq: number, dur: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now(ctx));
    g.gain.linearRampToValueAtTime(0.25, now(ctx) + 0.4);
    g.gain.linearRampToValueAtTime(0, now(ctx) + dur);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(now(ctx) + dur + 0.01);
}

/** Silent stub for tests / environments without Web Audio. */
export class NullAudioService implements AudioService {
    private muted = false;
    private activeBiome: string | null = null;
    playCue(_cue: AudioCue): void { /* noop */ }
    setMuted(muted: boolean): void { this.muted = muted; }
    isMuted(): boolean { return this.muted; }
    setBiomeAmbient(biome: string, _audio: BiomeAudio): void { this.activeBiome = biome; }
    stopAmbient(): void { this.activeBiome = null; }
    getActiveBiome(): string | null { return this.activeBiome; }
}
