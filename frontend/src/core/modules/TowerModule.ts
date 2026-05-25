import type { GameplayModule, ModuleConfig } from '../GameplayManager';

export class TowerModule implements GameplayModule {
    id = 'tower_defense';
    name = '3D 塔防模块';
    config: ModuleConfig;
    assets = [
        'res/tower_defense/tower_base.gltf',
        'res/tower_defense/laser_tower.gltf',
        'res/tower_defense/enemy_drone.gltf'
    ];

    private towers: any[] = [];
    private enemies: any[] = [];
    private score = 0;

    constructor() {
        this.config = {
            difficulty: 1,
            customParams: {
                spawnRate: 2.0,
                baseHealth: 100
            }
        };
    }

    async load(): Promise<void> {
        console.log(`[TowerModule] Loading 3D assets...`);
        // 模拟资源加载
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[TowerModule] 资源加载完成, 难度: ${this.config.difficulty}`);
    }

    update(dt: number): void {
        // 塔防独有的逻辑更新：例如防御塔索敌、开火、敌人移动
        if (Math.random() < 0.01 * this.config.difficulty) {
            this.spawnEnemy();
        }
        
        // 模拟打怪得分
        if (this.enemies.length > 0 && Math.random() < 0.05) {
            this.enemies.pop();
            this.score += 10;
        }
    }

    unload(): void {
        console.log(`[TowerModule] 卸载塔防模块，清理资源...`);
        this.towers = [];
        this.enemies = [];
    }

    getScore(): number {
        return this.score;
    }

    // --- 模块专属方法 ---
    spawnEnemy() {
        // 通过 global engine 引用来生成怪物
        const engine = (window as any).gameEngine;
        if (engine) {
            const vx = (Math.random() - 0.5) * 40;
            const vz = (Math.random() - 0.5) * 40;
            const id = engine.spawn_enemy(0, 0, vx, vz);
            this.enemies.push({ id, hp: 50 * this.config.difficulty });
            console.log(`[TowerModule] 生成了怪物 ID:${id}, 当前剩余: ${this.enemies.length}`);
        }
    }

    buildTower(x: number, z: number) {
        const engine = (window as any).gameEngine;
        if (engine) {
            const id = engine.build_tower(x, z);
            this.towers.push({ id, x, z, type: 'laser' });
            console.log(`[TowerModule] 在 (${x}, ${z}) 建造了防御塔 ID:${id}`);
        }
    }
}
