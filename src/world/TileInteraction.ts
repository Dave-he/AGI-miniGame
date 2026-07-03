/**
 * TileInteraction — player-on-tile behaviors for the WFC dungeon.
 *
 * Each tile kind has a small handler that, when the player steps on it,
 * applies an effect to the WorldState / Progression / EpochSystem and
 * returns a log message.
 */

import { WorldState } from './WorldState';
import { Progression } from '../player/Progression';
import {
    TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_CHEST, TILE_SPAWN, TILE_GOAL,
    TILE_TRAP, TILE_SHRINE,
} from './WfcLevelGen';

export interface TileEvent {
    type: 'reward' | 'damage' | 'heal' | 'lore' | 'note' | 'block';
    /** Short text to show in the HUD log. */
    message: string;
    /** Optional xp change. */
    xpDelta?: number;
    /** Optional currency changes. */
    goldDelta?: number;
    gemDelta?: number;
}

export class TileInteraction {
    private world: WorldState;
    private progression: Progression;
    private trapCount: number = 0;
    private shrineCount: number = 0;
    private chestCount: number = 0;

    constructor(world: WorldState, progression: Progression) {
        this.world = world;
        this.progression = progression;
    }

    /** React to the player stepping on a tile. Returns a TileEvent (or null for no-op). */
    stepOn(tile: number): TileEvent | null {
        switch (tile) {
            case TILE_FLOOR: return null;
            case TILE_WALL:  return { type: 'block', message: '撞到了一面墙。' };
            case TILE_DOOR:  return { type: 'lore', message: '穿过了一道次元之门。' };
            case TILE_SPAWN: return null; // first tile
            case TILE_GOAL:  return this.goal();
            case TILE_CHEST: return this.chest();
            case TILE_TRAP:  return this.trap();
            case TILE_SHRINE:return this.shrine();
            default: return null;
        }
    }

    private chest(): TileEvent {
        this.chestCount += 1;
        const gold = 30 + this.chestCount * 15;
        this.world.addGold(gold);
        return { type: 'reward', message: `开启宝箱 +${gold} 金币`, goldDelta: gold };
    }

    private trap(): TileEvent {
        this.trapCount += 1;
        const dmg = 10 + this.trapCount * 5;
        return { type: 'damage', message: `触发陷阱！受到 ${dmg} 伤害` };
    }

    private shrine(): TileEvent {
        this.shrineCount += 1;
        const xp = 40 + this.shrineCount * 20;
        this.progression.addXp(xp);
        return { type: 'heal', message: `祭坛赐福 +${xp} XP`, xpDelta: xp };
    }

    private goal(): TileEvent {
        const gold = 100;
        const xp = 200;
        this.world.addGold(gold);
        this.progression.addXp(xp);
        return { type: 'reward', message: `抵达终点 +${gold} 金币 +${xp} XP`, goldDelta: gold, xpDelta: xp };
    }

    getStats() {
        return { chests: this.chestCount, traps: this.trapCount, shrines: this.shrineCount };
    }
}
