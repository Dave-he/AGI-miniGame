import type { GameplayModule, ModuleConfig } from '../GameplayManager';

export class ParkourModule implements GameplayModule {
    id = 'parkour';
    name = '3D 跑酷模块';
    config: ModuleConfig;
    assets = [
        'res/parkour/character.gltf',
        'res/parkour/obstacle.gltf',
        'res/parkour/coin.gltf'
    ];

    private score = 0;

    constructor() {
        this.config = {
            difficulty: 1,
            customParams: {
                speed: 10,
                obstacleDensity: 0.5
            }
        };
    }

    async load(): Promise<void> {
        console.log(`[ParkourModule] Loading 3D runner assets...`);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`[ParkourModule] 跑酷场景加载完成, 速度: ${this.config.customParams.speed}`);
    }

    update(dt: number): void {
        // 跑酷独有逻辑：不断向前推进，生成障碍物或金币
        if (Math.random() < 0.02 * this.config.difficulty) {
            this.spawnObstacle();
        }
        this.score += dt * 10; // 随时间自动增加分数
    }

    unload(): void {
        console.log(`[ParkourModule] 卸载跑酷模块...`);
    }

    getScore(): number {
        return Math.floor(this.score);
    }

    spawnObstacle() {
        const engine = (window as any).gameEngine;
        if (engine && typeof engine.spawn_obstacle === 'function') {
            const x = (Math.random() - 0.5) * 20;
            const z = -50; // 从远处生成
            engine.spawn_obstacle(x, z);
        } else if (engine) {
            // fallback
            engine.spawn_enemy( (Math.random() - 0.5) * 20, -50, 0, 30 ); 
        }
        console.log(`[ParkourModule] 前方生成了障碍物!`);
    }
}
