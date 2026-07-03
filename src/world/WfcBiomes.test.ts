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

// ---------------------------------------------------------------------------
// Round 77 — `bpmForMood(mood)` helper. The DM `onDimension`
// callback in main.ts uses this to fill the `bpm` scalar
// (previously a hard-coded `120` placeholder). The mapping
// is hand-tuned to feel right per mood — see the comment
// block on `bpmForMood` in WfcBiomes.ts.
// ---------------------------------------------------------------------------

import { bpmForMood } from '../world/WfcBiomes';

describe('WfcBiomes — round 77 bpmForMood', () => {
    test('mysterious_maps_to_slow_60bpm', () => {
        expect(bpmForMood('mysterious')).toBe(60);
    });

    test('tense_maps_to_110bpm', () => {
        expect(bpmForMood('tense')).toBe(110);
    });

    test('cheerful_maps_to_130bpm', () => {
        expect(bpmForMood('cheerful')).toBe(130);
    });

    test('pulse_maps_to_140bpm_cyberpunk_fastest', () => {
        // The cyberpunk biome is the only one with
        // mood='pulse' — verifying this is the
        // fast-tempo code path catches a regression
        // that flipped the BPM mapping.
        expect(bpmForMood('pulse')).toBe(140);
    });

    test('epic_maps_to_90bpm_cinematic', () => {
        expect(bpmForMood('epic')).toBe(90);
    });

    test('all_5_moods_have_distinct_bpms', () => {
        // The mapping would be useless if two moods
        // shared a tempo. A regression that collapsed
        // 'tense' and 'cheerful' to the same BPM
        // would be caught here.
        const bpms = new Set([
            bpmForMood('mysterious'),
            bpmForMood('tense'),
            bpmForMood('cheerful'),
            bpmForMood('pulse'),
            bpmForMood('epic'),
        ]);
        expect(bpms.size).toBe(5);
    });

    test('all_bpms_fall_in_60_to_160_musicMood_band', () => {
        // The non-DM `themeToScene` path clamps its BPM
        // to [60, 160] (see SceneGen.ts:333-334). The
        // DM path's mapping should fall in the same
        // band so the two paths can be visually compared
        // by the player without one being weirdly fast
        // or slow.
        for (const mood of ['mysterious', 'tense', 'cheerful', 'pulse', 'epic'] as const) {
            const bpm = bpmForMood(mood);
            expect(bpm).toBeGreaterThanOrEqual(60);
            expect(bpm).toBeLessThanOrEqual(160);
        }
    });
});
