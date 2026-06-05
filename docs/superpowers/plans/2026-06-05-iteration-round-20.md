# AGI-miniGame 迭代计划 (2026-06-05, 第 20 轮)

> **目标**: 给 AGI 加一层"次元记忆"（DimensionVault），让世界
> 能记住玩家走过的路，并基于历史推荐下一站。

## 已完成 (本轮)

- ✅ **引擎层 (cocos4-rust)** `agi_minigame::vault::DimensionVault`：
  64 容量的有界环，13 个单元测试覆盖 record / recent /
  lastOutcomeFor / suggestNext / recentThemes / stats / clear。
- ✅ **游戏层 (AGI-miniGame)** `src/world/DimensionVault.ts`：与
  引擎 API 严格对称的 TS 镜像，14 个 jest 镜像测试。
- ✅ **VaultPanel** `src/ui/VaultPanel.ts`：纯渲染面板，列出
  最近 8 个次元访问 + 统计（容量/主题数/通关率）。
- ✅ **App 集成**：`main.ts` 在 `enterNewDimension()` 里
  `vault.record(blueprint, 'completed', now)` 并把
  `[vault] 记忆: ...` 写进 HUD log。
- ✅ **Bug 修复**：`BalanceTuner::suggest_difficulty` 在历史
  为空时早返回路径没 clamp，导致 level≥15 时返回值 > 1.0。
  补上 clamp。

## 验证

- `tsc --noEmit` 0 errors
- `jest` 262 passed (1 pre-existing Match3 flake unrelated to this round)
- `cargo test --lib agi_minigame` 129 passed

## 后续 (Round 21+)

- 真实的维度进入/失败/放弃事件接入（目前 demo 一律记 `completed`）。
- VaultPanel 的 DOM 节点 (`#vault-root`) 加进 `index.html`。
- WASM 绑定：把 `DimensionVault` 替换为 `wasm_exports.vault_*` 调用。
- 跨存档持久化：把 vault 序列化为 `world_state` 的一部分。
