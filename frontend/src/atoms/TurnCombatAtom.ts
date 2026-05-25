import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

interface Buff {
    id: string;
    name: string;
    duration: number;
    effect: Record<string, number>;
}

interface CombatUnit {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
    isPlayer: boolean;
    buffs: Buff[];
}

export class TurnCombatAtom extends Atom {
    readonly atomId = 'turn_combat';
    readonly atomName = '回合战斗';
    readonly atomVersion = 1;

    private player: CombatUnit | null = null;
    private enemies: CombatUnit[] = [];
    private currentTurn: 'player' | 'enemy' = 'player';
    private turnNumber: number = 0;
    private combatLog: string[] = [];
    private buffIdCounter: number = 0;

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.turnNumber = 0;
        this.combatLog = [];
        this.buffIdCounter = 0;
        this.player = {
            id: 'player',
            name: '勇者',
            hp: 100,
            maxHp: 100,
            attack: 15,
            defense: 5,
            speed: 10,
            isPlayer: true,
            buffs: [],
        };
        this.enemies = [
            {
                id: 'enemy_0',
                name: '哥布林',
                hp: 40,
                maxHp: 40,
                attack: 8,
                defense: 2,
                speed: 6,
                isPlayer: false,
                buffs: [],
            },
            {
                id: 'enemy_1',
                name: '骷髅兵',
                hp: 60,
                maxHp: 60,
                attack: 12,
                defense: 4,
                speed: 4,
                isPlayer: false,
                buffs: [],
            },
        ];
        this.currentTurn = 'player';
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        ctx.sharedData['player'] = this.player;
        ctx.sharedData['enemies'] = this.enemies;
    }

    onUpdate(_ctx: AtomContext): void {
        if (this.player && this.player.hp <= 0) {
            this.phase = AtomPhase.Failed;
        }
        if (this.enemies.length === 0) {
            this._score += 500;
            this.phase = AtomPhase.Completed;
        }
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.player = null;
        this.enemies = [];
        this.combatLog = [];
    }

    saveState(): Record<string, any> {
        return {
            player: this.player,
            enemies: this.enemies,
            currentTurn: this.currentTurn,
            turnNumber: this.turnNumber,
            score: this._score,
            combatLog: this.combatLog,
        };
    }

    loadState(state: Record<string, any>): void {
        this.player = state.player ?? null;
        this.enemies = state.enemies ?? [];
        this.currentTurn = state.currentTurn ?? 'player';
        this.turnNumber = state.turnNumber ?? 0;
        this._score = state.score ?? 0;
        this.combatLog = state.combatLog ?? [];
    }

    handleEvent(event: string, data: Record<string, any>, _ctx: AtomContext): void {
        if (event === 'action') {
            this.handleAction(data.action as string, data);
        }
    }

    handleAction(action: string, data: Record<string, any>): boolean {
        if (this.currentTurn !== 'player' || !this.player) return false;
        switch (action) {
            case 'attack':
                return this.playerAttack(data.targetId as string);
            case 'skill':
                return this.playerSkill(data.skillId as string, data.targetId as string);
            case 'defend':
                return this.playerDefend();
            case 'wait':
                this.endPlayerTurn();
                return true;
            default:
                return false;
        }
    }

    getPlayer(): CombatUnit | null { return this.player; }
    getEnemies(): CombatUnit[] { return [...this.enemies]; }
    getCurrentTurn(): string { return this.currentTurn; }
    getTurnNumber(): number { return this.turnNumber; }
    getCombatLog(): string[] { return [...this.combatLog]; }

    private playerAttack(targetId: string): boolean {
        if (!this.player) return false;
        const target = this.enemies.find(e => e.id === targetId);
        if (!target) return false;
        const damage = this.calculateDamage(this.player, target);
        target.hp = Math.max(0, target.hp - damage);
        this._score += damage;
        this.combatLog.push(`勇者攻击${target.name}，造成${damage}点伤害`);
        if (target.hp <= 0) {
            this.enemies = this.enemies.filter(e => e.id !== targetId);
            this.combatLog.push(`${target.name}被击败！`);
            this._score += 100;
        }
        this.endPlayerTurn();
        return true;
    }

    private playerSkill(_skillId: string, targetId: string): boolean {
        if (!this.player) return false;
        const target = this.enemies.find(e => e.id === targetId);
        if (!target) return false;
        const damage = this.calculateDamage(this.player, target) * 2;
        target.hp = Math.max(0, target.hp - damage);
        this._score += damage;
        this.combatLog.push(`勇者使用技能攻击${target.name}，造成${damage}点伤害`);
        if (target.hp <= 0) {
            this.enemies = this.enemies.filter(e => e.id !== targetId);
            this.combatLog.push(`${target.name}被击败！`);
            this._score += 100;
        }
        this.endPlayerTurn();
        return true;
    }

    private playerDefend(): boolean {
        if (!this.player) return false;
        const buff: Buff = {
            id: `buff_${this.buffIdCounter++}`,
            name: '防御姿态',
            duration: 1,
            effect: { defense: 10 },
        };
        this.player.buffs.push(buff);
        this.combatLog.push('勇者进入防御姿态，防御力+10');
        this.endPlayerTurn();
        return true;
    }

    private endPlayerTurn(): void {
        this.currentTurn = 'enemy';
        this.tickBuffs(this.player);
        this.enemyTurn();
    }

    private enemyTurn(): void {
        if (!this.player) return;
        for (const enemy of this.enemies) {
            const damage = this.calculateDamage(enemy, this.player);
            this.player.hp = Math.max(0, this.player.hp - damage);
            this.combatLog.push(`${enemy.name}攻击勇者，造成${damage}点伤害`);
            if (this.player.hp <= 0) break;
        }
        for (const enemy of this.enemies) {
            this.tickBuffs(enemy);
        }
        this.turnNumber++;
        this.currentTurn = 'player';
    }

    private calculateDamage(attacker: CombatUnit, defender: CombatUnit): number {
        let atk = attacker.attack;
        let def = defender.defense;
        for (const buff of attacker.buffs) {
            if (buff.effect.attack) atk += buff.effect.attack;
        }
        for (const buff of defender.buffs) {
            if (buff.effect.defense) def += buff.effect.defense;
        }
        const baseDamage = Math.max(1, atk - def);
        const variance = 0.8 + Math.random() * 0.4;
        return Math.floor(baseDamage * variance);
    }

    private tickBuffs(unit: CombatUnit | null): void {
        if (!unit) return;
        unit.buffs = unit.buffs.filter(b => {
            b.duration--;
            return b.duration > 0;
        });
    }
}
