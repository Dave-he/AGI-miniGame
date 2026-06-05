# AGI-miniGame 迭代计划 (2026-06-05, 第 22 轮)

> **目标**: 把 NpcMind 的"集体情绪"变成一个真正会被消费的信号——
> 让 BalanceTuner 把 `NpcRegistry::average_disposition()` 当作
> 难度推荐的第四个因子（前三个是 win_rate / avg_score / avg_duration），
> 闭合 PRD §2.2C 平衡 AI ↔ §2.2D 智能 NPC 的反射环路。

## 上下文 (Round 21 收尾)

- ✅ NpcMind 引擎层 + TS 镜像就绪，14+14 测试
- ✅ NpcRegistry::broadcast 在 enterNewDimension 时已被 main.ts 调用
- ✅ NpcMindPanel 已挂在 index.html
- ❌ NPC 的集体情绪 **没有任何下游消费**——目前只是一面镜子
- ❌ BalanceTuner 不知道 NPC 害怕了

## 本轮要做

### Engine (cocos4-rust)

`src/agi_minigame/ai_engine.rs` 给 `BalanceTuner` 加：

- `suggest_difficulty_with_mood(player_level: u32, mood: NpcDisposition) -> f32`
  - 复用现有 `suggest_difficulty` 的三因子推荐 (recent history)
  - 再叠加 mood adjustment：
    - `fear > 0.5` → -0.10 (NPC 怕到这地步，世界已经够难了)
    - `friendly > 0.5 && trust > 0.3` → +0.08 (NPC 喜欢你=玩得不错=加点压力)
    - `friendly < -0.3` → -0.05 (玩家是个混蛋，但调难度不解决问题，轻微补偿)
  - 单调 clamp 进 `[0.1, 1.0]`，永远不会爆
- 文档里明确写"反射环路"，并指明 mood 来自 `NpcRegistry::average_disposition()`
- ≥5 单元测试覆盖：
  - 空 history + 中性 mood → 等价 base
  - 高 fear 必须降低难度
  - 高 friendly+trust 必须升高难度
  - 极端 mood 不打破 clamp
  - 与 `suggest_difficulty` 在 `NpcDisposition::default()` 时 deterministically 等价

### Game (AGI-miniGame TS)

`src/ai/AIEngine.ts` 给 TS `BalanceTuner` 加对称方法：

- `suggestDifficultyWithMood(playerLevel: number, mood: NpcDisposition): number`
  - 同样的 fear/friendly/trust 阈值与系数
  - import 自 `src/world/NpcMind.ts` 的 `NpcDisposition` 类型 (已存在)
- ≥5 jest 测试镜像 Rust 用例
- `AIEngine.generateDimension` 接受 optional `mood` 参数并把它转给 tuner
- `src/gameplay/AIBridge.ts` 的 `planAndLoad` 接受 optional mood
- `src/main.ts` 在 `enterNewDimension` 之前读 `npcMinds.averageDisposition()`
  并把它写进 bridge 调用 + HUD log（"NPC 平均情绪：fear=0.4 → 难度 -0.10"）

### UI (collateral)

- `src/ui/NpcMindPanel.ts` 标题下方加一行 "→ 影响下次难度 ±X.XX"
  显示当前 mood 计算出的 bias，让反射环路 **可见**

## 验证

- `cargo test -p cocos4-rust agi_minigame::ai_engine` 不少于现有 + ≥5 新
- `cargo test --lib agi_minigame` 全绿
- `jest` 全绿，新增 ≥5
- `tsc --noEmit` 0 errors
- 两个仓库分别 commit & push

## 跨层契约

| 关注点 | 引擎层 (Rust) | 游戏层 (TS) |
| --- | --- | --- |
| 阈值常量 (0.5/0.3/-0.3) | ✅ canonical | 镜像 |
| 系数 (-0.10/+0.08/-0.05) | ✅ canonical | 镜像 |
| Clamp 边界 [0.1, 1.0] | ✅ canonical | 镜像 |
| AverageDisposition 计算 | ✅ NpcRegistry (Round 21) | ✅ TS 镜像 (Round 21) |
| HUD 文字 / 面板渲染 | ⛔ | ✅ |
| WASM 直连 | ⛔ (Round 23+) | TS 内自洽 |

## 后续 (Round 23+)

- WASM 绑定：BalanceTuner/NpcMind/Vault 切到 `wasm_exports.*`
- NpcMind 跨存档持久化：进 `world_state` 序列化
- BalanceTuner 反馈反向：高难度通关后 broadcast 一条让 NPC 转 "敬畏"
  的 entry（trust↑、fear↑混合）
- 让 fail/abandon 真正喂 `tuner.record_result(completed=false)` 而不只是 HUD log
