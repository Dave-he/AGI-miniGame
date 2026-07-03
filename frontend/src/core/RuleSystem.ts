import type { DimensionBlueprint } from './AiEngine';
import type { ModuleConfig } from './GameplayManager';

export type RuleType = 'modifier' | 'constraint' | 'trigger' | 'transformation';

export interface RuntimeRule {
    ruleId: string;
    name: string;
    description: string;
    ruleType: RuleType;
    targetModules?: string[];
    params: Record<string, any>;
}

export interface ModuleRuleEffect {
    scoreMultiplier: number;
    spawnRateMultiplier: number;
    speedMultiplier: number;
    pressureMultiplier: number;
    resourceDrainPerSecond: number;
    visualIntensity: number;
    ruleTags: string[];
}

export interface CompiledRuleSet {
    dimensionId: string;
    activeRules: RuntimeRule[];
    globalEffect: ModuleRuleEffect;
    moduleEffects: Record<string, ModuleRuleEffect>;
    summary: string[];
}

const DEFAULT_EFFECT: ModuleRuleEffect = {
    scoreMultiplier: 1,
    spawnRateMultiplier: 1,
    speedMultiplier: 1,
    pressureMultiplier: 1,
    resourceDrainPerSecond: 0,
    visualIntensity: 1,
    ruleTags: [],
};

const RULE_TARGETS: Record<string, string[]> = {
    speed_boost: ['parkour', 'shooter'],
    double_score: ['match3', 'tower_defense', 'parkour', 'shooter', 'synthesis', 'card', 'turn_combat', 'puzzle'],
    chain_bonus: ['match3', 'card', 'synthesis'],
    time_pressure: ['parkour', 'tower_defense', 'shooter'],
    resource_drain: ['tower_defense', 'card', 'synthesis'],
    dense_spawns: ['tower_defense', 'shooter', 'parkour'],
    aesthetic_focus: ['match3', 'tower_defense', 'parkour', 'shooter', 'synthesis', 'card', 'turn_combat', 'puzzle'],
    revival_bonus: ['match3', 'tower_defense', 'parkour', 'shooter', 'synthesis', 'card', 'turn_combat', 'puzzle'],
};

export class RuleCompiler {
    static compile(blueprint: DimensionBlueprint): CompiledRuleSet {
        const activeRules = this.normalizeRules(blueprint);
        const moduleEffects: Record<string, ModuleRuleEffect> = {};
        const globalEffect = this.createEffect();

        for (const moduleId of blueprint.modules) {
            moduleEffects[moduleId] = this.createEffect();
        }

        for (const rule of activeRules) {
            const targets = this.resolveTargets(rule, blueprint.modules);
            for (const target of targets) {
                const effect = moduleEffects[target] ?? this.createEffect();
                this.applyRule(effect, rule);
                moduleEffects[target] = effect;
            }
            if (targets.length === 0) {
                this.applyRule(globalEffect, rule);
            }
        }

        for (const moduleId of Object.keys(moduleEffects)) {
            this.mergeEffect(moduleEffects[moduleId], globalEffect);
        }

        return {
            dimensionId: blueprint.id,
            activeRules,
            globalEffect,
            moduleEffects,
            summary: activeRules.map(rule => `${rule.name}:${rule.description}`),
        };
    }

    static applyToModuleConfig(moduleId: string, config: ModuleConfig, compiled: CompiledRuleSet): ModuleConfig {
        const effect = compiled.moduleEffects[moduleId] ?? compiled.globalEffect;
        const customParams = {
            ...config.customParams,
            ruleEffects: effect,
            scoreMultiplier: effect.scoreMultiplier,
            spawnRateMultiplier: effect.spawnRateMultiplier,
            speedMultiplier: effect.speedMultiplier,
            pressureMultiplier: effect.pressureMultiplier,
            resourceDrainPerSecond: effect.resourceDrainPerSecond,
            visualIntensity: effect.visualIntensity,
            activeRuleTags: [...effect.ruleTags],
        };

        return {
            ...config,
            customParams,
        };
    }

    private static normalizeRules(blueprint: DimensionBlueprint): RuntimeRule[] {
        const rawRules = Array.isArray(blueprint.rules) ? blueprint.rules : [];
        if (rawRules.length === 0) {
            return this.fallbackRules(blueprint);
        }

        return rawRules.map((rawRule, index) => {
            const rule = rawRule as any;
            return {
                ruleId: String(rule.ruleId ?? rule.id ?? `generated_rule_${index}`),
                name: String(rule.name ?? rule.ruleId ?? `规则 ${index + 1}`),
                description: String(rule.description ?? 'AGI generated runtime rule'),
                ruleType: this.normalizeRuleType(rule.ruleType),
                targetModules: Array.isArray(rule.targetModules) ? rule.targetModules.map(String) : undefined,
                params: typeof rule.params === 'object' && rule.params ? rule.params : {},
            };
        });
    }

    private static fallbackRules(blueprint: DimensionBlueprint): RuntimeRule[] {
        const difficulty = Math.max(1, Math.min(10, blueprint.difficulty));
        const intensity = Math.max(0.1, Math.min(1, difficulty / 10));
        const rules: RuntimeRule[] = [
            {
                ruleId: 'aesthetic_focus',
                name: '审美聚焦',
                description: '强化清晰轮廓和目标地标',
                ruleType: 'transformation',
                targetModules: [...blueprint.modules],
                params: { intensity: 0.45 + intensity * 0.25 },
            },
        ];

        if (blueprint.modules.includes('parkour') || blueprint.modules.includes('shooter')) {
            rules.push({
                ruleId: 'speed_boost',
                name: '速度涌动',
                description: '动作玩法节奏提升',
                ruleType: 'modifier',
                targetModules: blueprint.modules.filter(moduleId => ['parkour', 'shooter'].includes(moduleId)),
                params: { intensity },
            });
        }

        if (blueprint.modules.length >= 3) {
            rules.push({
                ruleId: 'chain_bonus',
                name: '跨玩法连锁',
                description: '组合玩法获得连锁得分',
                ruleType: 'trigger',
                targetModules: [...blueprint.modules],
                params: { intensity: Math.min(1, intensity + 0.15) },
            });
        }

        return rules;
    }

    private static resolveTargets(rule: RuntimeRule, modules: string[]): string[] {
        const explicitTargets = rule.targetModules?.filter(moduleId => modules.includes(moduleId));
        if (explicitTargets && explicitTargets.length > 0) {
            return explicitTargets;
        }

        const knownTargets = RULE_TARGETS[rule.ruleId]?.filter(moduleId => modules.includes(moduleId)) ?? [];
        if (knownTargets.length > 0) {
            return knownTargets;
        }

        return modules;
    }

    private static applyRule(effect: ModuleRuleEffect, rule: RuntimeRule): void {
        const intensity = Math.max(0, Math.min(1.5, Number(rule.params?.intensity ?? 0.5)));
        effect.ruleTags.push(rule.ruleId);

        switch (rule.ruleId) {
            case 'speed_boost':
                effect.speedMultiplier *= 1 + intensity * 0.45;
                effect.spawnRateMultiplier *= 1 + intensity * 0.12;
                break;
            case 'double_score':
                effect.scoreMultiplier *= 1 + intensity;
                break;
            case 'chain_bonus':
                effect.scoreMultiplier *= 1 + intensity * 0.35;
                effect.visualIntensity *= 1 + intensity * 0.15;
                break;
            case 'time_pressure':
                effect.pressureMultiplier *= 1 + intensity * 0.5;
                effect.spawnRateMultiplier *= 1 + intensity * 0.25;
                break;
            case 'resource_drain':
                effect.resourceDrainPerSecond += intensity * 0.8;
                effect.scoreMultiplier *= 1 + intensity * 0.2;
                break;
            case 'dense_spawns':
                effect.spawnRateMultiplier *= 1 + intensity * 0.7;
                effect.pressureMultiplier *= 1 + intensity * 0.25;
                break;
            case 'revival_bonus':
                effect.scoreMultiplier *= 1 + intensity * 0.3;
                effect.visualIntensity *= 1 + intensity * 0.25;
                break;
            case 'aesthetic_focus':
                effect.visualIntensity *= 1 + intensity * 0.35;
                break;
            default:
                this.applyByType(effect, rule.ruleType, intensity);
                break;
        }
    }

    private static applyByType(effect: ModuleRuleEffect, ruleType: RuleType, intensity: number): void {
        switch (ruleType) {
            case 'modifier':
                effect.scoreMultiplier *= 1 + intensity * 0.2;
                effect.speedMultiplier *= 1 + intensity * 0.15;
                break;
            case 'constraint':
                effect.pressureMultiplier *= 1 + intensity * 0.2;
                effect.resourceDrainPerSecond += intensity * 0.25;
                break;
            case 'trigger':
                effect.scoreMultiplier *= 1 + intensity * 0.25;
                break;
            case 'transformation':
                effect.visualIntensity *= 1 + intensity * 0.2;
                break;
        }
    }

    private static mergeEffect(target: ModuleRuleEffect, source: ModuleRuleEffect): void {
        target.scoreMultiplier *= source.scoreMultiplier;
        target.spawnRateMultiplier *= source.spawnRateMultiplier;
        target.speedMultiplier *= source.speedMultiplier;
        target.pressureMultiplier *= source.pressureMultiplier;
        target.resourceDrainPerSecond += source.resourceDrainPerSecond;
        target.visualIntensity *= source.visualIntensity;
        target.ruleTags = [...new Set([...target.ruleTags, ...source.ruleTags])];
    }

    private static createEffect(): ModuleRuleEffect {
        return {
            ...DEFAULT_EFFECT,
            ruleTags: [],
        };
    }

    private static normalizeRuleType(ruleType: any): RuleType {
        if (ruleType === 'constraint' || ruleType === 'trigger' || ruleType === 'transformation') {
            return ruleType;
        }
        return 'modifier';
    }
}
