import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

interface Card {
    id: string;
    name: string;
    cost: number;
    type: string;
    value: number;
    description: string;
}

const STARTER_DECK_CARDS: Omit<Card, 'id'>[] = [
    { name: '打击', cost: 1, type: 'attack', value: 6, description: '造成6点伤害' },
    { name: '打击', cost: 1, type: 'attack', value: 6, description: '造成6点伤害' },
    { name: '打击', cost: 1, type: 'attack', value: 6, description: '造成6点伤害' },
    { name: '打击', cost: 1, type: 'attack', value: 6, description: '造成6点伤害' },
    { name: '防御', cost: 1, type: 'defense', value: 5, description: '获得5点护甲' },
    { name: '防御', cost: 1, type: 'defense', value: 5, description: '获得5点护甲' },
    { name: '防御', cost: 1, type: 'defense', value: 5, description: '获得5点护甲' },
    { name: '防御', cost: 1, type: 'defense', value: 5, description: '获得5点护甲' },
    { name: '重击', cost: 2, type: 'attack', value: 12, description: '造成12点伤害' },
    { name: '铁壁', cost: 2, type: 'defense', value: 10, description: '获得10点护甲' },
];

export class CardAtom extends Atom {
    readonly atomId = 'card';
    readonly atomName = '卡牌';
    readonly atomVersion = 1;

    private deck: Card[] = [];
    private hand: Card[] = [];
    private discardPile: Card[] = [];
    private energy: number = 0;
    private maxEnergy: number = 3;
    private armor: number = 0;
    private enemyHp: number = 50;
    private enemyMaxHp: number = 50;
    private enemyAttack: number = 8;
    private turnNumber: number = 0;
    private cardIdCounter: number = 0;
    private maxHandSize: number = 7;

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.armor = 0;
        this.turnNumber = 0;
        this.cardIdCounter = 0;
        this.enemyHp = 50;
        this.enemyMaxHp = 50;
        this.deck = this.generateStarterDeck();
        this.hand = [];
        this.discardPile = [];
        this.shuffleDeck();
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        this.startTurn();
        ctx.sharedData['hand'] = this.hand;
    }

    onUpdate(_ctx: AtomContext): void {
        if (this.enemyHp <= 0) {
            this._score += Math.floor(this.enemyMaxHp * 10);
            this.phase = AtomPhase.Completed;
        }
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.deck = [];
        this.hand = [];
        this.discardPile = [];
    }

    saveState(): Record<string, any> {
        return {
            deck: this.deck,
            hand: this.hand,
            discardPile: this.discardPile,
            energy: this.energy,
            armor: this.armor,
            enemyHp: this.enemyHp,
            turnNumber: this.turnNumber,
            score: this._score,
        };
    }

    loadState(state: Record<string, any>): void {
        this.deck = state.deck ?? [];
        this.hand = state.hand ?? [];
        this.discardPile = state.discardPile ?? [];
        this.energy = state.energy ?? 0;
        this.armor = state.armor ?? 0;
        this.enemyHp = state.enemyHp ?? 50;
        this.turnNumber = state.turnNumber ?? 0;
        this._score = state.score ?? 0;
    }

    handleEvent(event: string, data: Record<string, any>, _ctx: AtomContext): void {
        if (event === 'play_card') {
            this.playCard(data.cardId as string);
        } else if (event === 'end_turn') {
            this.endTurn();
        } else if (event === 'draw') {
            this.drawCards(data.count as number ?? 1);
        }
    }

    playCard(cardId: string): boolean {
        const index = this.hand.findIndex(c => c.id === cardId);
        if (index === -1) return false;
        const card = this.hand[index];
        if (card.cost > this.energy) return false;
        this.energy -= card.cost;
        this.hand.splice(index, 1);
        this.discardPile.push(card);
        this.resolveCard(card);
        return true;
    }

    endTurn(): void {
        this.discardHand();
        this.enemyTurn();
        this.startTurn();
    }

    drawCards(count: number): number {
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            if (this.hand.length >= this.maxHandSize) break;
            if (this.deck.length === 0) {
                this.reshuffleDiscardIntoDeck();
            }
            if (this.deck.length === 0) break;
            const card = this.deck.pop()!;
            this.hand.push(card);
            drawn++;
        }
        return drawn;
    }

    getDeck(): Card[] { return [...this.deck]; }
    getHand(): Card[] { return [...this.hand]; }
    getDiscardPile(): Card[] { return [...this.discardPile]; }
    getEnergy(): number { return this.energy; }
    getMaxEnergy(): number { return this.maxEnergy; }
    getArmor(): number { return this.armor; }
    getEnemyHp(): number { return this.enemyHp; }
    getEnemyMaxHp(): number { return this.enemyMaxHp; }
    getTurnNumber(): number { return this.turnNumber; }

    private generateStarterDeck(): Card[] {
        return STARTER_DECK_CARDS.map(c => ({
            ...c,
            id: `card_${this.cardIdCounter++}`,
        }));
    }

    private shuffleDeck(): void {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    private startTurn(): void {
        this.turnNumber++;
        this.energy = this.maxEnergy;
        this.armor = 0;
        this.drawCards(5);
    }

    private discardHand(): void {
        this.discardPile.push(...this.hand);
        this.hand = [];
    }

    private reshuffleDiscardIntoDeck(): void {
        this.deck = [...this.discardPile];
        this.discardPile = [];
        this.shuffleDeck();
    }

    private resolveCard(card: Card): void {
        if (card.type === 'attack') {
            this.enemyHp = Math.max(0, this.enemyHp - card.value);
            this._score += card.value;
        } else if (card.type === 'defense') {
            this.armor += card.value;
        }
    }

    private enemyTurn(): void {
        const damage = Math.max(0, this.enemyAttack - this.armor);
        this.armor = Math.max(0, this.armor - this.enemyAttack);
        this._score = Math.max(0, this._score - damage);
    }
}
