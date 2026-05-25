import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

interface Tower {
    id: string;
    row: number;
    col: number;
    type: string;
    level: number;
    damage: number;
    range: number;
    attackSpeed: number;
    attackCooldown: number;
}

interface Enemy {
    id: string;
    hp: number;
    maxHp: number;
    speed: number;
    pathIndex: number;
    position: { x: number; y: number };
    reward: number;
}

interface Wave {
    enemies: { type: string; count: number; hp: number; speed: number; reward: number }[];
    spawnInterval: number;
}

const GRID_SIZE = 12;
const PATH: { x: number; y: number }[] = [
    { x: 0, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 2 }, { x: 6, y: 2 },
    { x: 6, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 5 }, { x: 11, y: 5 },
];

export class TowerDefenseAtom extends Atom {
    readonly atomId = 'tower_defense';
    readonly atomName = '塔防';
    readonly atomVersion = 1;

    private towers: Tower[] = [];
    private enemies: Enemy[] = [];
    private waves: Wave[] = [];
    private currentWave: number = 0;
    private spawnTimer: number = 0;
    private enemiesSpawned: number = 0;
    private lives: number = 20;
    private towerIdCounter: number = 0;
    private enemyIdCounter: number = 0;
    private pathSet: Set<string> = new Set();

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.towers = [];
        this.enemies = [];
        this.currentWave = 0;
        this.lives = 20;
        this.towerIdCounter = 0;
        this.enemyIdCounter = 0;
        this.pathSet = new Set();
        for (let i = 0; i < PATH.length - 1; i++) {
            const from = PATH[i];
            const to = PATH[i + 1];
            if (from.x === to.x) {
                const minY = Math.min(from.y, to.y);
                const maxY = Math.max(from.y, to.y);
                for (let y = minY; y <= maxY; y++) {
                    this.pathSet.add(`${from.x},${y}`);
                }
            } else {
                const minX = Math.min(from.x, to.x);
                const maxX = Math.max(from.x, to.x);
                for (let x = minX; x <= maxX; x++) {
                    this.pathSet.add(`${x},${from.y}`);
                }
            }
        }
        this.generateWaves();
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        ctx.sharedData['towers'] = this.towers;
        ctx.sharedData['enemies'] = this.enemies;
    }

    onUpdate(ctx: AtomContext): void {
        if (this.phase !== AtomPhase.Running) return;
        const dt = ctx.deltaTime;
        this.spawnEnemies(dt);
        this.moveEnemies(dt);
        this.towerAttacks(dt);
        this.checkWaveComplete();
        if (this.lives <= 0) {
            this.phase = AtomPhase.Failed;
        }
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.towers = [];
        this.enemies = [];
        this.waves = [];
    }

    saveState(): Record<string, any> {
        return {
            towers: this.towers,
            enemies: this.enemies,
            currentWave: this.currentWave,
            lives: this.lives,
            score: this._score,
        };
    }

    loadState(state: Record<string, any>): void {
        this.towers = state.towers ?? [];
        this.enemies = state.enemies ?? [];
        this.currentWave = state.currentWave ?? 0;
        this.lives = state.lives ?? 20;
        this._score = state.score ?? 0;
    }

    handleEvent(event: string, data: Record<string, any>, _ctx: AtomContext): void {
        if (event === 'place_tower') {
            this.placeTower(data.row as number, data.col as number, data.type as string ?? 'basic');
        } else if (event === 'upgrade_tower') {
            this.upgradeTower(data.towerId as string);
        }
    }

    placeTower(row: number, col: number, type: string): Tower | null {
        if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
        if (this.pathSet.has(`${col},${row}`)) return null;
        if (this.towers.some(t => t.row === row && t.col === col)) return null;
        const id = `tower_${this.towerIdCounter++}`;
        const baseStats = this.getTowerBaseStats(type);
        const tower: Tower = {
            id,
            row,
            col,
            type,
            level: 1,
            damage: baseStats.damage,
            range: baseStats.range,
            attackSpeed: baseStats.attackSpeed,
            attackCooldown: 0,
        };
        this.towers.push(tower);
        return tower;
    }

    upgradeTower(towerId: string): boolean {
        const tower = this.towers.find(t => t.id === towerId);
        if (!tower || tower.level >= 3) return false;
        tower.level++;
        tower.damage = Math.floor(tower.damage * 1.5);
        tower.range += 0.5;
        tower.attackSpeed *= 0.85;
        return true;
    }

    private getTowerBaseStats(type: string): { damage: number; range: number; attackSpeed: number } {
        switch (type) {
            case 'sniper': return { damage: 50, range: 5, attackSpeed: 2.0 };
            case 'rapid': return { damage: 10, range: 2.5, attackSpeed: 0.3 };
            case 'splash': return { damage: 30, range: 3, attackSpeed: 1.5 };
            default: return { damage: 20, range: 3, attackSpeed: 1.0 };
        }
    }

    private generateWaves(): void {
        this.waves = [];
        for (let i = 0; i < 10; i++) {
            const hp = 50 + i * 30;
            const speed = 1 + i * 0.1;
            const count = 5 + i * 2;
            this.waves.push({
                enemies: [{ type: 'basic', count, hp, speed, reward: 10 + i * 5 }],
                spawnInterval: Math.max(0.3, 1.0 - i * 0.05),
            });
        }
    }

    private spawnEnemies(dt: number): void {
        if (this.currentWave >= this.waves.length) return;
        const wave = this.waves[this.currentWave];
        this.spawnTimer += dt;
        if (this.spawnTimer >= wave.spawnInterval && this.enemiesSpawned < wave.enemies[0].count) {
            this.spawnTimer = 0;
            const template = wave.enemies[0];
            const enemy: Enemy = {
                id: `enemy_${this.enemyIdCounter++}`,
                hp: template.hp,
                maxHp: template.hp,
                speed: template.speed,
                pathIndex: 0,
                position: { ...PATH[0] },
                reward: template.reward,
            };
            this.enemies.push(enemy);
            this.enemiesSpawned++;
        }
    }

    private moveEnemies(dt: number): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.hp <= 0) {
                this._score += enemy.reward;
                this.enemies.splice(i, 1);
                continue;
            }
            const targetIndex = Math.min(enemy.pathIndex + 1, PATH.length - 1);
            const target = PATH[targetIndex];
            const dx = target.x - enemy.position.x;
            const dy = target.y - enemy.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const moveAmount = enemy.speed * dt;
            if (dist <= moveAmount) {
                enemy.position = { ...target };
                enemy.pathIndex = targetIndex;
                if (enemy.pathIndex >= PATH.length - 1) {
                    this.lives--;
                    this.enemies.splice(i, 1);
                }
            } else {
                enemy.position.x += (dx / dist) * moveAmount;
                enemy.position.y += (dy / dist) * moveAmount;
            }
        }
    }

    private towerAttacks(dt: number): void {
        for (const tower of this.towers) {
            tower.attackCooldown -= dt;
            if (tower.attackCooldown > 0) continue;
            let closestEnemy: Enemy | null = null;
            let closestDist = Infinity;
            for (const enemy of this.enemies) {
                const dx = enemy.position.x - tower.col;
                const dy = enemy.position.y - tower.row;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= tower.range && dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = enemy;
                }
            }
            if (closestEnemy) {
                closestEnemy.hp -= tower.damage;
                tower.attackCooldown = tower.attackSpeed;
            }
        }
    }

    private checkWaveComplete(): void {
        if (this.currentWave >= this.waves.length) return;
        const wave = this.waves[this.currentWave];
        if (this.enemiesSpawned >= wave.enemies[0].count && this.enemies.length === 0) {
            this.currentWave++;
            this.enemiesSpawned = 0;
            this.spawnTimer = 0;
            if (this.currentWave >= this.waves.length) {
                this.phase = AtomPhase.Completed;
            }
        }
    }

    getLives(): number { return this.lives; }
    getCurrentWave(): number { return this.currentWave; }
    getTowers(): Tower[] { return [...this.towers]; }
    getEnemies(): Enemy[] { return [...this.enemies]; }
}
