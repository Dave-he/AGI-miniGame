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
 */

export type AudioCue =
    | 'spawn' | 'damage' | 'heal' | 'epoch' | 'levelup'
    | 'npc' | 'trap' | 'chest' | 'shrine' | 'click';

export interface AudioService {
    playCue(cue: AudioCue): void;
    setMuted(muted: boolean): void;
    isMuted(): boolean;
}

export class WebAudioService implements AudioService {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private muted: boolean = false;

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
    }

    isMuted(): boolean { return this.muted; }
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
    playCue(_cue: AudioCue): void { /* noop */ }
    setMuted(muted: boolean): void { this.muted = muted; }
    isMuted(): boolean { return this.muted; }
}
