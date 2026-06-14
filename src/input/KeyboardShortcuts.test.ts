import {
    routeKey,
    PORTAL_ATOMS,
    BINDING_DESCRIPTIONS,
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

        it.each(['0', '9', 'a', 'z', 'F1', 'Tab', 'Enter', 'ArrowUp'])(
            'returns null for unbound key "%s"',
            (key) => {
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
            // 1..8, Esc, Space, ?, S, L, E
            for (let i = 1; i <= 8; i++) expect(described.has(String(i))).toBe(true);
            expect(described.has('Esc')).toBe(true);
            expect(described.has('Space')).toBe(true);
            expect(described.has('?')).toBe(true);
            expect(described.has('S')).toBe(true);
            expect(described.has('L')).toBe(true);
            expect(described.has('E')).toBe(true);
        });

        it('has a non-empty Chinese description for every binding', () => {
            for (const d of BINDING_DESCRIPTIONS) {
                expect(d.key.length).toBeGreaterThan(0);
                expect(d.action.length).toBeGreaterThan(0);
                // CJK check — every action contains at least one CJK char
                expect(/[㐀-鿿]/.test(d.action)).toBe(true);
            }
        });
    });
});
