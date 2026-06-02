/**
 * GameAudio — thin glue between the AudioService and game events.
 *
 * Maps high-level game events (DSL applied, level up, epoch collapse,
 * NPC click, ...) to specific AudioCues. Lets the rest of the code
 * stay free of audio concerns.
 */

import type { AudioService, AudioCue } from './AudioService';

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

    constructor(svc: AudioService) {
        this.svc = svc;
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

    setMuted(muted: boolean): void { this.muted = muted; this.svc.setMuted(muted); }
    isMuted(): boolean { return this.muted; }
}
