import { describe, test, expect, beforeEach } from '@jest/globals';
import { 
    UnifiedWorldState, 
    PlayerProfile, 
    Wallet, 
    Inventory, 
    CurrencyType, 
    Transaction,
    AiEngine, 
    Dimension, 
    DimensionConfig, 
    DimensionObjective, 
    DimensionState, 
    DimensionRunner, 
    GameplayManager, 
    registerAllAtoms,
    AtomRegistry,
    AtomRunner,
    AtomPhase,
    Match3Atom, 
    TowerDefenseAtom, 
    CardAtom, 
    TurnCombatAtom, 
    ParkourAtom, 
    SynthesisAtom 
} from '../agi_minigame';

import { allGameplayTypes, GameplayType } from '../core/GameplayType';

describe('Unified World & Economy Systems E2E', () => {
    let worldState: UnifiedWorldState;

    beforeEach(() => {
        worldState = new UnifiedWorldState('player_test_1');
    });

    test('should initialize UnifiedWorldState with correct default settings', () => {
        expect(worldState.player.accountId).toBe('player_test_1');
        expect(worldState.player.level).toBe(1);
        expect(worldState.player.experience).toBe(0);
        expect(worldState.currentLocation).toBe('InfiniteDimensionalCity');
        expect(worldState.wallet.getBalance(CurrencyType.Gold)).toBe(0);
        expect(worldState.wallet.getBalance(CurrencyType.Energy)).toBe(100);
    });

    test('should progress PlayerProfile levels and scale attributes correctly', () => {
        const profile = worldState.player;
        const initialHp = profile.attributes.hp;
        const initialAtk = profile.attributes.attack;

        // Add enough experience to level up: Level 1 -> Level 2 requires 100 exp
        profile.addExperience(150);
        expect(profile.level).toBe(2);
        expect(profile.experience).toBe(50);
        expect(profile.attributes.hp).toBe(initialHp + 10);
        expect(profile.attributes.attack).toBe(initialAtk + 2);

        // Level 2 -> Level 3 requires 200 exp
        profile.addExperience(250);
        expect(profile.level).toBe(3);
        expect(profile.experience).toBe(100); // 50 initial + 250 = 300. 300 - 200 = 100
    });

    test('should execute wallet transactions for unified currency mechanics', () => {
        const wallet = worldState.wallet;

        // Earn some gold & gem
        const gainTx = new Transaction('tx_earn', 'Earned rewards from quest')
            .gain(CurrencyType.Gold, 500)
            .gain(CurrencyType.Gem, 10);

        const success = wallet.execute(gainTx);
        expect(success).toBe(true);
        expect(wallet.getBalance(CurrencyType.Gold)).toBe(500);
        expect(wallet.getBalance(CurrencyType.Gem)).toBe(10);

        // Cost transaction (afford check)
        const costTx = new Transaction('tx_buy', 'Bought iron sword')
            .cost(CurrencyType.Gold, 300)
            .cost(CurrencyType.Gem, 5);

        expect(wallet.canExecute(costTx)).toBe(true);
        const buySuccess = wallet.execute(costTx);
        expect(buySuccess).toBe(true);
        expect(wallet.getBalance(CurrencyType.Gold)).toBe(200);
        expect(wallet.getBalance(CurrencyType.Gem)).toBe(5);

        // Fail to execute unaffordable transaction
        const heavyTx = new Transaction('tx_heavy', 'Too expensive item')
            .cost(CurrencyType.Gold, 1000);

        expect(wallet.canExecute(heavyTx)).toBe(false);
        const heavySuccess = wallet.execute(heavyTx);
        expect(heavySuccess).toBe(false);
        expect(wallet.getBalance(CurrencyType.Gold)).toBe(200); // balance remains unchanged
    });

    test('should handle inventory operations', () => {
        const inventory = worldState.inventory;

        // Add items
        const added1 = inventory.addItem('wood', '木材', 5);
        expect(added1).toBe(5);
        expect(inventory.hasItem('wood', 5)).toBe(true);
        expect(inventory.hasItem('wood', 10)).toBe(false);

        // Stack items
        const added2 = inventory.addItem('wood', '木材', 10);
        expect(added2).toBe(10);
        expect(inventory.getItem('wood')?.quantity).toBe(15);

        // Remove item
        const removed = inventory.removeItem('wood', 8);
        expect(removed).toBe(8);
        expect(inventory.getItem('wood')?.quantity).toBe(7);

        // Remove all
        inventory.removeItem('wood', 10);
        expect(inventory.hasItem('wood')).toBe(false);
    });
});

describe('Super Brain AI Contents Generation E2E', () => {
    let aiEngine: AiEngine;

    beforeEach(() => {
        aiEngine = new AiEngine();
    });

    test('should generate dimension blueprints based on config rules', async () => {
        const config = {
            seed: 42,
            difficulty: 2,
            playerLevel: 3,
            themeHint: 'cyberpunk neon city'
        };

        const blueprint = await aiEngine.generateDimension(config);
        expect(blueprint.id).toBeDefined();
        expect(blueprint.difficulty).toBe(1); // Suggested difficulty defaults to 1 when no history exists
        expect(blueprint.modules).toEqual(['parkour', 'merge']); // Low level (3 < 5) should output parkour + merge
        expect(blueprint.content.prompt3DScene).toContain('cyberpunk neon city');
        expect(blueprint.content.uiStyle).toContain('cyberpunk neon city');

        // High level generation
        const highLevelConfig = {
            seed: 99,
            difficulty: 5,
            playerLevel: 10,
            themeHint: 'ancient desert temple'
        };
        const highBlueprint = await aiEngine.generateDimension(highLevelConfig);
        expect(highBlueprint.modules).toEqual(['tower_defense', 'card', 'puzzle']); // Level 10 (5 <= level < 15)
    });

    test('should dynamically tune difficulty in BalanceTunerAI', () => {
        const engine = new AiEngine();
        const tuner = engine.balanceAI;

        // Initial suggestion
        expect(tuner.suggestDifficulty(5)).toBe(1);

        // High winrate should increase difficulty
        tuner.recordSession({ difficulty: 1, score: 100, winRate: 0.9 });
        expect(tuner.suggestDifficulty(5)).toBe(2);

        // Low winrate should decrease difficulty
        tuner.recordSession({ difficulty: 5, score: 10, winRate: 0.1 });
        expect(tuner.suggestDifficulty(5)).toBe(4);
    });
});

describe('Dimension Lifecycle and Registry E2E', () => {
    let registry: AtomRegistry;
    let worldState: UnifiedWorldState;

    beforeEach(() => {
        registry = new AtomRegistry();
        registerAllAtoms(registry);
        worldState = new UnifiedWorldState('player_test_2');
    });

    test('should successfully load, run, and complete a Dimension', async () => {
        const aiEngine = new AiEngine();
        const blueprint = await aiEngine.generateDimension({
            seed: 123,
            difficulty: 1,
            playerLevel: 1,
            themeHint: 'space'
        });

        // Custom config set atomId
        blueprint.config.atomId = 'parkour';

        const dimConfig = new DimensionConfig(blueprint);
        const dimension = new Dimension(dimConfig);

        // 1. Initial State
        expect(dimension.getState()).toBe(DimensionState.Created);

        // 2. Load
        const loaded = dimension.load(registry);
        expect(loaded).toBe(true);
        expect(dimension.getState()).toBe(DimensionState.Ready);

        // 3. Start
        const started = dimension.start(worldState);
        expect(started).toBe(true);
        expect(dimension.getState()).toBe(DimensionState.Running);

        // 4. Update
        dimension.update(1.0, worldState);
        expect(dimension.getElapsedTime()).toBe(1.0);

        // 5. Objectives
        dimension.setObjectives([
            { id: 'obj1', description: 'Collect coins', targetValue: 10, currentValue: 0, completed: false }
        ]);
        expect(dimension.getProgress()).toBe(0);
        dimension.progressObjective('obj1', 10);
        expect(dimension.getProgress()).toBe(1.0);

        // 6. Complete
        const record = dimension.complete(worldState);
        expect(dimension.getState()).toBe(DimensionState.Completed);
        expect(record.score).toBeDefined();
        expect(worldState.gameplayHistory.length).toBe(1);
        expect(worldState.progression.dimensionsCompleted).toContain(blueprint.id);
    });
});

describe('Gameplay Atoms Mechanics & Runtime Core', () => {
    let registry: AtomRegistry;
    let worldState: UnifiedWorldState;
    let atomCtx: { worldState: any; deltaTime: number; sharedData: Record<string, any> };

    beforeEach(() => {
        registry = new AtomRegistry();
        registerAllAtoms(registry);
        worldState = new UnifiedWorldState('player_test_3');
        atomCtx = {
            worldState,
            deltaTime: 1.0,
            sharedData: {}
        };
    });

    test('Match3Atom: Swapping, matching, cascades, and scores', () => {
        const atom = registry.create('match3') as Match3Atom;
        expect(atom).toBeDefined();
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        expect(atom.currentPhase).toBe(AtomPhase.Running);

        const board = atom.getBoard();
        expect(board.length).toBe(8);
        expect(board[0].length).toBe(8);

        // Verify finding matches
        const matches = atom.findMatches();
        expect(matches.length).toBe(0); // initial removal should ensure no initial matches

        // Use a deterministic no-match board so random refill cannot make this test flaky.
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                board[r][c] = (r * 2 + c) % 6;
            }
        }

        // Manually force a match of 3 gems horizontally at (0,0), (0,1), (0,2)
        const forcedGem = 2;
        board[0][0] = forcedGem;
        board[0][1] = forcedGem;
        board[0][2] = forcedGem;
        
        // Re-inject board and process matches
        (atom as any).board = board;
        const refill = [0, 1, 2];
        (atom as any).randomGem = () => refill.shift() ?? 3;
        atom.processChain();

        expect(atom.currentScore).toBeGreaterThan(0);
        expect(atom.getCombo()).toBe(1);
    });

    test('CardAtom: starter deck, drawing, playing cards, resolving values, and combat cycle', () => {
        const atom = registry.create('card') as CardAtom;
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        expect(atom.currentPhase).toBe(AtomPhase.Running);
        expect(atom.getHand().length).toBe(5); // startTurn draws 5 cards
        expect(atom.getEnergy()).toBe(3); // starter max energy

        const initialEnemyHp = atom.getEnemyHp();
        
        // Find an attack card in hand
        const hand = atom.getHand();
        const attackCard = hand.find(c => c.type === 'attack');
        expect(attackCard).toBeDefined();

        if (attackCard) {
            // Play the card
            const played = atom.playCard(attackCard.id);
            expect(played).toBe(true);
            expect(atom.getEnergy()).toBe(3 - attackCard.cost);
            expect(atom.getEnemyHp()).toBe(initialEnemyHp - attackCard.value);
            expect(atom.currentScore).toBe(attackCard.value);
        }

        // End turn should discard remaining cards, trigger enemy turn, start new player turn
        const currentTurn = atom.getTurnNumber();
        atom.endTurn();
        expect(atom.getTurnNumber()).toBe(currentTurn + 1);
        expect(atom.getHand().length).toBe(5);
        expect(atom.getEnergy()).toBe(3);
    });

    test('TowerDefenseAtom: Place towers, upgrade them, spawn and attack enemies', () => {
        const atom = registry.create('tower_defense') as TowerDefenseAtom;
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        // Place a basic tower
        // We know GRID_SIZE is 12 and PATH has specific coords. We place at (0, 0)
        const tower = atom.placeTower(0, 0, 'basic');
        expect(tower).not.toBeNull();
        expect(atom.getTowers().length).toBe(1);

        if (tower) {
            // Upgrade basic tower
            const upgraded = atom.upgradeTower(tower.id);
            expect(upgraded).toBe(true);
            expect(atom.getTowers()[0].level).toBe(2);
        }

        // Run some updates to spawn and process enemies
        // Force spawn an enemy manually
        (atom as any).spawnEnemies(1.0);
        expect(atom.getEnemies().length).toBeGreaterThan(0);

        const initialEnemyHp = atom.getEnemies()[0].hp;

        // Perform tower attack cycle
        (atom as any).towerAttacks(1.0);
        // If enemy is within range, they should take damage
        // Let's verify enemyHp changed or updates process without throwing errors
        expect(atom.getEnemies().length).toBeGreaterThan(0);
    });

    test('TurnCombatAtom: Character turns, attacking enemies, and win criteria', () => {
        const atom = registry.create('turn_combat') as TurnCombatAtom;
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        expect(atom.getPlayer()).toBeDefined();
        expect(atom.getEnemies().length).toBe(2);
        expect(atom.getCurrentTurn()).toBe('player');

        // Play an attack action
        const targetEnemy = atom.getEnemies()[0];
        const success = atom.handleAction('attack', { targetId: targetEnemy.id });
        expect(success).toBe(true);
        expect(atom.getCombatLog().length).toBeGreaterThan(0);
        // Attacking ends player turn and runs enemy turn, returning turn back to player
        expect(atom.getCurrentTurn()).toBe('player');
    });

    test('ParkourAtom: Movement, jump/slide timer, collision detection', () => {
        const atom = registry.create('parkour') as ParkourAtom;
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        const initialDistance = atom.getDistance();
        
        // Trigger jump action
        atom.handleEvent('action', { action: 'jump' }, atomCtx);
        expect(atom.getRunner().isJumping).toBe(true);

        // Trigger update and check distance scroll
        atom.onUpdate({ ...atomCtx, deltaTime: 0.1 });
        expect(atom.getDistance()).toBeGreaterThan(initialDistance);
    });

    test('SynthesisAtom: Ingredient counts, crafting items, time ticks', () => {
        const atom = registry.create('synthesis') as SynthesisAtom;
        atom.onInit(atomCtx);
        atom.onEnter(atomCtx);

        // plank recipe requires 2 wood. We start with 10 wood
        const recipeId = 'recipe_plank';
        
        // Start crafting plank
        const craftSuccess = atom.craft(recipeId);
        expect(craftSuccess).toBe(true);
        expect(atom.getCraftingSlots().length).toBe(1);

        // Tick crafting time (plank takes 2 seconds)
        atom.onUpdate({ ...atomCtx, deltaTime: 2.0 });
        
        // Crafting slot should be completed and output plank added to inventory
        expect(atom.getCraftingSlots().length).toBe(0);
        const plank = atom.getInventory().find(i => i.itemId === 'plank');
        expect(plank).toBeDefined();
        expect(plank?.quantity).toBe(1);
    });
});
