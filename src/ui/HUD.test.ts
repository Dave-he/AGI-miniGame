/**
 * HUD tests — verify the I18n integration.
 */

import { HUD } from '../ui/HUD';
import { I18n } from '../i18n/I18n';

function makeHud() {
    document.body.innerHTML = '<div id="hud"></div>';
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    return { hud, i18n, root };
}

describe('HUD (I18n integration)', () => {
    beforeEach(() => {
        try { localStorage.removeItem('agi_locale'); } catch { /* noop */ }
    });

    test('renders with the active locale by default', () => {
        const { root } = makeHud();
        // The HUD should contain at least one of the localized labels.
        const text = root.textContent ?? '';
        expect(text.length).toBeGreaterThan(0);
    });

    test('switching locale re-renders the HUD', () => {
        const { root, i18n } = makeHud();
        const startText = root.textContent ?? '';
        i18n.setLocale(i18n.getLocale() === 'en-US' ? 'zh-CN' : 'en-US');
        const endText = root.textContent ?? '';
        // The body should differ between locales.
        expect(startText).not.toBe(endText);
    });

    test('setState(logLines) populates the console', () => {
        const { root, hud } = makeHud();
        hud.log('hello world');
        expect(root.querySelectorAll('.hud-log-line').length).toBe(1);
    });

    test('clicking the language toggle flips the locale', () => {
        const { root, i18n } = makeHud();
        const start = i18n.getLocale();
        const btn = root.querySelector<HTMLButtonElement>('.hud-lang');
        expect(btn).toBeTruthy();
        btn?.click();
        const end = i18n.getLocale();
        expect(end).not.toBe(start);
    });
});

// ---------------------------------------------------------------------------
// Round 26 — getState() replaces the `(this.hud as any).state` hack.
//
// Before round 26, callers reached into the private `state` field
// via a TypeScript escape hatch. The new `getState()` method
// exposes a typed read-only snapshot so main.ts and other
// consumers can read `dimension`, `worldEvent`, etc. without
// bypassing the type system.
// ---------------------------------------------------------------------------

describe('HUD — round 26 getState() (typed read-only snapshot)', () => {
    test('returns_default_state_before_any_setState_call', () => {
        const { hud } = makeHud();
        const s = hud.getState();
        expect(s.dimension).toBeNull();
        expect(s.worldEvent).toBeNull();
        expect(s.playerLevel).toBe(1);
        expect(s.gold).toBe(0);
        expect(s.gem).toBe(0);
        expect(s.score).toBe(0);
        expect(s.logLines).toEqual([]);
    });

    test('reflects_setState_patches', () => {
        const { hud } = makeHud();
        hud.setState({ playerLevel: 5, gold: 100 });
        const s = hud.getState();
        expect(s.playerLevel).toBe(5);
        expect(s.gold).toBe(100);
        expect(s.gem).toBe(0);
    });

    test('returns_a_read_only_view_of_internal_state', () => {
        // The returned object should be the same reference as
        // `hud.state` (we don't want to allocate a fresh copy on
        // every call). The TypeScript type is `Readonly<HUDState>`
        // so callers can't mutate it; the runtime check is that
        // the *same* state object is returned both times.
        const { hud } = makeHud();
        const a = hud.getState();
        const b = hud.getState();
        expect(a).toBe(b);
    });

    test('log_lines_appear_in_getState_snapshot', () => {
        const { hud } = makeHud();
        hud.log('hello world');
        hud.log('round 26');
        const s = hud.getState();
        expect(s.logLines.length).toBe(2);
        expect(s.logLines[0]).toContain('hello world');
        expect(s.logLines[1]).toContain('round 26');
    });

    test('dimension_field_round_trips_through_setState_and_getState', () => {
        // The case the round-26 refactor was for: main.ts:389 used
        // to do `(this.hud as any).state?.dimension` to read the
        // active dimension. After refactor, the path is
        // `this.hud.getState().dimension` — fully typed.
        const { hud } = makeHud();
        const fakeDim = {
            id: 'dim_test',
            name: 'Test',
            description: 'd',
            atomIds: ['match3'],
            atomWeights: {},
            difficulty: 0.5,
            rules: [],
            rewards: [],
            theme: { name: 't', visualStyle: 'cyberpunk', musicMood: 'epic', colorPalette: [] },
            timeLimitSecs: null,
            objectives: [],
        } as any;
        hud.setState({ dimension: fakeDim });
        expect(hud.getState().dimension).toBe(fakeDim);
    });
});

// ---------------------------------------------------------------------------
// Round 43 — lastBiome HUD prompt.
//
// Round 31 added the field on the WorldState, round 32
// persisted it across save/load. This round makes it
// visible to the player: a small "↩ 上次离开 #<biome>"
// line in the stats panel after reload.
// ---------------------------------------------------------------------------

describe('HUD — round 43 lastBiome HUD prompt', () => {
    test('setLastBiome_pushes_into_state', () => {
        const { hud } = makeHud();
        expect(hud.getState().lastBiome).toBeUndefined();
        hud.setLastBiome('forest');
        expect(hud.getState().lastBiome).toBe('forest');
        hud.setLastBiome(null);
        expect(hud.getState().lastBiome).toBeNull();
    });

    test('renders_lastBiome_in_HTML_when_set', () => {
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        // The HUD emits a small line tagged with the
        // `hud-biome-remembered` class so the player
        // can see the "上次离开 #forest" prompt.
        expect(root.innerHTML).toContain('hud-biome-remembered');
        expect(root.innerHTML).toContain('#forest');
    });

    test('does_not_render_lastBiome_line_when_null', () => {
        // Sanity: the optional line is *not* in the
        // HTML when lastBiome is null (no orphan
        // element).
        const { hud, root } = makeHud();
        hud.setLastBiome(null);
        expect(root.innerHTML).not.toContain('hud-biome-remembered');
    });

    test('escapes_biome_id_in_HTML', () => {
        // Defensive: a biome id with a `<` (which
        // shouldn't appear, but we don't trust
        // upstream) is HTML-escaped, not injected raw.
        const { hud, root } = makeHud();
        hud.setLastBiome('<script>alert(1)</script>');
        expect(root.innerHTML).toContain('&lt;script&gt;');
        expect(root.innerHTML).not.toContain('<script>alert(1)</script>');
    });
});

// ---------------------------------------------------------------------------
// Round 44 — lastSpeaker HUD prompt.
//
// Round 36 added the lastSpeaker* fields on the
// WorldState; this round exposes them in the HUD so the
// player sees "🗣 你刚才听见了 <id> 说：…" right after
// the narration (round-44 wiring in main.ts) and also
// after a save → reload (round-44 loadGame wiring).
// ---------------------------------------------------------------------------

describe('HUD — round 44 lastSpeaker HUD prompt', () => {
    test('setLastSpeaker_pushes_into_state', () => {
        const { hud } = makeHud();
        expect(hud.getState().lastSpeakerId).toBeUndefined();
        hud.setLastSpeaker({ id: 'mage_1', branch: 'fear', disposition: { friendly: 0, fear: 0.6, trust: 0 } });
        expect(hud.getState().lastSpeakerId).toBe('mage_1');
        expect(hud.getState().lastSpeakerBranch).toBe('fear');
        expect(hud.getState().lastSpeakerDisposition).toEqual({ friendly: 0, fear: 0.6, trust: 0 });
        hud.setLastSpeaker(null);
        expect(hud.getState().lastSpeakerId).toBeNull();
    });

    test('renders_lastSpeaker_in_HTML_when_set', () => {
        const { hud, root } = makeHud();
        hud.setLastSpeaker({ id: 'hostile_1', branch: 'hostile', disposition: { friendly: -0.5, fear: 0, trust: 0 } });
        expect(root.innerHTML).toContain('hud-speaker-remembered');
        expect(root.innerHTML).toContain('hostile_1');
        expect(root.innerHTML).toContain('[hostile]');
    });

    test('does_not_render_lastSpeaker_line_when_null', () => {
        const { hud, root } = makeHud();
        hud.setLastSpeaker(null);
        expect(root.innerHTML).not.toContain('hud-speaker-remembered');
    });

    test('escapes_speaker_id_in_HTML', () => {
        // Defensive: an NPC id with a `<` is HTML-escaped,
        // not injected raw.
        const { hud, root } = makeHud();
        hud.setLastSpeaker({ id: '<img src=x onerror=alert(1)>', branch: 'neutral', disposition: { friendly: 0, fear: 0, trust: 0 } });
        expect(root.innerHTML).toContain('&lt;img');
        expect(root.innerHTML).not.toContain('<img src=x onerror');
    });
});
