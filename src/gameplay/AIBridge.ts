/**
 * AIBridge — typed bridge between the game-layer AIEngine and the
 * engine-side AtomRegistry.
 *
 * On the TypeScript side we don't have a live binding into the Rust
 * `AtomRegistry` (no WASM build wired into the Vite app yet), so the
 * bridge uses a TS manifest that mirrors `cocos4-rust/.../agi_minigame/atoms`.
 * When the WASM binding is added, swap `loadFromManifest` for a call into
 * `wasm_exports.atom_registry_ids()` and the rest of the file stays
 * unchanged.
 *
 * Responsibilities:
 *   - Read the available atom ids (engine-side gameplay modules)
 *   - Feed them to AIEngine.gameplayAI.suggest() so the suggestion is
 *     bounded by what the engine actually supports
 *   - Convert the chosen combo into a list of GameplayModule factories
 *     the GameplayManager can load
 */

import { GameplayManager, GameplayModule, Match3Module, TowerModule, CardModule, ParkourModule, PuzzleModule } from './GameplayManager';
import { AIEngine, GameplayCombinerAI } from '../ai/AIEngine';
import { WorldState } from '../world/WorldState';
import type { NpcDisposition } from '../world/NpcMind';
import { buildGenerationConfigWithMood, DEFAULT_GENERATION_HINT } from '../ai/SceneGen';
import { buildGenerationConfigWithMoodWithFallback, type SceneGenWasmModule } from '../ai/SceneGenWasm';

export interface AtomManifestEntry {
    id: string;
    name: string;
    description: string;
    gameplayType: string;
}

/**
 * Mirror of `cocos4-rust/src/agi_minigame/atoms/mod.rs`. Kept in sync
 * manually; once WASM bindings land, replace with a live call.
 */
export const ATOM_MANIFEST: AtomManifestEntry[] = [
    { id: 'match3',        name: '三消',     description: '交换、匹配、消除、连锁、得分、道具', gameplayType: 'puzzle' },
    { id: 'tower_defense', name: '塔防',     description: '放置、路径、怪物波次、攻击、升级、防御', gameplayType: 'strategy' },
    { id: 'card',          name: '卡牌',     description: '抽卡、出牌、费用、效果、结算、卡组', gameplayType: 'card' },
    { id: 'turn_combat',   name: '回合战斗', description: '行动条、普攻、技能、Buff、属性、站位', gameplayType: 'rpg' },
    { id: 'parkour',       name: '跑酷',     description: '前进、跳跃、滑行、障碍物、收集、冲刺', gameplayType: 'action' },
    { id: 'puzzle',        name: '解谜',     description: '移动、推理、限制步数、目标状态', gameplayType: 'puzzle' },
    { id: 'synthesis',     name: '合成',     description: '合并、升级、产出、配方、解锁', gameplayType: 'casual' },
    { id: 'shooting',      name: '射击',     description: '瞄准、弹道、击毁、得分、连击', gameplayType: 'action' },
];

export interface BridgeConfig {
    playerLevel: number;
    recentLossCount?: number;
    minAtoms?: number;
    maxAtoms?: number;
    /**
     * Round 23 — collective NPC mood (typically
     * `NpcRegistry.averageDisposition()`). When provided, the
     * `toGenerationConfig` step nudges the difficulty range and the
     * preferredTypes order to reflect the mood.
     *
     * Defaults to `undefined` for backwards compatibility — when
     * absent, the bridge falls back to the original
     * `toGenerationConfig` path with hardcoded `[0.3, 0.8]`.
     */
    mood?: NpcDisposition;
    /** Seed for the deterministic atom pick (round 23). */
    seed?: number;
    /**
     * Round 57 — force the dimension to a specific primary atom id
     * (e.g. when the player presses 1-8 to jump straight into a
     * portal). When set, the AI suggestion is bypassed and the
     * `preferredTypes` is `[forcedAtomId]`. The forced id must be
     * in `ATOM_MANIFEST` or the call falls back to the AI path.
     */
    forcedAtomId?: string;
}

export interface BridgeResult {
    suggestion: ReturnType<GameplayCombinerAI['suggest']>;
    atomIds: string[];
    blueprint: ReturnType<AIEngine['generateDimension']>;
    modules: GameplayModule[];
    /**
     * Round 24 — the seed actually used to drive both
     * `DimensionGenerator` and `themeToScene`. The caller passes it
     * so subsequent WFC + NPC + event chain generation is
     * deterministic. Defaults to `Date.now()` when the caller did
     * not supply one.
     */
    seed: number;
    /**
     * Round 51 — `'wasm'` when the `buildGenerationConfigWithMood`
     * call went through the WASM bridge, `'ts-fallback'` when it
     * went through the in-process TS mirror (WASM unavailable /
     * errored / no mood provided). The HUD log line in `main.ts`
     * reads this to print `[gen-config] WASM 真出` vs
     * `[gen-config] WASM 兜底→ TS 镜像`. `'n/a'` when `cfg.mood`
     * was not supplied (the original `toGenerationConfig` path was
     * taken, no WASM/TS split).
     */
    configSource: 'wasm' | 'ts-fallback' | 'n/a' | 'forced';
}

export class AIBridge {
    private ai: AIEngine;
    private gameplay: GameplayManager;
    private worldState: WorldState;
    /**
     * Round 51 — WASM bridge for `buildGenerationConfigWithMood`. Null
     * means the loader failed and the TS mirror takes over (the same
     * fallback shape used by `themeToScene` in round 48).
     */
    private wasmMod: SceneGenWasmModule | null = null;

    constructor(ai: AIEngine, gameplay: GameplayManager, worldState: WorldState) {
        this.ai = ai;
        this.gameplay = gameplay;
        this.worldState = worldState;
        this.installDefaultModules();
    }

    /**
     * Round 51 — inject the loaded WASM bridge. Called by
     * `App.setSceneGenWasm` after `loadSceneGenWasm` resolves. Passing
     * `null` is valid (loader failed → TS mirror).
     */
    setSceneGenWasm(mod: SceneGenWasmModule | null): void {
        this.wasmMod = mod;
    }

    /** Register TS-side factories for the atoms that have a TS implementation. */
    private installDefaultModules(): void {
        this.gameplay.registerModule('match3',        () => new Match3Module());
        this.gameplay.registerModule('tower_defense', () => new TowerModule());
        this.gameplay.registerModule('card',          () => new CardModule());
        this.gameplay.registerModule('parkour',       () => new ParkourModule());
        this.gameplay.registerModule('puzzle',        () => new PuzzleModule());
    }

    /**
     * Plan a new dimension: ask the AI which combination to use, then
     * resolve the suggested primary+secondary atom ids against the engine
     * manifest and load the corresponding TS gameplay modules.
     *
     * Round 23 — when `cfg.mood` is provided, the
     * `toGenerationConfig` step uses `buildGenerationConfigWithMood`
     * so the NPC collective disposition actually shapes the next
     * scene's difficulty range and atom preferences. With no mood
     * (or with the default neutral), the result is byte-identical
     * to the original path (AC5).
     */
    async planAndLoad(cfg: BridgeConfig): Promise<BridgeResult> {
        // 1. Ask the AI which atom ids fit this player's level/stage.
        //    Round 57 — when `cfg.forcedAtomId` is set to a known
        //    atom, skip the AI suggestion entirely and pin the
        //    primary atom to it. The suggestion variable still
        //    exists for the result shape (it logs the bypass).
        const availableIds = new Set(ATOM_MANIFEST.map(a => a.id));
        const forced = cfg.forcedAtomId && availableIds.has(cfg.forcedAtomId)
            ? cfg.forcedAtomId : null;
        const suggestion = forced
            ? {
                stage: 'mid' as const,
                primary: [forced],
                secondary: [] as string[],
                excluded: [] as string[],
                rationale: `forced by keyboard shortcut (1-8) → ${forced}`,
            }
            : this.ai.gameplayAI.suggest(cfg.playerLevel, cfg.recentLossCount ?? 0);

        // 2. Build the GenerationConfig (filters + counts) from the
        //    suggestion. Round 23: when `mood` is provided, the mood
        //    nudges the difficulty range and the preferredTypes
        //    ordering. When absent, fall back to the hardcoded hint
        //    — same numbers as before. Round 57: when `forced` is
        //    set, build a minimal GenerationConfig with just the
        //    forced atom in preferredTypes.
        let generationCfg: ReturnType<GameplayCombinerAI['toGenerationConfig']>;
        let configSource: BridgeResult['configSource'];
        if (forced) {
            // Round 57 — bypass mood/WASM/buildGenerationConfigWithMood
            // entirely. The forced path is a single-atom dimension
            // and the mood / WASM path was designed for the AI
            // suggestion flow.
            generationCfg = {
                minAtoms: 1,
                maxAtoms: 2,
                difficultyRange: [0.3, 0.8],
                playerLevel: cfg.playerLevel,
                preferredTypes: [forced],
                excludedTypes: [],
                rewardMultiplier: 1.0,
            };
            configSource = 'forced';
        } else if (cfg.mood) {
            // Round 51 — try WASM first; on null result, fall back to
            // the TS mirror. The fallback is always safe (the TS mirror
            // never fails for well-formed input). The `source` is
            // surfaced in the `BridgeResult` so `main.ts` can log
            // `[gen-config] WASM 真出` vs `[gen-config] WASM 兜底→ TS 镜像`.
            const outcome = buildGenerationConfigWithMoodWithFallback(
                this.wasmMod,
                cfg.playerLevel,
                cfg.recentLossCount ?? 0,
                cfg.mood,
                {
                    minAtoms: cfg.minAtoms ?? 2,
                    maxAtoms: cfg.maxAtoms ?? 4,
                    rewardMultiplier: 1.0,
                    baseDifficultyRange: [0.3, 0.8],
                },
                cfg.seed ?? 0,
            );
            generationCfg = outcome.config;
            configSource = outcome.source;
        } else {
            generationCfg = this.ai.gameplayAI.toGenerationConfig(
                cfg.playerLevel,
                cfg.recentLossCount ?? 0,
                {
                    minAtoms: cfg.minAtoms ?? 2,
                    maxAtoms: cfg.maxAtoms ?? 4,
                    rewardMultiplier: 1.0,
                    difficultyRange: [0.3, 0.8],
                },
            );
            configSource = 'n/a';
        }

        // 3. Constrain preferredTypes to what the engine actually provides.
        const filteredPreferred = generationCfg.preferredTypes.filter(id => availableIds.has(id));
        const finalCfg = { ...generationCfg, preferredTypes: filteredPreferred };

        // 4. Generate the dimension blueprint. Round 24 — when
        //    `mood` is present, generateDimension uses it to override
        //    the colorPalette with the mood-tagged one.
        const blueprint = this.ai.generateDimension(finalCfg, cfg.mood);

        // 5. Load the corresponding TS gameplay modules (or stand-ins).
        const chosenAtoms = blueprint.atomIds;
        await this.gameplay.loadGameplay(chosenAtoms);

        // 6. Mirror the dimension on the WorldState so reward accounting works.
        //    Round 31 — also pass the biome (when set by themeToScene)
        //    so the WorldState can carry the biome across visits.
        const biome = (blueprint as any).biome as
            import('../ai/SceneGen').BiomeId | undefined;
        this.worldState.setActiveDimension(blueprint.id, chosenAtoms, biome);

        const modules: GameplayModule[] = chosenAtoms
            .map(id => this.gameplay.getModule(id))
            .filter((m): m is GameplayModule => !!m);

        return {
            suggestion,
            atomIds: chosenAtoms,
            blueprint,
            modules,
            seed: cfg.seed ?? Date.now(),
            configSource,
        };
    }

    /** Sync the WorldState (player + economy + dimension history) after a run. */
    recordRunCompletion(
        score: number,
        rewards: { itemId: string; quantity: number }[],
        durationSecs: number,
    ): void {
        if (!this.ai) return;
        const dim = this.worldState.activeDimension;
        if (!dim) return;
        this.worldState.recordDimensionComplete(dim.dimensionId, score, rewards);
        this.ai.recordSession({
            dimensionId: dim.dimensionId,
            difficulty: 0.5,
            playerLevel: this.worldState.player.level,
            score,
            durationSecs,
            completed: true,
        });
    }

    /** Currently-available atom ids (from the engine manifest). */
    availableAtomIds(): string[] {
        return ATOM_MANIFEST.map(a => a.id);
    }
}
