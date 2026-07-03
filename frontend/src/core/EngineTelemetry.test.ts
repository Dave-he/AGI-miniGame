import { describe, expect, it } from '@jest/globals';
import { EngineTelemetrySampler } from './EngineTelemetry';

describe('EngineTelemetrySampler', () => {
    it('converts engine telemetry JSON into activity and pressure signals', () => {
        const sampler = new EngineTelemetrySampler();
        const telemetry = sampler.ingest(JSON.stringify({
            frame_count: 12,
            entity_count: 20,
            dynamic_entity_count: 16,
            static_entity_count: 4,
            last_collision_count: 6,
            total_collision_count: 24,
            last_removed_count: 1,
            total_removed_count: 3,
            total_spawned_count: 40,
            average_speed: 180,
        }));
        const signal = sampler.getSignal();

        expect(telemetry.frame_count).toBe(12);
        expect(telemetry.total_removed_count).toBe(3);
        expect(signal.pressureScore).toBeGreaterThan(0.3);
        expect(signal.activityScore).toBeGreaterThan(0.4);
        expect(signal.densityScore).toBeGreaterThan(0.5);
    });

    it('keeps a stable empty sample if malformed telemetry arrives', () => {
        const sampler = new EngineTelemetrySampler();
        const telemetry = sampler.ingest('{bad json');

        expect(telemetry.frame_count).toBe(0);
        expect(sampler.getSignal().pressureScore).toBe(0);
    });
});
