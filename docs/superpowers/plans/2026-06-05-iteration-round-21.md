# AGI-miniGame 迭代计划 (2026-06-05, 第 21 轮)

> **目标**: 给 NPC 加一层"个体记忆"（NpcMind）—— PRD §2.2D
> 的"活生生的世界"目前 NPCDialogueAI 只能讲段子，没人记得
> 你昨天跟它聊过什么。本轮把记忆从 TS demo 提到引擎层，让
> 所有 NPC 行为都对玩家历史负责，并顺手收尾 Round 20 的
> Vault UI 落地。

## 上下文 (Round 20 收尾)

- ✅ `DimensionVault` 引擎层 + TS 镜像 + 14+13 测试已就绪
- ✅ `VaultPanel` 渲染器已实现
- ❌ `index.html` 缺 `#vault-root` 节点 → bootstrap 传 `undefined`
- ❌ `enterNewDimension` 始终记 `'completed'`（没接入失败/放弃路径）

## 本轮要做

### Engine (cocos4-rust)

新增 `src/agi_minigame/npc.rs`：

- `NpcId(String)`, `NpcDisposition { friendly: f32, fear: f32, trust: f32 }`
- `NpcMemoryEntry { kind, summary, turn, weight }` — kind 含 dialogue / witnessed_event / heard_about_dimension / received_gift
- `NpcMind` 单个 NPC 的状态机：
  - capacity 32 的有界记忆环
  - `remember(entry)` / `recent(n)` / `recall_by_kind(k)`
  - `shift_disposition(delta)` 带 clamp [-1.0, 1.0]
  - `suggest_topic(world_state)` — 根据最近记忆 + disposition 推荐话题
  - `mood()` → "happy" | "neutral" | "uneasy" | "hostile"（聚合 disposition）
- `NpcRegistry` 管理多个 `NpcMind`，并提供 `broadcast(entry_template)` 让一个世界事件被所有人记下

测试 ≥10：capacity wrap / disposition clamp / 各种 mood / broadcast /
recall_by_kind 排序 / suggest_topic 在不同 disposition 下的差异。

mod.rs 导出新类型。

### Game (AGI-miniGame TS)

- `src/world/NpcMind.ts`：与引擎严格对称的 TS 镜像（独立运行，
  暂不走 WASM；与 vault 思路一致）
- `src/ui/NpcMindPanel.ts`：纯渲染面板，选定一个 NPC 显示
  其 disposition / mood / 最近 6 条记忆
- `src/ui/__tests__/NpcMind.test.ts`：jest 镜像测试 ≥10
- `main.ts` 集成：
  - 启动时为每个 `npcs` 元素新建一个 `NpcMind`
  - `talkToNpc(idx)` 调用 `mind.remember({kind:'dialogue',...})` 并
    根据 mood 调整 NPCDialogueAI 输入
  - `enterNewDimension()` 调用 `npcRegistry.broadcast(...)` 让所有
    NPC "听说" 玩家去了哪个次元

### Round 20 收尾

- `index.html` 加 `<div id="vault-root" class="panel"></div>`
- `bootstrap` 把 `vaultRoot` 真正读出来并传入 App
- `enterNewDimension` 接受可选 `outcome` 参数（默认 completed）
- 新增 `failDimension()` / `abandonDimension()` demo 方法 + 按钮，
  调用 `vault.record(..., 'failed' | 'abandoned')`

## 验证

- `cargo test -p cocos4-rust agi_minigame::npc` ≥10 passed
- `cargo test --lib agi_minigame` 全绿（不打破现有 129）
- `jest` 不打破现有 262 + 新增 ≥10
- `tsc --noEmit` 0 errors
- 两个仓库分别 commit & push（cocos4-rust 推 agi 分支）

## 跨层契约 (引擎 ↔ 游戏)

| 关注点 | 引擎层 (Rust) | 游戏层 (TS) |
| --- | --- | --- |
| 单个 NPC 的状态机 + 记忆环 | ✅ NpcMind | 镜像（无 wasm） |
| 多 NPC 协同 | ✅ NpcRegistry::broadcast | 镜像 |
| 对话语料 / 性格风味文本 | ⛔ | ✅ NPCDialogueAI（保留） |
| Three.js 显示 / DOM 面板 | ⛔ | ✅ NpcMindPanel |
| 与 vault 的耦合 | ⛔（types-only） | ✅ main.ts 在 enterNewDimension 时联动 |

## 后续 (Round 22+)

- WASM 绑定：把 `DimensionVault` / `NpcMind` 接入 wasm_exports，
  TS 镜像降为兜底
- NpcMind 跨存档持久化：进 `world_state` 序列化
- NpcMind ↔ NarrationEngine 联动：narrate 时把 NPC 视角带进来
- NpcMind ↔ BalanceTuner：根据集体 disposition 影响下次推荐难度
