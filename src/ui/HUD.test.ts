/**
 * HUD tests — verify the I18n integration.
 */

import { HUD } from '../ui/HUD';
import { I18n } from '../i18n/I18n';
import { ActionDebouncer } from '../utils/ActionDebouncer';
import type { EventStep } from '../ai/SceneGen';
import { BINDING_DESCRIPTIONS } from '../input/KeyboardShortcuts';

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

    test('renders_kind_distribution_summary_for_diverse_chains (round 86)', () => {
        // The round-86 distribution summary lets the
        // player see the kind mix at a glance, without
        // scanning the compact per-event list. A 4-event
        // chain with 2× spawn_wave + 1× echo_lore + 1×
        // treasure_drop should show "spawn_wave ×2, echo_lore
        // ×1, treasure_drop ×1" in first-appearance order.
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain([
            { kind: 'spawn_wave',    delaySecs: 5,  payload: 'a' },
            { kind: 'echo_lore',     delaySecs: 13, payload: 'b' },
            { kind: 'spawn_wave',    delaySecs: 21, payload: 'c' },
            { kind: 'treasure_drop', delaySecs: 29, payload: 'd' },
        ]);
        const row = root.querySelector('.hud-event-chain')!;
        expect(row.textContent).toContain('分布:');
        expect(row.textContent).toContain('spawn_wave ×2');
        expect(row.textContent).toContain('echo_lore ×1');
        expect(row.textContent).toContain('treasure_drop ×1');
    });

    test('omits_distribution_summary_for_single_kind_chains (round 86)', () => {
        // A 2-event chain with 2× spawn_wave is still
        // useful — the distribution shows "spawn_wave ×2"
        // so the player knows the second event is a
        // repeat (not a bug). A 1-event chain is the
        // trivial case where the compact list already
        // shows the kind, so the distribution is
        // redundant; the helper still emits it (the
        // player can scan it as confirmation).
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain([
            { kind: 'spawn_wave', delaySecs: 5,  payload: 'a' },
            { kind: 'spawn_wave', delaySecs: 13, payload: 'b' },
        ]);
        const row = root.querySelector('.hud-event-chain')!;
        expect(row.textContent).toContain('分布:');
        expect(row.textContent).toContain('spawn_wave ×2');
        // No other kinds.
        expect(row.textContent).not.toContain('echo_lore');
    });

    test('preserves_first_appearance_order_in_distribution (round 86)', () => {
        // A chain where spawn_wave comes after echo_lore
        // in the schedule should still show echo_lore
        // first in the distribution (first-appearance
        // order, not alphabetical). This matches the
        // player's mental model: "the first thing that's
        // coming up is the most important kind".
        const { hud, root } = makeHud();
        hud.setLastSceneEventChain([
            { kind: 'echo_lore',     delaySecs: 5,  payload: 'a' },
            { kind: 'spawn_wave',    delaySecs: 13, payload: 'b' },
            { kind: 'echo_lore',     delaySecs: 21, payload: 'c' },
        ]);
        const row = root.querySelector('.hud-event-chain')!;
        const distStart = row.textContent!.indexOf('分布:');
        const distEnd = row.textContent!.indexOf(')', distStart);
        const dist = row.textContent!.slice(distStart, distEnd);
        // echo_lore appears before spawn_wave in the
        // distribution.
        const echoIdx = dist.indexOf('echo_lore');
        const spawnIdx = dist.indexOf('spawn_wave');
        expect(echoIdx).toBeGreaterThan(-1);
        expect(spawnIdx).toBeGreaterThan(-1);
        expect(echoIdx).toBeLessThan(spawnIdx);
    });
});

// ---------------------------------------------------------------------------
// Round 87 — `setLastBiomeAccent` & dim-panel left-border.
//
// Before round 87, the HUD dim panel was visually flat
// (just a `hud-panel hud-dim` card). Now the dim panel
// carries a 4px left border tinted with the biome's
// `particleColor` from `BiomeAtmosphere`. The HUD
// receives the color as a plain string (decoupled from
// the scene module — App resolves biome → color and
// pushes the value). Setting it to `null` removes the
// border entirely (e.g. a round-1 save that pre-dates
// the biome memory has no accent).
// ---------------------------------------------------------------------------

describe('HUD — round 87 setLastBiomeAccent & dim-panel left-border', () => {
    function mountHud(): { hud: HUD; root: HTMLElement } {
        return makeHud();
    }

    test('setLastBiomeAccent_pushes_into_state', () => {
        const { hud } = mountHud();
        expect(hud.getState().lastBiomeAccent).toBeUndefined();
        hud.setLastBiomeAccent('#88ccff');
        expect(hud.getState().lastBiomeAccent).toBe('#88ccff');
        hud.setLastBiomeAccent(null);
        expect(hud.getState().lastBiomeAccent).toBeNull();
    });

    test('dim_panel_renders_with_left_border_when_accent_set', () => {
        // The forest biome uses #88ccff as its
        // particleColor; the dim panel's inline
        // `style` attribute must set the
        // `--biome-accent` CSS custom property to
        // that value. The `border-left` rule itself
        // lives in the stylesheet (round 88), not
        // in the inline style.
        const { hud, root } = mountHud();
        hud.setLastBiomeAccent('#88ccff');
        const dimPanel = root.querySelector('.hud-panel.hud-dim')!;
        expect(dimPanel).not.toBeNull();
        const style = dimPanel.getAttribute('style') ?? '';
        expect(style).toContain('--biome-accent');
        expect(style).toContain('#88ccff');
        // Round 88: the inline style no longer
        // carries the `border-left` rule — that's
        // moved to the stylesheet. Verify the
        // round-87 inline pattern is gone so we
        // don't accidentally regress back to it.
        expect(style).not.toContain('border-left');
    });

    test('dim_panel_renders_without_border_style_when_accent_null', () => {
        // A null accent is the "no biome memory yet"
        // state. The dim panel must not set the
        // `--biome-accent` custom property — the
        // stylesheet rule's `transparent` fallback
        // keeps the panel flat.
        const { hud, root } = mountHud();
        // Explicitly null: even after a non-null
        // round-trip, nulling it out must clear the
        // style attr.
        hud.setLastBiomeAccent('#88ccff');
        hud.setLastBiomeAccent(null);
        const dimPanel = root.querySelector('.hud-panel.hud-dim')!;
        const style = dimPanel.getAttribute('style') ?? '';
        expect(style).not.toContain('--biome-accent');
        // And the round-87 inline `border-left`
        // pattern is still absent.
        expect(style).not.toContain('border-left');
    });

    test('dim_panel_escapes_accent_value_to_prevent_attribute_injection', () => {
        // The accent goes into an HTML attribute via
        // a template-literal interpolation. A
        // malicious value like `" onmouseover="alert(1)`
        // could break out of the `style` attr if we
        // didn't escape quotes. The HTML `style`
        // attribute is CDATA-like (entities are kept
        // literal in real browsers per HTML
        // §13.1.2.5), so escapeHtml converts the
        // embedded `"` to `&quot;` and the browser
        // keeps the entire payload inside the single
        // `style="..."` attribute. We assert the
        // security property directly: only the
        // `style` attribute exists, with no
        // `onmouseover` attribute bleeding through.
        const { hud, root } = mountHud();
        hud.setLastBiomeAccent('" onmouseover="alert(1)');
        const dimPanel = root.querySelector('.hud-panel.hud-dim')!;
        // Exactly one attribute (`style`) and zero
        // `onmouseover` attributes — the injection
        // attempt is fully contained.
        expect(dimPanel.hasAttribute('onmouseover')).toBe(false);
        const style = dimPanel.getAttribute('style') ?? '';
        // The value starts with the legitimate
        // `--biome-accent:` prefix; the malicious
        // payload sits inside the value, not as a
        // sibling attribute.
        expect(style.startsWith('--biome-accent:')).toBe(true);
    });

    test('stylesheet_hud_dim_rule_reads_biome_accent_custom_property', () => {
        // Round 88 moved the `border-left` rule to a
        // stylesheet class. We read the file directly
        // (a small file-content test) to confirm the
        // rule still wires `--biome-accent` to the
        // border, so a future edit doesn't silently
        // break the round-87 visual cue.
        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const cssPath = path.resolve(
            __dirname, '../../frontend/src/style.css',
        );
        const css = fs.readFileSync(cssPath, 'utf8');
        // The .hud-panel.hud-dim selector must read
        // the --biome-accent custom property with a
        // transparent fallback.
        expect(css).toMatch(/\.hud-panel\.hud-dim\s*\{[^}]*border-left:\s*4px solid var\(--biome-accent,\s*transparent\)/);
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

// ---------------------------------------------------------------------------
// Round 79 — `setRollbackCount` + 🛟 row. Mirrors the
// round-69/73/74 row-rendering tests but for the lifetime
// rollback count surfaced from `WorldState.rollbackCount`.
// ---------------------------------------------------------------------------

describe('HUD — round 79 setRollbackCount', () => {
    test('renders_🛟_row_with_count', () => {
        const { hud, root } = makeHud();
        hud.setRollbackCount(2);
        const row = root.querySelector('.hud-rollback-count');
        expect(row).not.toBeNull();
        expect(row!.textContent).toContain('🛟');
        expect(row!.textContent).toContain('2');
    });

    test('adds_🛟_to_emoji_strip_and_increments_count', () => {
        const { hud, root } = makeHud();
        hud.setRollbackCount(1);
        const summary = root.querySelector('.hud-memories > summary')!;
        expect(summary.textContent).toContain('🛟');
        // Count "1 条记忆" should be present.
        expect(summary.textContent).toContain('1');
    });

    test('does_not_render_🛟_row_when_count_is_zero', () => {
        // A fresh save (or a save that never saw a
        // rollback) renders identically to pre-round-79:
        // no 🛟 row, no 🛟 in the emoji strip.
        const { hud, root } = makeHud();
        hud.setRollbackCount(0);
        const row = root.querySelector('.hud-rollback-count');
        expect(row).toBeNull();
        const summary = root.querySelector('.hud-memories > summary');
        if (summary) {
            expect(summary.textContent).not.toContain('🛟');
        }
    });

    test('does_not_render_🛟_row_when_count_is_null', () => {
        // A legacy save (or a hard-reset path) loaded
        // without the field defaults to null, which must
        // also keep the row hidden.
        const { hud, root } = makeHud();
        hud.setRollbackCount(null);
        const row = root.querySelector('.hud-rollback-count');
        expect(row).toBeNull();
    });

    test('clears_🛟_row_when_setRollbackCount_called_with_null', () => {
        // Round a count in, then clear it — the row
        // should vanish and the emoji strip should drop 🛟.
        const { hud, root } = makeHud();
        hud.setRollbackCount(3);
        expect(root.querySelector('.hud-rollback-count')).not.toBeNull();
        hud.setRollbackCount(null);
        expect(root.querySelector('.hud-rollback-count')).toBeNull();
        const summary = root.querySelector('.hud-memories > summary');
        if (summary) {
            expect(summary.textContent).not.toContain('🛟');
        }
    });

    test('renders_multi_digit_count', () => {
        // A save with many rollbacks (heavy recovery
        // history) should display the full integer, not
        // truncate. Sanity check for the `b$` template
        // binding.
        const { hud, root } = makeHud();
        hud.setRollbackCount(17);
        const row = root.querySelector('.hud-rollback-count')!;
        expect(row.textContent).toContain('17');
    });

    test('setRollbackCount_reflected_in_getState', () => {
        // The HUDState contract — `getState()` should
        // expose the count for callers (e.g. tests, debug
        // overlays) that need to read it without parsing
        // the DOM. Mirrors the round-26 read-only
        // snapshot contract.
        const { hud } = makeHud();
        hud.setRollbackCount(4);
        const state = hud.getState();
        expect(state.rollbackCount).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// Round 146 — HUD
// `setDebouncers` +
// debouncer mini-strip.
// ---------------------------------------------------------------------------

describe('HUD — round 146 setDebouncers & debouncer mini-strip', () => {
    // Pin the test's "now" so
    // the countdown math is
    // deterministic. The
    // round-108 ActionDebouncer
    // reads Date.now() at
    // check() time.
    let nowSpy: jest.SpyInstance<number, []>;
    beforeEach(() => {
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    });
    afterEach(() => {
        nowSpy.mockRestore();
    });

    function makeDebouncer(windowMs = 500, name = 'saveGame', round = 'round 106'): ActionDebouncer {
        return new ActionDebouncer(windowMs, name, round, () => { /* logFn */ });
    }

    test('does_not_render_strip_when_debouncers_omitted', () => {
        // Pre-round-146 layout: the strip is hidden when
        // setDebouncers has never been called. Mirrors
        // the "null rolls back to the pre-round-79
        // layout" contract.
        const { root } = makeHud();
        const strip = root.querySelector('.hud-debouncer-strip');
        expect(strip).toBeNull();
    });

    test('renders_strip_with_4_cells_when_4_debouncers_set', () => {
        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: makeDebouncer(500, 'loadGame', 'round 104'), chineseLabel: '读取存档' },
            { debouncer: makeDebouncer(500, 'saveGame', 'round 106'), chineseLabel: '保存游戏' },
            { debouncer: makeDebouncer(500, 'rollWorldEvent', 'round 107'), chineseLabel: '世界事件' },
            { debouncer: makeDebouncer(500, 'enterAtom', 'round 109'), chineseLabel: '进入 atom' },
        ]);
        const cells = root.querySelectorAll('.hud-debouncer-strip-cell');
        expect(cells.length).toBe(4);
    });

    test('all_4_cells_render_as_可触发_when_no_debouncer_has_fired', () => {
        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: makeDebouncer(500, 'a', 'r1'), chineseLabel: 'A' },
            { debouncer: makeDebouncer(500, 'b', 'r2'), chineseLabel: 'B' },
            { debouncer: makeDebouncer(500, 'c', 'r3'), chineseLabel: 'C' },
            { debouncer: makeDebouncer(500, 'd', 'r4'), chineseLabel: 'D' },
        ]);
        const cells = root.querySelectorAll('.hud-debouncer-strip-cell');
        for (const cell of Array.from(cells)) {
            expect(cell.classList.contains('is-open')).toBe(true);
            expect(cell.classList.contains('is-shielding')).toBe(false);
            expect(cell.textContent).toContain('可触发');
        }
    });

    test('shielding_cell_switches_to_屏蔽中_after_stamp_inside_window_round_146', () => {
        // Stamp the 2nd debouncer 100ms in the past. With
        // a 500ms window, that's still inside the window →
        // the 2nd cell should switch to 屏蔽中 + show
        // a "100/500ms" countdown.
        const debouncers = [
            makeDebouncer(500, 'a', 'r1'),
            makeDebouncer(500, 'b', 'r2'),
            makeDebouncer(500, 'c', 'r3'),
            makeDebouncer(500, 'd', 'r4'),
        ];
        // Advance Date.now() so `stamp()` records a
        // baseline, then roll back so the read happens
        // 100ms "after" the stamp.
        nowSpy.mockReturnValue(1_700_000_000_000);
        debouncers[1].stamp();
        nowSpy.mockReturnValue(1_700_000_000_100);

        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: debouncers[0], chineseLabel: 'A' },
            { debouncer: debouncers[1], chineseLabel: 'B' },
            { debouncer: debouncers[2], chineseLabel: 'C' },
            { debouncer: debouncers[3], chineseLabel: 'D' },
        ]);
        const cells = root.querySelectorAll('.hud-debouncer-strip-cell');
        // The 2nd cell (index 1) is shielding.
        expect(cells[1].classList.contains('is-shielding')).toBe(true);
        expect(cells[1].classList.contains('is-open')).toBe(false);
        expect(cells[1].textContent).toContain('屏蔽中');
        expect(cells[1].textContent).toContain('100/500ms');
        // The other 3 cells are still open.
        for (const idx of [0, 2, 3]) {
            expect(cells[idx].classList.contains('is-open')).toBe(true);
            expect(cells[idx].textContent).toContain('可触发');
        }
    });

    test('shielding_cell_reverts_to_可触发_after_window_expires_round_146', () => {
        // Stamp 600ms in the past (window = 500ms) → the
        // window has expired → cell is back to 可触发.
        const debouncers = [
            makeDebouncer(500, 'a', 'r1'),
            makeDebouncer(500, 'b', 'r2'),
        ];
        nowSpy.mockReturnValue(1_700_000_000_000);
        debouncers[0].stamp();
        nowSpy.mockReturnValue(1_700_000_000_600);

        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: debouncers[0], chineseLabel: 'A' },
            { debouncer: debouncers[1], chineseLabel: 'B' },
        ]);
        const cells = root.querySelectorAll('.hud-debouncer-strip-cell');
        expect(cells[0].classList.contains('is-open')).toBe(true);
        expect(cells[0].textContent).toContain('可触发');
    });

    test('renders_3_separators_between_4_cells_round_146', () => {
        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: makeDebouncer(500, 'a', 'r1'), chineseLabel: 'A' },
            { debouncer: makeDebouncer(500, 'b', 'r2'), chineseLabel: 'B' },
            { debouncer: makeDebouncer(500, 'c', 'r3'), chineseLabel: 'C' },
            { debouncer: makeDebouncer(500, 'd', 'r4'), chineseLabel: 'D' },
        ]);
        const seps = root.querySelectorAll('.hud-debouncer-strip-sep');
        expect(seps.length).toBe(3);
        for (const s of Array.from(seps)) {
            expect(s.textContent).toBe('|');
        }
    });

    test('adds_⏱_to_emoji_strip_and_increments_count_round_146', () => {
        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: makeDebouncer(500, 'a', 'r1'), chineseLabel: 'A' },
            { debouncer: makeDebouncer(500, 'b', 'r2'), chineseLabel: 'B' },
        ]);
        const summary = root.querySelector('.hud-memories > summary')!;
        expect(summary.textContent).toContain('⏱');
    });

    test('does_not_render_strip_when_debouncers_array_is_empty_round_146', () => {
        // Empty array is treated as "no strip" (mirrors
        // the "null is no strip" contract).
        const { hud, root } = makeHud();
        hud.setDebouncers([]);
        const strip = root.querySelector('.hud-debouncer-strip');
        expect(strip).toBeNull();
    });

    test('does_not_render_strip_after_setDebouncers_null_round_146', () => {
        const { hud, root } = makeHud();
        hud.setDebouncers([
            { debouncer: makeDebouncer(500, 'a', 'r1'), chineseLabel: 'A' },
        ]);
        expect(root.querySelector('.hud-debouncer-strip')).not.toBeNull();
        hud.setDebouncers(null);
        expect(root.querySelector('.hud-debouncer-strip')).toBeNull();
    });

    test('state_snapshot_round_trips_debouncers_through_getState_round_146', () => {
        // Mirrors the round-26 read-only snapshot
        // contract: external callers (e.g. debug
        // overlays) can read the debouncers without
        // parsing the DOM. The getter returns a fresh
        // array snapshot.
        const { hud } = makeHud();
        const debouncers = [
            { debouncer: makeDebouncer(500, 'a', 'r1'), chineseLabel: 'A' },
            { debouncer: makeDebouncer(500, 'b', 'r2'), chineseLabel: 'B' },
        ];
        hud.setDebouncers(debouncers);
        const state = hud.getState();
        expect(state.debouncers).not.toBeNull();
        expect(state.debouncers!.length).toBe(2);
        expect(state.debouncers![0].chineseLabel).toBe('A');
        expect(state.debouncers![1].chineseLabel).toBe('B');
        // The snapshot is a copy: mutating the source
        // array should NOT leak into the state.
        (debouncers as Array<{ chineseLabel: string }>).pop();
        const state2 = hud.getState();
        expect(state2.debouncers!.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Round 147 — HUD
// `setHotkeys` +
// quick-action
// hotkey hint strip.
// ---------------------------------------------------------------------------

describe('HUD — round 147 setHotkeys & hotkey hint strip', () => {
    test('does_not_render_strip_when_hotkeys_omitted', () => {
        // Pre-round-147 layout: the strip is hidden
        // when setHotkeys has never been called.
        const { root } = makeHud();
        const strip = root.querySelector('.hud-hotkeys');
        expect(strip).toBeNull();
    });

    test('renders_strip_with_4_hotkeys_when_4_bindings_set', () => {
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置' },
            { key: 'Q', action: '代码' },
            { key: 'T', action: '状态' },
            { key: 'R', action: '回滚' },
        ]);
        const hotkeys = root.querySelectorAll('.hud-hotkey');
        expect(hotkeys.length).toBe(4);
    });

    test('renders_kbd_element_with_correct_key_round_147', () => {
        // Each hotkey wraps the key in `<kbd>` so CSS
        // can style it as a key cap.
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置' },
            { key: 'R', action: '回滚' },
        ]);
        const kbd = root.querySelectorAll('kbd.hud-hotkey-key');
        expect(kbd.length).toBe(2);
        expect(kbd[0].textContent).toBe('P');
        expect(kbd[1].textContent).toBe('R');
    });

    test('renders_chinese_action_label_round_147', () => {
        // The action label is the Chinese
        // description, e.g. "设置" / "回滚".
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置' },
            { key: 'R', action: '回滚' },
        ]);
        const actions = root.querySelectorAll('.hud-hotkey-action');
        expect(actions[0].textContent).toBe('设置');
        expect(actions[1].textContent).toBe('回滚');
    });

    test('renders_3_dot_separators_between_4_hotkeys_round_147', () => {
        // 4 hotkeys → 3 · separators (mirrors
        // the round-145/146 separator pattern).
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置' },
            { key: 'Q', action: '代码' },
            { key: 'T', action: '状态' },
            { key: 'R', action: '回滚' },
        ]);
        const seps = root.querySelectorAll('.hud-hotkey-sep');
        expect(seps.length).toBe(3);
        for (const s of Array.from(seps)) {
            expect(s.textContent).toBe('·');
        }
    });

    test('does_not_render_strip_when_hotkeys_array_is_empty_round_147', () => {
        // Empty array is treated as "no strip" (mirrors
        // the "null is no strip" contract).
        const { hud, root } = makeHud();
        hud.setHotkeys([]);
        const strip = root.querySelector('.hud-hotkeys');
        expect(strip).toBeNull();
    });

    test('does_not_render_strip_after_setHotkeys_null_round_147', () => {
        const { hud, root } = makeHud();
        hud.setHotkeys([{ key: 'P', action: '设置' }]);
        expect(root.querySelector('.hud-hotkeys')).not.toBeNull();
        hud.setHotkeys(null);
        expect(root.querySelector('.hud-hotkeys')).toBeNull();
    });

    test('renders_group_label_when_group_field_changes_round_147', () => {
        // When `group` differs from the previous
        // binding's group, a `<span class="hud-hotkey-group">`
        // section header is emitted.
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置', group: '面板' },
            { key: 'Q', action: '代码', group: '面板' },
            { key: 'R', action: '回滚', group: '系统' },
        ]);
        const groups = root.querySelectorAll('.hud-hotkey-group');
        // 1st pair shares "面板" → 1 group label.
        // 3rd binding has "系统" → 2nd group label.
        expect(groups.length).toBe(2);
        expect(groups[0].textContent).toBe('面板');
        expect(groups[1].textContent).toBe('系统');
    });

    test('does_not_repeat_group_label_for_consecutive_same_group_round_147', () => {
        // Two consecutive bindings with the same
        // `group` produce ONE group label, not two.
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置', group: '面板' },
            { key: 'Q', action: '代码', group: '面板' },
        ]);
        const groups = root.querySelectorAll('.hud-hotkey-group');
        expect(groups.length).toBe(1);
        expect(groups[0].textContent).toBe('面板');
    });

    test('omits_group_label_when_no_group_provided_round_147', () => {
        // No `group` field → no group label rendered.
        const { hud, root } = makeHud();
        hud.setHotkeys([
            { key: 'P', action: '设置' },
            { key: 'R', action: '回滚' },
        ]);
        const groups = root.querySelectorAll('.hud-hotkey-group');
        expect(groups.length).toBe(0);
    });

    test('state_snapshot_round_trips_hotkeys_through_getState_round_147', () => {
        // Mirrors the round-26 read-only snapshot
        // contract: external callers can read the
        // hotkeys without parsing the DOM. The
        // snapshot is a copy.
        const { hud } = makeHud();
        const hotkeys = [
            { key: 'P', action: '设置' },
            { key: 'R', action: '回滚' },
        ];
        hud.setHotkeys(hotkeys);
        const state = hud.getState();
        expect(state.hotkeys).not.toBeNull();
        expect(state.hotkeys!.length).toBe(2);
        expect(state.hotkeys![0].key).toBe('P');
        expect(state.hotkeys![1].action).toBe('回滚');
        // Mutating the source array should NOT leak
        // into the state.
        (hotkeys as Array<{ action: string }>).pop();
        const state2 = hud.getState();
        expect(state2.hotkeys!.length).toBe(2);
    });

    test('hotkey_strip_renders_inside_hud_stats_panel_round_147', () => {
        // The strip is rendered INSIDE the
        // `hud-stats` panel (not in the dim / log
        // panels) so it acts as a quick-reference
        // card at the bottom of the stats column.
        const { hud, root } = makeHud();
        hud.setHotkeys([{ key: 'P', action: '设置' }]);
        const statsPanel = root.querySelector('.hud-stats');
        expect(statsPanel).not.toBeNull();
        const strip = statsPanel!.querySelector('.hud-hotkeys');
        expect(strip).not.toBeNull();
        // The strip is NOT in the dim / log panels.
        const dimPanel = root.querySelector('.hud-dim');
        const logPanel = root.querySelector('.hud-log');
        expect(dimPanel!.querySelector('.hud-hotkeys')).toBeNull();
        expect(logPanel!.querySelector('.hud-hotkeys')).toBeNull();
    });
});

// ============================================================================
// Round 150 — biome-contextual hotkey hint strip.
// Extends the round-147 base strip with a SECOND strip below it, prefixed
// with a `—— ${label} ——` biome header. The host pushes per-biome bindings
// on dimension change (forest / desert / cyberpunk / ice).
// ============================================================================

test('round_150_omitted_biome_hotkeys (default layout)', () => {
    // No `setBiomeHotkeys` call → biome strip is hidden
    // (the round-147 layout is preserved).
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    // No setBiomeHotkeys call.
    const strip = root.querySelector('.hud-hotkeys-biome');
    expect(strip).toBeNull();
});

test('round_150_setBiomeHotkeys_renders_biome_strip_below_base', () => {
    // Push a biome context with 3 bindings → the biome
    // strip appears BELOW the base strip (which is empty
    // here — only the biome strip is shown).
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setBiomeHotkeys('赛博', [
        { key: '1', action: '黑客', group: '入侵' },
        { key: '2', action: '机甲', group: '战斗' },
        { key: '3', action: '芯片', group: '升级' },
    ]);
    const biomeStrip = root.querySelector('.hud-hotkeys-biome');
    expect(biomeStrip).not.toBeNull();
    // 3 binding spans + 2 separators.
    const hotkeySpans = biomeStrip!.querySelectorAll('.hud-hotkey');
    expect(hotkeySpans.length).toBe(3);
    const seps = biomeStrip!.querySelectorAll('.hud-hotkey-sep');
    expect(seps.length).toBe(2);
});

test('round_150_biome_strip_includes_label_header', () => {
    // The biome label is rendered as `—— ${label} ——`
    // in a `.hud-hotkey-biome-label` element.
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setBiomeHotkeys('森林', [
        { key: '1', action: '伐木', group: '采集' },
    ]);
    const labelEl = root.querySelector('.hud-hotkey-biome-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl!.textContent).toBe('—— 森林 ——');
});

test('round_150_null_label_omits_header_but_keeps_strip', () => {
    // When biomeLabel is null, the strip renders WITHOUT
    // the header (just the bindings).
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setBiomeHotkeys(null, [
        { key: '1', action: '火把' },
    ]);
    const biomeStrip = root.querySelector('.hud-hotkeys-biome');
    expect(biomeStrip).not.toBeNull();
    // The label is absent.
    expect(biomeStrip!.querySelector('.hud-hotkey-biome-label')).toBeNull();
    // But the binding is there.
    expect(biomeStrip!.querySelectorAll('.hud-hotkey').length).toBe(1);
});

test('round_150_setBiomeHotkeys_null_clears_strip', () => {
    // Pass null for hotkeys → biome strip disappears.
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setBiomeHotkeys('沙漠', [{ key: '1', action: '挖井' }]);
    expect(root.querySelector('.hud-hotkeys-biome')).not.toBeNull();
    hud.setBiomeHotkeys(null, null);
    expect(root.querySelector('.hud-hotkeys-biome')).toBeNull();
});

test('round_150_biome_and_base_strips_render_together', () => {
    // Both strips are set → both render in the same
    // `hud-stats` panel. Biome strip is BELOW the base
    // strip (rendered later in the template).
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setHotkeys([
        { key: 'P', action: '设置', group: '面板' },
        { key: 'Q', action: '代码', group: '面板' },
    ]);
    hud.setBiomeHotkeys('冰原', [
        { key: '1', action: '凿冰', group: '采集' },
        { key: '2', action: '雪橇', group: '移动' },
    ]);
    const allStrips = root.querySelectorAll('.hud-hotkeys');
    // 2 strips total: 1 base + 1 biome.
    expect(allStrips.length).toBe(2);
    // The first is the base (no `.hud-hotkeys-biome` class).
    expect(allStrips[0].classList.contains('hud-hotkeys-biome')).toBe(false);
    // The second is the biome strip.
    expect(allStrips[1].classList.contains('hud-hotkeys-biome')).toBe(true);
});

test('round_150_biome_strip_uses_defensive_copy_round_trip', () => {
    // Mutating the source array after pushing to the HUD
    // must NOT leak into the HUD's stored state
    // (defensive-copy contract — mirrors the round-147
    // setHotkeys pattern).
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    const source = [
        { key: '1', action: '黑客', group: '入侵' },
    ];
    hud.setBiomeHotkeys('赛博', source);
    // Mutate the source AFTER setBiomeHotkeys.
    source.push({ key: '2', action: '机甲', group: '战斗' });
    // The biome strip is still just 1 binding.
    const biomeStrip = root.querySelector('.hud-hotkeys-biome');
    expect(biomeStrip!.querySelectorAll('.hud-hotkey').length).toBe(1);
});

test('round_150_chinese_label_is_escaped_round_150', () => {
    // The biome label goes through `escapeHtml` for XSS
    // safety. A label containing HTML metacharacters
    // (e.g. `<script>`) is rendered as TEXT, not
    // parsed as HTML.
    const root = document.getElementById('hud')!;
    const i18n = new I18n();
    const hud = new HUD(root, i18n);
    hud.setBiomeHotkeys('<script>alert(1)</script>', [
        { key: '1', action: '火把' },
    ]);
    const labelEl = root.querySelector('.hud-hotkey-biome-label');
    expect(labelEl).not.toBeNull();
    // The text content is the literal string (escaped).
    expect(labelEl!.textContent).toContain('<script>');
    // But no actual <script> element was created.
    expect(labelEl!.querySelector('script')).toBeNull();
});

/* ---------------------------------------------------------------------------
 * Round 152 — HUD compact mode tests.
 *
 * The compact mode collapses the round-51 memories
 * block's per-row detail lists (WASM latency per-fn
 * breakdown, event-chain timeline, debouncer
 * mini-strip countdowns) into headline rows. The
 * `compact` flag lives on HUDState; the `setCompact`
 * setter is the canonical write path. These tests
 * pin the contract:
 *
 *  1. Default state is non-compact (isCompact === false).
 *  2. setCompact(true) flips the flag.
 *  3. setCompact(false) flips it back.
 *  4. setCompact updates the state field read via getState.
 *  5. isCompact() mirrors getState().compact (defense in
 *     depth — a regression that overrode one but not
 *     the other fails this test).
 *  6. With wasmLatencyStats set + compact=true, the
 *     per-fn breakdown is omitted (only the headline
 *     row renders).
 *  7. With lastSceneEventChain set + compact=true, the
 *     full per-event timeline is omitted.
 *  8. With debouncers set + compact=true, the
 *     countdown span is dropped + the
 *     `hud-debouncer-strip-compact` class is added.
 *
 * The localStorage round-trip is covered at the
 * `loadHudCompactFromStorage` / `saveHudCompactToStorage`
 * level by direct tests in main.ts (avoids spinning
 * up the full App in this module).
 * ------------------------------------------------------------------------- */

describe('HUD — round 152 compact mode', () => {
    test('default_state_is_not_compact_round_152', () => {
        // Fresh HUD → compact flag is undefined
        // → isCompact() returns false. The render
        // path treats undefined and false
        // identically (the comparisons use
        // `s.compact === true` and `s.compact ===
        // true` strict-equality), so a regression
        // that returned `true` for undefined would
        // fail this test.
        const { hud } = makeHud();
        expect(hud.isCompact()).toBe(false);
    });

    test('setCompact_true_flips_isCompact_round_152', () => {
        const { hud } = makeHud();
        hud.setCompact(true);
        expect(hud.isCompact()).toBe(true);
    });

    test('setCompact_false_flips_isCompact_back_round_152', () => {
        // Two-step flip: true → false must
        // return to the default state.
        const { hud } = makeHud();
        hud.setCompact(true);
        hud.setCompact(false);
        expect(hud.isCompact()).toBe(false);
    });

    test('setCompact_updates_state_field_round_152', () => {
        // Defense in depth: a regression that
        // updated the `compact` field via a
        // side-channel (e.g. a closure) but
        // missed the `getState().compact` read
        // would fail this test.
        const { hud } = makeHud();
        hud.setCompact(true);
        expect(hud.getState().compact).toBe(true);
        hud.setCompact(false);
        expect(hud.getState().compact).toBe(false);
    });

    test('wasm_latency_per_fn_breakdown_omitted_in_compact_round_152', () => {
        // The round-69 WASM row renders the
        // headline ("⚡ WASM 延迟 (N 样本)")
        // PLUS a `<br>` followed by the per-fn
        // detail list. In compact mode, the
        // detail list is dropped.
        const { hud, root } = makeHud();
        const fnStats = {
            medianMs: 5,
            p95Ms: 10,
            maxMs: 20,
            count: 100,
        };
        hud.setState({
            wasmLatencyStats: {
                totalSamples: 100,
                perFn: { match3: fnStats, parkour: fnStats },
            },
        });
        // Non-compact: the per-fn detail is present.
        const detailBefore = root.querySelector('.hud-wasm-latency .hud-memories-row-detail');
        expect(detailBefore).not.toBeNull();
        // Compact: the per-fn detail is omitted.
        hud.setCompact(true);
        const detailAfter = root.querySelector('.hud-wasm-latency .hud-memories-row-detail');
        expect(detailAfter).toBeNull();
        // The headline row is still present.
        const headline = root.querySelector('.hud-wasm-latency');
        expect(headline).not.toBeNull();
        expect(headline!.textContent).toContain('WASM 延迟');
    });

    test('event_chain_per_event_timeline_omitted_in_compact_round_152', () => {
        // The round-73 event-chain row renders
        // the "next: <kind> in <delaySecs>s"
        // headline PLUS a `<br>` followed by
        // the full per-event timeline. In
        // compact mode, the timeline is dropped
        // but the headline + count suffix +
        // distribution summary stay.
        const { hud, root } = makeHud();
        const chain: EventStep[] = [
            { kind: 'spawn_wave', delaySecs: 5, payload: '{}' },
            { kind: 'echo_lore', delaySecs: 12, payload: '{}' },
            { kind: 'spawn_wave', delaySecs: 18, payload: '{}' },
        ];
        hud.setState({ lastSceneEventChain: chain });
        // Non-compact: timeline present.
        const detailBefore = root.querySelector('.hud-event-chain .hud-memories-row-detail');
        expect(detailBefore).not.toBeNull();
        expect(detailBefore!.textContent).toContain('echo_lore');
        // Compact: timeline omitted.
        hud.setCompact(true);
        const detailAfter = root.querySelector('.hud-event-chain .hud-memories-row-detail');
        expect(detailAfter).toBeNull();
        // The headline + count suffix + dist line stay.
        const headline = root.querySelector('.hud-event-chain');
        expect(headline).not.toBeNull();
        expect(headline!.textContent).toContain('next:');
        expect(headline!.textContent).toContain('spawn_wave ×2');
    });

    test('debouncer_strip_drops_countdown_and_adds_compact_class_round_152', () => {
        // The round-146 debouncer strip renders
        // 3 spans per cell (label / status /
        // countdown). In compact mode, the
        // countdown span is dropped + the
        // wrapper gets a `…-compact` class
        // for the stylesheet to tighten the
        // row height.
        const { hud, root } = makeHud();
        // The round-108 ActionDebouncer
        // constructor takes (windowMs, actionName,
        // roundTag, logFn). `check()` stamps the
        // debouncer (allowed returns true) which
        // puts it into the "shielding" state for
        // the next `windowMs`.
        const debouncer = new ActionDebouncer(500, 'save', 'round 152', () => {});
        debouncer.check();
        hud.setState({
            debouncers: [
                { debouncer, chineseLabel: '保存' },
            ],
        });
        // Non-compact: the countdown span is present.
        const stripBefore = root.querySelector('.hud-debouncer-strip');
        expect(stripBefore).not.toBeNull();
        expect(stripBefore!.classList.contains('hud-debouncer-strip-compact')).toBe(false);
        const countdownBefore = root.querySelector('.hud-debouncer-strip-countdown');
        expect(countdownBefore).not.toBeNull();
        // Compact: countdown dropped, compact class added.
        hud.setCompact(true);
        const stripAfter = root.querySelector('.hud-debouncer-strip');
        expect(stripAfter).not.toBeNull();
        expect(stripAfter!.classList.contains('hud-debouncer-strip-compact')).toBe(true);
        const countdownAfter = root.querySelector('.hud-debouncer-strip-countdown');
        expect(countdownAfter).toBeNull();
        // The status span is still present (only
        // the countdown is dropped).
        const status = root.querySelector('.hud-debouncer-strip-status');
        expect(status).not.toBeNull();
    });

    test('BINDING_DESCRIPTIONS_includes_hud_compact_hotkey_round_152', () => {
        // The H key shortcut for HUD compact mode
        // is mirrored in BINDING_DESCRIPTIONS so
        // the help overlay auto-iterates it. A
        // regression that added the H key to
        // routeKey + KeyboardAction union but
        // forgot BINDING_DESCRIPTIONS would fail
        // this test (the help overlay would
        // silently omit the row).
        const desc = BINDING_DESCRIPTIONS.find((d) => d.key === 'H');
        expect(desc).toBeDefined();
        expect(desc!.action).toContain('紧凑');
    });

    // Round 153 — HUD fade mode tests.
    //
    // Round 153 adds an opt-in "fade" mode
    // (F key + `agi_hud_fade` localStorage
    // flag): after 3s of key/click inactivity
    // the .hud-stats panel auto-fades to
    // 0.25 opacity, and snaps back to fully
    // visible on the next `notifyInput()`
    // call. These tests pin the HUD-side
    // state machine so a future refactor
    // can't silently break the fade contract.

    test('default_state_is_not_fade_enabled_round_153', () => {
        // Fresh HUD: fade mode is OFF by
        // default (mirrors the round-152
        // compact default).
        const { hud } = makeHud();
        expect(hud.isFadeEnabled()).toBe(false);
    });

    test('setFadeEnabled_true_flips_isFadeEnabled_round_153', () => {
        const { hud } = makeHud();
        hud.setFadeEnabled(true);
        expect(hud.isFadeEnabled()).toBe(true);
    });

    test('setFadeEnabled_false_flips_isFadeEnabled_back_round_153', () => {
        const { hud } = makeHud();
        hud.setFadeEnabled(true);
        hud.setFadeEnabled(false);
        expect(hud.isFadeEnabled()).toBe(false);
    });

    test('notifyInput_clears_idle_timestamp_round_153', () => {
        // Simulate: fade enabled, panel has
        // already auto-faded. notifyInput()
        // must reset `hudFadeIdledAt` to null
        // so the render template drops the
        // `hud-stats-fading` class.
        const { hud } = makeHud();
        hud.setFadeEnabled(true);
        // Force the panel into fading state
        // by ticking idle past the threshold.
        hud.tickIdle(4000, 0);  // 4s > 3s default
        expect(hud.isFading()).toBe(true);
        hud.notifyInput();
        expect(hud.isFading()).toBe(false);
    });

    test('tickIdle_flips_to_fading_after_threshold_round_153', () => {
        // With fade enabled and a 3s
        // (default) threshold, a tickIdle
        // call where now - lastInputAt >= 3000
        // must flip `hudFadeIdledAt` to `now`.
        const { hud } = makeHud();
        hud.setFadeEnabled(true);
        expect(hud.isFading()).toBe(false);
        const flipped = hud.tickIdle(5000, 1000);  // diff = 4000
        expect(flipped).toBe(true);
        expect(hud.isFading()).toBe(true);
    });

    test('tickIdle_no_op_when_disabled_round_153', () => {
        // With fade disabled, tickIdle must
        // return false AND must not flip
        // `hudFadeIdledAt`. This is the
        // gating test that protects against
        // a regression where the host driver
        // would otherwise force a fade
        // regardless of the user's opt-in.
        const { hud } = makeHud();
        expect(hud.isFadeEnabled()).toBe(false);
        const flipped = hud.tickIdle(10000, 0);  // huge diff
        expect(flipped).toBe(false);
        expect(hud.isFading()).toBe(false);
    });

    test('render_emits_hud_stats_fading_class_when_fading_round_153', () => {
        // The .hud-stats panel should carry
        // the `hud-stats-fading` class when
        // `hudFadeIdledAt` is set. CSS picks
        // this up via `.hud-stats.hud-stats-fading`.
        const { hud, root } = makeHud();
        hud.setFadeEnabled(true);
        hud.tickIdle(5000, 0);
        const stats = root.querySelector('.hud-stats');
        expect(stats).not.toBeNull();
        expect(stats!.classList.contains('hud-stats-fading')).toBe(true);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_fade_hotkey_round_153', () => {
        // The J key shortcut for HUD fade
        // mode is mirrored in BINDING_DESCRIPTIONS
        // so the help overlay auto-iterates
        // it (same pattern as round-152's H
        // key). Note: F is already taken by
        // the round-21 vault-panel toggle,
        // so the fade row uses J (the next
        // free letter after H).
        const fadeRows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'J' && d.action.includes('淡出')
        );
        expect(fadeRows.length).toBeGreaterThanOrEqual(1);
    });

    // Round 154 — HUD 4-corner snap tests.
    //
    // Round 154 adds an opt-in "corner"
    // mode (K key + `agi_hud_corner`
    // localStorage flag): the player cycles
    // through 4 screen corners (`tl → tr →
    // br → bl → tl`) so the stats panel can
    // sit in the corner that doesn't
    // occlude the mouse or dominant-hand
    // finger. The CSS class on the root
    // element is the only thing that changes
    // (`.hud-corner-tl` / `-tr` / `-br` /
    // `-bl` in `index.html`); the panel
    // contents are unchanged.
    //
    // These tests pin the HUD-side state
    // machine so a future refactor can't
    // silently break the corner-snap
    // contract.

    test('default_state_is_top_right_corner_round_154', () => {
        // Fresh HUD: corner is 'tr' by
        // default (mirrors the round-1
        // layout that placed the stats
        // panel in the top-right corner
        // of the viewport).
        const { hud } = makeHud();
        expect(hud.getCorner()).toBe('tr');
    });

    test('setCorner_flips_corner_value_round_154', () => {
        // setCorner must update the
        // corner state AND apply the
        // CSS class to the root element
        // so the panel snaps to the new
        // position immediately.
        const { hud, root } = makeHud();
        hud.setCorner('tl');
        expect(hud.getCorner()).toBe('tl');
        expect(root.classList.contains('hud-corner-tl')).toBe(true);
        expect(root.classList.contains('hud-corner-tr')).toBe(false);
    });

    test('cycleCorner_advances_through_4_corners_round_154', () => {
        // The cycle order is `tl → tr → br → bl → tl`
        // (clockwise from top-left).
        // After 4 cycles we should be
        // back to 'tr' (the round-1
        // default).
        const { hud } = makeHud();
        expect(hud.getCorner()).toBe('tr');
        const c1 = hud.cycleCorner();
        expect(c1).toBe('br');
        const c2 = hud.cycleCorner();
        expect(c2).toBe('bl');
        const c3 = hud.cycleCorner();
        expect(c3).toBe('tl');
        const c4 = hud.cycleCorner();
        expect(c4).toBe('tr');
        expect(hud.getCorner()).toBe('tr');
    });

    test('applyCornerClass_strips_prior_corner_classes_round_154', () => {
        // applyCornerClass (called via
        // setCorner) must STRIP prior
        // `hud-corner-*` classes so the
        // root doesn't accumulate stale
        // variants on repeated toggles.
        // Regression test: a future
        // refactor that just appends
        // would leave all 4 classes on
        // the root simultaneously.
        const { hud, root } = makeHud();
        hud.setCorner('tl');
        expect(root.classList.contains('hud-corner-tr')).toBe(false);
        hud.setCorner('br');
        expect(root.classList.contains('hud-corner-tl')).toBe(false);
        expect(root.classList.contains('hud-corner-br')).toBe(true);
    });

    test('applyCornerClass_on_construction_round_154', () => {
        // The constructor calls
        // applyCornerClass so the root
        // element carries the right
        // `hud-corner-*` modifier from
        // the start (matches the
        // round-1 top-right default
        // when no state has been
        // pushed yet).
        const { root } = makeHud();
        expect(root.classList.contains('hud-corner-tr')).toBe(true);
    });

    test('state_round_trips_corner_through_getState_round_154', () => {
        // getState() must surface the
        // current `hudCorner` field
        // so test-utils and the
        // SettingsPanel (future) can
        // read it.
        const { hud } = makeHud();
        hud.setCorner('bl');
        expect(hud.getState().hudCorner).toBe('bl');
    });

    test('render_preserves_corner_class_round_154', () => {
        // Render is destructive on the
        // panel's innerHTML but the
        // root's className must remain
        // intact across renders — the
        // corner class lives on the
        // root, not on the inner panel.
        const { hud, root } = makeHud();
        hud.setCorner('br');
        hud.setState({ score: 12345 });  // triggers re-render
        expect(root.classList.contains('hud-corner-br')).toBe(true);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_corner_hotkey_round_154', () => {
        // The C key shortcut for the
        // HUD 4-corner snap is
        // mirrored in BINDING_DESCRIPTIONS
        // so the help overlay
        // auto-iterates it (same
        // pattern as round-152's H
        // key + round-153's J key).
        const cornerRows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'C' && d.action.includes('角落')
        );
        expect(cornerRows.length).toBeGreaterThanOrEqual(1);
    });

    // Round 155 — HUD always-on-top pin tests.
    //
    // Round 155 adds an opt-in "pin" mode
    // (X key + `agi_hud_pinned` localStorage
    // flag): the #hud-root element gets the
    // `hud-pinned` CSS class which boosts its
    // z-index from the round-1 default of 10 to
    // 10000 so the panel stays clickable above
    // fullscreen Three.js canvases. The pin
    // state must SURVIVE toggling the corner
    // class (round-154 regression defense).
    //
    // These tests pin the HUD-side state
    // machine so a future refactor can't
    // silently break the pin contract.

    test('default_state_is_not_pinned_round_155', () => {
        // Fresh HUD: pin is OFF by
        // default (mirrors the round-1
        // z-index of 10, where the HUD
        // can be pushed below a
        // fullscreen canvas).
        const { hud } = makeHud();
        expect(hud.isPinned()).toBe(false);
    });

    test('setPinned_true_applies_hud_pinned_class_round_155', () => {
        // setPinned(true) must add the
        // `hud-pinned` class to the
        // root element so the CSS
        // z-index boost applies.
        const { hud, root } = makeHud();
        hud.setPinned(true);
        expect(hud.isPinned()).toBe(true);
        expect(root.classList.contains('hud-pinned')).toBe(true);
    });

    test('setPinned_false_strips_hud_pinned_class_round_155', () => {
        // setPinned(false) must remove
        // the `hud-pinned` class.
        const { hud, root } = makeHud();
        hud.setPinned(true);
        hud.setPinned(false);
        expect(hud.isPinned()).toBe(false);
        expect(root.classList.contains('hud-pinned')).toBe(false);
    });

    test('togglePinned_flips_pin_state_round_155', () => {
        // togglePinned() must flip the
        // pin state and return the new
        // value so the host can persist
        // it.
        const { hud } = makeHud();
        expect(hud.isPinned()).toBe(false);
        const next1 = hud.togglePinned();
        expect(next1).toBe(true);
        expect(hud.isPinned()).toBe(true);
        const next2 = hud.togglePinned();
        expect(next2).toBe(false);
        expect(hud.isPinned()).toBe(false);
    });

    test('setCorner_preserves_pinned_class_round_155', () => {
        // Critical interaction test:
        // round-154 setCorner() rebuilds
        // root.className via
        // `applyCornerClass()`, which
        // would silently strip the
        // `hud-pinned` class added by
        // round-155 if the two helpers
        // didn't coordinate. The
        // contract: setCorner MUST
        // preserve the pin state.
        const { hud, root } = makeHud();
        hud.setPinned(true);
        expect(root.classList.contains('hud-pinned')).toBe(true);
        // Toggling the corner must NOT
        // drop the pin class.
        hud.setCorner('bl');
        expect(root.classList.contains('hud-pinned')).toBe(true);
        expect(hud.isPinned()).toBe(true);
        expect(root.classList.contains('hud-corner-bl')).toBe(true);
    });

    test('applyPinnedClass_is_idempotent_round_155', () => {
        // Calling setPinned(true)
        // twice must NOT add the
        // `hud-pinned` class twice or
        // otherwise mutate the root
        // differently. Regression: a
        // future refactor that appended
        // without checking would
        // duplicate the class.
        const { hud, root } = makeHud();
        hud.setPinned(true);
        hud.setPinned(true);
        expect(root.classList.contains('hud-pinned')).toBe(true);
        // Count via DOMTokenList
        // (matches returns the
        // matching substrings; class
        // names are space-separated so
        // we use a regex-anchored match
        // via split().filter()).
        const tokens = root.className.split(/\s+/).filter(Boolean);
        const pinCount = tokens.filter((t) => t === 'hud-pinned').length;
        expect(pinCount).toBe(1);
    });

    test('state_round_trips_pinned_through_getState_round_155', () => {
        // getState() must surface the
        // `hudPinned` field so test-utils
        // and the SettingsPanel
        // (future) can read it.
        const { hud } = makeHud();
        hud.setPinned(true);
        expect(hud.getState().hudPinned).toBe(true);
        hud.setPinned(false);
        expect(hud.getState().hudPinned).toBe(false);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_pinned_hotkey_round_155', () => {
        // The X key shortcut for the
        // HUD pin toggle is mirrored in
        // BINDING_DESCRIPTIONS so the
        // help overlay auto-iterates it
        // (same pattern as round-152's
        // H key + round-153's J key +
        // round-154's C key).
        const pinnedRows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'X' && d.action.includes('置顶')
        );
        expect(pinnedRows.length).toBeGreaterThanOrEqual(1);
    });

    // =========================================================
    // Round 156 — click-through mode (Y key).
    //
    // 9 tests pinning the click-through
    // state machine. The contract is
    // structurally similar to round-155
    // pin (boolean flag, classList-based
    // CSS class) but lives on a separate
    // state field (`hudClickThrough`)
    // because pinned controls *stacking*
    // and click-through controls
    // *interaction* — orthogonal concerns.
    // The key cross-cutting test is
    // `setCorner_preserves_click_through_class_round_156`
    // which pins the round-154 + 155 + 156
    // interaction contract: corner cycling
    // must NOT strip the pin class OR the
    // click-through class.
    // =========================================================

    test('default_state_is_not_click_through_round_156', () => {
        // Fresh HUD: click-through is
        // OFF by default (mirrors the
        // round-1 default where the
        // HUD blocks clicks on the
        // scene behind it).
        const { hud } = makeHud();
        expect(hud.isClickThrough()).toBe(false);
    });

    test('setClickThrough_true_applies_hud_click_through_class_round_156', () => {
        // setClickThrough(true) must
        // add the `hud-click-through`
        // class to the root element
        // so the CSS `pointer-events:
        // none` rule applies.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        expect(hud.isClickThrough()).toBe(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
    });

    test('setClickThrough_false_strips_hud_click_through_class_round_156', () => {
        // setClickThrough(false) must
        // remove the
        // `hud-click-through` class.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        hud.setClickThrough(false);
        expect(hud.isClickThrough()).toBe(false);
        expect(root.classList.contains('hud-click-through')).toBe(false);
    });

    test('toggleClickThrough_flips_state_round_156', () => {
        // toggleClickThrough() must
        // flip the click-through state
        // and return the new value so
        // the host can persist it.
        const { hud } = makeHud();
        expect(hud.isClickThrough()).toBe(false);
        const next1 = hud.toggleClickThrough();
        expect(next1).toBe(true);
        expect(hud.isClickThrough()).toBe(true);
        const next2 = hud.toggleClickThrough();
        expect(next2).toBe(false);
        expect(hud.isClickThrough()).toBe(false);
    });

    test('setCorner_preserves_click_through_class_round_156', () => {
        // Critical interaction test
        // (round-154/155/156 triple
        // contract): round-154
        // setCorner() rebuilds
        // root.className via
        // `applyCornerClass()`, which
        // would silently strip BOTH
        // the `hud-pinned` class
        // (round-155) AND the
        // `hud-click-through` class
        // (round-156) if the helper
        // didn't chain all three. The
        // contract: setCorner MUST
        // preserve the pin state AND
        // the click-through state.
        const { hud, root } = makeHud();
        hud.setPinned(true);
        hud.setClickThrough(true);
        expect(root.classList.contains('hud-pinned')).toBe(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        // Toggling the corner must NOT
        // drop EITHER class.
        hud.setCorner('bl');
        expect(root.classList.contains('hud-pinned')).toBe(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        expect(hud.isPinned()).toBe(true);
        expect(hud.isClickThrough()).toBe(true);
        expect(root.classList.contains('hud-corner-bl')).toBe(true);
    });

    test('setPinned_preserves_click_through_class_round_156', () => {
        // Symmetric interaction test:
        // setPinned() must NOT strip
        // the click-through class. The
        // two methods are independent
        // (both use classList.add /
        // remove — non-destructive) so
        // a regression here would mean
        // a refactor changed one of
        // them to root.className = '...'.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        hud.setPinned(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        expect(root.classList.contains('hud-pinned')).toBe(true);
    });

    test('applyClickThroughClass_is_idempotent_round_156', () => {
        // Calling setClickThrough(true)
        // twice must NOT add the
        // `hud-click-through` class
        // twice. Regression: a future
        // refactor that appends
        // without checking would
        // duplicate the class.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        hud.setClickThrough(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        const tokens = root.className.split(/\s+/).filter(Boolean);
        const count = tokens.filter((t) => t === 'hud-click-through').length;
        expect(count).toBe(1);
    });

    test('state_round_trips_click_through_through_getState_round_156', () => {
        // getState() must surface the
        // `hudClickThrough` field so
        // test-utils can read it (and
        // any future SettingsPanel
        // knob).
        const { hud } = makeHud();
        hud.setClickThrough(true);
        expect(hud.getState().hudClickThrough).toBe(true);
        hud.setClickThrough(false);
        expect(hud.getState().hudClickThrough).toBe(false);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_click_through_hotkey_round_156', () => {
        // The Y key shortcut for the
        // HUD click-through toggle is
        // mirrored in BINDING_DESCRIPTIONS
        // so the help overlay
        // auto-iterates it (same
        // pattern as round-155's X
        // key).
        const rows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'Y' && d.action.includes('穿透')
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    // =========================================================
    // Round 159 — HUD
    // auto-hide-on-fullscreen
    // mode. Companion to the
    // round-152 compact / round-
    // 153 fade / round-154
    // corner / round-155 pin /
    // round-156 click-through
    // stack.
    //
    // The 16th mode is a
    // visibility gate tied to
    // `document.fullscreenElement`:
    // the host binds a
    // `fullscreenchange`
    // listener and calls
    // `setAutoHideFullscreen`
    // to sync state. When
    // enabled, the HUD applies
    // the
    // `hud-auto-hide-fullscreen`
    // CSS class on the root,
    // which the index.html
    // rule pairs with
    // `:fullscreen` to hide
    // the panel.
    //
    // 8 tests pinning the new
    // state machine + class
    // + BINDING_DESCRIPTIONS
    // + class preservation
    // across the round-152 →
    // round-158 stack.
    // =========================================================

    test('default_state_is_not_auto_hide_fullscreen_round_159', () => {
        // A fresh HUD has the
        // auto-hide flag off
        // (default `false`
        // when never set).
        // A regression that
        // pre-set the flag
        // would silently
        // auto-hide the HUD
        // for new players
        // who never opted in.
        const { hud } = makeHud();
        expect(hud.isAutoHideFullscreen()).toBe(false);
    });

    test('setAutoHideFullscreen_true_applies_hud_auto_hide_fullscreen_class_round_159', () => {
        // The setter applies
        // the CSS class on
        // the root so the
        // index.html rule
        // can pair it with
        // `:fullscreen`.
        const { hud, root } = makeHud();
        hud.setAutoHideFullscreen(true);
        expect(hud.isAutoHideFullscreen()).toBe(true);
        expect(root.classList.contains('hud-auto-hide-fullscreen')).toBe(true);
    });

    test('setAutoHideFullscreen_false_strips_hud_auto_hide_fullscreen_class_round_159', () => {
        // Toggling back off
        // removes the class
        // (idempotent — calling
        // twice doesn't error).
        const { hud, root } = makeHud();
        hud.setAutoHideFullscreen(true);
        hud.setAutoHideFullscreen(false);
        expect(hud.isAutoHideFullscreen()).toBe(false);
        expect(root.classList.contains('hud-auto-hide-fullscreen')).toBe(false);
    });

    test('toggleAutoHideFullscreen_flips_state_round_159', () => {
        // The toggle returns
        // the new value so
        // the host can persist
        // it to localStorage.
        // Mirrors the
        // round-156
        // `toggleClickThrough`
        // contract.
        const { hud } = makeHud();
        expect(hud.toggleAutoHideFullscreen()).toBe(true);
        expect(hud.isAutoHideFullscreen()).toBe(true);
        expect(hud.toggleAutoHideFullscreen()).toBe(false);
        expect(hud.isAutoHideFullscreen()).toBe(false);
    });

    test('setAutoHideFullscreen_preserves_click_through_class_round_159', () => {
        // The 4-way pin /
        // click-through /
        // auto-hide /
        // (round-154 corner)
        // coordination. A
        // regression that
        // used
        // `this.root.className = ...`
        // (raw string set)
        // instead of
        // `classList.add /
        // remove` would
        // strip the
        // click-through
        // class on the same
        // pass.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        hud.setAutoHideFullscreen(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        expect(root.classList.contains('hud-auto-hide-fullscreen')).toBe(true);
    });

    test('setCorner_preserves_auto_hide_fullscreen_class_round_159', () => {
        // The corner cycle
        // (round-154) must
        // not strip the
        // auto-hide class.
        // Symmetric to the
        // round-156
        // `setCorner_preserves_click_through`
        // contract.
        const { hud, root } = makeHud();
        hud.setAutoHideFullscreen(true);
        expect(root.classList.contains('hud-auto-hide-fullscreen')).toBe(true);
        hud.setCorner('br');
        expect(root.classList.contains('hud-auto-hide-fullscreen')).toBe(true);
    });

    test('applyAutoHideFullscreenClass_is_idempotent_round_159', () => {
        // The class
        // manipulation uses
        // `classList.add` /
        // `remove` (not
        // `className =`)
        // so calling the
        // setter twice
        // doesn't double-add
        // the class. Defense
        // in depth.
        const { hud, root } = makeHud();
        hud.setAutoHideFullscreen(true);
        hud.setAutoHideFullscreen(true);
        // The class is present exactly once.
        const matches = root.className.match(/hud-auto-hide-fullscreen/g) || [];
        expect(matches.length).toBe(1);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_auto_hide_fullscreen_hotkey_round_159', () => {
        // The K key shortcut
        // for the HUD
        // auto-hide-on-fullscreen
        // toggle is mirrored
        // in BINDING_DESCRIPTIONS
        // so the help overlay
        // auto-iterates it
        // (same pattern as
        // round-155's X /
        // round-156's Y).
        const rows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'K' && d.action.includes('全屏自动隐藏')
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    // =========================================================
    // Round 160 — HUD
    // minimize-to-icon mode.
    // Companion to the
    // round-152 compact /
    // round-153 fade /
    // round-154 corner /
    // round-155 pin /
    // round-156 click-through
    // / round-159
    // auto-hide-fullscreen
    // stack.
    //
    // The 17th mode is a
    // collapse-to-icon flag:
    // the HUD applies the
    // `hud-minimized` CSS
    // class on the root,
    // which the index.html
    // rule pairs with a
    // 32×32 circle. The
    // player can click the
    // icon to expand the
    // panel back to its
    // full size.
    //
    // 8 tests pinning the
    // new state machine +
    // class + BINDING_DESCRIPTIONS
    // + class preservation
    // across the round-152
    // → round-159 stack.
    // =========================================================

    test('default_state_is_not_minimized_round_160', () => {
        // A fresh HUD has
        // the minimized flag
        // off (default
        // `false` when never
        // set). A regression
        // that pre-set the
        // flag would silently
        // auto-minimize the
        // HUD for new players
        // who never opted in.
        const { hud } = makeHud();
        expect(hud.isMinimized()).toBe(false);
    });

    test('setMinimized_true_applies_hud_minimized_class_round_160', () => {
        // The setter applies
        // the CSS class on
        // the root so the
        // index.html rule
        // can pair it with
        // a 32×32 circle.
        const { hud, root } = makeHud();
        hud.setMinimized(true);
        expect(hud.isMinimized()).toBe(true);
        expect(root.classList.contains('hud-minimized')).toBe(true);
    });

    test('setMinimized_false_strips_hud_minimized_class_round_160', () => {
        // Toggling back off
        // removes the class
        // (idempotent —
        // calling twice
        // doesn't error).
        const { hud, root } = makeHud();
        hud.setMinimized(true);
        hud.setMinimized(false);
        expect(hud.isMinimized()).toBe(false);
        expect(root.classList.contains('hud-minimized')).toBe(false);
    });

    test('toggleMinimized_flips_state_round_160', () => {
        // The toggle
        // returns the new
        // value so the host
        // can persist it to
        // localStorage.
        // Mirrors the
        // round-156
        // `toggleClickThrough`
        // /
        // round-159
        // `toggleAutoHideFullscreen`
        // contract.
        const { hud } = makeHud();
        expect(hud.toggleMinimized()).toBe(true);
        expect(hud.isMinimized()).toBe(true);
        expect(hud.toggleMinimized()).toBe(false);
        expect(hud.isMinimized()).toBe(false);
    });

    test('setMinimized_preserves_click_through_class_round_160', () => {
        // The 5-way pin /
        // click-through /
        // auto-hide /
        // minimized /
        // (round-154
        // corner)
        // coordination. A
        // regression that
        // used
        // `this.root.className = ...`
        // (raw string set)
        // instead of
        // `classList.add /
        // remove` would
        // strip the
        // click-through
        // class on the same
        // pass.
        const { hud, root } = makeHud();
        hud.setClickThrough(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        hud.setMinimized(true);
        expect(root.classList.contains('hud-click-through')).toBe(true);
        expect(root.classList.contains('hud-minimized')).toBe(true);
    });

    test('setCorner_preserves_minimized_class_round_160', () => {
        // The corner
        // cycle
        // (round-154)
        // must not strip
        // the minimized
        // class.
        // Symmetric to
        // the round-156
        // `setCorner_preserves_click_through`
        // /
        // round-159
        // `setCorner_preserves_auto_hide_fullscreen`
        // contract.
        const { hud, root } = makeHud();
        hud.setMinimized(true);
        expect(root.classList.contains('hud-minimized')).toBe(true);
        hud.setCorner('br');
        expect(root.classList.contains('hud-minimized')).toBe(true);
    });

    test('applyMinimizedClass_is_idempotent_round_160', () => {
        // The class
        // manipulation
        // uses
        // `classList.add` /
        // `remove` (not
        // `className =`)
        // so calling the
        // setter twice
        // doesn't
        // double-add the
        // class. Defense
        // in depth.
        const { hud, root } = makeHud();
        hud.setMinimized(true);
        hud.setMinimized(true);
        const matches = root.className.match(/hud-minimized/g) || [];
        expect(matches.length).toBe(1);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_minimized_hotkey_round_160', () => {
        // The B key
        // shortcut for
        // the HUD
        // minimize-to-icon
        // toggle is
        // mirrored in
        // BINDING_DESCRIPTIONS
        // so the help
        // overlay
        // auto-iterates
        // it (same
        // pattern as
        // round-155's X
        // /
        // round-156's Y
        // /
        // round-159's K).
        const rows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'B' && d.action.includes('最小化')
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    // =========================================================
    // Round 169 C — HUD
    // 21st mode: `hudAutoShrink`.
    // The new mode flag
    // applies the
    // `hud-auto-shrink`
    // CSS class on the
    // root, which the
    // index.html rule
    // pairs with a
    // `transform: scale(0.55)`
    // + `opacity: 0.78`
    // (micro-form).
    // Unlike round-160
    // `hud-minimized` (which
    // collapses the HUD
    // to a 32×32 icon),
    // auto-shrink keeps
    // the HUD visible
    // AND interactive
    // — just smaller.
    //
    // The companion
    // `expandFromAutoShrink`
    // method applies
    // the secondary
    // `hud-auto-shrink-active`
    // class which the
    // CSS uses to
    // restore the
    // opacity to 1
    // (the runtime can
    // wire this to a
    // mouseover / focus
    // event so the HUD
    // pops back to full
    // opacity when the
    // player is actively
    // interacting).
    //
    // 8 tests pinning
    // the new state
    // machine + class +
    // class preservation
    // across the
    // round-152 → 160
    // stack +
    // BINDING_DESCRIPTIONS
    // hotkey row.
    // =========================================================

    test('default_state_is_not_auto_shrink_round_169', () => {
        // A fresh HUD has
        // the auto-shrink
        // flag off (default
        // `false` when
        // never set). The
        // U key shortcut
        // is the way the
        // player opts in.
        const { hud } = makeHud();
        expect(hud.isAutoShrink()).toBe(false);
    });

    test('setAutoShrink_true_applies_hud_auto_shrink_class_round_169', () => {
        const { hud, root } = makeHud();
        expect(root.classList.contains('hud-auto-shrink')).toBe(false);
        hud.setAutoShrink(true);
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
    });

    test('setAutoShrink_false_strips_hud_auto_shrink_class_round_169', () => {
        const { hud, root } = makeHud();
        hud.setAutoShrink(true);
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
        hud.setAutoShrink(false);
        expect(root.classList.contains('hud-auto-shrink')).toBe(false);
    });

    test('toggleAutoShrink_flips_state_and_class_round_169', () => {
        const { hud, root } = makeHud();
        // First toggle: false → true
        const after1 = hud.toggleAutoShrink();
        expect(after1).toBe(true);
        expect(hud.isAutoShrink()).toBe(true);
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
        // Second toggle: true → false
        const after2 = hud.toggleAutoShrink();
        expect(after2).toBe(false);
        expect(hud.isAutoShrink()).toBe(false);
        expect(root.classList.contains('hud-auto-shrink')).toBe(false);
    });

    test('expandFromAutoShrink_removes_active_class_round_169', () => {
        // The runtime uses
        // `expandFromAutoShrink`
        // as the
        // mouseover /
        // focus event
        // hook so the
        // HUD pops back
        // to full
        // opacity when
        // the player is
        // actively
        // interacting.
        // The secondary
        // `hud-auto-shrink-active`
        // class is the
        // "slim right now"
        // flag — the
        // idle timer adds
        // it, this method
        // removes it.
        // The primary
        // `hud-auto-shrink`
        // class is
        // preserved (the
        // preference
        // survives the
        // expand).
        const { hud, root } = makeHud();
        hud.setAutoShrink(true);
        // Pretend the idle
        // timer added the
        // active class.
        root.classList.add('hud-auto-shrink-active');
        expect(root.classList.contains('hud-auto-shrink-active')).toBe(true);
        hud.expandFromAutoShrink();
        expect(root.classList.contains('hud-auto-shrink-active')).toBe(false);
        // Primary
        // auto-shrink
        // preference
        // (the "I want
        // micro-form"
        // flag) is
        // preserved.
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
    });

    test('setCorner_preserves_auto_shrink_class_round_169', () => {
        // The corner
        // cycle
        // (round-154)
        // must not strip
        // the auto-shrink
        // class.
        // Symmetric to
        // the round-160
        // `setCorner_preserves_minimized_class`
        // contract —
        // extends the
        // 5-way pin +
        // click-through +
        // auto-hide +
        // minimized +
        // auto-shrink
        // coordination in
        // `applyCornerClass`.
        const { hud, root } = makeHud();
        hud.setAutoShrink(true);
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
        hud.setCorner('br');
        expect(root.classList.contains('hud-auto-shrink')).toBe(true);
    });

    test('applyAutoShrinkClass_is_idempotent_round_169', () => {
        // The class
        // manipulation
        // uses
        // `classList.add`
        // / `remove` (not
        // `className =`)
        // so calling the
        // setter twice
        // doesn't
        // double-add the
        // class. Defense
        // in depth.
        const { hud, root } = makeHud();
        hud.setAutoShrink(true);
        hud.setAutoShrink(true);
        const matches = root.className.match(/hud-auto-shrink/g) || [];
        expect(matches.length).toBe(1);
    });

    test('BINDING_DESCRIPTIONS_includes_hud_auto_shrink_hotkey_round_169', () => {
        // The U key
        // shortcut for
        // the HUD
        // auto-shrink
        // toggle is
        // mirrored in
        // BINDING_DESCRIPTIONS
        // so the help
        // overlay
        // auto-iterates
        // it (same
        // pattern as
        // round-160's B
        // / round-155's
        // X / round-156's
        // Y / round-159's
        // K). Pin the
        // exact U entry
        // here.
        const rows = BINDING_DESCRIPTIONS.filter(
            (d) => d.key === 'U' && (d.action.includes('自动') || d.action.includes('shrink') || d.action.includes('微缩') || d.action.includes('缩小'))
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    // =========================================================
    // Round 162 — HUD
    // scene-speed mini-strip.
    // Companion to the
    // round-161 `,` (comma)
    // scene-speed cycle
    // feature. Mirrors the
    // round-146 debouncer
    // mini-strip pattern:
    // a compact
    // pipe-separated strip
    // of 4 cells (0.5x /
    // 1x / 2x / 4x) with
    // an `is-active`
    // highlight on the
    // current preset.
    //
    // The strip is gated
    // on `s.sceneSpeed
    // != null`: when no
    // preset has been
    // pushed, the strip is
    // omitted from the
    // render output (the
    // round-146 default
    // layout for HUDs that
    // don't bind to scene
    // speed).
    // =========================================================

    test('does_not_render_strip_when_scene_speed_omitted_round_162', () => {
        // No `setSceneSpeed` call → strip is hidden.
        const { root } = makeHud();
        const strip = root.querySelector('.hud-scene-speed-strip');
        expect(strip).toBeNull();
    });

    test('renders_strip_with_4_cells_when_scene_speed_set_round_162', () => {
        const { hud, root } = makeHud();
        hud.setSceneSpeed(1);
        const cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        expect(cells.length).toBe(4);
    });

    test('renders_3_separators_between_4_cells_round_162', () => {
        const { hud, root } = makeHud();
        hud.setSceneSpeed(1);
        const seps = root.querySelectorAll('.hud-scene-speed-strip-sep');
        expect(seps.length).toBe(3);
        for (const s of Array.from(seps)) {
            expect(s.textContent).toBe('|');
        }
    });

    test('is_active_class_marks_current_preset_round_162', () => {
        // For each of the 4 presets, only that cell
        // should have the `is-active` class.
        const { hud, root } = makeHud();
        hud.setSceneSpeed(2);
        const cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        // Only the 3rd cell (value 2) is active.
        expect(cells[0].classList.contains('is-active')).toBe(false);
        expect(cells[1].classList.contains('is-active')).toBe(false);
        expect(cells[2].classList.contains('is-active')).toBe(true);
        expect(cells[3].classList.contains('is-active')).toBe(false);
    });

    test('switches_active_cell_when_multiplier_changes_round_162', () => {
        // Cycle from 0.5 → 1 → 2 → 4 and verify the
        // active cell follows.
        const { hud, root } = makeHud();
        hud.setSceneSpeed(0.5);
        let cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        expect(cells[0].classList.contains('is-active')).toBe(true);
        hud.setSceneSpeed(1);
        cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        expect(cells[1].classList.contains('is-active')).toBe(true);
        hud.setSceneSpeed(2);
        cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        expect(cells[2].classList.contains('is-active')).toBe(true);
        hud.setSceneSpeed(4);
        cells = root.querySelectorAll('.hud-scene-speed-strip-cell');
        expect(cells[3].classList.contains('is-active')).toBe(true);
    });

    test('does_not_render_strip_after_setSceneSpeed_null_round_162', () => {
        const { hud, root } = makeHud();
        hud.setSceneSpeed(1);
        expect(root.querySelector('.hud-scene-speed-strip')).not.toBeNull();
        hud.setSceneSpeed(null);
        expect(root.querySelector('.hud-scene-speed-strip')).toBeNull();
    });

    test('state_round_trips_scene_speed_through_getState_round_162', () => {
        const { hud } = makeHud();
        expect(hud.getState().sceneSpeed).toBeUndefined();
        hud.setSceneSpeed(2);
        expect(hud.getState().sceneSpeed).toBe(2);
        hud.setSceneSpeed(null);
        expect(hud.getState().sceneSpeed).toBeNull();
    });

    test('renders_status_labels_round_162', () => {
        // The 4 status labels (慢 / 标准 / 快 / 极速)
        // give the player a categorical cue
        // ("am I in slow mode?") without reading
        // the multiplier number.
        const { hud, root } = makeHud();
        hud.setSceneSpeed(1);
        const statuses = root.querySelectorAll('.hud-scene-speed-strip-status');
        expect(statuses.length).toBe(4);
        expect(statuses[0].textContent).toBe('慢');
        expect(statuses[1].textContent).toBe('标准');
        expect(statuses[2].textContent).toBe('快');
        expect(statuses[3].textContent).toBe('极速');
    });

    test('renders_label_text_round_162', () => {
        // The 4 multiplier labels (0.5x / 1x / 2x /
        // 4x) are the canonical cycle preset names.
        const { hud, root } = makeHud();
        hud.setSceneSpeed(1);
        const labels = root.querySelectorAll('.hud-scene-speed-strip-label');
        expect(labels.length).toBe(4);
        expect(labels[0].textContent).toBe('0.5x');
        expect(labels[1].textContent).toBe('1x');
        expect(labels[2].textContent).toBe('2x');
        expect(labels[3].textContent).toBe('4x');
    });

    test('coexists_with_debouncer_strip_round_162', () => {
        // The scene-speed strip is rendered AFTER
        // the round-146 debouncer strip but inside
        // the same `hud-stats` panel. Setting both
        // → both strips are visible in the same
        // panel.
        const { hud, root } = makeHud();
        const debouncer = new ActionDebouncer(500, 'save', 'round 162', () => {});
        hud.setDebouncers([{ debouncer, chineseLabel: '保存' }]);
        hud.setSceneSpeed(2);
        const speedStrip = root.querySelector('.hud-scene-speed-strip');
        const debouncerStrip = root.querySelector('.hud-debouncer-strip');
        expect(speedStrip).not.toBeNull();
        expect(debouncerStrip).not.toBeNull();
        // Both strips live in the stats panel.
        const statsPanel = root.querySelector('.hud-stats');
        expect(statsPanel!.querySelector('.hud-scene-speed-strip')).not.toBeNull();
        expect(statsPanel!.querySelector('.hud-debouncer-strip')).not.toBeNull();
    });
});
