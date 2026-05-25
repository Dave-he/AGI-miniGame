import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

interface Recipe {
    id: string;
    name: string;
    inputs: Record<string, number>;
    output: { itemId: string; name: string; quantity: number };
    craftTime: number;
    discovered: boolean;
}

interface CraftingSlot {
    recipeId: string;
    remainingTime: number;
    totalTime: number;
}

interface InventoryEntry {
    itemId: string;
    name: string;
    quantity: number;
}

const BASE_ITEMS: InventoryEntry[] = [
    { itemId: 'wood', name: '木材', quantity: 10 },
    { itemId: 'stone', name: '石头', quantity: 10 },
    { itemId: 'herb', name: '草药', quantity: 10 },
    { itemId: 'iron', name: '铁矿石', quantity: 5 },
    { itemId: 'crystal', name: '水晶', quantity: 3 },
];

const RECIPES: Omit<Recipe, 'discovered'>[] = [
    { id: 'recipe_plank', name: '制作木板', inputs: { wood: 2 }, output: { itemId: 'plank', name: '木板', quantity: 1 }, craftTime: 2 },
    { id: 'recipe_brick', name: '制作砖块', inputs: { stone: 3 }, output: { itemId: 'brick', name: '砖块', quantity: 1 }, craftTime: 3 },
    { id: 'recipe_potion', name: '制作药水', inputs: { herb: 3 }, output: { itemId: 'potion', name: '药水', quantity: 1 }, craftTime: 4 },
    { id: 'recipe_ingot', name: '冶炼铁锭', inputs: { iron: 2 }, output: { itemId: 'ingot', name: '铁锭', quantity: 1 }, craftTime: 5 },
    { id: 'recipe_sword', name: '锻造剑', inputs: { ingot: 3, plank: 1 }, output: { itemId: 'sword', name: '剑', quantity: 1 }, craftTime: 8 },
    { id: 'recipe_shield', name: '锻造盾', inputs: { ingot: 2, plank: 2 }, output: { itemId: 'shield', name: '盾', quantity: 1 }, craftTime: 8 },
    { id: 'recipe_magic_staff', name: '制作法杖', inputs: { crystal: 2, plank: 1, potion: 1 }, output: { itemId: 'magic_staff', name: '法杖', quantity: 1 }, craftTime: 10 },
];

export class SynthesisAtom extends Atom {
    readonly atomId = 'synthesis';
    readonly atomName = '合成';
    readonly atomVersion = 1;

    private inventory: Map<string, InventoryEntry> = new Map();
    private recipes: Recipe[] = [];
    private craftingSlots: CraftingSlot[] = [];
    private maxCraftingSlots: number = 3;

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.inventory = new Map();
        this.craftingSlots = [];
        for (const item of BASE_ITEMS) {
            this.inventory.set(item.itemId, { ...item });
        }
        this.recipes = RECIPES.map(r => ({ ...r, discovered: false }));
        this.discoverRecipe('recipe_plank');
        this.discoverRecipe('recipe_brick');
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        ctx.sharedData['inventory'] = this.getInventory();
    }

    onUpdate(ctx: AtomContext): void {
        if (this.phase !== AtomPhase.Running) return;
        const dt = ctx.deltaTime;
        this.updateCrafting(dt);
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.inventory.clear();
        this.craftingSlots = [];
    }

    saveState(): Record<string, any> {
        return {
            inventory: this.getInventory(),
            recipes: this.recipes,
            craftingSlots: this.craftingSlots,
            score: this._score,
        };
    }

    loadState(state: Record<string, any>): void {
        this.inventory = new Map();
        const items = state.inventory ?? [];
        for (const item of items) {
            this.inventory.set(item.itemId, { ...item });
        }
        this.recipes = state.recipes ?? this.recipes;
        this.craftingSlots = state.craftingSlots ?? [];
        this._score = state.score ?? 0;
    }

    handleEvent(event: string, data: Record<string, any>, _ctx: AtomContext): void {
        if (event === 'craft') {
            this.craft(data.recipeId as string);
        } else if (event === 'instant_craft') {
            this.instantCraft(data.recipeId as string);
        } else if (event === 'add_item') {
            this.addItem(data.itemId as string, data.name as string, data.quantity as number ?? 1);
        }
    }

    craft(recipeId: string): boolean {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe || !recipe.discovered) return false;
        if (this.craftingSlots.length >= this.maxCraftingSlots) return false;
        if (!this.hasIngredients(recipe)) return false;
        this.consumeIngredients(recipe);
        this.craftingSlots.push({
            recipeId: recipe.id,
            remainingTime: recipe.craftTime,
            totalTime: recipe.craftTime,
        });
        return true;
    }

    instantCraft(recipeId: string): boolean {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe || !recipe.discovered) return false;
        if (!this.hasIngredients(recipe)) return false;
        this.consumeIngredients(recipe);
        this.addOutput(recipe);
        this._score += 10;
        this.checkDiscovery(recipe);
        return true;
    }

    addItem(itemId: string, name: string, quantity: number): void {
        const existing = this.inventory.get(itemId);
        if (existing) {
            existing.quantity += quantity;
        } else {
            this.inventory.set(itemId, { itemId, name, quantity });
        }
    }

    getInventory(): InventoryEntry[] {
        return Array.from(this.inventory.values());
    }

    getRecipes(): Recipe[] {
        return [...this.recipes];
    }

    getDiscoveredRecipes(): Recipe[] {
        return this.recipes.filter(r => r.discovered);
    }

    getCraftingSlots(): CraftingSlot[] {
        return [...this.craftingSlots];
    }

    private hasIngredients(recipe: Recipe): boolean {
        for (const [itemId, amount] of Object.entries(recipe.inputs)) {
            const item = this.inventory.get(itemId);
            if (!item || item.quantity < amount) return false;
        }
        return true;
    }

    private consumeIngredients(recipe: Recipe): void {
        for (const [itemId, amount] of Object.entries(recipe.inputs)) {
            const item = this.inventory.get(itemId);
            if (item) {
                item.quantity -= amount;
                if (item.quantity <= 0) {
                    this.inventory.delete(itemId);
                }
            }
        }
    }

    private addOutput(recipe: Recipe): void {
        const output = recipe.output;
        this.addItem(output.itemId, output.name, output.quantity);
    }

    private updateCrafting(dt: number): void {
        for (let i = this.craftingSlots.length - 1; i >= 0; i--) {
            const slot = this.craftingSlots[i];
            slot.remainingTime -= dt;
            if (slot.remainingTime <= 0) {
                const recipe = this.recipes.find(r => r.id === slot.recipeId);
                if (recipe) {
                    this.addOutput(recipe);
                    this._score += 10;
                    this.checkDiscovery(recipe);
                }
                this.craftingSlots.splice(i, 1);
            }
        }
    }

    private checkDiscovery(completedRecipe: Recipe): void {
        const outputId = completedRecipe.output.itemId;
        for (const recipe of this.recipes) {
            if (recipe.discovered) continue;
            const inputs = Object.keys(recipe.inputs);
            if (inputs.includes(outputId)) {
                const hasAllBase = inputs.every(id => {
                    const item = this.inventory.get(id);
                    return item && item.quantity > 0;
                });
                if (hasAllBase) {
                    this.discoverRecipe(recipe.id);
                }
            }
        }
    }

    private discoverRecipe(recipeId: string): void {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (recipe && !recipe.discovered) {
            recipe.discovered = true;
            this._score += 50;
        }
    }
}
