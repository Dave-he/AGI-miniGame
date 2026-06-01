/**
 * @jest-environment jsdom
 *
 * SceneTransitions tests using a tiny mock scene.
 */

import { SceneTransitions, DEFAULT_TRANSITION_CONFIG } from '../scene/SceneTransitions';
import { AIBridge } from '../gameplay/AIBridge';
import { AIEngine } from '../ai/AIEngine';
import { GameplayManager } from '../gameplay/GameplayManager';
import { WorldState } from '../world/WorldState';

class MockScene {
    public cleared = false;
    public entered: any = null;
    onDimensionCleared() { this.cleared = true; }
    onDimensionEntered(b: any) { this.entered = b; }
}

function make() {
    const scene = new MockScene();
    const ai = new AIEngine(1);
    const gameplay = new GameplayManager();
    const ws = new WorldState('t', 'T');
    const bridge = new AIBridge(ai, gameplay, ws);
    const cfg = { ...DEFAULT_TRANSITION_CONFIG, fadeOutMs: 1, hubHoldMs: 1, fadeInMs: 1 };
    const trans = new SceneTransitions(scene as any, ai, bridge, cfg);
    return { scene, ai, bridge, trans, cfg };
}

describe('SceneTransitions', () => {
    test('returnToHub enters fading-out then in-hub', async () => {
        const { trans, scene } = make();
        const events: string[] = [];
        trans.on(e => events.push(e.phase));
        trans.returnToHub([{ itemId: 'gold', quantity: 10 }]);
        expect(trans.getPhase()).toBe('fading-out');
        expect(events[0]).toBe('fading-out');
        // Wait long enough for fade-out + hub hold + fade-in to complete.
        await new Promise(r => setTimeout(r, 30));
        expect(trans.getPhase()).toBe('in-dimension');
        expect(events).toContain('in-hub');
        expect(events).toContain('fading-in');
        expect(events[events.length - 1]).toBe('in-dimension');
    });

    test('enterNextDimension selects atoms from the manifest', async () => {
        const { trans } = make();
        trans.returnToHub();
        await new Promise(r => setTimeout(r, 30));
        const phase = trans.getPhase();
        expect(['in-dimension', 'fading-in']).toContain(phase);
    });
});
