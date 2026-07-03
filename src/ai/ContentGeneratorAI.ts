/**
 * ContentGeneratorAI — generates theme assets, music mood, and intro lore
 * for a freshly generated dimension. The PRD calls for Stable Diffusion /
 * Midjourney art, Suno/Udio BGM, and LLM-driven story. Since those services
 * are out of scope for this iteration, we generate *prompts* for them so
 * the game layer can plug in a real backend later.
 */

export type MusicMood = 'epic' | 'mysterious' | 'cheerful' | 'tense' | 'melancholic' | 'pulse';
export type VisualStyle = 'cyberpunk' | 'fantasy' | 'space' | 'underwater' | 'desert' | 'dungeon';

export interface ThemeContent {
    themeName: string;
    visualStyle: VisualStyle;
    artPrompt: string;
    bgmPrompt: string;
    musicMood: MusicMood;
    colorPalette: string[];
    introLore: string;
    objectiveFlavor: string;
}

const VISUAL_PROMPTS: Record<VisualStyle, string> = {
    cyberpunk: '霓虹灯、低空飞行器、雨夜、巨大全息广告、赛博朋克城市',
    fantasy:   '漂浮岛屿、瀑布、发光森林、奇幻城堡、日落',
    space:     '星空、深空站、失重碎片、能量光环、紫黑色调',
    underwater:'珊瑚宫殿、发光鱼群、沉船遗迹、蓝色光柱',
    desert:    '沙丘、废墟、绿洲、星空下的篝火',
    dungeon:   '地下城、火把、骨骸、宝箱、幽暗回廊',
};

const BGM_MOODS: MusicMood[] = ['epic', 'mysterious', 'cheerful', 'tense', 'melancholic', 'pulse'];
const PALETTES: string[][] = [
    ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    ['#A06CD5', '#6247AA', '#FF7F3E'],
    ['#06FFA5', '#3D087B', '#F5E960'],
    ['#FF4D6D', '#FF8FA3', '#FFF1E6'],
];

export class ContentGeneratorAI {
    private rng: () => number;

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    generate(stage: string, atomIds: string[], difficulty: number): ThemeContent {
        const visualStyles: VisualStyle[] = ['cyberpunk', 'fantasy', 'space', 'underwater', 'desert', 'dungeon'];
        const visualStyle = visualStyles[Math.floor(this.rng() * visualStyles.length)];
        const musicMood = BGM_MOODS[Math.floor(this.rng() * BGM_MOODS.length)];
        const colorPalette = PALETTES[Math.floor(this.rng() * PALETTES.length)];
        const themeName = this.makeThemeName(stage, atomIds);
        const introLore = this.makeIntroLore(themeName, visualStyle, atomIds, difficulty);
        const objectiveFlavor = this.makeObjectiveFlavor(atomIds, difficulty);

        return {
            themeName,
            visualStyle,
            artPrompt: `${VISUAL_PROMPTS[visualStyle]}，${themeName}主题，赛博朋克风格，3D 渲染，Unity/Three.js 适配`,
            bgmPrompt: `为 ${themeName} 主题创作 ${musicMood} 风格的 BGM，融合 ${atomIds.join('、')} 玩法的节奏特征，120 BPM，时长 3 分钟，可循环`,
            musicMood,
            colorPalette,
            introLore,
            objectiveFlavor,
        };
    }

    private makeThemeName(stage: string, atomIds: string[]): string {
        const adj = ['混沌', '永恒', '幻影', '量子', '虚空', '烈焰', '冰霜', '雷霆', '暗影', '光辉', '深渊', '星辰', '时空', '命运'];
        const noun = ['迷宫', '战场', '神殿', '花园', '塔楼', '竞技场', '秘境', '次元', '试炼', '回廊', '领域', '裂隙', '梦境'];
        const a = adj[Math.floor(this.rng() * adj.length)];
        const n = noun[Math.floor(this.rng() * noun.length)];
        return `${a}·${n}（${stage}）`;
    }

    private makeIntroLore(themeName: string, visual: VisualStyle, atoms: string[], difficulty: number): string {
        const mood = difficulty > 0.7 ? '危机四伏' : difficulty > 0.4 ? '暗流涌动' : '生机盎然';
        return `欢迎来到【${themeName}】——一个${mood}的${this.styleDesc(visual)}。这里的规则由「${atoms.join(' + ')}」共同编织，等待你来重塑或颠覆。`;
    }

    private makeObjectiveFlavor(atoms: string[], difficulty: number): string {
        const target = Math.floor(1000 * difficulty);
        return `在【${atoms.join(' · ')}】玩法中累计获得 ${target} 分。`;
    }

    private styleDesc(s: VisualStyle): string {
        switch (s) {
            case 'cyberpunk': return '赛博朋克世界';
            case 'fantasy':   return '奇幻大陆';
            case 'space':     return '深空领域';
            case 'underwater':return '深海秘境';
            case 'desert':    return '沙海遗迹';
            case 'dungeon':   return '幽暗地牢';
        }
    }

    private makeRng(seed: number): () => number {
        let s = seed % 233280;
        if (s <= 0) s += 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}
