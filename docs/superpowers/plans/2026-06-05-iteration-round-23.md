# AGI-miniGame 迭代计划 (2026-06-05, 第 23 轮)

> **目标**: 把 round 22 留下的"可观测但不影响"反射缺口补上 —
> `NpcRegistry::average_disposition()` 不再只出现在 HUD log 中，
> 而是真正驱动下一张次元的 `difficulty_range` 与 `preferred_types`，
> 让 PRD §2.2C 平衡 AI 与 §2.2D 智能 NPC 真正"咬合"。

## 上下文 (Round 22 收尾)

- ✅ Round 22 加了 `BalanceTuner::suggest_difficulty_with_mood` + TS 镜像
- ✅ `enterNewDimension` 在 HUD log 写一行 `[平衡] NPC 平均情绪 ... → 难度 ±X.XX`
- ✅ NpcMindPanel 加了"→ 影响下次难度"预览
- ❌ 反射信号**只是被打印**，从未真正进入 `bridge.planAndLoad` 的 `generationCfg`
- ❌ scene generation 的 difficulty_range / preferred_types 仍按静态 `[0.3, 0.8]` 跑

## 本轮要做

### Engine (cocos4-rust)

**新文件** `src/agi_minigame/scene_gen.rs` (~250 行 + 12 测试)

- `pub struct GenerationHint { min_atoms, max_atoms, reward_multiplier, base_difficulty_range: (f32, f32) }`
- `pub fn build_generation_config_with_mood(level, losses, mood, hint, seed) -> GenerationConfig`
  - **difficulty_range 调整**:
    - `fear > 0.5` → `hi -= 0.05` (世界已经够恐怖了)
    - `friendly > 0.5 && trust > 0.3` → `lo += 0.05` (受人爱戴，加大挑战)
    - `friendly < -0.3` → `lo -= 0.05` (被厌恶，难度不解决问题)
    - 三个分支可叠加；clamp 进 `[0.1, 1.0]`；维护 `lo ≤ hi`
  - **preferred_types 头部插入** (用 seed 决定二选一):
    - fear → `parkour` 或 `puzzle`
    - friendly+trust → `match3` 或 `synthesis`
    - hostile → `tower_defense` 或 `turn_combat`
  - **excluded_types** 镜像 TS: `recent_loss_count >= 3` → 排除 `Shooting`
  - **种子确定性**: 同 (level, losses, mood, hint, seed) → 字节级相同输出
- `pub fn mood_promoted_atoms(mood, seed) -> Vec<GameplayType>` — 单测可见
- `mod.rs` 加 `pub mod scene_gen;` 与 `pub use scene_gen::{...};`
- 12 单测覆盖 (1) neutral 等价 base (2) fear 降上界 (3) friendly+trust 升下界
  (4) hostile 降下界 (5) 三条件叠加 clamp (6) seed 确定性 (7) neutral 不前置
  (8) 极端 mood 不越界 (9) preferred_types 去重 (10) DEFAULT hint 字段
  (11) losses≥3 排除 shooting (12) losses<3 不排除

### Game (AGI-miniGame TS)

**新文件** `src/ai/SceneGen.ts` + `src/ai/SceneGen.test.ts`

- `interface GenerationHint` (与 Rust `GenerationHint` 字段一一对应)
- `const DEFAULT_GENERATION_HINT: GenerationHint` (与 Rust `Default::default()` 等价)
- `buildGenerationConfigWithMood(...)` — 字节级镜像 (f32 → Number 取 1e-5 容差)
- `moodPromotedAtoms(mood, seed)` — 用 mulberry32 复现 `rand::StdRng::seed_from_u64`
- 17 个 jest 镜像 (含 1 个集成: 3 个 gift broadcast 后 lower bound 抬升)

**扩展** `src/gameplay/AIBridge.ts`

- `BridgeConfig` 加 `mood?: NpcDisposition; seed?: number`
- `planAndLoad`:
  - 有 `mood` → 调 `buildGenerationConfigWithMood`
  - 无 `mood` → 维持原 `toGenerationConfig` (向后兼容)

**扩展** `src/main.ts:enterNewDimension`

- `bridge.planAndLoad` 调用多带 `mood: avgMood, seed: Date.now()`
- 当 mood 让 difficulty_range 偏离 base hint 时，HUD 写一行
  `[gen] mood → 难度带 [lo, hi]`

**扩展** `src/gameplay/AIBridge.test.ts` +3 集成测试

- neutral mood 与 no-mood 路径产出的 difficulty 都在 [0.3, 0.8]
- fear=0.8 → 30 次采样 difficulty 全部 ≤ 0.75
- friendly+trust → 30 次采样 difficulty 全部 ≥ 0.35

## 跨层契约

| 关注点 | 引擎层 (Rust) | 游戏层 (TS) |
| --- | --- | --- |
| `mood → difficulty bias` 阈值 / 系数 | ✅ canonical (Round 22) | 镜像 |
| `mood → preferred_types` 头部插入 | ✅ canonical (本轮) | 镜像 |
| `difficulty_range` nudge (±0.05) | ✅ canonical (本轮) | 镜像 |
| `clamp [0.1, 1.0]` | ✅ canonical | 镜像 |
| `GenerationHint` 字段 | ✅ canonical | 镜像 |
| Seed 选 atom 的决定性 | ✅ canonical (rand::StdRng) | 镜像 (mulberry32) |
| HUD 文字 / 面板 | ⛔ | ✅ |
| WASM 直连 | ⛔ (Round 24+) | TS 内自洽 |

## 验证

- `cargo test --lib agi_minigame::scene_gen` ≥ 12 测试全过
- `cargo test --lib agi_minigame` 全绿 (基线 154 + 12 新 = ≥166)
- `npx jest src/ai/SceneGen.test.ts` ≥ 17 测试全过
- `npx jest` 全套件 (基线 287 + 20 新 = ≥307)
- `npx tsc --noEmit` 0 errors
- 两仓分别 commit & push

## 后续 (Round 24+)

- WASM 绑定: `buildGenerationConfigWithMood` 切到 `wasm_exports.scene_gen`
- 跨存档持久化: `NpcRegistry.averageDisposition` + last `buildGenerationConfig` 进 `world_state`
- fail/abandon 真喂 `tuner.record_result(completed=false)` (vault.record 已有，下一步反喂)
- 难度推荐真正进入 WFC / Three.js 渲染参数 (theme color palette 与 mood 同步)
- NpcMindPanel 顶部加 "[gen] 已应用：难度带 [...]" 行 (颜色化, cyan/pink)
- HUD getter 重构: 去掉 `(this.hud as any).state` hack (Round 21 引入)
- 玩家行为 → NPC 反馈强化: 高难度通关后 broadcast 一条让 NPC "敬畏" 的 entry
