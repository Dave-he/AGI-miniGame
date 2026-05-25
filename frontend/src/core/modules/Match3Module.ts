import type { GameplayModule, ModuleConfig } from '../GameplayManager';

export class Match3Module implements GameplayModule {
    id = 'match3';
    name = '3D 三消模块';
    config: ModuleConfig;
    assets = [
        'res/match3/gem_red.gltf',
        'res/match3/gem_blue.gltf',
        'res/match3/gem_green.gltf'
    ];

    private board: number[][] = [];
    private score = 0;

    constructor() {
        this.config = {
            difficulty: 1,
            customParams: {
                rows: 8,
                cols: 8,
                gemTypes: 5
            }
        };
    }

    async load(): Promise<void> {
        console.log(`[Match3Module] Loading 3D gems...`);
        // 模拟资源加载
        await new Promise(resolve => setTimeout(resolve, 500));
        this.initBoard();
        console.log(`[Match3Module] 棋盘初始化完成, 难度: ${this.config.difficulty}`);
    }

    update(dt: number): void {
        // 三消逻辑：如下落动画、消除结算等
        // 这里如果是 AI 托管或者自动挂机模式，可以模拟自动消除
        if (Math.random() < 0.02 * this.config.difficulty) {
            this.simulateMatch();
        }
    }

    unload(): void {
        console.log(`[Match3Module] 卸载三消模块，清理棋盘...`);
        this.board = [];
    }

    getScore(): number {
        return this.score;
    }

    // --- 模块专属方法 ---
    private initBoard() {
        const { rows, cols, gemTypes } = this.config.customParams;
        this.board = Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => Math.floor(Math.random() * gemTypes))
        );
    }

    private simulateMatch() {
        this.score += 30;
        console.log(`[Match3Module] 触发消除！得分 +30, 当前得分: ${this.score}`);
    }
}
