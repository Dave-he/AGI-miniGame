# AGI-miniGame 技术架构文档

> **版本**: 2026-06-05 — 历经 20 轮迭代后的实现状态。
> **范围**: 描述 `src/` (TypeScript 游戏层) + `src/dsl/*` (Rust WASM DSL)
> + 镜像到 `cocos4-rust/src/agi_minigame/dsl/*` (引擎层) 的代码。

## rounds 20 新增 (本轮)

- **DimensionVault 引擎层** (`cocos4-rust/src/agi_minigame/vault.rs`)：
  AGI 的"次元记忆"。bounded ring (default 64) + `record / recent /
  lastOutcomeFor / suggestNext / recentThemes / stats / clear`。
  `suggest_next` 在候选池里挑出最近 `avoid_window` 次访问中未出现
  的蓝图，全部出现时回退到"最久未访问"的选择（确定性
  seed-tiebreaker）。13 个单元测试覆盖所有 API 与边角。
- **DimensionVault 游戏层** (`src/world/DimensionVault.ts`)：与引擎
  API 严格对称的 TS 镜像，便于将来切换到 WASM-backed 实现。
  14 个 jest 镜像测试。
- **VaultPanel** (`src/ui/VaultPanel.ts`)：纯渲染面板，列出最近
  8 个次元访问与统计（容量/主题数/通关率）。`App` 在
  `enterNewDimension()` 里 `vault.record(blueprint, 'completed', now)`，
  并把 `[vault] 记忆: N 次访问 / M 主题 / 通关率 X%` 写进 HUD log。
- **cocos4-rust bug 修复**：`BalanceTuner::suggest_difficulty` 在
  历史为空时的早返回路径没 clamp，导致 level≥15 时返回值 > 1.0。
  补 clamp 到 `[0.1, 1.0]`。

## rounds 16-19 新增 (本轮)

- **NpcFactory 真正驱动 App** (`src/main.ts`)：3 个硬编码 NPC 替换
  为 `NpcFactory.generateRoster({ count: 5, seed: Date.now() })`。
- **Benchmark 套件** (`src/bench/Benchmark.test.ts`)：4 个软 SLA 测试
  (AI 维度生成 / DSL 解析 / DslExecutor 应用 / EpochSystem 转场)，
  防止跨迭代性能回归。
- **NarrationEngine** (`src/narration/NarrationEngine.ts`)：每个次元进入
  时生成 3 句开场白（5 opener × 5 mood × 5 call = 75 种组合），
  djb2-seeded 决定论 — 同一 id 永远相同句子。`src/main.ts` 的
  `enterNewDimension()` 现在调用它并把 3 句播到 HUD log。
- **迭代计划文档** (`docs/superpowers/plans/2026-06-01-iteration-round-17.md`)：
  捕获 round 17 的目标和 1-16 轮历史。
- **Git 远程** (`AGI-miniGame.git` bare repo at `/Users/hyx/workspace/`)：
  AGI-miniGame 终于有了可用的 push 目的地。
- **cocos4-rust DSL 边角案例**（6 个新测试）：负数、小数、空字符串、
  Unicode 标识符、负数 Heal 参数、超量空白。

## rounds 12-14 新增 (本轮)

相对 round 11，rounds 12-14 新增了：

- **PlayerHealth** (`src/player/PlayerHealth.ts`)：HP 池 (100) +
  takeDamage / heal / kill / reviveToFull。HP=0 触发
  `epochTriggerCollapse()` 并在新纪元以 1 HP 复活，叙事上把玩家
  之死与「纪元更迭」绑定。
- **SessionReplay** (`src/analytics/SessionReplay.ts`)：bounded
  ring (200 事件) + 确定性回放，支持 speed 0 (即时) / 1 (实时) / 4
  (4 倍速)。
- **DmMode** (`src/dm/DmMode.ts`)：玩家作为创世者的 DM 指令解析
  (spawn npc / rule / event / dim)，pluggable handlers，bounded
  history，handler 异常捕获。
- **GodConsole** (`src/ui/GodConsole.ts`)：DM 模式下的 prompt + 历
  史面板 UI；通过 `btn-god` 切换显示。
- **App 集成** (`src/main.ts`)：PlayerHealth / DmMode / SessionReplay /
  GodConsole 真正接入 App loop。HP 在 HUD log 体现，DM 命令
  通过 SceneManager / HotReloadController 立即生效。

## rounds 10-11 回顾

相对 round 9，rounds 10-11 新增了 SettingsPanel / EngineAtomManifest /
真实 Match3 玩法 / 按生物群系 WFC 渲染 / Match3Bridge 等。详见
`docs/superpowers/plans/` 中的历史 plan。

## 与 9 轮迭代版的差异 (rounds 10-12 新增)

相对 round 9 版本，rounds 10-12 新增了：

- **SettingsPanel** (`src/ui/SettingsPanel.ts`)：音效静音、难度选择
  (简单/普通/困难)、语言切换。
- **EngineAtomManifest** (`src/gameplay/EngineAtomManifest.ts`)：6 个
  cocos4-rust agi_minigame 原子的 TS 端类型化清单，是引擎 ↔ 游戏的
  契约。
- **真实 Match3 游戏循环** (`Match3Module.findMatches` + `cascade`)：
  完整的连锁消除 + 重力 + 重生 + 评分。
- **WFC 按生物群系渲染**：`SceneManager.renderWfcDungeon(grid, biome?)`，
  `WfcBiomes` 提供 6 套主题色板。
- **Match3Bridge** (`src/gameplay/Match3Bridge.ts`)：2D 模块棋盘与 3D
  立方体网格的双向同步。
- **StatsPanel 实时刷新** + 1s 间隔 `uptime` 更新。
- **FeedbackService** (`src/feedback/FeedbackService.ts`)：玩家反馈 →
  Analytics 事件。
- **EndlessMode** (`src/world/EndlessMode.ts`)：通关后自动进入下一个
  次元，难度随 step 递增，可暂停。
- **EngineTypeBridge** (`src/engine/EngineTypeBridge.ts`)：cocos4-rust
  `agi_minigame::dsl` AST 的 TS 端类型化映射（含 `toEngineRule` 强制
  类型守卫）。

## 9 轮迭代版（rounds 6-9）回顾

相对 [PRD §2.4 原始架构](PRD.md)，rounds 6-9 新增了：

## 与 4 轮迭代版的差异

相对 [PRD §2.4 原始架构](PRD.md)，当前实现新增/强化了：

- **HttpLLMClient**：OpenAI 兼容 `/v1/chat/completions` 真实客户端
  （`src/ai/HttpLLMClient.ts`），缺失 API key / 网络错误时优雅回退
  到 `MockLLMClient`。
- **SaveMigrator**：版本化存档格式（v0 → v1 → v2），`SaveSystem.loadFromJson()`
  在加载老存档时自动迁移；`SAVE_VERSION` 已升至 2。
- **I18n**：zh-CN / en-US 双语目录，auto-detect `navigator.language`，
  localStorage 持久化；`HUD` 内置语言切换按钮。
- **Analytics**：零依赖事件/计数器追踪器，bounded ring (50) + 13
  event kinds + JSON 导出。
- **NpcCombat**：`src/scene/NpcCombat.ts`，3D 玩家 vs NPC，HP /
  攻击 / 治愈 / 击败。
- **GameAudio**：`src/audio/GameAudio.ts` 把 15 个高层 game events
  映射到 10 个 `AudioCue`；`AudioService` 用 Web Audio API 程序
  化合成 SFX（无外部资源）。
- **StatsPanel**：`src/ui/StatsPanel.ts` 渲染 Analytics snapshot
  （uptime、top-8 计数器、最近 5 个事件）。
- **cocos4-rust 端**：agi_minigame::atoms 集成测试覆盖 6 个原子的注册
  与生命周期；DSL AST 暴露 `to_json() / from_json()` 无需 serde 依赖。
- **3D Match3 网格**：`SceneManager.renderMatch3Grid()` 把
  `Match3Module` 的 2D 棋盘渲染为 3D 立方体，命中时可闪烁。

## 体验层 → AI → 引擎 数据流（当前实现）

```
┌──────────────────────────────────────────────────────────────────┐
│  App  ─  I18n  ─  HUD  ─  ProgressionUI  ─  EconomyPanel         │
│            ─  EpochPanel  ─  StatsPanel  ─  TutorialOverlay    │
│            ─  GameAudio (WebAudioService)                       │
│            ─  Analytics (event ring)                            │
├──────────────────────────────────────────────────────────────────┤
│  AIBridge.planAndLoad()   ─  GameplayManager (6 modules)        │
│       │                                                          │
│       └─ AIEngine.{gameplayAI, contentAI, tuner, worldAI}       │
│                + NPCDialogueAI + HttpLLMClient (OpenAI compat)  │
├──────────────────────────────────────────────────────────────────┤
│  MemeCompiler → HttpLLMClient.complete() → DslRule              │
│       │                                                          │
│       └─ HotReloadController → DslExecutor → SceneManager.spawn*│
├──────────────────────────────────────────────────────────────────┤
│  WorldState + Progression + EpochSystem + SaveSystem             │
│  + SaveMigrator (v0/v1 → v2)                                   │
├──────────────────────────────────────────────────────────────────┤
│  SceneManager (Three.js): portals, NPCs, WFC dungeon,            │
│                            Match3 grid, spawned entities,         │
│                            floating text, avatar                 │
│  + HubController (WASD / click-to-move)                         │
│  + NpcCombat (player vs NPC HP / damage)                        │
├──────────────────────────────────────────────────────────────────┤
│  cocos4-rust: agi_minigame::{dsl, atoms, ai_engine, dimension,   │
│                                 world_state, economy, gameplay}  │
│  + 引擎核心: core, scene, renderer, physics, input, audio      │
└──────────────────────────────────────────────────────────────────┘
```

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
