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
        const spawnRateMultiplier = Number(this.config.customParams.spawnRateMultiplier ?? 1);
        const pressureMultiplier = Number(this.config.customParams.pressureMultiplier ?? 1);
        const entityCount = Number((window as any).__agiEntityCount ?? 0);
        const maxRuntimeEntities = Number(this.config.customParams.maxRuntimeEntities ?? 28);
        if (
            entityCount < maxRuntimeEntities &&
            Math.random() < dt * 0.45 * this.config.difficulty * spawnRateMultiplier * pressureMultiplier
        ) {
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
            const pressure = Number(this.config.customParams.pressureMultiplier ?? 1);
            const speed = Number(this.config.customParams.speedMultiplier ?? 1);
            const vx = (Math.random() - 0.5) * 80 * speed * pressure;
            const vz = (Math.random() - 0.5) * 80 * speed * pressure;
            engine.add_entity(
                (Math.random() - 0.5) * 320,
                150,
                (Math.random() - 0.5) * 320,
                '#ff3366',
                vx,
                -80 * pressure,
                vz,
                1
            );
        }
        console.log(`[ShooterModule] 发现新目标!`);
    }

    fireWeapon() {
        console.log(`[ShooterModule] 射击！`);
        this.score += Math.floor(50 * Number(this.config.customParams.scoreMultiplier ?? 1));
    }
}
