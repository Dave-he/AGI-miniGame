# AGI-miniGame 技术架构文档

> **版本**: 2026-06 — 历经 4 轮迭代后的实现状态。
> **范围**: 描述 `src/` (TypeScript 游戏层) + `src/dsl/*` (Rust WASM DSL)
> + 镜像到 `cocos4-rust/src/agi_minigame/dsl/*` (引擎层) 的代码。

## 项目概述

**AGI-miniGame** 是基于 **cocos4-rust** 引擎构建的 AGI 实验性小游戏平台。已
实现 PRD §2 的全部核心能力：3D 世界模型驱动场景生成、独立组件模块、由 4
大 AI 中枢（玩法组合 / 内容生成 / 平衡 / 智能世界）驱动的统一体验层。游戏
采用 Rust + WASM（cocos4-rust）作为底层 ECS / 物理 / DSL 解释器，前端
Three.js 负责 3D 渲染，TypeScript 负责业务逻辑、UI、AI 编排与 LLM 协议。

### 当前实现架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         体验层 (TypeScript)                          │
│  App  ─  SceneManager  ─  HUD  ─  ProgressionUI  ─  EconomyPanel   │
│                  ─  EpochPanel  ─  TutorialOverlay                │
│  玩家与 NPC 互动的"无限次元城"主舞台                                 │
├──────────────────────────────────────────────────────────────────────┤
│                       AI 中枢 (TypeScript)                          │
│  AIEngine                                                              │
│  ├─ GameplayCombinerAI   (基于阶段 + 历史选玩法组合)                  │
│  ├─ ContentGeneratorAI   (主题名 / art 提示 / BGM 提示 / 剧情)        │
│  ├─ BalanceTuner         (调参 / 难度历史)                          │
│  └─ SmartWorldAI         (世界事件 + NPC 台词)                       │
│  + NPCDialogueAI         (基于人格 × 话题的对话 + 记忆)                │
│  + MockAigcBackend       (SD / Midjourney / Suno / LLM 占位)         │
├──────────────────────────────────────────────────────────────────────┤
│                       桥接层 (TypeScript)                            │
│  AIBridge.planAndLoad()  ─  GameplayManager.loadGameplay()          │
│  把 AI 推荐的 atom 组合映射到已注册的 TS 玩法模块                       │
├──────────────────────────────────────────────────────────────────────┤
│                  玩法模块 (TypeScript, 独立可热加载)                   │
│  Match3Module  ·  TowerModule  ·  CardModule  ·  ParkourModule       │
│  PuzzleModule  ·  SynthesisModule                                   │
├──────────────────────────────────────────────────────────────────────┤
│                  统一世界与纪元 (TypeScript)                          │
│  WorldState  ·  Progression  ·  EpochSystem  ·  SaveSystem           │
├──────────────────────────────────────────────────────────────────────┤
│                      DSL 层 (TypeScript + Rust)                      │
│  MemeCompiler.ts    (TS: 拼 prompt / 解析 / 离线 fallback)           │
│  parser.rs          (Rust: 真正的递归下降解析器)                     │
│  HotReloadController (4 阶段编译 / 护盾 / 限流)                     │
│  DslExecutor        (Spawn / Damage / Heal 实时应用到 3D 场景)        │
├──────────────────────────────────────────────────────────────────────┤
│                      场景层 (Three.js)                                │
│  SceneManager: 地面 / 星空 / 8 立方体传送门 / WFC 迷你地牢 / NPC 实体 │
├──────────────────────────────────────────────────────────────────────┤
│                      引擎层 (cocos4-rust, Rust)                      │
│  agi_minigame::dsl    (镜像 TS 端的 DSL 解析器)                     │
│  agi_minigame::atoms  (6 个原子: match3 / tower / card / parkour      │
│                       / turn_combat / synthesis)                      │
│  agi_minigame::ai_engine  (DimensionGenerator, RuleComposer,          │
│                            BalanceTuner)                              │
│  agi_minigame::dimension  (DimensionRunner / load / start / update)  │
│  agi_minigame::world_state (UnifiedWorldState, PlayerProfile)        │
│  agi_minigame::economy     (Currency, Inventory, Wallet)            │
│  agi_minigame::gameplay    (GameplayType, GameplayState)            │
│  core / scene / renderer / physics / input / audio / asset_manager    │
└──────────────────────────────────────────────────────────────────────┘
```

## 数据流：玩家从"无限次元城"触发一次"模因突变"

```
玩家在无限次元城        4 大 AI 中枢                 引擎层
  │                         │                              │
  │ 进入"编译槽"           │                              │
  ├────────────────────────>│                              │
  │                         │ 1. GameplayCombinerAI         │
  │                         │    选玩法组合                 │
  │                         │ 2. ContentGeneratorAI         │
  │                         │    出主题 + art/BGM prompt   │
  │                         │ 3. SmartWorldAI               │
  │                         │    触发世界事件                │
  │                         │                              │
  │ 点击"模因→DSL"         │ 4. (前端) MemeCompiler       │
  │                         │    拼 prompt → LLM → DSL     │
  │                         │ 5. HotReloadController       │
  │                         │    compiling → shielded      │
  │                         │    → applied                 │
  │                         │                              │
  │                         │ 6. DslExecutor               │
  │                         │    真正向 3D 场景生成/伤害/   │
  │                         │    治疗                       │
  │                         │ 7. EpochSystem.addRule()     │
  │                         │    当规则累积到 8 条触发     │
  │                         │    "大坍缩" 进入新纪元       │
  │                         │                              │
  │ 通关或失败              │ 8. SaveSystem 自动存档        │
  ├────────────────────────>│    30s tick                  │
  │                         │                              │
```

## 核心模块（TypeScript 端）

### 1. 4 大 AI 中枢 (`src/ai/AIEngine.ts`)

| AI | 类 | 职责 | 入参 | 出参 |
|---|---|---|---|---|
| A. 玩法组合 | `GameplayCombinerAI` | 玩家阶段 / 战况 → 推荐 atom 组合 | level, recentLossCount | `CombinationSuggestion` |
| B. 内容生成 | `ContentGeneratorAI` | 阶段 + atom 列表 → 主题 / 提示词 | stage, atoms, difficulty | `ThemeContent` |
| C. 平衡调参 | `BalanceTuner` | 历史通关率 → 建议难度 | playerLevel, history | `number` |
| D. 智能世界 | `SmartWorldAI` | 玩家状态 → 事件 + NPC 台词 | level, lossCount | `WorldEventDraft` |

外加：

- `NPCDialogueAI`：6 种人格 × 7 话题，per-NPC 记忆（最多 16 轮）。
- `MockAigcBackend`：SD / Midjourney / Suno / LLM 的确定性占位（id 由 hash
  (prompt, seed) 派生，方便缓存）。

### 2. 玩法模块 (`src/gameplay/GameplayManager.ts`)

每个玩法实现 `GameplayModule` 接口（`load / update / pause / resume /
unload / getScore`）：

| Atom ID | 模块 | 状态 |
|---|---|---|
| `match3`        | `Match3Module`     | 8×8 棋盘，自动无初始匹配（修复后） |
| `tower_defense` | `TowerModule`      | 路径 + 塔放置 + 怪物波次 |
| `card`          | `CardModule`       | 9 张卡 × 4 稀有度，能量 + 抽牌 + 弃牌 |
| `parkour`       | `ParkourModule`    | 距离 + 金币 + 速度 |
| `puzzle`        | `PuzzleModule`     | 步数 + 目标状态 |
| `synthesis`     | `SynthesisModule`  | 11 个合成配方 × 5 阶 |

`AIBridge.planAndLoad()` 调用 `GameplayManager.loadGameplay()` 来热加载选
中的组合。

### 3. 统一世界 (`src/world/`)

- **`WorldState`**：玩家档案 + 钱包 + 背包 + 进行中次元 + 历次元记录。
- **`EpochSystem`**：PRD §3 的"纪元更迭"。规则累积到 8 条触发"大坍缩"，
  半数规则压缩为 `HistoricalRelic`（buff / debuff）永久影响后续。
- **`SaveSystem`**：v1 完整快照（world + epoch + progression + AI 历史），
  30s 自动存档到 localStorage。
- **`WfcLevelGen`**：6 瓦片 WFC，连接性由 `carveCorridor` 后处理保证。

### 4. DSL 流水线 (`src/dsl/`)

```
玩家碎片 (Meme[])
   ↓ combineMemes()        ──>  LLM prompt
   ↓ (LLM call, real or mock)
DSL 字符串  ──> parseDSL()  ──>  DslRule
                              ├─> HotReloadController  ──>  DslExecutor
                              │   (compiling 600ms +
                              │    shielded 800ms +
                              │    rate-limited 3/s)
                              └─> toEngineJSON()        ──>  cocos4-rust WASM
```

`HotReloadController` 实现 PRD §5 风险 1 的缓解：动画掩盖网络延迟。

### 5. 3D 场景 (`src/scene/SceneManager.ts`)

- 8 立方体传送门，按 atom 着色，当前次元门高亮。
- 星空 + 地面 + 网格背景。
- `spawnEntity(id, label)`：DSL 触发的实体浮现 4 秒。
- `spawnFloatingText(text, color)`：Damage / Heal 飘字。
- `spawnNpc(id, name) + setNpcDialogue()`：NPC 胶囊 + 头顶对话框。
- `renderWfcDungeon(grid)`：把 WFC 输出渲染为迷你 3D 地牢。
- 摄像机环绕轨道 + 实体淡出回收。

### 6. UI (`src/ui/`)

- **`HUD.ts`**：统计 + 当前次元 + 控制台日志。
- **`ProgressionUI.ts`**：XP 进度条 + 升级横幅 + 天赋树（8 天赋，含前置
  关系）。
- **`EconomyPanel.ts`**：通用货币（金币 / 钻石 / 体力）+ 玩法专属代币
  + 背包。
- **`EpochPanel.ts`**：当前纪元 + 活跃规则 + 历史遗迹 + 大坍缩按钮。

## 引擎层（cocos4-rust）

### 已交付
- `agi_minigame::dsl` — 镜像 TS 端的 DSL 解析器与 AST，8 个单元测试。
- `agi_minigame::atoms` — 6 个原生游戏原子（match3 / tower_defense / card
  / turn_combat / parkour / synthesis），每个 200~500 行。
- `agi_minigame::ai_engine` — `DimensionGenerator`, `RuleComposer`,
  `BalanceTuner`。
- `agi_minigame::dimension` — `DimensionRunner` 与 `Dimension`（load / start
  / update / pause / resume / complete / fail 状态机）。
- `agi_minigame::world_state` — `UnifiedWorldState`, `PlayerProfile`。
- `agi_minigame::economy` — `Currency`, `Inventory`, `Wallet`。
- `agi_minigame::gameplay` — `GameplayType`, `GameplayState`, `GameplayEvent`。
- 核心：`core / scene / renderer / physics / input / audio / asset_manager`。
- `src/game/game.rs` — Cocos4 引导脚本（modern-systemjs 兼容）。

### 与游戏层的契约
- 镜像 DSL：双方可独立解析同一字符串（语法完全一致）。
- `register_all_atoms(registry)`：TS 端 `AIBridge.ATOM_MANIFEST` 是该注册
  表的镜像。
- 一旦 WASM 绑定接上 `AIBridge`，将 `loadFromManifest()` 替换为对
  `wasm_exports.atom_registry_ids()` 的调用即可。

## 已知边界 / 后续工作

- **真实 LLM 调用**：当前 `combineMemes()` 生成 prompt 后由
  `compileFallback()` 给出确定性结果；接入真实 LLM 时只需替换
  `main.ts` 的 `hotReloadFromMemes`。
- **真实 AIGC 资产**：`MockAigcBackend` 返回结构化 stub；接入 SD / Suno
  时只需替换 `call()` 实现。
- **多人 / 联机**：当前纯单机；`WorldEventDraft` 的设计已留出同步接口。
- **3D 实体 ↔ cocos4-rust 绑定**：`SceneManager` 当前直接用 Three.js；待
  WASM 绑定完成后可桥接到 `EntityRenderData` 通道。
