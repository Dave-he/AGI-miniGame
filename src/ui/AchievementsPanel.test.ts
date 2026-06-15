/**
 * AchievementsPanel — round-118 panel-level tests.
 *
 * Mirrors the round-20 VaultPanel test
 * pattern: drive `renderAchievementsPanel`
 * directly with a stub `PlayerProfile` and
 * assert the rendered HTML for each
 * scenario.
 */

import { renderAchievementsPanel } from './AchievementsPanel';
import { PlayerProfile } from '../player/PlayerProfile';

function makeProfile(achievements: string[]): PlayerProfile {
    const p = new PlayerProfile('test-account', 'test-player');
    for (const a of achievements) {
        p.addAchievement(a);
    }
    return p;
}

function makeRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'achievements-root';
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.getElementById('achievements-root')?.remove();
});

test('renders_empty_state_when_no_achievements', () => {
    const root = makeRoot();
    const profile = makeProfile([]);
    const handle = renderAchievementsPanel(root, profile);
    // Empty state line is shown.
    expect(root.innerHTML).toContain('achievements-empty');
    expect(root.innerHTML).toContain('暂无成就');
    expect(handle.refresh).toBeDefined();
});

test('renders_unlock_count_in_stats_row', () => {
    const root = makeRoot();
    const profile = makeProfile(['first-dimension', 'first-completion']);
    renderAchievementsPanel(root, profile);
    // 2 unlocked; the number
    // appears inside the
    // .achievements-stats row.
    expect(root.innerHTML).toContain('achievements-stats');
    expect(root.innerHTML).toMatch(/<b>2<\/b>/);
});

test('renders_each_achievement_id_as_a_row', () => {
    const root = makeRoot();
    const profile = makeProfile(['first-dimension', 'first-completion', 'vault-100']);
    renderAchievementsPanel(root, profile);
    // 3 rows; each id appears
    // in a .achievements-id
    // span. The order is most-
    // recently-unlocked first
    // (vault-100 first).
    expect(root.innerHTML).toContain('first-dimension');
    expect(root.innerHTML).toContain('first-completion');
    expect(root.innerHTML).toContain('vault-100');
});

test('renders_most_recent_first', () => {
    const root = makeRoot();
    const profile = makeProfile(['a', 'b', 'c']);
    renderAchievementsPanel(root, profile);
    const html = root.innerHTML;
    const cPos = html.indexOf('>c<');
    const aPos = html.indexOf('>a<');
    // c was added last → appears
    // before a in the rendered
    // list.
    expect(cPos).toBeGreaterThan(-1);
    expect(aPos).toBeGreaterThan(-1);
    expect(cPos).toBeLessThan(aPos);
});

test('escapeHtml_prevents_script_injection', () => {
    const root = makeRoot();
    const profile = makeProfile(['<script>alert(1)</script>']);
    renderAchievementsPanel(root, profile);
    // The id is HTML-escaped
    // before being inserted
    // into both the title
    // attribute and the
    // `.achievements-id` span.
    // The actual security
    // property we care about:
    // no <script> element was
    // created in the rendered
    // DOM tree.
    expect(root.querySelector('script')).toBeNull();
    // The textContent of the
    // id span contains the
    // raw text (unescaped),
    // proving the escape was
    // at the HTML-attribute
    // level, not the
    // text-content level.
    const idSpan = root.querySelector('.achievements-id');
    expect(idSpan?.textContent).toBe('<script>alert(1)</script>');
});

test('refresh_re_reads_player_achievements', () => {
    const root = makeRoot();
    const profile = makeProfile(['a']);
    const handle = renderAchievementsPanel(root, profile);
    expect(root.innerHTML).toContain('>a<');
    expect(root.innerHTML).toMatch(/<b>1<\/b>/);
    // Mutate the profile after
    // the initial render, then
    // refresh — the new id
    // should appear.
    profile.addAchievement('b');
    handle.refresh();
    expect(root.innerHTML).toContain('>a<');
    expect(root.innerHTML).toContain('>b<');
    expect(root.innerHTML).toMatch(/<b>2<\/b>/);
});

test('panel_class_wrapper_in_html', () => {
    const root = makeRoot();
    renderAchievementsPanel(root, makeProfile([]));
    // The outer wrapper has
    // class `achievements-panel`
    // (mirrors the round-20
    // `.vault-panel` and
    // round-21 `.npc-mind-panel`
    // patterns).
    expect(root.innerHTML).toContain('class="achievements-panel"');
});

test('renders_pill_emoji_for_each_achievement', () => {
    const root = makeRoot();
    const profile = makeProfile(['a', 'b']);
    renderAchievementsPanel(root, profile);
    // 2 achievements → 2 pills
    // (count the 🏅 emoji
    // occurrences inside the
    // .achievements-pill span).
    const matches = root.innerHTML.match(/achievements-pill/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
});
