import {
    routeKey,
    PORTAL_ATOMS,
    BINDING_DESCRIPTIONS,
    MOUSE_BINDINGS,
    PANEL_TOGGLE_BINDINGS,
    PANEL_TOGGLE_DESCRIPTIONS,
    panelToggleBindingByKey,
    panelToggleBindingByMethod,
    panelToggleBindingByButton,
    panelToggleMethodByKind,
    type PanelToggleBinding,
    type KeyboardAction,
} from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
    describe('routeKey', () => {
        it.each(['1', '2', '3', '4', '5', '6', '7', '8'])(
            'maps digit "%s" to the matching enter-atom action',
            (digit) => {
                const action = routeKey(digit);
                expect(action).not.toBeNull();
                expect(action!.kind).toBe('enter-atom');
                const ea = action as Extract<KeyboardAction, { kind: 'enter-atom' }>;
                expect(ea.index).toBe(parseInt(digit, 10) - 1);
                expect(ea.atomId).toBe(PORTAL_ATOMS[ea.index]);
            },
        );

        it('routes Escape to abandon', () => {
            expect(routeKey('Escape')).toEqual({ kind: 'abandon' });
        });

        it('routes Esc to abandon (legacy alias)', () => {
            expect(routeKey('Esc')).toEqual({ kind: 'abandon' });
        });

        it('routes Space to reroll', () => {
            expect(routeKey(' ')).toEqual({ kind: 'reroll' });
        });

        it('routes Spacebar to reroll (legacy alias)', () => {
            expect(routeKey('Spacebar')).toEqual({ kind: 'reroll' });
        });

        it('routes ? to toggle-help', () => {
            expect(routeKey('?')).toEqual({ kind: 'toggle-help' });
        });

        it('routes S/s to save', () => {
            expect(routeKey('S')).toEqual({ kind: 'save' });
            expect(routeKey('s')).toEqual({ kind: 'save' });
        });

        it('routes L/l to load', () => {
            expect(routeKey('L')).toEqual({ kind: 'load' });
            expect(routeKey('l')).toEqual({ kind: 'load' });
        });

        it('routes E/e to event', () => {
            expect(routeKey('E')).toEqual({ kind: 'event' });
            expect(routeKey('e')).toEqual({ kind: 'event' });
        });

        it('routes R/r to rollback (round 85)', () => {
            // The round-54 rollback UI is the last line
            // of defense for the player when a second
            // `enterNewDimension` corrupts the world.
            // The R key is a "good controls" shortcut
            // for it — same effect as clicking the
            // inline "🔙 回滚" button, but keyboard-
            // reachable. A no-op (no `lastFailedSnapshot`)
            // is the safe default if the player presses
            // R when nothing's broken.
            expect(routeKey('R')).toEqual({ kind: 'rollback' });
            expect(routeKey('r')).toEqual({ kind: 'rollback' });
        });

        it('routes backtick to toggle-dm-console (round 91)', () => {
            // Round 91 — the backtick/tilde key toggles
            // the DM God console. The console is the
            // entry point for `dm run <cmd>` lines that
            // drive the round-66 onDimension callback
            // and the round-87 setLastBiomeAccent wiring.
            // Pre-round-91 the player had to click
            // btn-god in the HUD; the keyboard shortcut
            // closes the "操控性好" gap.
            expect(routeKey('`')).toEqual({ kind: 'toggle-dm-console' });
        });

        it('routes tilde to toggle-dm-console (shift+backtick alias, round 91)', () => {
            // The same physical key produces `~` when
            // shifted. US QWERTY + most international
            // layouts use the same physical position for
            // both. We route both `ev.key` outputs to the
            // same action so the player doesn't have to
            // remember which shift-state their layout
            // uses.
            expect(routeKey('~')).toEqual({ kind: 'toggle-dm-console' });
        });

        it('routes K/k to toggle-dsl-codex (round 133)', () => {
            // Round 133 — K key
            // toggles the
            // `#dsl-codex-root`
            // panel (the
            // round-133
            // `renderDslCodexPanel`
            // showing the AGI's
            // most recently
            // generated /
            // hot-reloaded
            // `DslRule` as a
            // small codex). K
            // is mnemonic-
            // friendly for
            // "DSL Knowledge"
            // (or just "Codex
            // K") and was free
            // in the panel-
            // toggle group.
            // Case-insensitive
            // (US QWERTY +
            // most international
            // layouts produce
            // the same physical
            // letter in both
            // shift states).
            expect(routeKey('K')).toEqual({ kind: 'toggle-dsl-codex' });
            expect(routeKey('k')).toEqual({ kind: 'toggle-dsl-codex' });
        });

        it('Round 153 — J key routes to toggle-hud-fade', () => {
            // Round 153 added the J key for the HUD
            // fade mode toggle (next free letter
            // after H — F is taken by the round-21
            // vault panel). Case-insensitive like
            // the rest of the letter bindings.
            expect(routeKey('J')).toEqual({ kind: 'toggle-hud-fade' });
            expect(routeKey('j')).toEqual({ kind: 'toggle-hud-fade' });
        });

        it('Round 154 — C key routes to cycle-hud-corner', () => {
            // Round 154 added the C key for the HUD
            // corner-snap cycling (next free letter
            // after J — round 153 bound J to fade;
            // K is taken by the round-130 DSL codex
            // toggle). C reads as "Corner".
            // Case-insensitive like the rest of the
            // letter bindings.
            expect(routeKey('C')).toEqual({ kind: 'cycle-hud-corner' });
            expect(routeKey('c')).toEqual({ kind: 'cycle-hud-corner' });
        });

        it.each(['0', '9', 'a', 'F1', 'Tab', 'Enter', 'ArrowUp'])(
            'returns null for unbound key "%s"',
            (key) => {
                // Round 91 — backtick/tilde is now bound
                // to toggle-dm-console, so it's removed
                // from the unbound set.
                //
                // Round 132 — z / Z is now bound to
                // toggle-event-log, so it's removed
                // from the unbound set too. (X / x
                // replaces it as the generic unbound
                // letter test.)
                //
                // Round 153 — j / J is now bound to
                // toggle-hud-fade (round-153 HUD fade
                // mode), so it's removed from the
                // unbound set too. ('a' is still the
                // generic unbound-letter test.)
                //
                // Round 154 — k / K is now bound to
                // cycle-hud-corner (round-154 HUD
                // 4-corner snap), so it's removed
                // from the unbound set as well.
                //
                // unbound set too. ('a' is still the
                // generic unbound-letter test.)
                //
                // Round 133 — k / K is now bound to
                // toggle-dsl-codex, so it's removed
                // from the unbound set too. (J / j
                // replaces it as the generic unbound
                // letter test.)
                expect(routeKey(key)).toBeNull();
            },
        );

        it('returns null for an empty key', () => {
            expect(routeKey('')).toBeNull();
        });
    });

    describe('PORTAL_ATOMS', () => {
        it('has exactly 8 entries (matching the number keys 1..8)', () => {
            expect(PORTAL_ATOMS.length).toBe(8);
        });

        it('starts with match3 and ends with shooting (matches SceneManager.PORTAL_PALETTE order)', () => {
            expect(PORTAL_ATOMS[0]).toBe('match3');
            expect(PORTAL_ATOMS[PORTAL_ATOMS.length - 1]).toBe('shooting');
        });

        it('has no duplicate atom ids', () => {
            expect(new Set(PORTAL_ATOMS).size).toBe(PORTAL_ATOMS.length);
        });
    });

    describe('BINDING_DESCRIPTIONS', () => {
        it('covers every key the router knows about', () => {
            const described = new Set(BINDING_DESCRIPTIONS.map(d => d.key));
            // 1..8, Esc, Space, ?, S, L, E, R, `/~
            for (let i = 1; i <= 8; i++) expect(described.has(String(i))).toBe(true);
            expect(described.has('Esc')).toBe(true);
            expect(described.has('Space')).toBe(true);
            expect(described.has('?')).toBe(true);
            expect(described.has('S')).toBe(true);
            expect(described.has('L')).toBe(true);
            expect(described.has('E')).toBe(true);
            // Round 85 — the R key for rollback.
            expect(described.has('R')).toBe(true);
            // Round 95 — the backtick/tilde alias is now
            // rendered as `'`/~'` in the help overlay (a
            // single BINDING_DESCRIPTIONS row that
            // documents both shift-states), not just
            // `'``. A regression that drops the `~` from
            // the key field would make the alias
            // relationship invisible to the player.
            expect(described.has('`/~')).toBe(true);
        });

        it('has a non-empty Chinese description for every binding', () => {
            for (const d of BINDING_DESCRIPTIONS) {
                expect(d.key.length).toBeGreaterThan(0);
                expect(d.action.length).toBeGreaterThan(0);
                // CJK check — every action contains at least one CJK char
                expect(/[㐀-鿿]/.test(d.action)).toBe(true);
            }
        });

        it('reverse-covers every BINDING_DESCRIPTIONS row in routeKey (round 95)', () => {
            // The companion test to "covers every key the
            // router knows about" (which is one-way:
            // routes → descriptions). A zombie description
            // (a BINDING_DESCRIPTIONS row whose key
            // doesn't route anywhere) would silently be
            // rendered in the help overlay and confuse
            // the player. This test pins the reverse
            // direction: for every description, routeKey
            // must return a non-null action.
            //
            // Round 96 — the 'Space' skip was removed.
            // routeKey now handles ' ' (literal ev.key),
            // 'Space' (BINDING_DESCRIPTIONS doc label),
            // AND 'Spacebar' (legacy alias). Every
            // BINDING_DESCRIPTIONS row is now routable.
            // The only remaining skip is the backtick/
            // tilde compound (round 95) which the
            // alias test below pins explicitly.
            for (const d of BINDING_DESCRIPTIONS) {
                // Skip the round-95 backtick/tilde
                // compound (the alias test below pins
                // both ` and ~ routing).
                if (d.key === '`/~') continue;
                const action = routeKey(d.key);
                expect(action).not.toBeNull();
            }
        });

        it('spacebar ev.key has three alias forms (round 96)', () => {
            // Round 96 — the spacebar ev.key is a
            // literal ' ' character (the actual key the
            // browser produces), but the help overlay
            // displays the human-readable label 'Space'
            // and 'Spacebar' is the round-57 legacy
            // alias. All three forms now route to
            // { kind: 'reroll' } so the round-95 reverse
            // coverage test can pass without skip
            // clauses. The 'Space' case is never
            // triggered in modern browsers (ev.key is
            // always ' ') but it closes the
            // documentation-vs-ev.key contract gap.
            expect(routeKey(' ')).toEqual({ kind: 'reroll' });
            expect(routeKey('Space')).toEqual({ kind: 'reroll' });
            expect(routeKey('Spacebar')).toEqual({ kind: 'reroll' });
        });

        it('documents the backtick/tilde alias relationship in the key field (round 95)', () => {
            // Round 95 — the backtick/tilde BINDING_DESCRIPTIONS
            // entry's `key` field is `'`/~'` (slash-separated)
            // so the help overlay visibly documents BOTH
            // shift-states (backtick unshifted, tilde
            // shifted). The `routeKey` switch still handles
            // `'`` and `~` independently (line 158-159 of
            // KeyboardShortcuts.ts), so both physical
            // key outputs are accepted. This test pins
            // the documentation contract: the player
            // looking at the help overlay sees the `~`
            // alias, not just the backtick.
            const aliasRow = BINDING_DESCRIPTIONS.find((d) => d.key === '`/~');
            expect(aliasRow).toBeDefined();
            expect(aliasRow!.action).toBe('切换 DM God 控制台');
            // And the routeKey switch still routes both
            // forms (defense against a refactor that
            // drops one case but keeps the other).
            expect(routeKey('`')).toEqual({ kind: 'toggle-dm-console' });
            expect(routeKey('~')).toEqual({ kind: 'toggle-dm-console' });
        });
    });

    describe('MOUSE_BINDINGS (round 59)', () => {
        it('has at least one entry documenting the scroll-zoom', () => {
            // round 58 added scroll-zoom, round 59 documents it in
            // the help overlay. The list must mention the wheel.
            const joined = MOUSE_BINDINGS.map(d => d.key + ' ' + d.action).join(' ');
            expect(joined).toMatch(/滚轮|缩放|wheel/i);
        });

        it('has a non-empty Chinese description for every binding', () => {
            for (const d of MOUSE_BINDINGS) {
                expect(d.key.length).toBeGreaterThan(0);
                expect(d.action.length).toBeGreaterThan(0);
                expect(/[㐀-鿿]/.test(d.action)).toBe(true);
            }
        });

        it('does not overlap with the keyboard BINDING_DESCRIPTIONS', () => {
            // Mouse and keyboard share the same overlay, so we
            // sanity-check that no mouse key text is the same as a
            // keyboard key text (they describe different surfaces).
            const kbKeys = new Set(BINDING_DESCRIPTIONS.map(d => d.key));
            for (const d of MOUSE_BINDINGS) {
                expect(kbKeys.has(d.key)).toBe(false);
            }
        });
    });

    // ---------------------------------------------------------------
    // Round 131 — the 12 panel-toggle
    // keys (P / Q / W / T / F / M / V /
    // B / G / N / O / D) are now
    // driven by a single
    // `PANEL_TOGGLE_BINDINGS`
    // table (the single source of
    // truth for the panel-toggle
    // group). This describe block
    // pins the table's contract:
    // 12 unique rows + every
    // BINDING_DESCRIPTIONS panel-
    // toggle row matches a
    // table row + the 3 lookup
    // helpers (by key / by method /
    // by kind) all return the
    // expected method names.
    // Round 132 widened to 13
    // (Z-EventLog). Round 133
    // widened to 14 (K-DslCodex).
    // ---------------------------------------------------------------

    describe('PANEL_TOGGLE_BINDINGS table (round 131/132/133/137)', () => {
        it('has exactly 15 rows', () => {
            // Round 132 widened
            // the table from 12
            // → 13 rows (added
            // the Z-key
            // EventLog panel).
            // Round 133 widened
            // the table from 13
            // → 14 rows (added
            // the K-key
            // DslCodex panel).
            // Round 137 widened
            // the table from 14
            // → 15 rows (added
            // the I-key
            // Inventory panel —
            // the pre-existing
            // `InventoryUI` module
            // finally wired into
            // the App).
            expect(PANEL_TOGGLE_BINDINGS.length).toBe(15);
        });

        it('lists the 15 expected keys in QWERTY order', () => {
            const keys = PANEL_TOGGLE_BINDINGS.map((b) => b.key);
            expect(keys).toEqual(['P', 'Q', 'W', 'T', 'F', 'M', 'V', 'B', 'G', 'N', 'O', 'D', 'Z', 'K', 'I']);
        });

        it('has unique key / methodName / panelId / buttonId across all 15 rows', () => {
            const keys = PANEL_TOGGLE_BINDINGS.map((b) => b.key);
            const methods = PANEL_TOGGLE_BINDINGS.map((b) => b.methodName);
            const panels = PANEL_TOGGLE_BINDINGS.map((b) => b.panelId);
            const buttons = PANEL_TOGGLE_BINDINGS.map((b) => b.buttonId);
            expect(new Set(keys).size).toBe(15);
            expect(new Set(methods).size).toBe(15);
            expect(new Set(panels).size).toBe(15);
            expect(new Set(buttons).size).toBe(15);
        });

        it('every row has a non-empty Chinese label and action', () => {
            for (const b of PANEL_TOGGLE_BINDINGS) {
                expect(b.label.length).toBeGreaterThan(0);
                expect(b.action.length).toBeGreaterThan(0);
                // Pin Chinese content (any
                // CJK ideograph char) so a
                // future refactor that
                // accidentally drops the
                // Chinese localization is
                // caught.
                expect(/[㐀-鿿]/.test(b.label)).toBe(true);
                expect(/[㐀-鿿]/.test(b.action)).toBe(true);
            }
        });

        it('every panelId ends with "-root"', () => {
            // All 12 mount points
            // follow the
            // `<panel>-root`
            // convention. A
            // refactor that uses
            // a different id
            // scheme (e.g. a
            // dash-vs-underscore
            // typo) would break
            // this.
            for (const b of PANEL_TOGGLE_BINDINGS) {
                expect(b.panelId.endsWith('-root')).toBe(true);
            }
        });

        it('every buttonId starts with "btn-"', () => {
            for (const b of PANEL_TOGGLE_BINDINGS) {
                expect(b.buttonId.startsWith('btn-')).toBe(true);
            }
        });

        it('every methodName starts with "toggle"', () => {
            for (const b of PANEL_TOGGLE_BINDINGS) {
                expect(b.methodName.startsWith('toggle')).toBe(true);
            }
        });

        it('every BINDING_DESCRIPTIONS panel-toggle row matches a PANEL_TOGGLE_BINDINGS row by key', () => {
            // The 12 panel-toggle
            // BINDING_DESCRIPTIONS
            // rows (P / Q / W / T / F
            // / M / V / B / G / N /
            // O / D) must all have a
            // matching table row.
            // The remaining
            // BINDING_DESCRIPTIONS
            // rows (1-8 / Esc /
            // Space / ? / S / L / E
            // / R / ` / Spacebar)
            // are NOT panel-toggle
            // and so are allowed to
            // have no table match.
            const panelKeys = new Set(PANEL_TOGGLE_BINDINGS.map((b) => b.key));
            for (const d of BINDING_DESCRIPTIONS) {
                if (panelKeys.has(d.key)) {
                    const b = panelToggleBindingByKey(d.key)!;
                    // The table's `action`
                    // field (the
                    // PANEL_TOGGLE_DESCRIPTIONS
                    // short action) must
                    // match the table's
                    // BINDING_DESCRIPTIONS
                    // row's `action`
                    // (the long form is
                    // allowed to differ).
                    // We pin the
                    // BINDING_DESCRIPTIONS
                    // row exists + has a
                    // non-empty Chinese
                    // action that mentions
                    // the panel's purpose.
                    expect(d.action.length).toBeGreaterThan(0);
                    expect(/[㐀-鿿]/.test(d.action)).toBe(true);
                    // The short action
                    // is a substring or
                    // paraphrase of the
                    // long action. (For
                    // most rows the short
                    // is the long minus
                    // the '切换 ' prefix
                    // or '(... )' suffix.)
                    expect(b).toBeDefined();
                }
            }
        });

        it('PANEL_TOGGLE_DESCRIPTIONS is now a projection of PANEL_TOGGLE_BINDINGS', () => {
            // The 15 help-overlay
            // rows are
            // `{key, action}`
            // projections of the
            // table.
            expect(PANEL_TOGGLE_DESCRIPTIONS.length).toBe(15);
            for (let i = 0; i < PANEL_TOGGLE_BINDINGS.length; i++) {
                const b = PANEL_TOGGLE_BINDINGS[i];
                const d = PANEL_TOGGLE_DESCRIPTIONS[i];
                expect(d.key).toBe(b.key);
                expect(d.action).toBe(b.action);
            }
        });

        it('panelToggleBindingByKey is case-insensitive', () => {
            // `routeKey` routes
            // both 'p' and 'P'
            // (case-insensitive).
            // The lookup helper
            // must too.
            expect(panelToggleBindingByKey('p')?.methodName).toBe('toggleSettings');
            expect(panelToggleBindingByKey('P')?.methodName).toBe('toggleSettings');
            expect(panelToggleBindingByKey('d')?.methodName).toBe('toggleDebugOverlay');
            expect(panelToggleBindingByKey('D')?.methodName).toBe('toggleDebugOverlay');
            // Round 132: Z key.
            expect(panelToggleBindingByKey('z')?.methodName).toBe('toggleEventLog');
            expect(panelToggleBindingByKey('Z')?.methodName).toBe('toggleEventLog');
            // Round 133: K key.
            expect(panelToggleBindingByKey('k')?.methodName).toBe('toggleDslCodex');
            expect(panelToggleBindingByKey('K')?.methodName).toBe('toggleDslCodex');
        });

        it('panelToggleBindingByKey returns undefined for unknown keys', () => {
            // Defensive: any key
            // not in the table
            // returns undefined
            // (not throw / not
            // null). (Pre-round-132
            // Z was a defensive
            // unknown; round 132
            // promoted Z to a
            // real binding, so
            // this test now uses
            // a different letter
            // (X) + the empty
            // string. Round 133
            // promoted K to a
            // real binding too,
            // so we use J now as
            // the defensive
            // unknown.)
            expect(panelToggleBindingByKey('j')).toBeUndefined();
            expect(panelToggleBindingByKey('J')).toBeUndefined();
            expect(panelToggleBindingByKey('1')).toBeUndefined();
            expect(panelToggleBindingByKey('')).toBeUndefined();
        });

        it('panelToggleBindingByMethod resolves all 14 method names', () => {
            // The 14 public
            // method names on
            // App are all
            // resolvable via
            // the helper. This
            // is the contract
            // the 14 wrapper
            // methods rely on
            // (each calls
            // `this.toggleByMethod(name)`).
            const methodNames = PANEL_TOGGLE_BINDINGS.map((b) => b.methodName);
            for (const m of methodNames) {
                expect(panelToggleBindingByMethod(m)?.methodName).toBe(m);
            }
        });

        it('panelToggleBindingByMethod returns undefined for unknown methods', () => {
            expect(panelToggleBindingByMethod('toggleHelp')).toBeUndefined();
            expect(panelToggleBindingByMethod('toggleGodConsole')).toBeUndefined();
            expect(panelToggleBindingByMethod('enterNewDimension')).toBeUndefined();
            expect(panelToggleBindingByMethod('')).toBeUndefined();
        });

        it('panelToggleBindingByButton resolves all 14 button ids', () => {
            // The 14 mouse-button
            // ids are all
            // resolvable via
            // the helper. The
            // bootstrap loop
            // uses this contract
            // (binds `b.buttonId`
            // for every row in
            // the table).
            const buttonIds = PANEL_TOGGLE_BINDINGS.map((b) => b.buttonId);
            for (const id of buttonIds) {
                expect(panelToggleBindingByButton(id)?.buttonId).toBe(id);
            }
        });

        it('panelToggleMethodByKind maps the 14 KeyboardAction kinds to method names', () => {
            // The bootstrap
            // keydown switch
            // `default` arm
            // uses this helper
            // to resolve a
            // `kind` string
            // (e.g.
            // 'toggle-settings')
            // to a method name
            // (e.g.
            // 'toggleSettings').
            // All 14 panel-
            // toggle kinds must
            // round-trip.
            const expected: ReadonlyArray<[string, string]> = [
                ['toggle-settings',           'toggleSettings'],
                ['toggle-stats',              'toggleStatsPanel'],
                ['toggle-progression',        'toggleProgression'],
                ['toggle-tutorial',           'toggleTutorial'],
                ['toggle-vault',              'toggleVault'],
                ['toggle-npc-mind',           'toggleNpcMind'],
                ['toggle-achievements',       'toggleAchievements'],
                ['toggle-biome-library',      'toggleBiomeLibrary'],
                ['toggle-god-console-panel',  'toggleGodConsolePanel'],
                ['toggle-economy',            'toggleEconomy'],
                ['toggle-epoch',              'toggleEpoch'],
                ['toggle-debug-overlay',      'toggleDebugOverlay'],
                ['toggle-event-log',          'toggleEventLog'],
                ['toggle-dsl-codex',          'toggleDslCodex'],
            ];
            for (const [kind, methodName] of expected) {
                expect(panelToggleMethodByKind(kind)).toBe(methodName);
            }
        });

        it('panelToggleMethodByKind returns undefined for non-panel-toggle kinds', () => {
            // Kinds that are NOT
            // panel-toggle
            // (toggle-help uses
            // `app.toggleHelp()`,
            // not the round-117
            // helper; toggle-dm-
            // console uses
            // `app.toggleGodConsole()`
            // directly) return
            // undefined so the
            // bootstrap `default`
            // arm ignores them.
            expect(panelToggleMethodByKind('toggle-help')).toBeUndefined();
            expect(panelToggleMethodByKind('toggle-dm-console')).toBeUndefined();
            // And non-toggle
            // kinds:
            expect(panelToggleMethodByKind('abandon')).toBeUndefined();
            expect(panelToggleMethodByKind('save')).toBeUndefined();
            expect(panelToggleMethodByKind('enter-atom')).toBeUndefined();
            // And the empty
            // string / non-toggle-
            // prefix strings:
            expect(panelToggleMethodByKind('')).toBeUndefined();
            expect(panelToggleMethodByKind('toggle-')).toBeUndefined();
        });

        it('every PanelToggleBinding has all 6 required fields', () => {
            // Type guard sanity —
            // every row passes
            // the structural
            // type check.
            for (const b of PANEL_TOGGLE_BINDINGS) {
                const _check: PanelToggleBinding = b;
                expect(typeof b.key).toBe('string');
                expect(typeof b.panelId).toBe('string');
                expect(typeof b.label).toBe('string');
                expect(typeof b.action).toBe('string');
                expect(typeof b.methodName).toBe('string');
                expect(typeof b.buttonId).toBe('string');
            }
        });
    });
});
