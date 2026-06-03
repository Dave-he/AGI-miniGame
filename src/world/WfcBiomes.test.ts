/**
 * WfcBiomes tests.
 */

import { BIOMES, biomeForVisualStyle } from '../world/WfcBiomes';

describe('WfcBiomes', () => {
    test('every biome has a non-empty name and a mood', () => {
        for (const b of Object.values(BIOMES)) {
            expect(b.name.length).toBeGreaterThan(0);
            expect(['mysterious', 'tense', 'cheerful', 'pulse', 'epic']).toContain(b.mood);
        }
    });

    test('biomeForVisualStyle returns the matching biome', () => {
        expect(biomeForVisualStyle('cyberpunk neon city').id).toBe('cyberpunk');
        expect(biomeForVisualStyle('古墓').id).toBe('dungeon');
        expect(biomeForVisualStyle('forest').id).toBe('forest');
        expect(biomeForVisualStyle('沙海').id).toBe('desert');
        expect(biomeForVisualStyle('冰原').id).toBe('ice');
        expect(biomeForVisualStyle('star space').id).toBe('space');
    });

    test('biomeForVisualStyle defaults to dungeon for unknown styles', () => {
        expect(biomeForVisualStyle('???').id).toBe('dungeon');
    });

    test('biome tileColors are all valid hex', () => {
        for (const b of Object.values(BIOMES)) {
            for (const [, color] of Object.entries(b.tileColors)) {
                expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
        }
    });
});
