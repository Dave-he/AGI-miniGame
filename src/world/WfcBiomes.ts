/**
 * WfcBiomes — per-dimension color palettes for the WFC dungeon.
 *
 * Each biome overrides the default tile colors in DEFAULT_TILES. The
 * biome is chosen by ContentGeneratorAI (already picks a visualStyle)
 * and applied at render time by SceneManager.renderWfcDungeon(grid,
 * biome).
 */

export type BiomeId = 'cyberpunk' | 'forest' | 'desert' | 'ice' | 'space' | 'dungeon';

export interface BiomePalette {
    id: BiomeId;
    name: string;
    /** Overrides the default tile color by tile id. */
    tileColors: Partial<Record<number, string>>;
    /** Tints the floor plane as a whole. */
    floorTint: string;
    /** Optional wall tint. */
    wallTint: string;
    /** Mood for music / particle tinting. */
    mood: 'mysterious' | 'tense' | 'cheerful' | 'pulse' | 'epic';
}

export const BIOMES: Record<BiomeId, BiomePalette> = {
    cyberpunk: {
        id: 'cyberpunk',
        name: '赛博朋克',
        floorTint: '#0a0e1d',
        wallTint:  '#1d0036',
        mood: 'pulse',
        tileColors: {
            0: '#1d0036', // floor
            1: '#0a0e1d', // wall
            2: '#ff66cc', // door
            3: '#06d6a0', // chest
            4: '#4ecdc4', // spawn
            5: '#ffd166', // goal
        },
    },
    forest: {
        id: 'forest',
        name: '幽邃森林',
        floorTint: '#0d2818',
        wallTint:  '#1a4d2e',
        mood: 'mysterious',
        tileColors: {
            0: '#0d2818', // floor
            1: '#1a4d2e', // wall
            2: '#90c290', // door
            3: '#ffd166', // chest
            4: '#06d6a0', // spawn
            5: '#ff66cc', // goal
        },
    },
    desert: {
        id: 'desert',
        name: '黄沙秘境',
        floorTint: '#5a3e1b',
        wallTint:  '#8a6234',
        mood: 'epic',
        tileColors: {
            0: '#5a3e1b',
            1: '#8a6234',
            2: '#a06cd5',
            3: '#ffd166',
            4: '#ff6b6b',
            5: '#4ecdc4',
        },
    },
    ice: {
        id: 'ice',
        name: '冰霜深渊',
        floorTint: '#b0e0ff',
        wallTint:  '#88c0e0',
        mood: 'tense',
        tileColors: {
            0: '#b0e0ff',
            1: '#88c0e0',
            2: '#a06cd5',
            3: '#ffd166',
            4: '#ff6b6b',
            5: '#06d6a0',
        },
    },
    space: {
        id: 'space',
        name: '深空遗迹',
        floorTint: '#0a0420',
        wallTint:  '#1d0a3a',
        mood: 'mysterious',
        tileColors: {
            0: '#0a0420',
            1: '#1d0a3a',
            2: '#a06cd5',
            3: '#ffd166',
            4: '#06d6a0',
            5: '#ff66cc',
        },
    },
    dungeon: {
        id: 'dungeon',
        name: '幽暗地牢',
        floorTint: '#1a1a1a',
        wallTint:  '#0a0a0a',
        mood: 'tense',
        tileColors: {
            0: '#1a1a1a',
            1: '#0a0a0a',
            2: '#a06cd5',
            3: '#ffd166',
            4: '#06d6a0',
            5: '#ff6b6b',
        },
    },
};

/** Pick a biome from a content-generator visual style. */
export function biomeForVisualStyle(style: string): BiomePalette {
    const s = (style || '').toLowerCase();
    if (s.includes('cyber') || s.includes('neon') || s.includes('city')) return BIOMES.cyberpunk;
    if (s.includes('forest') || s.includes('jungle') || s.includes('木')) return BIOMES.forest;
    if (s.includes('desert') || s.includes('sand')  || s.includes('沙')) return BIOMES.desert;
    if (s.includes('ice')    || s.includes('snow')  || s.includes('冰')) return BIOMES.ice;
    if (s.includes('space') || s.includes('star')  || s.includes('星')) return BIOMES.space;
    return BIOMES.dungeon;
}
