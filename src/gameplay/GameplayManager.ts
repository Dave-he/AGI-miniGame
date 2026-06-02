export interface GameplayModule {
    id: string;
    name: string;
    load(): Promise<void>;
    update(dt: number): void;
    pause(): void;
    resume(): void;
    unload(): void;
    getScore(): number;
}

export class GameplayManager {
    private modules: Map<string, GameplayModule> = new Map();
    private moduleRegistry: Map<string, () => GameplayModule> = new Map();
    private isPaused: boolean = false;

    constructor() {
        this.registerDefaultModules();
    }

    private registerDefaultModules(): void {
        // 延迟注册，避免循环依赖
    }

    registerModule(id: string, factory: () => GameplayModule): void {
        this.moduleRegistry.set(id, factory);
    }

    async loadGameplay(atomIds: string[]): Promise<void> {
        this.unloadAll();

        for (const atomId of atomIds) {
            const factory = this.moduleRegistry.get(atomId);
            if (factory) {
                const module = factory();
                await module.load();
                this.modules.set(atomId, module);
                console.log(`Loaded gameplay module: ${module.name}`);
            } else {
                console.warn(`Gameplay module not found: ${atomId}`);
            }
        }

        console.log(`Active gameplay modules: ${this.modules.size}`);
    }

    update(dt: number): void {
        if (this.isPaused) return;

        for (const module of this.modules.values()) {
            module.update(dt);
        }
    }

    pause(): void {
        this.isPaused = true;
        for (const module of this.modules.values()) {
            module.pause();
        }
    }

    resume(): void {
        this.isPaused = false;
        for (const module of this.modules.values()) {
            module.resume();
        }
    }

    unloadAll(): void {
        for (const [, module] of this.modules) {
            module.unload();
        }
        this.modules.clear();
    }

    getModule(id: string): GameplayModule | undefined {
        return this.modules.get(id);
    }

    getActiveModuleIds(): string[] {
        return Array.from(this.modules.keys());
    }

    getTotalScore(): number {
        let total = 0;
        for (const module of this.modules.values()) {
            total += module.getScore();
        }
        return total;
    }
}

export class Match3Module implements GameplayModule {
    id = 'match3';
    name = '三消';
    
    private board: number[][] = [];
    private score: number = 0;
    private rows: number = 8;
    private cols: number = 8;
    private isLoaded: boolean = false;

    async load(): Promise<void> {
        this.initBoard();
        this.isLoaded = true;
    }

    update(dt: number): void {
        // 游戏逻辑更新
    }

    pause(): void {}
    resume(): void {}

    unload(): void {
        this.board = [];
        this.score = 0;
        this.isLoaded = false;
    }

    getScore(): number {
        return this.score;
    }

    swap(row1: number, col1: number, row2: number, col2: number): boolean {
        if (!this.isLoaded) return false;

        const temp = this.board[row1][col1];
        this.board[row1][col1] = this.board[row2][col2];
        this.board[row2][col2] = temp;

        if (this.checkMatches()) {
            this.score += 10;
            return true;
        }

        this.board[row2][col2] = this.board[row1][col1];
        this.board[row1][col1] = temp;
        return false;
    }

    private initBoard(): void {
        this.board = [];
        for (let row = 0; row < this.rows; row++) {
            const rowArr: number[] = [];
            for (let col = 0; col < this.cols; col++) {
                rowArr.push(Math.floor(Math.random() * 6));
            }
            this.board.push(rowArr);
        }
    }

    private checkMatches(): boolean {
        let hasMatch = false;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols - 2; col++) {
                if (this.board[row][col] !== -1 &&
                    this.board[row][col] === this.board[row][col + 1] &&
                    this.board[row][col] === this.board[row][col + 2]) {
                    hasMatch = true;
                }
            }
        }

        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows - 2; row++) {
                if (this.board[row][col] !== -1 &&
                    this.board[row][col] === this.board[row + 1][col] &&
                    this.board[row][col] === this.board[row + 2][col]) {
                    hasMatch = true;
                }
            }
        }

        return hasMatch;
    }
}

export class TowerModule implements GameplayModule {
    id = 'tower_defense';
    name = '塔防';
    
    private score: number = 0;
    private gold: number = 100;
    private lives: number = 20;
    private wave: number = 0;

    async load(): Promise<void> {
        this.score = 0;
        this.gold = 100;
        this.lives = 20;
        this.wave = 0;
    }

    update(dt: number): void {}
    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    placeTower(x: number, y: number, cost: number): boolean {
        if (this.gold >= cost) {
            this.gold -= cost;
            return true;
        }
        return false;
    }

    startNextWave(): void {
        this.wave += 1;
    }

    onEnemyDefeated(reward: number): void {
        this.gold += reward;
        this.score += reward;
    }
}

export class ParkourModule implements GameplayModule {
    id = 'parkour';
    name = '跑酷';
    
    private score: number = 0;
    private distance: number = 0;
    private coins: number = 0;
    private speed: number = 1;

    async load(): Promise<void> {
        this.score = 0;
        this.distance = 0;
        this.coins = 0;
        this.speed = 1;
    }

    update(dt: number): void {
        this.distance += this.speed * dt * 10;
        this.score = Math.floor(this.distance);
    }

    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    jump(): void {}
    slide(): void {}

    collectCoin(amount: number): void {
        this.coins += amount;
    }
}

export class PuzzleModule implements GameplayModule {
    id = 'puzzle';
    name = '解谜';

    private score: number = 0;
    private moves: number = 0;
    private solved: boolean = false;

    async load(): Promise<void> {
        this.score = 0;
        this.moves = 0;
        this.solved = false;
    }

    update(dt: number): void {}
    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    makeMove(): void {
        this.moves += 1;
    }

    solvePuzzle(): void {
        this.solved = true;
        const bonus = Math.max(100 - this.moves * 2, 10);
        this.score += bonus;
    }
}

export type SynthesisTier = 1 | 2 | 3 | 4 | 5;
export type SynthesisItemKind = 'wood' | 'stone' | 'iron' | 'crystal' | 'fire' | 'water' | 'life' | 'shadow' | 'light';

export interface SynthesisItem {
    id: string;
    name: string;
    kind: SynthesisItemKind;
    tier: SynthesisTier;
}

const SYNTHESIS_RECIPES: Record<string, { name: string; tier: SynthesisTier; kind: SynthesisItemKind }> = {
    // tier-1 → tier-2
    'wood+stone':  { name: '石斧',   tier: 2, kind: 'iron' },
    'wood+wood':   { name: '木棒',   tier: 2, kind: 'wood' },
    'stone+stone': { name: '石砖',   tier: 2, kind: 'stone' },
    'water+water': { name: '冰晶',   tier: 2, kind: 'crystal' },
    // tier-2 → tier-3
    'iron+iron':   { name: '钢锭',   tier: 3, kind: 'iron' },
    'iron+fire':   { name: '熔岩剑', tier: 3, kind: 'fire' },
    'life+water':  { name: '生命水', tier: 3, kind: 'life' },
    'crystal+crystal': { name: '能量核心', tier: 3, kind: 'crystal' },
    // tier-3 → tier-4
    'crystal+fire':   { name: '等离子宝石', tier: 4, kind: 'crystal' },
    'shadow+light':   { name: '黄昏宝珠',   tier: 4, kind: 'shadow' },
    'life+life':      { name: '精灵之心',   tier: 4, kind: 'life' },
    // tier-4 → tier-5
    'crystal+life+fire': { name: '创世碎片', tier: 5, kind: 'crystal' },
};

/**
 * SynthesisModule — merge two items of compatible kinds to produce a
 * higher-tier item. Implements the PRD §2.2.A "合成" gameplay atom.
 *
 * Score = sum of resulting item tiers × 100; bonuses for cross-kind
 * synthesis (fire + water > fire + fire).
 */
export class SynthesisModule implements GameplayModule {
    id = 'synthesis';
    name = '合成';
    private score: number = 0;
    private items: SynthesisItem[] = [];
    private combo: number = 0;
    private bestTier: SynthesisTier = 1;

    async load(): Promise<void> {
        this.score = 0;
        this.items = [
            this.makeItem('wood',   1),
            this.makeItem('wood',   1),
            this.makeItem('stone',  1),
            this.makeItem('iron',   2),
            this.makeItem('crystal',3),
            this.makeItem('life',   2),
        ];
        this.combo = 0;
        this.bestTier = 1;
    }

    update(_dt: number): void {}
    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    getItems(): SynthesisItem[] { return [...this.items]; }
    getBestTier(): SynthesisTier { return this.bestTier; }
    getCombo(): number { return this.combo; }

    /**
     * Try to merge two items. Returns the produced item on success or
     * null if the recipe is unknown. Consumes the inputs in either case.
     */
    merge(a: SynthesisItem, b: SynthesisItem): SynthesisItem | null {
        const aIdx = this.items.findIndex(i => i === a);
        const bIdx = this.items.findIndex(i => i === b);
        if (aIdx < 0 || bIdx < 0) return null;
        // remove higher index first so the lower index stays valid
        const [hi, lo] = aIdx > bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        this.items.splice(hi, 1);
        this.items.splice(lo, 1);

        const key1 = `${a.kind}+${b.kind}`;
        const key2 = `${b.kind}+${a.kind}`;
        const recipe = SYNTHESIS_RECIPES[key1] ?? SYNTHESIS_RECIPES[key2];
        if (!recipe) {
            // Failed merge: -5 score, reset combo
            this.score = Math.max(0, this.score - 5);
            this.combo = 0;
            return null;
        }
        const produced: SynthesisItem = this.makeItem(recipe.kind, recipe.tier, recipe.name);
        this.items.push(produced);
        this.score += recipe.tier * 100;
        this.bestTier = Math.max(this.bestTier, recipe.tier) as SynthesisTier;
        this.combo += 1;
        // Cross-kind bonus
        if (a.kind !== b.kind) this.score += 50;
        return produced;
    }

    private makeItem(kind: SynthesisItemKind, tier: SynthesisTier, name?: string): SynthesisItem {
        return {
            id: `${kind}_${tier}_${Math.random().toString(36).slice(2, 7)}`,
            name: name ?? this.defaultName(kind, tier),
            kind,
            tier,
        };
    }

    private defaultName(kind: SynthesisItemKind, tier: SynthesisTier): string {
        const tierName = ['', '碎片', '粗坯', '成品', '精品', '传说'][tier];
        const kindName: Record<SynthesisItemKind, string> = {
            wood: '木材', stone: '石材', iron: '铁块', crystal: '水晶',
            fire: '火焰', water: '清水', life: '生命', shadow: '暗影', light: '光辉',
        };
        return `${tierName}${kindName[kind]}`;
    }
}

export type CardElement = 'fire' | 'water' | 'wind' | 'earth' | 'light' | 'shadow';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CardDef {
    id: string;
    name: string;
    cost: number;
    element: CardElement;
    rarity: CardRarity;
    damage: number;
    shield: number;
    heal: number;
    draw: number;
}

const STARTER_DECK: CardDef[] = [
    { id: 'strike',  name: '打击',   cost: 1, element: 'earth', rarity: 'common',    damage: 6,  shield: 0, heal: 0, draw: 0 },
    { id: 'defend',  name: '防御',   cost: 1, element: 'earth', rarity: 'common',    damage: 0,  shield: 5, heal: 0, draw: 0 },
    { id: 'heal',    name: '治疗',   cost: 2, element: 'water', rarity: 'common',    damage: 0,  shield: 0, heal: 8, draw: 0 },
    { id: 'fireball',name: '火球',   cost: 3, element: 'fire',  rarity: 'rare',      damage: 16, shield: 0, heal: 0, draw: 0 },
    { id: 'draw',    name: '抽牌',   cost: 1, element: 'wind',  rarity: 'common',    damage: 0,  shield: 0, heal: 0, draw: 2 },
    { id: 'cleave',  name: '顺劈',   cost: 2, element: 'earth', rarity: 'common',    damage: 10, shield: 0, heal: 0, draw: 0 },
    { id: 'barrier', name: '壁垒',   cost: 2, element: 'light', rarity: 'rare',      damage: 0,  shield: 12,heal: 0, draw: 0 },
    { id: 'tsunami', name: '海啸',   cost: 4, element: 'water', rarity: 'epic',      damage: 18, shield: 0, heal: 4, draw: 0 },
    { id: 'meteor',  name: '陨石',   cost: 5, element: 'fire',  rarity: 'legendary', damage: 28, shield: 0, heal: 0, draw: 0 },
];

/**
 * CardModule — implements a real deck-builder with energy, draw, and
 * per-card effects (damage / shield / heal / draw). Replaces the
 * earlier stub that just played cards for +50 score.
 */
export class CardModule implements GameplayModule {
    id = 'card';
    name = '卡牌';

    private score: number = 0;
    private deck: CardDef[] = [];
    private hand: CardDef[] = [];
    private discard: CardDef[] = [];
    private maxHand: number = 6;
    private energy: number = 3;
    private maxEnergy: number = 3;
    private energyRegen: number = 3;
    private turn: number = 0;
    private enemyHp: number = 50;

    async load(): Promise<void> {
        this.score = 0;
        this.deck = STARTER_DECK.flatMap(c => [c, c, c, c]); // 4 of each
        this.hand = [];
        this.discard = [];
        this.energy = this.maxEnergy;
        this.turn = 0;
        this.enemyHp = 50;
        this.draw(this.maxHand);
    }

    update(_dt: number): void {}
    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    getHand(): CardDef[] { return [...this.hand]; }
    getEnergy(): number { return this.energy; }
    getTurn(): number { return this.turn; }
    getEnemyHp(): number { return this.enemyHp; }
    isEnemyAlive(): boolean { return this.enemyHp > 0; }

    private draw(count: number): void {
        for (let i = 0; i < count; i++) {
            if (this.hand.length >= this.maxHand) return;
            if (this.deck.length === 0) {
                this.deck = this.discard;
                this.discard = [];
                this.shuffle();
            }
            const c = this.deck.pop();
            if (c) this.hand.push(c);
        }
    }

    private shuffle(): void {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    playCard(idx: number): { ok: boolean; log: string[] } {
        const log: string[] = [];
        if (idx < 0 || idx >= this.hand.length) {
            return { ok: false, log: ['无效的手牌索引'] };
        }
        const card = this.hand[idx];
        if (this.energy < card.cost) {
            return { ok: false, log: [`能量不足 (${this.energy}/${card.cost})`] };
        }
        this.energy -= card.cost;
        this.hand.splice(idx, 1);
        this.discard.push(card);

        if (card.damage > 0) {
            this.enemyHp = Math.max(0, this.enemyHp - card.damage);
            this.score += card.damage * 2;
            log.push(`${card.name} 造成 ${card.damage} 点伤害`);
        }
        if (card.shield > 0) {
            this.score += card.shield;
            log.push(`${card.name} 提供了 ${card.shield} 点护盾`);
        }
        if (card.heal > 0) {
            this.score += card.heal * 3;
            log.push(`${card.name} 回复了 ${card.heal} 点生命`);
        }
        if (card.draw > 0) {
            this.draw(card.draw);
            log.push(`${card.name} 抽了 ${card.draw} 张牌`);
        }
        return { ok: true, log };
    }

    endTurn(): void {
        this.turn += 1;
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen);
        // Discard the hand
        this.discard.push(...this.hand);
        this.hand = [];
        this.draw(this.maxHand);
        // Enemy "counterattacks" for 4 damage
        this.enemyHp = Math.min(50, this.enemyHp + 2); // small regen
    }
}
