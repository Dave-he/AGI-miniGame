export interface EngineTelemetry {
    frame_count: number;
    total_elapsed_secs: number;
    last_dt: number;
    bounds_size: number;
    entity_count: number;
    dynamic_entity_count: number;
    static_entity_count: number;
    last_collision_count: number;
    total_collision_count: number;
    last_removed_count: number;
    total_removed_count: number;
    total_spawned_count: number;
    average_speed: number;
    max_speed: number;
}

export interface TelemetrySignal {
    pressureScore: number;
    activityScore: number;
    densityScore: number;
    collisionScore: number;
    velocityScore: number;
}

const EMPTY_TELEMETRY: EngineTelemetry = {
    frame_count: 0,
    total_elapsed_secs: 0,
    last_dt: 0,
    bounds_size: 0,
    entity_count: 0,
    dynamic_entity_count: 0,
    static_entity_count: 0,
    last_collision_count: 0,
    total_collision_count: 0,
    last_removed_count: 0,
    total_removed_count: 0,
    total_spawned_count: 0,
    average_speed: 0,
    max_speed: 0,
};

export class EngineTelemetrySampler {
    private latest: EngineTelemetry = { ...EMPTY_TELEMETRY };
    private latestSignal: TelemetrySignal = {
        pressureScore: 0,
        activityScore: 0,
        densityScore: 0,
        collisionScore: 0,
        velocityScore: 0,
    };

    ingest(json: string): EngineTelemetry {
        try {
            const parsed = JSON.parse(json);
            this.latest = {
                ...EMPTY_TELEMETRY,
                ...parsed,
            };
            this.latestSignal = this.toSignal(this.latest);
        } catch (e) {
            console.warn('Failed to parse engine telemetry:', e);
        }

        return this.latest;
    }

    getLatest(): EngineTelemetry {
        return { ...this.latest };
    }

    getSignal(): TelemetrySignal {
        return { ...this.latestSignal };
    }

    private toSignal(telemetry: EngineTelemetry): TelemetrySignal {
        const densityScore = clamp01(telemetry.dynamic_entity_count / 24);
        const collisionScore = clamp01(telemetry.last_collision_count / 12);
        const velocityScore = clamp01(telemetry.average_speed / 240);
        const spawnScore = clamp01(telemetry.total_spawned_count / 80);
        const pressureScore = clamp01(densityScore * 0.35 + collisionScore * 0.30 + velocityScore * 0.25 + spawnScore * 0.10);
        const activityScore = clamp01(densityScore * 0.30 + velocityScore * 0.35 + collisionScore * 0.15 + spawnScore * 0.20);

        return {
            pressureScore,
            activityScore,
            densityScore,
            collisionScore,
            velocityScore,
        };
    }
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
