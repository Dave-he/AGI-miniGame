import type { GameplayModule, ModuleConfig } from '../GameplayManager';

export class ShooterModule implements GameplayModule {
    id = 'shooter';
    name = '3D 射击模块';
    config: ModuleConfig;
    assets = [
        'res/shooter/weapon.gltf',
        'res/shooter/target.gltf',
        'res/shooter/projectile.gltf'
    ];

    private score = 0;

    constructor() {
        this.config = {
            difficulty: 1,
            customParams: {
                fireRate: 5,
                enemyHp: 100
            }
        };
    }

    async load(): Promise<void> {
        console.log(`[ShooterModule] Loading weapons and targets...`);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`[ShooterModule] 武器装载完毕.`);
    }

    update(dt: number): void {
        if (Math.random() < 0.015 * this.config.difficulty) {
            this.spawnTarget();
        }
    }

    unload(): void {
        console.log(`[ShooterModule] 卸载射击模块...`);
    }

    getScore(): number {
        return this.score;
    }

    spawnTarget() {
        const engine = (window as any).gameEngine;
        if (engine) {
            const vx = (Math.random() - 0.5) * 20;
            const vz = (Math.random() - 0.5) * 20;
            engine.spawn_enemy((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, vx, vz);
        }
        console.log(`[ShooterModule] 发现新目标!`);
    }

    fireWeapon() {
        console.log(`[ShooterModule] 射击！`);
        this.score += 50; // 模拟击中
    }
}
