import { CurrencyType, Transaction } from './Economy';
import type { EngineTelemetry, TelemetrySignal } from './EngineTelemetry';
import type { GeneratedSceneRecord } from './SceneLifecycle';
import type { SceneAestheticReport } from './SceneAestheticSystem';
import type { SceneWorldPlan } from './SceneWorldBuilder';
import type { UnifiedWorldState } from './WorldState';

export type SceneObjectiveKind = 'survive_time' | 'score' | 'pressure_control' | 'anchor_stability';

export interface SceneObjectiveProgress {
    id: string;
    label: string;
    kind: SceneObjectiveKind;
    current: number;
    target: number;
    unit: string;
    optional: boolean;
    completed: boolean;
}

export interface SceneRewardPlan {
    gold: number;
    gem: number;
    token: number;
    experience: number;
}

export interface SceneObjectiveSession {
    sceneId: string;
    startedAt: number;
    elapsedSeconds: number;
    score: number;
    objectives: SceneObjectiveProgress[];
    rewards: SceneRewardPlan;
    completed: boolean;
    settled: boolean;
}

export interface SceneObjectiveInput {
    dt: number;
    score: number;
    telemetry: EngineTelemetry;
    signal: TelemetrySignal;
}

export interface SceneObjectiveCompletion {
    score: number;
    rewards: SceneRewardPlan;
    completedObjectiveIds: string[];
}

export class SceneObjectiveSystem {
    createSession(
        scene: GeneratedSceneRecord,
        worldPlan: SceneWorldPlan,
        aestheticReport: SceneAestheticReport,
        rewardMultiplier: number = 1,
        now: number = Date.now()
    ): SceneObjectiveSession {
        const difficulty = Math.max(1, scene.difficulty);
        const survivalTarget = Math.round(4 + difficulty * 0.45 + scene.modules.length * 0.35);
        const scoreTarget = Math.round(35 + difficulty * 12 + scene.modules.length * 16);
        const stabilityTarget = 70;
        const pressureTarget = Math.max(4, Math.round(3 + scene.modules.length * 0.75));

        return {
            sceneId: scene.id,
            startedAt: now,
            elapsedSeconds: 0,
            score: 0,
            objectives: [
                {
                    id: 'survive_time',
                    label: '稳定运行生成场景',
                    kind: 'survive_time',
                    current: 0,
                    target: survivalTarget,
                    unit: 's',
                    optional: false,
                    completed: false,
                },
                {
                    id: 'anchor_stability',
                    label: '保持空间锚点稳定',
                    kind: 'anchor_stability',
                    current: Math.round(aestheticReport.stabilityScore * 100),
                    target: stabilityTarget,
                    unit: '%',
                    optional: false,
                    completed: aestheticReport.stabilityScore * 100 >= stabilityTarget,
                },
                {
                    id: 'pressure_control',
                    label: '压住碰撞与刷怪压力',
                    kind: 'pressure_control',
                    current: 0,
                    target: pressureTarget,
                    unit: 's',
                    optional: true,
                    completed: false,
                },
                {
                    id: 'score',
                    label: '跨玩法得分',
                    kind: 'score',
                    current: 0,
                    target: scoreTarget,
                    unit: 'pts',
                    optional: true,
                    completed: false,
                },
            ],
            rewards: this.planRewards(scene, worldPlan, aestheticReport, rewardMultiplier),
            completed: false,
            settled: false,
        };
    }

    update(session: SceneObjectiveSession, input: SceneObjectiveInput): SceneObjectiveSession {
        if (session.completed) {
            return session;
        }

        session.elapsedSeconds += Math.max(0, input.dt);
        session.score = Math.max(session.score, input.score);

        for (const objective of session.objectives) {
            switch (objective.kind) {
                case 'survive_time':
                    objective.current = Math.min(objective.target, session.elapsedSeconds);
                    break;
                case 'score':
                    objective.current = Math.min(objective.target, input.score);
                    break;
                case 'pressure_control':
                    objective.current = input.signal.pressureScore <= 0.78
                        ? Math.min(objective.target, objective.current + Math.max(0, input.dt))
                        : Math.max(0, objective.current - Math.max(0, input.dt) * 0.5);
                    break;
                case 'anchor_stability':
                    objective.current = Math.min(objective.target, objective.current);
                    break;
            }
            objective.completed = objective.current >= objective.target;
        }

        session.completed = session.objectives
            .filter(objective => !objective.optional)
            .every(objective => objective.completed);
        return session;
    }

    settle(session: SceneObjectiveSession, worldState: UnifiedWorldState): SceneObjectiveCompletion | null {
        if (!session.completed || session.settled) {
            return null;
        }

        session.settled = true;
        const rewards = session.rewards;
        const transaction = new Transaction(`scene_complete_${session.sceneId}_${session.startedAt}`, `Scene ${session.sceneId} completion`)
            .gain(CurrencyType.Gold, rewards.gold)
            .gain(CurrencyType.Token, rewards.token)
            .withTimestamp(Date.now());
        if (rewards.gem > 0) {
            transaction.gain(CurrencyType.Gem, rewards.gem);
        }
        worldState.wallet.execute(transaction);
        worldState.player.addExperience(rewards.experience);
        worldState.progression.recordDimensionComplete(session.sceneId);

        return {
            score: session.score,
            rewards,
            completedObjectiveIds: session.objectives
                .filter(objective => objective.completed)
                .map(objective => objective.id),
        };
    }

    private planRewards(
        scene: GeneratedSceneRecord,
        worldPlan: SceneWorldPlan,
        aestheticReport: SceneAestheticReport,
        rewardMultiplier: number
    ): SceneRewardPlan {
        const multiplier = Math.max(0.5, rewardMultiplier);
        const baseGold = 40 + scene.difficulty * 9 + scene.modules.length * 12 + worldPlan.landmarks.length * 3;
        const aestheticBonus = 1 + aestheticReport.overallScore * 0.35;

        return {
            gold: Math.round(baseGold * multiplier * aestheticBonus),
            gem: aestheticReport.overallScore >= 0.78 ? 1 : 0,
            token: Math.max(1, Math.round(scene.modules.length * multiplier)),
            experience: Math.round(25 + scene.difficulty * 8 + aestheticReport.overallScore * 30),
        };
    }
}
