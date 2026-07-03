# Round 23 PRD — Reflexive Scene Generation (Reflex 难度真集成)

> **Selected** (round 23, 2026-06-05): 关闭 round 22 留下的"可观测但不影响"缺口 —
> NPC 集体情绪不再只是 HUD log，而是真正驱动下一张次元的难度带、推荐主题与备选 atom 池。

## 目标

把 `enterNewDimension` 升级为**真正反射式**的场景生成：NpcRegistry 集体情绪 → BalanceTuner bias → `toGenerationConfig` → 难度带 / 主题倾向 / 备选 atom 池动态调整，让"千人千面"在场景生成层落地。

## 用户故事

- As a **玩家**, I want 次元城在我**受人爱戴**时给出更刺激的挑战、在我**人见人怕**时主动降低难度，让游戏世界回应我的行为。
- As a **AGI 平衡模块**, I want 把"群体恐惧度"作为生成参数喂给 `to_generation_config`，让单点规则（`difficulty = 0.3 + level * 0.05`）升级为上下文敏感函数。
- As a **内容生成 AI**, I want 在 NPC 高度恐惧时倾向生成"阴森"主题、在群体友善时倾向"活力"主题，让美术与情绪同步。
- As a **测试工程师**, I want 引擎层新增的 8-10 个单测覆盖所有阈值 / 叠加 / clamp / 主题切换方向，TS 镜像测试同形 1:1。

## 引擎层职责 (cocos4-rust)

- **新文件** `src/agi_minigame/scene_gen.rs` (~120 行)
  - `pub fn build_generation_config_with_mood(
      base_player_level: u32,
      recent_loss_count: u32,
      mood: &NpcDisposition,
      hint: &GenerationHint,
  ) -> GenerationConfig`
  - `GenerationHint { min_atoms, max_atoms, reward_multiplier, base_difficulty_range: (f32, f32) }`
  - 内部：先调 `to_generation_config(base_player_level, recent_loss_count, hint)`，再 `BalanceTuner::suggest_difficulty_with_mood(base_player_level, mood)` 覆盖 difficultyRange 中心，最后按 mood.fear / mood.friendly 在 `preferredTypes` 端做 soft 主题倾向（见下"主题倾向"）。
- **扩展** `src/agi_minigame/ai_engine.rs`
  - `GenerationConfig::with_mood_bias(&mut self, mood: &NpcDisposition)` —— 让 `ai_engine` 拥有该方法（与 `scene_gen.rs` 的纯函数等价，但是为 EngineTypeBridge 暴露）。
- **主题倾向规则**（canonical，Rust 侧定义）
  - `mood.fear > 0.5` → 在 `preferredTypes` 前置 `parkour`（逃跑感）或 `puzzle`（安静）之一，由种子选其一；同时 `difficultyRange` 上限下调 0.05。
  - `mood.friendly > 0.5 && mood.trust > 0.3` → 前置 `match3` 或 `synthesis`（合作/收集），下限上调 0.05。
  - `mood.friendly < -0.3` → 前置 `tower_defense` 或 `turn_combat`（对抗感），下限下调 0.05。
  - `excludedTypes` 保持不变（不动 PRD §2.2C "无敌组合"约束）。
- **测试** `#[cfg(test)] mod tests` in `scene_gen.rs`
  1. neutral mood：与 `to_generation_config` 等价（bit-identical，差 0）。
  2. fear>0.5 单条件：difficultyRange 上限 ≤ 0.80（hint 上限），preferredTypes 头部出现 parkour/puzzle。
  3. friendly>0.5 && trust>0.3 单条件：下限 ≥ 0.30（hint 下限），preferredTypes 头部出现 match3/synthesis。
  4. friendly<-0.3 单条件：下限 ≤ 0.30，preferredTypes 头部出现 tower_defense/turn_combat。
  5. 三条件同时叠加：clamp 后 [0.1, 1.0]，preferredTypes 头部按规则排序。
  6. 极端 mood (fear=1.0)：difficultyRange 上限确实被压低，且 preferredTypes 列表顺序确定（同一 mood 同一 seed → 同顺序）。
  7. seed 确定性：相同输入 + 相同 seed → 完全相同 GenerationConfig（serde_json 一致）。
  8. 不破坏 base：当 mood 各字段全为 0 时，输出与 `to_generation_config` 字节级一致。
  9. clamp 边界：mood 推升超过 1.0 时不越界，difficultyRange 上限被截到 1.0。
  10. preferredTypes 去重：if 同一 atom 同时被两条规则选中，去重不重复。
- **EngineTypeBridge** 不动（这一轮 `mood_bias` 数值不进 `Rule` 序列化）。

## 游戏层职责 (AGI-miniGame)

- **新文件** `src/ai/SceneGen.ts`（TS 镜像，~80 行 + 镜像测试）
  - `buildGenerationConfigWithMood(...)` 与引擎严格对称。
  - `export function applyMoodToPreferredTypes(types: string[], mood: NpcDisposition, seed: number): string[]`
  - jest 镜像测试：10 个，与 Rust 单测 1:1 同形。
- **扩展** `src/ai/AIEngine.ts`
  - `BalanceTuner.prototype.toGenerationConfigWithMood(level, recentLoss, hint, mood)` 委托给 `SceneGen.buildGenerationConfigWithMood`。
  - `BalanceTuner.prototype.applyMoodToPreferredTypes(types, mood, seed)` 委托给 `SceneGen.applyMoodToPreferredTypes`。
- **扩展** `src/gameplay/AIBridge.ts`
  - `BridgeConfig` 加 `mood?: NpcDisposition`（可选，向后兼容）。
  - `planAndLoad(cfg)`：如果 `cfg.mood` 存在，调 `toGenerationConfigWithMood(...)`；否则维持现状。
- **扩展** `src/main.ts`
  - `enterNewDimension` 把 `this.npcMinds.averageDisposition()` 传给 `bridge.planAndLoad({ ..., mood: avgMood })`。
  - HUD log 增加 `[gen] mood → 难度带 [0.42, 0.72] / 主题倾向 [match3, parkour, ...]` 一行（仅在 mood 非 neutral 时打）。
- **测试** `src/ai/SceneGen.test.ts`（10 个镜像）+ `src/gameplay/AIBridge.test.ts` 增加 2-3 个集成测试（mood 传入路径）。

## 集成点

- `main.ts:enterNewDimension`：在 `bridge.planAndLoad` 之前已经算好 `avgMood`，新增调用 `bridge.planAndLoad({ playerLevel, mood: avgMood })`。
- HUD：`renderAllPanels()` 不变；新加一行条件 log。
- NpcMindPanel：现有"→ 影响下次难度"预览保留，新增"→ 已应用：难度带 [X, Y]"小行（颜色与之前一致，cyan/pink）。

## 验收标准

每条都对应一个可观察的测试或文件位置：

- [ ] AC1 — `cargo test --lib agi_minigame::scene_gen` 至少 10 个测试全过。
- [ ] AC2 — `cargo test --lib` 整个 `agi_minigame` 套件全过（基线 154 + ≥10 新增 = ≥164）。
- [ ] AC3 — `npx jest` 全套件全过（基线 287 + ≥12 新增 = ≥299）。
- [ ] AC4 — `npx tsc --noEmit` 0 错误。
- [ ] AC5 — `AIBridge.planAndLoad({ playerLevel, mood })` 与 `planAndLoad({ playerLevel })` 在 neutral mood 下产出**字节级**相同 `GenerationConfig`（写一个 jest 断言）。
- [ ] AC6 — `enterNewDimension` 在 `mood.fear=0.8, friendly=0, trust=0` 时，HOC log 出现 `[gen] mood → 难度带 [...]` 且上限 < 0.80（在 main.ts 测试中通过 mock hud.log 验证）。
- [ ] AC7 — `applyMoodToPreferredTypes(['match3','tower_defense','card'], fear=0.8, seed=42)` 在两次调用下产生相同结果（seed 确定性）。
- [ ] AC8 — `npcMinds.averageDisposition()` 在 `broadcast(HeardAbout, weight=+0.6)` 三次后 friendly 由 0 升到 ≥0.5，再 `planAndLoad` 输出下限提升（端到端集成测试）。
- [ ] AC9 — 引擎 / 游戏两侧的 `mood → difficulty` 系数完全一致（同一 mood 同一 level 下 Rust 浮点结果与 TS 浮点结果差 ≤ 1e-6）。
- [ ] AC10 — 文档 `docs/superpowers/plans/2026-06-05-iteration-round-23.md` 写好，含本轮目标和历史回溯。

## 实现难度

**M** (3-5h)

- 引擎层: 1.5h（结构 + 10 测试）
- 游戏层: 1.5h（TS 镜像 + jest）
- 集成: 0.5h（main.ts + AIBridge + log）
- 文档: 0.5h

## 风险

- **R1 — preferredTypes 顺序与 ATOM_MANIFEST 兼容**：`applyMoodToPreferredTypes` 头部插入可能与 `excludedTypes` 冲突 → 测试覆盖排除场景，且 `filteredPreferred` 之后才应用 mood。
- **R2 — TS 浮点与 Rust 浮点可能略有差异** → AC9 用 `1e-6` 容差；不为强一致，但绝不能 > 1e-4。
- **R3 — DimensionGenerator 对 difficultyRange 极度敏感** → 范围变化 ±0.05 不应让生成质量崩塌；端到端冒烟跑 1 个 seed 确认 blueprint.difficulty 仍 ∈ [0.1, 1.0]。
- **R4 — 回归**：`planAndLoad` 调用方除 `enterNewDimension` 外可能还有 0 个；但 `testAIBridge` / `testIntegration` 都假设无 mood → 全部必须通过。
- **R5 — 浮点累加偏差**：`mood_bias` 已经是 `f32`；TS 端用 `Number`，**只在序列化点** `Number(x).toFixed(6)` 再 parseFloat 与 Rust 对齐；日常逻辑容忍 1e-6。
