import {
    routeKey,
    PORTAL_ATOMS,
    BINDING_DESCRIPTIONS,
    MOUSE_BINDINGS,
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

        it.each(['0', '9', 'a', 'z', 'F1', 'Tab', 'Enter', 'ArrowUp'])(
            'returns null for unbound key "%s"',
            (key) => {
                // Round 91 — backtick/tilde is now bound
                // to toggle-dm-console, so it's removed
                // from the unbound set.
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
});
