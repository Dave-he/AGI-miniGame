# AGI-miniGame 迭代计划 (2026-06-01, 第 17 轮)

> **目标**: 把 16 轮迭代的成果系统化，并补齐最后几块短板以达到 PRD §2 的
> 全部能力。

## 已完成 (本轮之前)

- ✅ 4 AI 中枢 + NPC 对话 + AIGC mock
- ✅ DSL 双向（TS + Rust）解析
- ✅ WFC 关卡生成 + 3D 渲染
- ✅ 纪元更迭 / 大坍缩
- ✅ DSL 热更新（含编译充能 + 护盾）
- ✅ 存档 / 读档 + 版本迁移
- ✅ 6 种玩法模块（match3 / tower / card / parkour / puzzle / synthesis）
- ✅ 经济 / 成长 / 天赋 / HP / 死亡复活
- ✅ 4 面板 HUD + DM 控制台 + 会话回放
- ✅ I18n (zh-CN + en-US)
- ✅ Analytics + FeedbackService + EndlessMode
- ✅ cocos4-rust 引擎 DSL + 6 原子 + 集成测试
- ✅ ARCHITECTURE.md + PRD.md 同步

## 本轮目标 (Round 17)

1. **退役硬编码 NPC 列表** ✅：NpcFactory 真正驱动 App 的 NPC 阵容。
2. **AGI 性能基准** ✅：4 个轻量级 Benchmark 测试。
3. **更新迭代 plan 文档** ✅：本文件。
4. **cocos4-rust agi_minigame 集成测试** (后续)：DimensionRunner + AIEngine 端到端。

## 验证

- `tsc --noEmit` 0 errors
- `jest` 244+ 通过
- `cargo test --lib` 1836+ 通过
