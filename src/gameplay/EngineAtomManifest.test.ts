/**
 * EngineAtomManifest tests.
 */

import {
    ENGINE_ATOMS, ENGINE_ATOM_IDS, ENGINE_ATOM_INDEX,
    findEngineAtom, atomsInFamily, atomsWithAllTags, listEngineAtoms,
} from '../gameplay/EngineAtomManifest';

describe('EngineAtomManifest', () => {
    test('every id is unique', () => {
        const ids = ENGINE_ATOMS.map(a => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every id is non-empty and kebab-case-ish', () => {
        for (const a of ENGINE_ATOMS) {
            expect(a.id.length).toBeGreaterThan(0);
            expect(a.id).toMatch(/^[a-z0-9_]+$/);
        }
    });

    test('the manifest covers all 6 cocos4-rust atoms', () => {
        const required = ['match3', 'tower_defense', 'card', 'turn_combat', 'parkour', 'synthesis'];
        for (const id of required) {
            expect(ENGINE_ATOM_IDS).toContain(id);
        }
    });

    test('findEngineAtom returns the spec or undefined', () => {
        expect(findEngineAtom('match3')?.name).toBe('三消');
        expect(findEngineAtom('nonexistent')).toBeUndefined();
    });

    test('atomsInFamily returns the right slice', () => {
        const casual = atomsInFamily('casual');
        expect(casual.map(a => a.id)).toEqual(['synthesis']);
        expect(atomsInFamily('strategy').map(a => a.id)).toEqual(['tower_defense']);
        expect(atomsInFamily('card').map(a => a.id)).toEqual(['card']);
    });

    test('atomsWithAllTags returns the right slice', () => {
        const tagged = atomsWithAllTags(['puzzle']);
        expect(tagged.length).toBe(1);
        expect(tagged[0].id).toBe('match3');
        // No atom has both 'puzzle' and 'card' tags → empty
        expect(atomsWithAllTags(['puzzle', 'card'])).toEqual([]);
    });

    test('listEngineAtoms returns name + id only', () => {
        const list = listEngineAtoms();
        expect(list.length).toBe(ENGINE_ATOMS.length);
        for (const it of list) {
            expect(typeof it.id).toBe('string');
            expect(typeof it.name).toBe('string');
        }
    });

    test('ENGINE_ATOM_INDEX is consistent with ENGINE_ATOMS', () => {
        for (const a of ENGINE_ATOMS) {
            expect(ENGINE_ATOM_INDEX.get(a.id)).toBe(a);
        }
    });
});
