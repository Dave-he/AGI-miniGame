/**
 * HUD tests — verify the I18n integration.
 */

import { HUD } from '../ui/HUD';
import { I18n } from '../i18n/I18n';
import type { EventStep } from '../ai/SceneGen';

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
        try { sessionStorage.clear(); } catch { /* noop */ }
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

describe('HUD — round 64 setMinimap', () => {
    test('setMinimap_pushes_into_state', () => {
        const { hud } = makeHud();
        expect(hud.getState().lastMinimap).toBeUndefined();
        hud.setMinimap('data:image/png;base64,AAAA');
        expect(hud.getState().lastMinimap).toBe('data:image/png;base64,AAAA');
        hud.setMinimap(null);
        expect(hud.getState().lastMinimap).toBeNull();
    });

    test('renders_img_with_src_when_data_url_set', () => {
        const { hud, root } = makeHud();
        hud.setMinimap('data:image/png;base64,FAKE');
        const img = root.querySelector('img.hud-minimap');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).toBe('data:image/png;base64,FAKE');
        expect(img?.getAttribute('width')).toBe('80');
        expect(img?.getAttribute('height')).toBe('60');
    });

    test('renders_alt_text_using_lastBiome_when_both_set', () => {
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        hud.setMinimap('data:image/png;base64,FAKE');
        const img = root.querySelector('img.hud-minimap');
        expect(img?.getAttribute('alt')).toBe('minimap of #forest');
    });

    test('omits_img_when_data_url_null', () => {
        const { hud, root } = makeHud();
        hud.setMinimap('data:image/png;base64,FAKE');
        expect(root.querySelector('img.hud-minimap')).not.toBeNull();
        hud.setMinimap(null);
        expect(root.querySelector('img.hud-minimap')).toBeNull();
    });

    test('minimap_counted_in_emoji_memo_summary', () => {
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        hud.setMinimap('data:image/png;base64,FAKE');
        // The details summary should now include 2 (biome + minimap).
        const summary = root.querySelector('details.hud-memories summary');
        expect(summary?.textContent).toMatch(/2/);
    });
});

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

// ---------------------------------------------------------------------------
// Round 45 — NpcMind snapshot HUD prompt.
//
// Round 40 added the per-NPC memory snapshot to the
// WorldState. This round exposes a "🧠 N 个 NPC 记住了
// K 段记忆" tally in the HUD header so the player can
// see the cross-save memory count without opening any
// panel.
// ---------------------------------------------------------------------------

describe('HUD — round 45 NpcMind snapshot tally', () => {
    test('setNpcMindsSnapshot_aggregates_count_and_memories', () => {
        const { hud } = makeHud();
        expect(hud.getState().npcMindsSnapshotCount).toBeUndefined();
        hud.setNpcMindsSnapshot([
            { entries: [{ kind: 'a' }, { kind: 'b' }] },  // 2 memories
            { entries: [{ kind: 'c' }] },                 // 1 memory
            { entries: [] },                                // 0 memories
        ]);
        expect(hud.getState().npcMindsSnapshotCount).toBe(3);
        expect(hud.getState().npcMindsSnapshotMemories).toBe(3);
    });

    test('renders_NPC_mind_tally_in_HTML_when_set', () => {
        const { hud, root } = makeHud();
        hud.setNpcMindsSnapshot([
            { entries: [{ kind: 'a' }, { kind: 'b' }] },
            { entries: [{ kind: 'c' }] },
        ]);
        expect(root.innerHTML).toContain('hud-npc-snapshot');
        expect(root.innerHTML).toContain('2');
        expect(root.innerHTML).toContain('3');
    });

    test('does_not_render_tally_when_count_is_zero', () => {
        // Sanity: a zero-length snapshot leaves the
        // tally out (no orphan element). Same for an
        // empty array (which has count 0).
        const { hud, root } = makeHud();
        hud.setNpcMindsSnapshot([]);
        expect(root.innerHTML).not.toContain('hud-npc-snapshot');
    });
});

// ---------------------------------------------------------------------------
// Round 46 — lastNpcDisposition HUD prompt.
//
// Round 35 added the average-disposition snapshot on
// the WorldState. This round exposes a
// "🎭 集体情绪: friendly X / fear Y / trust Z" line
// in the stats panel so the player can see the mood
// signal without opening the NpcMind panel.
// ---------------------------------------------------------------------------

describe('HUD — round 46 lastNpcDisposition HUD prompt', () => {
    test('setLastNpcDisposition_pushes_a_copy_into_state', () => {
        const { hud } = makeHud();
        expect(hud.getState().lastNpcDisposition).toBeUndefined();
        const disp = { friendly: 0.4, fear: -0.1, trust: 0.2 };
        hud.setLastNpcDisposition(disp);
        const s = hud.getState().lastNpcDisposition;
        expect(s).toEqual(disp);
        // The HUD should copy, not retain the same
        // reference, so the caller can mutate `disp`
        // without affecting HUD state.
        expect(s).not.toBe(disp);
    });

    test('renders_collective_mood_line_in_HTML_when_set', () => {
        const { hud, root } = makeHud();
        hud.setLastNpcDisposition({ friendly: 0.4, fear: 0, trust: 0.2 });
        expect(root.innerHTML).toContain('hud-npc-mood');
        expect(root.innerHTML).toContain('0.40');
        expect(root.innerHTML).toContain('0.20');
    });

    test('does_not_render_mood_line_when_null', () => {
        const { hud, root } = makeHud();
        hud.setLastNpcDisposition(null);
        expect(root.innerHTML).not.toContain('hud-npc-mood');
    });
});

// ---------------------------------------------------------------------------
// Round 47 — SceneBlueprint scalars HUD prompt.
//
// Round 24's `themeToScene` produces four user-visible
// scalars (npcCount, musicBpm, eventChain.length,
// npcArchetypeHints.length). Round 47 persists them on
// WorldState across save/load and exposes them in the
// HUD as a "🎬 上次维度: NPC×N · BPM T · M 事件 · K
// archetype" line so the player sees the scene structure
// the same way they saw mood (round 46) and biome
// (round 43) — without opening any panel and across
// reloads.
// ---------------------------------------------------------------------------

describe('HUD — round 47 SceneBlueprint scalars HUD prompt', () => {
    test('setLastSceneBlueprint_stores_all_four_scalars_and_null_resets', () => {
        const { hud } = makeHud();
        expect(hud.getState().lastSceneNpcCount).toBeUndefined();
        hud.setLastSceneBlueprint({
            npcCount: 6,
            bpm: 130,
            eventCount: 4,
            archetypeHintCount: 1,
        });
        const s1 = hud.getState();
        expect(s1.lastSceneNpcCount).toBe(6);
        expect(s1.lastSceneBpm).toBe(130);
        expect(s1.lastSceneEventCount).toBe(4);
        expect(s1.lastSceneArchetypeHintCount).toBe(1);
        // null resets all four at once — callers don't
        // need to enumerate.
        hud.setLastSceneBlueprint(null);
        const s2 = hud.getState();
        expect(s2.lastSceneNpcCount).toBeNull();
        expect(s2.lastSceneBpm).toBeNull();
        expect(s2.lastSceneEventCount).toBeNull();
        expect(s2.lastSceneArchetypeHintCount).toBeNull();
    });

    test('renders_scene_blueprint_line_when_any_scalar_is_set', () => {
        const { hud, root } = makeHud();
        hud.setLastSceneBlueprint({
            npcCount: 6,
            bpm: 130,
            eventCount: 4,
            archetypeHintCount: 1,
        });
        expect(root.innerHTML).toContain('hud-scene-blueprint');
        expect(root.innerHTML).toContain('🎬 上次维度');
        expect(root.innerHTML).toContain('NPC×<b>6</b>');
        expect(root.innerHTML).toContain('BPM <b>130</b>');
        expect(root.innerHTML).toContain('<b>4</b> 事件');
        expect(root.innerHTML).toContain('<b>1</b> archetype');
    });

    test('does_not_render_scene_blueprint_line_when_all_scalars_are_null', () => {
        const { hud, root } = makeHud();
        // Default state has all undefined → no line.
        expect(root.innerHTML).not.toContain('hud-scene-blueprint');
        // Explicit null clear: still no line.
        hud.setLastSceneBlueprint(null);
        expect(root.innerHTML).not.toContain('hud-scene-blueprint');
    });
});

// ---------------------------------------------------------------------------
// Round 53 — HUD recovery banner (showRecoveryBanner + auto-hide).
//
// Called by `App.recoverFromRenderFailure` after a
// successful recovery (e.g. enterNewDimension completed
// after a rehydrate failure). The banner shows the error
// code and new biome, auto-hides after 5s, and has a
// dismiss button for instant close.
// ---------------------------------------------------------------------------

describe('HUD — round 53 recovery banner', () => {
    test('showRecoveryBanner_pushes_into_state_and_renders_div', () => {
        jest.useFakeTimers();
        try {
            const { hud, root } = makeHud();
            hud.showRecoveryBanner('ERR_SCENE_RENDER', 'forest');
            expect(root.innerHTML).toContain('hud-recovery-banner');
            expect(root.innerHTML).toContain('ERR_SCENE_RENDER');
            expect(root.innerHTML).toContain('#forest');
            expect(root.innerHTML).toContain('hud-recovery-dismiss');
        } finally {
            jest.useRealTimers();
        }
    });

    test('banner_hidden_after_5s_via_setTimeout', () => {
        jest.useFakeTimers();
        try {
            const { hud, root } = makeHud();
            hud.showRecoveryBanner('ERR_NPC_SPAWN', 'dungeon');
            expect(root.innerHTML).toContain('hud-recovery-banner');
            jest.advanceTimersByTime(5000);
            // After 5s, the auto-hide timer has flipped
            // `visible` to false. We trigger render() via
            // setLastBiome as a canonical HUD write path
            // so the new state reaches the DOM.
            hud.setLastBiome('dungeon');
            expect(root.innerHTML).not.toContain('hud-recovery-banner');
        } finally {
            jest.useRealTimers();
        }
    });

    test('dismiss_button_hides_banner_immediately', () => {
        jest.useFakeTimers();
        try {
            const { hud, root } = makeHud();
            hud.showRecoveryBanner('ERR_EVENT_CHAIN', 'space');
            expect(root.innerHTML).toContain('hud-recovery-banner');
            const dismissBtn = root.querySelector<HTMLButtonElement>('.hud-recovery-dismiss');
            expect(dismissBtn).toBeTruthy();
            dismissBtn!.click();
            expect(root.innerHTML).not.toContain('hud-recovery-banner');
        } finally {
            jest.useRealTimers();
        }
    });
});

// ---------------------------------------------------------------------------
// Round 51 — HUD 顶部持久化提示分组重构 (5 行折叠到 <details>)。
//
// Rounds 43/44/45/46/47 each added a HUD prompt line at the top
// of the stats panel. After 5 rounds the top of the panel was
// visually overloaded. Round 51 collapses those 5 lines into a
// single <details>/<summary> block: the summary shows a compact
// emoji + count (`↩🗣🧠🎭🎬 5 条记忆 · 点击展开`); the body
// preserves the original 5 divs verbatim so the round 43-47 HUD
// contract is unchanged. sessionStorage (`hud-memories-open`)
// persists the open/closed state across intra-tab reloads but
// resets on a fresh tab (sessionStorage is per-tab by spec).
//
// Test surface (5 jest, round-51 describe block):
//   1. details block absent when no fields set
//   2. summary count reflects number of set fields
//   3. summary emoji only includes set fields
//   4. collapsed by default, open when sessionStorage says so
//   5. toggle event writes sessionStorage
// ---------------------------------------------------------------------------

describe('HUD — round 51 persistent-memories collapsible <details>', () => {
    test('details_block_absent_when_no_persistent_memory_field_is_set', () => {
        const { root } = makeHud();
        // Default state: all 5 persistent-memory fields are
        // undefined/null, so the entire <details> block is
        // omitted from the DOM (no orphan empty <details>).
        expect(root.querySelector('.hud-memories')).toBeNull();
    });

    test('summary_count_reflects_number_of_set_fields', () => {
        const { hud, root } = makeHud();
        // Set 2 of 5 fields: lastBiome + lastSpeaker.
        hud.setLastBiome('forest');
        hud.setLastSpeaker({ id: 'mage_1', branch: 'fear', disposition: { friendly: 0, fear: 0.6, trust: 0 } });
        const details = root.querySelector<HTMLDetailsElement>('.hud-memories');
        expect(details).not.toBeNull();
        const summary = details!.querySelector('summary');
        expect(summary).not.toBeNull();
        expect(summary!.textContent).toContain('2');
        expect(summary!.textContent).toContain('条记忆');

        // Now set all 5 → count should be 5.
        hud.setNpcMindsSnapshot([{ entries: [{ kind: 'a' }] }]);
        hud.setLastNpcDisposition({ friendly: 0.4, fear: 0, trust: 0.2 });
        hud.setLastSceneBlueprint({ npcCount: 6, bpm: 130, eventCount: 4, archetypeHintCount: 1 });
        const details2 = root.querySelector<HTMLDetailsElement>('.hud-memories')!;
        expect(details2.querySelector('summary')!.textContent).toContain('5');
    });

    test('summary_emoji_includes_only_set_fields', () => {
        const { hud, root } = makeHud();
        // Only lastBiome set: summary should contain ↩ but NOT
        // any of the other 4 emoji. Each emoji is also followed
        // by a space (they're joined with '' so we look for the
        // emoji as a discrete codepoint run).
        hud.setLastBiome('forest');
        const summaryText = root.querySelector<HTMLDetailsElement>('.hud-memories')!.querySelector('summary')!.textContent ?? '';
        expect(summaryText).toContain('↩');
        expect(summaryText).not.toContain('🗣');
        expect(summaryText).not.toContain('🧠');
        expect(summaryText).not.toContain('🎭');
        expect(summaryText).not.toContain('🎬');
    });

    test('details_collapsed_by_default_unless_sessionStorage_says_open', () => {
        // First: no sessionStorage value → no `open` attribute.
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        const details1 = root.querySelector<HTMLDetailsElement>('.hud-memories');
        expect(details1).not.toBeNull();
        expect(details1!.hasAttribute('open')).toBe(false);

        // Second: set sessionStorage to '1', then construct a
        // new HUD — the new render should produce <details open>.
        sessionStorage.setItem('hud-memories-open', '1');
        document.body.innerHTML = '<div id="hud"></div>';
        const root2 = document.getElementById('hud')!;
        const hud2 = new HUD(root2, new I18n());
        hud2.setLastBiome('forest');
        const details2 = root2.querySelector<HTMLDetailsElement>('.hud-memories');
        expect(details2).not.toBeNull();
        expect(details2!.hasAttribute('open')).toBe(true);
    });

    test('toggle_event_writes_sessionStorage_via_newState_string', () => {
        // The handler reads e.newState ('open' | 'closed')
        // per the ToggleEvent spec; we dispatch a synthetic
        // toggle with a typed payload (newState='open') and
        // verify sessionStorage is updated to '1'. A second
        // dispatch with newState='closed' should write '0'.
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        const details = root.querySelector<HTMLDetailsElement>('.hud-memories')!;

        // Open the details programmatically AND dispatch a
        // synthetic toggle (jsdom's dispatchEvent on details
        // is the supported way to drive the handler in tests;
        // a real click on <summary> in jsdom does not always
        // fire toggle on every version, so we use dispatch).
        details.open = true;
        const openEvent = new Event('toggle') as Event & { newState?: string };
        openEvent.newState = 'open';
        details.dispatchEvent(openEvent);
        expect(sessionStorage.getItem('hud-memories-open')).toBe('1');

        // Now close + dispatch.
        details.open = false;
        const closeEvent = new Event('toggle') as Event & { newState?: string };
        closeEvent.newState = 'closed';
        details.dispatchEvent(closeEvent);
        expect(sessionStorage.getItem('hud-memories-open')).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// Round 54 — HUD rollback button + hideRecoveryBanner.
//
// The inline "🔙 回滚" button inside the recovery
// banner is gated on TWO conditions:
//   1. setRollbackHandler(fn) was called (App wires
//      this in constructor)
//   2. setBackupAvailable(true) was called (App
//      calls this after backupFailedSnapshot)
// Without either, the button is omitted from the
// render output (safe no-op fallback).
// ---------------------------------------------------------------------------

describe('HUD — round 54 rollback button', () => {
    test('hideRecoveryBanner_clears_visible_immediately', () => {
        jest.useFakeTimers();
        try {
            const { hud, root } = makeHud();
            hud.showRecoveryBanner('ERR_X', 'forest');
            expect(root.innerHTML).toContain('hud-recovery-banner');
            hud.hideRecoveryBanner();
            // hideRecoveryBanner flips visible=false
            // synchronously (no setTimeout involved).
            expect(root.innerHTML).not.toContain('hud-recovery-banner');
        } finally {
            jest.useRealTimers();
        }
    });

    test('rollback_button_only_renders_when_handler_and_backup_available', () => {
        const { hud, root } = makeHud();
        // No handler, no backup → no button.
        hud.showRecoveryBanner('ERR_X', 'forest');
        expect(root.innerHTML).not.toContain('hud-recovery-rollback');
        // Handler set, no backup → still no button.
        hud.setRollbackHandler(() => undefined);
        hud.setBackupAvailable(false);
        hud.showRecoveryBanner('ERR_X', 'forest');
        expect(root.innerHTML).not.toContain('hud-recovery-rollback');
        // Both set → button rendered.
        hud.setBackupAvailable(true);
        hud.showRecoveryBanner('ERR_X', 'forest');
        expect(root.innerHTML).toContain('hud-recovery-rollback');
    });

    test('rollback_button_click_invokes_handler', () => {
        const { hud, root } = makeHud();
        const handler = jest.fn();
        hud.setRollbackHandler(handler);
        hud.setBackupAvailable(true);
        hud.showRecoveryBanner('ERR_X', 'forest');
        const rollbackBtn = root.querySelector<HTMLButtonElement>('.hud-recovery-rollback');
        expect(rollbackBtn).toBeTruthy();
        rollbackBtn!.click();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Round 69 — `setWasmLatencyStats` + the new `⚡` row in the
// persistent-memories block. The setter accepts a
// WasmLatencySummary (per-fn count + median + p95 + max) and
// pushes it into HUDState. The render method emits a `.hud-wasm-latency`
// div with one bullet line per active fn, formatted as
// "median Xms · p95 Yms · max Zms (×N)". The `⚡` emoji is
// added to the summary strip only when at least one fn has
// a non-zero count (zero-count summaries don't pull the row
// in, matching the round-64 minimap "data URL present" guard).
// ---------------------------------------------------------------------------

describe('HUD — round 69 setWasmLatencyStats', () => {
    test('setWasmLatencyStats_pushes_into_state', () => {
        const { hud } = makeHud();
        expect(hud.getState().wasmLatencyStats).toBeUndefined();
        hud.setWasmLatencyStats({
            perFn: { themeToScene: { count: 1, medianMs: 1.5, p95Ms: 1.5, maxMs: 1.5 } },
            totalSamples: 1,
        });
        expect(hud.getState().wasmLatencyStats?.totalSamples).toBe(1);
        expect(hud.getState().wasmLatencyStats?.perFn.themeToScene.medianMs).toBe(1.5);
    });

    test('setWasmLatencyStats_null_clears_state', () => {
        const { hud } = makeHud();
        hud.setWasmLatencyStats({
            perFn: { themeToScene: { count: 1, medianMs: 1, p95Ms: 1, maxMs: 1 } },
            totalSamples: 1,
        });
        hud.setWasmLatencyStats(null);
        expect(hud.getState().wasmLatencyStats).toBeNull();
    });

    test('renders_⚡_row_when_perFn_non_empty', () => {
        const { hud, root } = makeHud();
        hud.setWasmLatencyStats({
            perFn: {
                themeToScene: { count: 5, medianMs: 1.5, p95Ms: 2.0, maxMs: 2.5 },
                mood4thSentenceFor: { count: 3, medianMs: 0.8, p95Ms: 0.9, maxMs: 1.0 },
            },
            totalSamples: 8,
        });
        const row = root.querySelector('.hud-wasm-latency');
        expect(row).not.toBeNull();
        expect(row!.textContent).toContain('⚡');
        expect(row!.textContent).toContain('themeToScene');
        expect(row!.textContent).toContain('mood4thSentenceFor');
        expect(row!.textContent).toContain('median');
        expect(row!.textContent).toContain('p95');
        expect(row!.textContent).toContain('max');
        // Both fns should appear (5 + 3 = 8 total samples
        // matches what the analytics bus emitted).
        expect(row!.textContent).toContain('×5');
        expect(row!.textContent).toContain('×3');
    });

    test('does_not_render_⚡_row_when_perFn_is_empty', () => {
        // Zero-count summary (e.g. immediately after
        // WasmLatencyStats.reset()): the row should be
        // hidden, NOT pulled in as a no-op divider.
        const { hud, root } = makeHud();
        hud.setWasmLatencyStats({ perFn: {}, totalSamples: 0 });
        const row = root.querySelector('.hud-wasm-latency');
        expect(row).toBeNull();
    });

    test('⚡_emoji_appears_in_summary_strip_when_stats_present', () => {
        // The round-51 summary shows the active-field count
        // + an emoji strip. Round 69 added ⚡ as the 7th
        // emoji. Verify it appears when wasm stats are set.
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        hud.setWasmLatencyStats({
            perFn: { themeToScene: { count: 1, medianMs: 1, p95Ms: 1, maxMs: 1 } },
            totalSamples: 1,
        });
        const summary = root.querySelector('details.hud-memories > summary');
        expect(summary).not.toBeNull();
        expect(summary!.textContent).toContain('⚡');
        // The count should reflect both ↩ (lastBiome) + ⚡
        // (wasm) = 2. (no other fields set in this test).
        expect(summary!.textContent).toContain('2');
    });

    test('coexists_with_other_memory_fields', () => {
        // Regression check — the new ⚡ row shouldn't break
        // the round-43/44/45/46/47/64 fields. Setting every
        // memory field + WASM stats should produce 7 fields
        // in the summary (↩ 🗣 🧠 🎭 🎬 🗺 ⚡).
        const { hud, root } = makeHud();
        hud.setLastBiome('forest');
        hud.setLastSpeaker({
            id: 'npc_1',
            branch: 'fear',
            disposition: { friendly: 0.1, fear: 0.7, trust: 0.0 },
        });
        hud.setNpcMindsSnapshot([{ entries: [{}, {}] }, { entries: [{}] }]);
        hud.setLastNpcDisposition({ friendly: 0.5, fear: 0.2, trust: 0.3 });
        hud.setLastSceneBlueprint({ npcCount: 5, bpm: 120, eventCount: 3, archetypeHintCount: 2 });
        hud.setMinimap('data:image/png;base64,FAKE');
        hud.setWasmLatencyStats({
            perFn: { themeToScene: { count: 2, medianMs: 1.5, p95Ms: 1.8, maxMs: 2.0 } },
            totalSamples: 2,
        });
        const summary = root.querySelector('details.hud-memories > summary');
        expect(summary!.textContent).toContain('7');
        // All 7 emojis should appear in the strip.
        for (const emoji of ['↩', '🗣', '🧠', '🎭', '🎬', '🗺', '⚡']) {
            expect(summary!.textContent).toContain(emoji);
        }
        // The wasm row should be present in the body.
        const row = root.querySelector('.hud-wasm-latency');
        expect(row).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Round 73 — `setLastSceneEventChain` + `⏰` row in the
// persistent-memories block. Mirrors the round-69 wasm-latency
// pattern (new emoji + new field in HUDState + new row HTML).
// The chain is rendered as a "next: <kind> in <delay>s" headline
// with a compact list of all events underneath.
// ---------------------------------------------------------------------------

describe('HUD — round 73 setLastSceneEventChain', () => {
    const SAMPLE_CHAIN: EventStep[] = [
        { kind: 'spawn_wave',    delaySecs: 5,  payload: 'forest_spawn_wave_2' },
        { kind: 'echo_lore',     delaySecs: 13, payload: 'forest_echo_lore_4' },
        { kind: 'treasure_drop', delaySecs: 21, payload: 'forest_treasure_drop_0' },
    ];

    test('renders_⏰_row_with_next_event_headline', () => {
        // The chain is already delay-sorted (both
        // `themeToScene` and `synthesizeDmEventChain`
        // guarantee this), so the first entry is the next
        // event. The row's textContent should mention
        // "next: spawn_wave in 5s" as the headline.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const row = root.querySelector('.hud-event-chain');
        expect(row).not.toBeNull();
        expect(row!.textContent).toContain('next:');
        expect(row!.textContent).toContain('spawn_wave');
        expect(row!.textContent).toContain('5s');
    });

    test('renders_full_chain_as_compact_list', () => {
        // Below the headline, all 3 events should appear as
        // "· t+<delay>s <kind>" lines. The delay format is
        // t+5s / t+13s / t+21s to match the round-39
        // event-log convention.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const row = root.querySelector('.hud-event-chain')!;
        expect(row.textContent).toContain('t+5s');
        expect(row.textContent).toContain('t+13s');
        expect(row.textContent).toContain('t+21s');
        expect(row.textContent).toContain('echo_lore');
        expect(row.textContent).toContain('treasure_drop');
    });

    test('adds_⏰_to_emoji_strip_and_increments_count', () => {
        // The round-51 `<details>` summary should grow from
        // 0 emojis (default) to 1 (⏰) when only the chain
        // row is set. The count is "1 条记忆" in zh-CN.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const summary = root.querySelector('.hud-memories > summary')!;
        expect(summary.textContent).toContain('⏰');
        // Count "1 条记忆" should be present.
        expect(summary.textContent).toContain('1');
    });

    test('does_not_render_⏰_row_when_chain_is_null', () => {
        // Default HUD (no chain set) should NOT pull the row
        // in, and the emoji strip should not include ⏰.
        const { hud, root } = makeHud();
        const row = root.querySelector('.hud-event-chain');
        expect(row).toBeNull();
        const summary = root.querySelector('.hud-memories > summary');
        if (summary) {
            expect(summary.textContent).not.toContain('⏰');
        }
    });

    test('does_not_render_⏰_row_when_chain_is_empty_array', () => {
        // A round-49 partial save where the loader didn't
        // have a chain to recover should leave the row
        // hidden (matches the round-69 zero-counts
        // contract).
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain([]);
        const row = root.querySelector('.hud-event-chain');
        expect(row).toBeNull();
    });

    test('clears_⏰_row_when_setLastSceneEventChain_called_with_null', () => {
        // Round a chain in, then clear it — the row should
        // vanish and the emoji strip should drop ⏰.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        expect(root.querySelector('.hud-event-chain')).not.toBeNull();
        hud.setLastSceneEventChain(null);
        expect(root.querySelector('.hud-event-chain')).toBeNull();
        const summary = root.querySelector('.hud-memories > summary');
        if (summary) {
            expect(summary.textContent).not.toContain('⏰');
        }
    });

    test('defensive_clone_prevents_caller_mutation_from_leaking', () => {
        // Mirrors the round-72 WorldState setter — the
        // HUD must deep-clone the chain so a caller
        // mutating the source array doesn't affect the
        // rendered row.
        const { hud, root } = makeHud();
        const source: EventStep[] = [
            { kind: 'spawn_wave', delaySecs: 5, payload: '0_0' },
        ];
        hud.setLastSceneEventChain(source);
        // Mutate after the call.
        source[0].payload = 'MUTATED';
        source.push({ kind: 'echo_lore', delaySecs: 13, payload: 'evil' });
        // The rendered row should still show the original
        // 1-event chain with the original payload.
        const row = root.querySelector('.hud-event-chain')!;
        expect(row.textContent).toContain('spawn_wave');
        expect(row.textContent).not.toContain('MUTATED');
        expect(row.textContent).not.toContain('evil');
    });
});

// ---------------------------------------------------------------------------
// Round 74 — `hud-memories-row-*` class-based styling.
//
// Before round 74, the round-69 `⚡` row and the round-73 `⏰`
// row each carried two inline `style="..."` attributes
// (opacity 0.7 for the count suffix, font-size 0.85em for
// the compact detail list). Inline styles bypass the
// stylesheet cascade, so any future theme-switch or
// per-biome tint adjustment would need a code change, not a
// CSS edit. This round moves both styles into the
// `.hud-memories-row-count` and `.hud-memories-row-detail`
// classes in frontend/src/style.css.
// ---------------------------------------------------------------------------

describe('HUD — round 74 hud-memories-row-* class-based styling', () => {
    // Sample fixtures for both rows. We construct a
    // non-empty chain and a non-empty WASM stats blob so
    // both rows render side-by-side in the test DOM.
    const SAMPLE_CHAIN: EventStep[] = [
        { kind: 'spawn_wave',    delaySecs: 5,  payload: 'forest_spawn_wave_2' },
        { kind: 'treasure_drop', delaySecs: 13, payload: 'forest_treasure_drop_0' },
    ];
    const SAMPLE_WASM = {
        perFn: {
            themeToScene:         { count: 5, medianMs: 1.5, p95Ms: 2.0, maxMs: 2.5 },
            mood4thSentenceFor:   { count: 3, medianMs: 0.8, p95Ms: 0.9, maxMs: 1.0 },
        },
        totalSamples: 8,
    };

    test('⚡_row_uses_class_for_dimmed_count_suffix', () => {
        // The headline "⚡ WASM 延迟 (N 样本)" had its
        // count suffix at `style="opacity:0.7"`; round 74
        // moved it to `class="hud-memories-row-count"`.
        const { hud, root } = makeHud();
        hud.setWasmLatencyStats(SAMPLE_WASM);
        const row = root.querySelector('.hud-wasm-latency')!;
        const countSpan = row.querySelector('.hud-memories-row-count');
        expect(countSpan).not.toBeNull();
        expect(countSpan!.textContent).toContain('8 样本');
        // No inline style should remain on this span.
        expect(countSpan!.getAttribute('style')).toBeNull();
    });

    test('⚡_row_uses_class_for_compact_per_fn_list', () => {
        // The compact "· <fn>: median ... p95 ... max ..."
        // list was at `style="font-size:0.85em"`; round 74
        // moved it to `class="hud-memories-row-detail"`.
        const { hud, root } = makeHud();
        hud.setWasmLatencyStats(SAMPLE_WASM);
        const row = root.querySelector('.hud-wasm-latency')!;
        const detailSpan = row.querySelector('.hud-memories-row-detail');
        expect(detailSpan).not.toBeNull();
        expect(detailSpan!.textContent).toContain('themeToScene');
        expect(detailSpan!.textContent).toContain('mood4thSentenceFor');
        // No inline style should remain on this span.
        expect(detailSpan!.getAttribute('style')).toBeNull();
    });

    test('⏰_row_uses_class_for_dimmed_count_suffix', () => {
        // Mirror check for the round-73 chain row. The
        // "(N 事件)" suffix had the same inline
        // `style="opacity:0.7"` problem.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const row = root.querySelector('.hud-event-chain')!;
        const countSpan = row.querySelector('.hud-memories-row-count');
        expect(countSpan).not.toBeNull();
        expect(countSpan!.textContent).toContain('2 事件');
        expect(countSpan!.getAttribute('style')).toBeNull();
    });

    test('⏰_row_uses_class_for_compact_event_list', () => {
        // Mirror check for the round-73 chain row. The
        // "· t+<b>...</b>s <b>...</b>" list was at
        // `style="font-size:0.85em"`.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const row = root.querySelector('.hud-event-chain')!;
        const detailSpan = row.querySelector('.hud-memories-row-detail');
        expect(detailSpan).not.toBeNull();
        expect(detailSpan!.textContent).toContain('t+5s');
        expect(detailSpan!.textContent).toContain('t+13s');
        expect(detailSpan!.textContent).toContain('spawn_wave');
        expect(detailSpan!.textContent).toContain('treasure_drop');
        expect(detailSpan!.getAttribute('style')).toBeNull();
    });

    test('no_inline_opacity_or_font_size_styles_on_rows', () => {
        // Belt-and-suspenders: even when both rows are
        // rendered at the same time, the rendered HTML
        // must not contain any inline `style="opacity:..."`
        // or `style="font-size:..."` attributes inside
        // the row containers. A future contributor adding
        // a new row should follow the same class-based
        // pattern.
        const { hud, root } = makeHud();
        hud.setWasmLatencyStats(SAMPLE_WASM);
        hud.setLastSceneEventChain(SAMPLE_CHAIN);
        const wasmRow = root.querySelector('.hud-wasm-latency')!;
        const chainRow = root.querySelector('.hud-event-chain')!;
        for (const row of [wasmRow, chainRow]) {
            const inlineStyled = row.querySelectorAll('[style*="opacity"], [style*="font-size"]');
            expect(inlineStyled.length).toBe(0);
        }
    });

    test('stylesheet_contains_both_new_rules', () => {
        // The CSS file must carry the rules we're now
        // referencing. We read the file directly (jest
        // doesn't apply the stylesheet, but the class
        // contract is "the rule exists at the source").
        // If the file is moved or renamed, this test
        // will fail loudly — better than a silent
        // dead-class.
        const fs = require('fs');
        const path = require('path');
        const cssPath = path.resolve(__dirname, '../../frontend/src/style.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        // The two rules. Match the property + class
        // selector with a permissive regex.
        expect(css).toMatch(/\.hud-memories-row-count\s*\{\s*opacity:\s*0\.7\s*;?\s*\}/);
        expect(css).toMatch(/\.hud-memories-row-detail\s*\{\s*font-size:\s*0\.85em\s*;?\s*\}/);
    });
});
