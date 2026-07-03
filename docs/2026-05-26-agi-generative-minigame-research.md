# AGI Generative Minigame Research Notes

Date: 2026-05-26

## Sources Checked

- Procedural Content Generation via Machine Learning (PCGML): https://arxiv.org/abs/1702.00539
- Procedural Content Generation in Games with LLM integration: https://arxiv.org/abs/2410.15644
- Adapting PCG to Player Personas Through Evolution: https://arxiv.org/abs/2112.04406
- Experience-Driven Procedural Content Generation: https://yannakakis.net/wp-content/uploads/2019/02/EDPCG.pdf
- A Vision for Continuous Automated Game Design / ANGELINA: https://arxiv.org/abs/1707.09661
- Procedural Content Generation Benchmark for quality, diversity, and controllability metrics: https://arxiv.org/abs/2503.21474
- Dynamic Difficulty Adjustment in Virtual Reality Exergames through Experience-driven PCG: https://arxiv.org/abs/2108.08762
- Experience Management in Multi-player Games: https://ieee-cog.org/2020/papers2019/paper_218.pdf
- Left 4 Dead AI Director dynamic pacing reference: https://developer.valvesoftware.com/wiki/Info_director
- Model as a Game: On Numerical and Spatial Consistency for Generative Games: https://www.microsoft.com/en-us/research/publication/model-as-a-game-on-numerical-and-spatial-consistency-for-generative-games/
- MaaG summary, especially explicit numerical logic and spatial memory: https://www.microsoft.com/en-us/research/articles/maag-a-new-framework-for-consistent-ai-generated-games/?lang=ja
- Fly, Fail, Fix: Iterative Game Repair with Reinforcement Learning and Large Multimodal Models: https://research.nvidia.com/publication/2025-08_fly-fail-fix-iterative-game-repair-reinforcement-learning-and-large-multimodal
- A modular framework for automated evaluation of PCG with deep reinforcement learning agents: https://arxiv.org/abs/2505.16801
- Playing the Imitation Game: How Perceived Generated Content Shapes Player Experience: https://arxiv.org/abs/2602.14254
- InSpatio-WorldFM real-time generation with explicit 3D anchors and spatial memory: https://arxiv.org/abs/2603.11911
- StableWorld dynamic frame eviction against long-horizon drift: https://arxiv.org/abs/2601.15281
- WorldCam camera pose as geometric representation for long-horizon 3D consistency: https://arxiv.org/abs/2603.16871
- Playing the Imitation Game / perceived generated content and aesthetic judgement: https://arxiv.org/abs/2602.14254
- Complexity and aesthetics in generative and evolutionary art: https://link.springer.com/article/10.1007/s10710-022-09429-9
- Mixed-initiative PCG with diversity/entropy quality evaluation: https://www.sciencedirect.com/science/article/abs/pii/S1875952124001277
- Procedural Content Generation via Generative Artificial Intelligence survey: https://www.jstage.jst.go.jp/article/iis/advpub/0/advpub_2026.R.01/_article/-char/en
- Agentic PCG: Procedural Content Generation via Tool-using LLMs: https://papers.ssrn.com/sol3/Delivery.cfm/6499021.pdf?abstractid=6499021&mirid=1&type=2
- Runtime Evaluation of PCG in an Endless Runner Using Autonomous Agents: https://arxiv.org/abs/2605.01783
- Grounding Machine Creativity in Game Design Knowledge Representations: https://arxiv.org/abs/2603.07101
- PCGRLLM reward design for PCG reinforcement learning: https://arxiv.org/abs/2502.10906
- From World-Gen to Quest-Line dependency-driven prompt pipeline: https://arxiv.org/abs/2604.25482
- Steamworks AI content survey, especially live-generated guardrails: https://partner.steamgames.com/doc/gettingstarted/contentsurvey

## Takeaways Applied In This Iteration

1. PCG should generate more than geometry. AGI-miniGame scenes now carry module combinations, visual prompts, story text, difficulty bias, content hash, and lifecycle metrics.
2. Player modelling should steer generation. The new scene lifecycle layer accepts `PlayerSceneProfile` with preferred modules, avoided modules, novelty bias, and aesthetic taste.
3. Generated content needs evaluation loops. Scene hotness now combines recency, utilization, revisit rate, completion rate, play depth, and aesthetic score.
4. "Use it or lose it" should be gradual. Scenes first enter `gray` rollout with a warning, then retire only after the grace window.
5. Revisit should revive content. Any visit to a `gray` or `retired` scene reopens it and restores rollout.
6. Live-generated content needs guardrails. `ContentGeneratorAI` now emits guardrail strings for generated scenes.
7. Continuous automated game design should support iteration, not just one-shot generation. The scene pool is therefore persisted and re-evaluated over time instead of being discarded on reload.
8. PCG evaluation should track quality, diversity, and controllability. Current tests cover lifecycle quality gates, player preference control, and scene pool persistence; next iterations should add diversity scoring across generated scene histories.
9. Generated rules should be executable, not only descriptive. `RuleCompiler` now converts AGI rules such as `speed_boost`, `dense_spawns`, `chain_bonus`, `aesthetic_focus`, and `revival_bonus` into module runtime parameters.
10. The rule execution boundary stays in the game layer: AI rules tune gameplay module parameters, while the Rust/WASM engine continues to expose generic entity and render APIs.
11. Telemetry-driven adaptation needs an engine-to-game feedback channel. `GameEngine.get_telemetry_json()` now exposes generic frame, entity, collision, spawn, and speed metrics; `EngineTelemetrySampler` converts those into pressure/activity signals consumed by scene lifecycle scoring.
12. This follows the AI Director / Experience Manager pattern: the runtime observes play signals, then the game layer adjusts pacing, lifecycle, and generation policy.
13. Generative games need consistency checks, not just attractive frames. `ContentGeneratorAI` now emits guardrails for numerical consistency, spatial continuity, and rule readability, following the MaaG framing.
14. Automated repair research suggests closing the loop with traces. `SceneDirector` now consumes lifecycle plus runtime telemetry to route high-pressure play into calmer modules and to recommend gray-scene rescue.
15. Player perception of generated content matters. The UI now exposes generated scenes as `AGI 策展生成` with consistency checks and an aesthetic promise, making generation feel curated instead of arbitrary.
16. Multi-player experience management should not force one global scene feed. `SceneDirector.planForPlayer()` creates per-player routes from preference, novelty, pressure, and scene decay state.
17. Spatial memory can be approximated in the current engine by explicit anchors. `SceneWorldBuilder` now compiles each AGI scene into deterministic memory anchors, landmarks, background layers, and spawn plans from `contentHash` and player identity.
18. Scene switching needs a clean simulation boundary. The Rust/WASM engine now exposes `reset_scene_entities()` as a generic runtime operation, while the game layer decides what AGI scene should be rebuilt next.
19. Long-running generated worlds need drift control. Resetting non-terrain entities between generated scenes is the current lightweight equivalent of frame/scene eviction: old scene state stops accumulating into the next generated world.
20. Aesthetic quality should be computed as a coarse design signal, not treated as objective truth. `SceneAestheticSystem` scores readability, coherence, contrast, novelty, and stability, then still keeps player-facing voting available through lifecycle metrics.
21. Perception research suggests generated content needs curated framing. The UI now shows `审美定理评估` and strengths/warnings so AGI output is presented as intentionally curated rather than arbitrary.
22. PCG quality/diversity research maps well to scene operations. The current evaluator uses module variety, spatial anchor spread, landmark coverage, and density fit as lightweight proxies for expressive range and play readability.
23. Generated quests need explicit conditions and rewards, not just text. `SceneObjectiveSystem` now compiles each AGI scene into survival, spatial-stability, pressure-control, and score objectives.
24. Runtime evaluation should happen while the player is inside generated content. Scene objectives consume engine telemetry, gameplay score, and elapsed time every frame, then record lifecycle completion when mandatory goals pass.
25. Reward design is part of the generated loop. Objective completion now pays unified wallet currencies, player experience, gameplay history, and lifecycle completion metrics through game-layer code.

## Engine vs Game Boundary

Engine layer, owned by `/home/hyx/codespace/cocos-engine/cocos4-rust` or the Rust/WASM runtime in this repo:

- ECS entity storage and update loop.
- Physics, collision, bounds, and render data extraction.
- Stable JS/WASM APIs such as `GameEngine.add_entity()`, `get_render_data()`, telemetry, and generic scene-entity reset.
- Rendering/input/audio primitives when provided by the engine binding.

AGI-miniGame game layer, owned by TypeScript/frontend code:

- AGI scene generation prompts, story, module combinations, and rule directives.
- World state, economy, player profile, progression, and scene lifecycle policies.
- Hotspot planning, gray rollout, retirement, and revisit recovery.
- Per-player scene director recommendations, rescue routing, and generated-content exposure copy.
- Deterministic scene-world planning from AGI scene records into anchors, landmarks, palettes, and entity spawn plans.
- Aesthetic theorem evaluation for generated scene readability, coherence, contrast, novelty, and stability.
- Generated objective chains, completion checks, reward payout, and gameplay history recording.
- UI panels, telemetry display, and Three.js presentation choices.
- Game-specific module adaptation to the engine API.

The current code changes stay in the game layer. `ShooterModule` was updated to call the existing engine API (`add_entity`) instead of expecting a game-specific `spawn_enemy` engine function.
