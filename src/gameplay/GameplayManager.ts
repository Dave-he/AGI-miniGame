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

export class CardModule implements GameplayModule {
    id = 'card';
    name = '卡牌';
    
    private score: number = 0;
    private hand: string[] = [];
    private deck: string[] = [];
    private mana: number = 3;

    async load(): Promise<void> {
        this.score = 0;
        this.hand = [];
        this.deck = ['fireball', 'heal', 'shield', 'attack', 'attack'];
        this.mana = 3;
        this.drawCards(3);
    }

    update(dt: number): void {}
    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }

    drawCards(count: number): void {
        for (let i = 0; i < count; i++) {
            if (this.deck.length > 0 && this.hand.length < 8) {
                this.hand.push(this.deck.pop()!);
            }
        }
    }

    playCard(cardIndex: number, cost: number): boolean {
        if (this.mana >= cost && cardIndex < this.hand.length) {
            this.mana -= cost;
            this.hand.splice(cardIndex, 1);
            this.score += 50;
            return true;
        }
        return false;
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
