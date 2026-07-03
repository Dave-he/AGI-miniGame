/**
 * SmartWorldAI — generates transient world events, NPC chatter, and
 * world-state modifiers that ride on top of the active dimension.
 *
 * Per PRD §2.2.D: the world (weather,突发事件, NPC relationships, plot
 * branches) should change in real time based on player behaviour and AI
 * inference. This module produces those events and a small "npc_dialogue"
 * line for the hub UI.
 */

export type WorldEventKind = 'weather' | 'ambush' | 'merchant' | 'shrine' | 'eclipse' | 'festival';

export interface WorldEventDraft {
    kind: WorldEventKind;
    name: string;
    description: string;
    modifier: Record<string, number>;
    durationSecs: number;
    isPositive: boolean;
    npcLine: string;
}

const TEMPLATES: Record<WorldEventKind, Array<Omit<WorldEventDraft, 'kind' | 'npcLine'>>> = {
    weather: [
        { name: '重力风暴', description: '世界重力减半，所有弹道飞行时间翻倍', modifier: { gravity: 0.5 }, durationSecs: 90, isPositive: false },
        { name: '量子微风', description: '所有得分加成 +25%',                       modifier: { scoreMul: 1.25 }, durationSecs: 60, isPositive: true },
        { name: '时间加速', description: '关卡计时器走速 +30%',                    modifier: { timerMul: 1.3 }, durationSecs: 120, isPositive: false },
    ],
    ambush: [
        { name: '精英怪奇袭', description: '下一波敌人血量 +50%，击杀奖励翻倍',  modifier: { enemyHp: 1.5, rewardMul: 2.0 }, durationSecs: 45, isPositive: false },
    ],
    merchant: [
        { name: '次元商人到访', description: '金币产出 +50%，持续 60 秒',         modifier: { goldMul: 1.5 }, durationSecs: 60, isPositive: true },
    ],
    shrine: [
        { name: '古老祭坛苏醒', description: '经验获取 +100%，下一次胜利后生效',  modifier: { xpMul: 2.0 }, durationSecs: 30, isPositive: true },
    ],
    eclipse: [
        { name: '黑日食',     description: '所有光源强度 -50%，敌人可视范围缩短', modifier: { lightMul: 0.5, visionMul: 0.7 }, durationSecs: 75, isPositive: false },
    ],
    festival: [
        { name: '彩屑节',     description: '奖励掉落翻倍，移动速度 +10%',          modifier: { dropMul: 2.0, speedMul: 1.1 }, durationSecs: 90, isPositive: true },
    ],
};

const NPC_LINES: Record<WorldEventKind, string[]> = {
    weather: ['风起了，注意脚下。', '看那天空……在扭曲。', '你感觉到时间的重量了吗？'],
    ambush:  ['前面有动静，小心！', '他们闻到了你的气息……', '把武器握紧。'],
    merchant:['要看看我新进的货吗？', '今天的货物来自另一个次元。', '稀缺货，只此一件。'],
    shrine:  ['祭坛在低语……', '我感受到远古的回响。', '许个愿吧，但要小心代价。'],
    eclipse: ['太阳熄灭了。', '影子开始有了自己的意志。', '别走太远，会迷路的。'],
    festival:['彩屑飞舞！', '这是庆祝的日子。', '加入游行吧！'],
};

export class SmartWorldAI {
    private rng: () => number;
    private recent: WorldEventDraft[] = [];

    constructor(seed: number = Date.now()) {
        this.rng = this.makeRng(seed);
    }

    rollEvent(playerLevel: number, recentLossCount: number = 0): WorldEventDraft | null {
        const kinds = Object.keys(TEMPLATES) as WorldEventKind[];
        // Bias the event type based on level and recent loss
        let weight = kinds.map(() => 1.0);
        if (recentLossCount >= 2) {
            // give the player something positive
            weight = kinds.map((k, i) => {
                const t = TEMPLATES[k][0];
                return t && t.isPositive ? 2.0 : 0.5;
            });
        }
        if (playerLevel <= 3) {
            // mostly weather + festival for newbies
            const idx = kinds.indexOf('weather');
            if (idx >= 0) weight[idx] *= 2.0;
        }

        const total = weight.reduce((a, b) => a + b, 0);
        let pick = this.rng() * total;
        let chosenIdx = 0;
        for (let i = 0; i < weight.length; i++) {
            pick -= weight[i];
            if (pick <= 0) { chosenIdx = i; break; }
        }
        const kind = kinds[chosenIdx];
        const options = TEMPLATES[kind];
        const tpl = options[Math.floor(this.rng() * options.length)];

        const lines = NPC_LINES[kind];
        const draft: WorldEventDraft = {
            kind,
            name: tpl.name,
            description: tpl.description,
            modifier: tpl.modifier,
            durationSecs: tpl.durationSecs,
            isPositive: tpl.isPositive,
            npcLine: lines[Math.floor(this.rng() * lines.length)],
        };
        this.recent.push(draft);
        if (this.recent.length > 20) this.recent.shift();
        return draft;
    }

    getRecent(): WorldEventDraft[] {
        return [...this.recent];
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
