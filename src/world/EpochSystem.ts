/**
 * EpochSystem — implements the PRD §3 "Layer 3: 纪元更迭" / 大坍缩.
 *
 * Concept:
 *  - Each "epoch" is a span of time during which world rules accumulate.
 *  - World rules are layer 2 of the multiverse — they permanently mutate
 *    the active dimension (e.g. "全图重力-50%").
 *  - When the rule count passes a threshold (or the player triggers a
 *    "collapse"), the world is rebuilt for the next epoch. The *core*
 *    rules from the previous epoch are compressed into 历史遗迹
 *    (Historical Relics) — Buff/Debuff items that persist in the
 *    inventory and influence future epochs.
 *
 * The system exposes:
 *   - addRule(rule)         — accumulate a layer-2 rule
 *   - triggerCollapse()     — force a transition (player action or threshold)
 *   - advanceEpoch()        — internal: rebuild world, compress relics
 *   - snapshot()            — for save/load
 */

export type RuleKind = 'modifier' | 'constraint' | 'trigger' | 'transformation';

export interface WorldRule {
    id: string;
    name: string;
    description: string;
    kind: RuleKind;
    params: Record<string, number | string>;
    /** When the rule was added (game tick or session ms). */
    addedAt: number;
}

export interface HistoricalRelic {
    id: string;
    sourceRuleName: string;
    effect: 'buff' | 'debuff';
    magnitude: number;
    description: string;
}

export interface EpochSnapshot {
    epochNumber: number;
    epochName: string;
    startedAt: number;
    activeRules: WorldRule[];
    relics: HistoricalRelic[];
    collapseCount: number;
}

const COLLAPSE_THRESHOLD = 8;
const MAX_RETAINED_RULES = 4;
const RELIC_KEEP_RATIO = 0.5; // top 50% of rules become relics

const EPOCH_THEMES = [
    '晨曦纪元',  '烈焰纪元',  '深海纪元',  '虚空军团',
    '量子风暴',  '晶体纪元',  '暗影纪元',  '黄金纪元',
    '秘银纪元',  '虚空纪元',  '星海纪元',  '终末纪元',
];

export class EpochSystem {
    public epochNumber: number = 1;
    public epochName: string = EPOCH_THEMES[0];
    public startedAt: number = Date.now();
    public activeRules: WorldRule[] = [];
    public relics: HistoricalRelic[] = [];
    public collapseCount: number = 0;

    private rng: () => number;

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    /** Add a layer-2 world rule. Returns true if it pushes us past the threshold. */
    addRule(rule: WorldRule): { collapsed: boolean; epoch: number } {
        this.activeRules.push(rule);
        if (this.activeRules.length >= COLLAPSE_THRESHOLD) {
            this.advanceEpoch();
            return { collapsed: true, epoch: this.epochNumber };
        }
        return { collapsed: false, epoch: this.epochNumber };
    }

    /** Force a transition (e.g. player presses "大坍缩" button). */
    triggerCollapse(): { epoch: number; newRelics: HistoricalRelic[] } {
        const newRelics = this.compressRelics();
        this.advanceEpoch(newRelics);
        return { epoch: this.epochNumber, newRelics };
    }

    /** True when adding one more rule would trigger a collapse. */
    isAtThreshold(): boolean {
        return this.activeRules.length >= COLLAPSE_THRESHOLD - 1;
    }

    /** Compress half the active rules into HistoricalRelics. */
    private compressRelics(): HistoricalRelic[] {
        const sorted = [...this.activeRules].sort((a, b) => {
            // Sort by magnitude (the max absolute param value)
            return this.ruleMagnitude(b) - this.ruleMagnitude(a);
        });
        const keep = Math.max(1, Math.floor(sorted.length * RELIC_KEEP_RATIO));
        const top = sorted.slice(0, keep);
        return top.map((r, i) => ({
            id: `relic_${this.epochNumber}_${i}`,
            sourceRuleName: r.name,
            effect: this.ruleMagnitude(r) >= 0 ? 'buff' : 'debuff',
            magnitude: Math.abs(this.ruleMagnitude(r)),
            description: `${r.name} 残留的余韵：${r.description}`,
        }));
    }

    private ruleMagnitude(r: WorldRule): number {
        let max = 0;
        for (const v of Object.values(r.params)) {
            if (typeof v === 'number') max = Math.max(max, Math.abs(v));
        }
        // modifier rules are positive; constraint rules are negative
        if (r.kind === 'constraint') return -max;
        return max;
    }

    private advanceEpoch(precomputedRelics?: HistoricalRelic[]): void {
        const newRelics = precomputedRelics ?? this.compressRelics();
        this.relics.push(...newRelics);
        // Cap relic history to keep the array bounded.
        if (this.relics.length > 32) {
            this.relics = this.relics.slice(this.relics.length - 32);
        }
        // Keep the most impactful few rules for the next epoch.
        const sorted = [...this.activeRules].sort((a, b) =>
            Math.abs(this.ruleMagnitude(b)) - Math.abs(this.ruleMagnitude(a))
        );
        this.activeRules = sorted.slice(0, MAX_RETAINED_RULES);
        this.collapseCount += 1;
        this.epochNumber += 1;
        this.epochName = EPOCH_THEMES[(this.epochNumber - 1) % EPOCH_THEMES.length];
        this.startedAt = Date.now();
    }

    /** Multiplier applied to player stats from accumulated relics. */
    relicMultiplier(effect: 'damage' | 'defense' | 'gold'): number {
        let mul = 1.0;
        for (const r of this.relics) {
            if (r.effect === 'buff') {
                if (effect === 'damage' || effect === 'gold') mul += r.magnitude * 0.01;
                else mul -= r.magnitude * 0.005;
            } else {
                if (effect === 'defense') mul += r.magnitude * 0.005;
                else mul -= r.magnitude * 0.01;
            }
        }
        return Math.max(0.1, mul);
    }

    snapshot(): EpochSnapshot {
        return {
            epochNumber: this.epochNumber,
            epochName: this.epochName,
            startedAt: this.startedAt,
            activeRules: [...this.activeRules],
            relics: [...this.relics],
            collapseCount: this.collapseCount,
        };
    }

    load(snap: EpochSnapshot): void {
        this.epochNumber = snap.epochNumber;
        this.epochName = snap.epochName;
        this.startedAt = snap.startedAt;
        this.activeRules = [...snap.activeRules];
        this.relics = [...snap.relics];
        this.collapseCount = snap.collapseCount;
    }

    private makeRng(seed: number): () => number {
        let s = seed % 233280;
        if (s <= 0) s += 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
}
