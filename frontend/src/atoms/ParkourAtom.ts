import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

const Lane = { Left: 0, Center: 1, Right: 2 } as const;
type Lane = typeof Lane[keyof typeof Lane];

const ObstacleType = { Low: 'low', High: 'high', Gap: 'gap', Spike: 'spike' } as const;
type ObstacleType = typeof ObstacleType[keyof typeof ObstacleType];

const CollectibleType = { Coin: 'coin', Gem: 'gem', PowerUp: 'powerup', Shield: 'shield' } as const;
type CollectibleType = typeof CollectibleType[keyof typeof CollectibleType];

interface Obstacle {
    type: ObstacleType;
    lane: Lane;
    position: number;
    passed: boolean;
}

interface Collectible {
    type: CollectibleType;
    lane: Lane;
    position: number;
    collected: boolean;
    value: number;
}

interface Runner {
    lane: Lane;
    y: number;
    isJumping: boolean;
    isSliding: boolean;
    jumpTimer: number;
    slideTimer: number;
    hasShield: boolean;
    shieldTimer: number;
    hasPowerUp: boolean;
    powerUpTimer: number;
}

const LANE_COUNT = 3;
const JUMP_DURATION = 0.6;
const SLIDE_DURATION = 0.5;
const SHIELD_DURATION = 5.0;
const POWERUP_DURATION = 3.0;
const SPAWN_INTERVAL_MIN = 0.8;
const SPAWN_INTERVAL_MAX = 1.5;
const SCROLL_SPEED = 8;

export class ParkourAtom extends Atom {
    readonly atomId = 'parkour';
    readonly atomName = '跑酷';
    readonly atomVersion = 1;

    private runner: Runner = {
        lane: Lane.Center,
        y: 0,
        isJumping: false,
        isSliding: false,
        jumpTimer: 0,
        slideTimer: 0,
        hasShield: false,
        shieldTimer: 0,
        powerUpTimer: 0,
        hasPowerUp: false,
    };
    private obstacles: Obstacle[] = [];
    private collectibles: Collectible[] = [];
    private distance: number = 0;
    private spawnTimer: number = 0;
    private speed: number = SCROLL_SPEED;
    private coins: number = 0;
    private gems: number = 0;
    private isHit: boolean = false;

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.runner = {
            lane: Lane.Center,
            y: 0,
            isJumping: false,
            isSliding: false,
            jumpTimer: 0,
            slideTimer: 0,
            hasShield: false,
            shieldTimer: 0,
            hasPowerUp: false,
            powerUpTimer: 0,
        };
        this.obstacles = [];
        this.collectibles = [];
        this.distance = 0;
        this.spawnTimer = 0;
        this.speed = SCROLL_SPEED;
        this.coins = 0;
        this.gems = 0;
        this.isHit = false;
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        ctx.sharedData['runner'] = this.runner;
    }

    onUpdate(ctx: AtomContext): void {
        if (this.phase !== AtomPhase.Running) return;
        const dt = ctx.deltaTime;
        this.distance += this.speed * dt;
        this._score = Math.floor(this.distance);
        this.updateRunner(dt);
        this.spawnObjects(dt);
        this.moveObjects(dt);
        this.checkCollisions();
        this.speed = SCROLL_SPEED + this.distance * 0.001;
        if (this.isHit && !this.runner.hasShield) {
            this.phase = AtomPhase.Failed;
        }
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.obstacles = [];
        this.collectibles = [];
    }

    saveState(): Record<string, any> {
        return {
            runner: this.runner,
            distance: this.distance,
            score: this._score,
            coins: this.coins,
            gems: this.gems,
        };
    }

    loadState(state: Record<string, any>): void {
        this.runner = state.runner ?? this.runner;
        this.distance = state.distance ?? 0;
        this._score = state.score ?? 0;
        this.coins = state.coins ?? 0;
        this.gems = state.gems ?? 0;
    }

    handleEvent(event: string, _data: Record<string, any>, _ctx: AtomContext): void {
        if (event !== 'action') return;
        const action = _data.action as string;
        switch (action) {
            case 'jump':
                this.jump();
                break;
            case 'slide':
                this.slide();
                break;
            case 'dash':
                this.dash();
                break;
            case 'laneLeft':
                this.changeLane(-1);
                break;
            case 'laneRight':
                this.changeLane(1);
                break;
        }
    }

    getDistance(): number { return this.distance; }
    getCoins(): number { return this.coins; }
    getGems(): number { return this.gems; }
    getRunner(): Runner { return { ...this.runner }; }
    getObstacles(): Obstacle[] { return [...this.obstacles]; }
    getCollectibles(): Collectible[] { return [...this.collectibles]; }

    private jump(): void {
        if (this.runner.isJumping || this.runner.isSliding) return;
        this.runner.isJumping = true;
        this.runner.jumpTimer = JUMP_DURATION;
    }

    private slide(): void {
        if (this.runner.isSliding || this.runner.isJumping) return;
        this.runner.isSliding = true;
        this.runner.slideTimer = SLIDE_DURATION;
    }

    private dash(): void {
        this.distance += 5;
    }

    private changeLane(direction: number): void {
        const newLane = this.runner.lane + direction;
        if (newLane >= 0 && newLane < LANE_COUNT) {
            this.runner.lane = newLane as Lane;
        }
    }

    private updateRunner(dt: number): void {
        if (this.runner.isJumping) {
            this.runner.jumpTimer -= dt;
            const progress = 1 - this.runner.jumpTimer / JUMP_DURATION;
            this.runner.y = Math.sin(progress * Math.PI) * 2;
            if (this.runner.jumpTimer <= 0) {
                this.runner.isJumping = false;
                this.runner.y = 0;
            }
        }
        if (this.runner.isSliding) {
            this.runner.slideTimer -= dt;
            if (this.runner.slideTimer <= 0) {
                this.runner.isSliding = false;
            }
        }
        if (this.runner.hasShield) {
            this.runner.shieldTimer -= dt;
            if (this.runner.shieldTimer <= 0) {
                this.runner.hasShield = false;
            }
        }
        if (this.runner.hasPowerUp) {
            this.runner.powerUpTimer -= dt;
            if (this.runner.powerUpTimer <= 0) {
                this.runner.hasPowerUp = false;
            }
        }
    }

    private spawnObjects(dt: number): void {
        this.spawnTimer += dt;
        const interval = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
        if (this.spawnTimer < interval) return;
        this.spawnTimer = 0;
        const lane = Math.floor(Math.random() * LANE_COUNT) as Lane;
        if (Math.random() < 0.6) {
            const types = [ObstacleType.Low, ObstacleType.High, ObstacleType.Gap, ObstacleType.Spike];
            this.obstacles.push({
                type: types[Math.floor(Math.random() * types.length)],
                lane,
                position: 50,
                passed: false,
            });
        } else {
            const types = [CollectibleType.Coin, CollectibleType.Coin, CollectibleType.Gem, CollectibleType.PowerUp, CollectibleType.Shield];
            const cType = types[Math.floor(Math.random() * types.length)];
            let value = 10;
            if (cType === CollectibleType.Gem) value = 50;
            this.collectibles.push({
                type: cType,
                lane,
                position: 50,
                collected: false,
                value,
            });
        }
    }

    private moveObjects(dt: number): void {
        const moveAmount = this.speed * dt;
        for (const obs of this.obstacles) {
            obs.position -= moveAmount;
        }
        for (const col of this.collectibles) {
            col.position -= moveAmount;
        }
        this.obstacles = this.obstacles.filter(o => o.position > -5);
        this.collectibles = this.collectibles.filter(c => c.position > -5 && !c.collected);
    }

    private checkCollisions(): void {
        for (const obs of this.obstacles) {
            if (obs.passed || obs.position > 1 || obs.position < -1) continue;
            if (obs.lane !== this.runner.lane) continue;
            let hit = false;
            switch (obs.type) {
                case ObstacleType.Low:
                    hit = !this.runner.isJumping;
                    break;
                case ObstacleType.High:
                    hit = !this.runner.isSliding;
                    break;
                case ObstacleType.Gap:
                    hit = !this.runner.isJumping;
                    break;
                case ObstacleType.Spike:
                    hit = true;
                    break;
            }
            if (hit) {
                obs.passed = true;
                if (this.runner.hasShield) {
                    this.runner.hasShield = false;
                } else {
                    this.isHit = true;
                }
            }
        }
        for (const col of this.collectibles) {
            if (col.collected || col.position > 1 || col.position < -1) continue;
            if (col.lane !== this.runner.lane) continue;
            col.collected = true;
            switch (col.type) {
                case CollectibleType.Coin:
                    this.coins++;
                    this._score += col.value;
                    break;
                case CollectibleType.Gem:
                    this.gems++;
                    this._score += col.value;
                    break;
                case CollectibleType.PowerUp:
                    this.runner.hasPowerUp = true;
                    this.runner.powerUpTimer = POWERUP_DURATION;
                    break;
                case CollectibleType.Shield:
                    this.runner.hasShield = true;
                    this.runner.shieldTimer = SHIELD_DURATION;
                    break;
            }
        }
    }
}
