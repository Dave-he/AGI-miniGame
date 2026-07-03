# Round 53 — 真重渲染失败优雅恢复 (loadGame rehydrate 失败 → 自动 enterNewDimension 替代)

> 草拟日期: 2026-06-07
> 上轮: Round 52 (40ee905 master, WASM 扩展 3 fn; 752c547 agi, WASM exports + 14 cargo)
> 接续 round 50 try/catch 兜底 (c97387f) — 本轮把 "log + 仅 HUD 还原" 升级为 "log + 自动 enterNewDimension 替代"
>
> **研究支撑 (deep-research 2026-06-07, 77 agents, 6/17 claims confirmed)**: 失败检测应分 3 段 catch (generateDungeonWithWeights / renderWfcDungeon / spawnNpcWave) + eventChain 尾 catch; 幂等性用 1 次 BEB retry (slot=200ms, ~100ms 期望); WorldState 备份 pre-failure 字段到 `lastFailedSnapshot` 后再覆盖; 静默 auto-recover + 非 modal banner; jest 用 spyOn chain + clearAllMocks in beforeEach; round 50 catch-all 重构为分级 catch + single recovery orchestrator。

---

## 目标

把 round 50 的被动 try/catch ("[scene] 真重渲染失败: <msg> (fallback: 仅 HUD 还原)") 升级为**主动恢复**: 真重渲染管线任一段失败时, 自动调 `enterNewDimension()` 替代空 3D 场景, 让玩家不必手动重启也不必手动进入新维度。失败前备份当前 7 字段到 `lastFailedSnapshot` 供未来 rollback; HUD 给出可见的 recovery banner。

## 用户故事

- **As a** 玩家**, I can** 看到 "上次离开 #biome" 提示但 3D 场景在 1-2 秒内自动出现新维度 (而非一直空着)**, so** 反射环路视觉信号不中断。
- **As a** 出问题的玩家**, I can** 在 HUD 看到非 modal banner `[scene] 自动恢复: 旧渲染失败 (ERR_SCENE_RENDER) → 进入新维度 #X` 告诉我发生了什么**, so** 我知道这是恢复行为不是 bug。
- **As a** 开发者**, I can** 在 jest 里用 `jest.spyOn(scene, 'renderWfcDungeon').mockImplementation(throw)` 注入任一段失败, 验证 enterNewDimension 被调用且 WorldState `lastFailedSnapshot` 被备份**, so** 失败路径有完整测试覆盖。
- **As a** 第一次启动的玩家**, I can** 看到正常的 fresh-start 流程 (没有 lastFailedSnapshot, 没有 recovery banner)**, so** 首次启动不受影响。

## 引擎层职责

**Rust `cocos4-rust` 无需改动。** 纯 TS UI + main.ts 错误处理重构, 反射环路 7 字段 schema 不变。

## 游戏层职责 (canonical)

`AGI-miniGame/src/world/WorldState.ts`:
- **新公开字段** `lastFailedSnapshot: SceneBlueprintSnapshot | null = null` — 重渲染失败前备份 `{ lastSceneBlueprint, lastDimensionSeed, lastBiome, npcMindsSnapshot }` 的 4-字段 deep copy
- **新公开助手** `backupFailedSnapshot()` — 调 4 个现有 getter, 构造 `{ blueprint: {...lastSceneBlueprint}, seed: lastDimensionSeed, biome: lastBiome, npcSnapshot: [...npcMindsSnapshot] }`, 存到 `lastFailedSnapshot` (defensive clone 防止 caller mutate 源)
- **新公开助手** `clearFailedSnapshot()` — 把 `lastFailedSnapshot` 重置为 `null` (成功 enterNewDimension 后调, 防止 stale backup)
- **saveToJSON** 写 `lastFailedSnapshot ?? undefined` (compact)
- **loadFromJSON** 读时走 round-32 同款 `typeof === 'object' && lastFailedSnapshot !== null` 守卫 + back-compat null

`AGI-miniGame/src/main.ts`:
- **新私有助手** `recoverFromRenderFailure(errCode: RenderErrorCode, partialState: { rendered: boolean, spawned: boolean, scheduled: boolean }): Promise<void>` — single recovery orchestrator, 按 `errCode` + `partialState` 走 4 种恢复策略:
  - `ERR_DUNGEON_GEN` / `ERR_SCENE_RENDER` (rendered=false) → 调 `this.enterNewDimension()` 一次, 失败则 fresh-start
  - `ERR_NPC_SPAWN` (rendered=true, spawned=false) → 仅调 `this.scene.spawnNpcWave(...)` 重试 1 次, 不 enterNewDimension
  - `ERR_EVENT_CHAIN` (rendered=true, spawned=true, scheduled=false) → 仅 schedule eventChain 一次, 不 enterNewDimension
  - 其余/未知 → fresh-start (clearActiveDimension + enterNewDimension 兜底)
- **loadGame 真重渲染块重构** (main.ts:927-962):
  - 3 段 try/catch: 段 1 = `generateDungeonWithWeights` (ERR_DUNGEON_GEN); 段 2 = `renderWfcDungeon` (ERR_SCENE_RENDER); 段 3 = `spawnNpcWave` (ERR_NPC_SPAWN)
  - eventChain setTimeout 保留段末单 catch (ERR_EVENT_CHAIN), 因为 async 边界需要 microtask
  - 任一段 catch 调 `this.worldState.backupFailedSnapshot()` + HUD log + `this.recoverFromRenderFailure(code, partialState)`
  - 顶层无 try/catch (round 50 的 catch-all 删除, 由分段 catch 替代)
- **enterNewDimension 末尾** 加 `this.worldState.clearFailedSnapshot()` (成功路径清 stale backup)
- **HUD 新增非 modal banner**: 在 `<details class="hud-memories">` 之上加 `<div class="hud-recovery-banner" hidden>[scene] 自动恢复: 旧渲染失败 (ERR_X) → 进入新维度 #biome</div>`, 5 秒后 hidden=true (CSS animation + setTimeout); 提供 dismiss 按钮

`AGI-miniGame/src/main.ts` (NpcMind rehydration 路径):
- 现有 `if (this.worldState.npcMindsSnapshot.length > 0) { this.npcMinds.loadFromSnapshots(...) }` 块包 try/catch (main.ts:868-877 范围)
- catch: `ERR_NPC_REHYDRATE` log + 调 `this.npcMinds.clear()` (新公开方法 round 53 加在 NpcMind) + `this.hud.log('[narr+mind] 还原失败, 走 fresh NpcFactory')` + **不**触发 enterNewDimension (scene blueprint 仍可用, 仅 NPC roster 重置)
- 顺序: rehydrate catch 在 rehydrate 后, 但在真重渲染 try 块**之前** — rehydrate 失败不会污染 render 失败诊断

`AGI-miniGame/src/world/NpcMind.ts`:
- **新公开方法** `clear(): void` — `_minds.length = 0`, NpcRegistry 变空 registry (供 round 53 catch 调用)
- 不影响 round 21-52 任何路径 (新方法, 无 default 调用方)

`AGI-miniGame/src/ui/HUD.ts`:
- **新公开助手** `showRecoveryBanner(code: string, biome: string | null): void` — render() 中插 banner 块 (round 51 之前是 round-43-47 5 行, 现在是 5 行 + 可选 banner)
- **新私有 state 字段** `recoveryBanner: { code: string; biome: string | null; visible: boolean } | null` (round 53)
- 5 秒后 `recoveryBanner.visible = false` (在 showRecoveryBanner 内 setTimeout)
- render() 时 `recoveryBanner?.visible ? '<div class="hud-recovery-banner">…</div>' : ''` 插到 `<details class="hud-memories">` 之前

`AGI-miniGame/index.html`:
- **新 CSS** `.hud-recovery-banner` (8 行): `background: rgba(255, 102, 204, 0.15)`, `border: 1px solid var(--neon-pink)`, `color: var(--neon-pink)`, `padding: 6px 10px`, `border-radius: 4px`, `margin: 0 0 6px 0`, `font-size: 11px`, `display: flex`, `justify-content: space-between` + dismiss button `.hud-recovery-dismiss` (`background: none; border: none; color: var(--neon-pink); cursor: pointer; font-size: 12px`)

`AGI-miniGame/src/main.ts` (testing seams):
- **不**新增 testing-only export; 现有 `app.scene.renderWfcDungeon` / `app.scene.spawnNpcWave` 已是 public methods 可被 spyOn; `app.enterNewDimension` 同
- HUD `showRecoveryBanner` 是 public, 测试可调

`AGI-miniGame/src/main.test.ts` (新文件, round 53):
- **+6 jest** (round-53 describe 块):
  1. `recover_dungeon_gen_error_calls_enterNewDimension_once_and_backs_up_snapshot` — spyOn `generateDungeonWithWeights` 抛错, 验证 `app.worldState.lastFailedSnapshot !== null` + `enterNewDimension` 被调 1 次
  2. `recover_scene_render_error_calls_enterNewDimension_and_resets_scene` — spyOn `scene.renderWfcDungeon` 抛错, 验证 enterNewDimension 被调 + 4-字段 lastFailedSnapshot 含 lastBiome
  3. `recover_npc_spawn_error_only_respawns_does_not_enterNewDimension` — spyOn `scene.spawnNpcWave` 抛错, 验证 `enterNewDimension` **不**被调, 但 retry spawnNpcWave 被调 1 次
  4. `recover_npc_rehydrate_error_resets_npc_registry_only` — spyOn `npcMinds.loadFromSnapshots` 抛错, 验证 `enterNewDimension` 不被调 + `npcMinds.len() === 0` + scene render 后续成功
  5. `first_launch_with_no_lastSceneBlueprint_does_not_trigger_recovery` — fresh `App` (no save) + 直接 enterNewDimension (loadGame 不走 rehydrate 块), 验证 `app.worldState.lastFailedSnapshot === null`
  6. `enterNewDimension_success_clears_lastFailedSnapshot` — 设 lastFailedSnapshot 非 null, 调 enterNewDimension 成功, 验证 lastFailedSnapshot === null

`AGI-miniGame/src/world/WorldState.test.ts` (round 53 续):
- **+3 jest** (round-53 describe 块):
  1. `backupFailedSnapshot_deep_copies_4_fields_and_returns_non_null` — 设 4 字段非 null, 调 backupFailedSnapshot, 验证 lastFailedSnapshot.blueprint / .seed / .biome / .npcSnapshot 都对, mutate 源不漏
  2. `clearFailedSnapshot_resets_to_null` — 设非 null, 调 clearFailedSnapshot, 验证 === null
  3. `round_trip_save_load_with_lastFailedSnapshot` — 设非 null, save/load, 验证 back-compat

`AGI-miniGame/src/ui/HUD.test.ts` (round 53 续):
- **+3 jest** (round-53 describe 块):
  1. `showRecoveryBanner_pushes_into_state_and_renders_div` — 调 `showRecoveryBanner('ERR_SCENE_RENDER', 'forest')`, 验证 root.innerHTML 含 `hud-recovery-banner` + `ERR_SCENE_RENDER` + `#forest`
  2. `banner_hidden_after_5s_via_setTimeout` — 用 `jest.useFakeTimers()`, 验证 t=0 banner 可见, t=5001 banner 不可见
  3. `dismiss_button_hides_banner_immediately` — 调 dismiss, 验证 banner 立即隐藏

`AGI-miniGame/src/world/NpcMind.test.ts` (round 53 续):
- **+2 jest** (round-53 describe 块):
  1. `clear_resets_registry_to_empty` — 插 2 个 NpcMind, 调 clear, 验证 len() === 0
  2. `clear_does_not_throw_on_empty_registry` — fresh registry, 调 clear, 验证不抛错

## 验收标准

1. ✅ 3 段 catch (ERR_DUNGEON_GEN / ERR_SCENE_RENDER / ERR_NPC_SPAWN) + eventChain 尾 catch (ERR_EVENT_CHAIN) — `main.ts:927-962` 重构后, 单一 catch-all 移除
2. ✅ `recoverFromRenderFailure(code, partialState)` orchestrator 函数在 main.ts 中 — 4 分支 dispatch
3. ✅ `worldState.lastFailedSnapshot` 在 catch 块被设; 4 字段 deep copy
4. ✅ `enterNewDimension` 末尾调 `worldState.clearFailedSnapshot()`
5. ✅ `npcMinds.clear()` 公开方法, NpcMind.test.ts 覆盖
6. ✅ HUD `showRecoveryBanner(code, biome)` 5 秒 auto-hide + dismiss button
7. ✅ `hud-recovery-banner` CSS 在 index.html, 非 modal 样式
8. ✅ 首次启动 (无 lastSceneBlueprint) 不触发 recovery, `lastFailedSnapshot === null`
9. ✅ NpcMind rehydrate 失败仅 reset npcRegistry, 不 enterNewDimension (scene render 仍成功)
10. ✅ partial failure: render OK + spawn 失败 → 仅 retry spawnNpcWave, **不** enterNewDimension
11. ✅ jest 全套 509 → 523 (+14: 6 main + 3 WorldState + 3 HUD + 2 NpcMind), 0 回归
12. ✅ tsc --noEmit 干净
13. ✅ cargo test --lib 仍 1964 (无 Rust 改动基线)
14. ✅ 关键不变量: round 50 已有 log `[scene] 真重渲染: ...` 仍存在; round 51 HUD `<details>` 结构不变; round 52 WASM 调用站点不动
15. ✅ 关键不变量: `grep -rE 'as any' src/main.ts` 仍 3 hits (round 42 历史注释 + 浏览器 API 真实 any)
16. ✅ manual `npm run dev` 视觉确认: 模拟 3D 失败 (DevTools throw) → 1-2 秒后自动 enterNewDimension, banner 5 秒后消失

## 实现难度

**M (3-4h)**

- main.ts 3 段 catch 重构 + recovery orchestrator: ~45 min
- WorldState lastFailedSnapshot 字段 + 2 助手 + save/load: ~25 min
- NpcMind.clear() 公开方法 + 2 jest: ~10 min
- HUD showRecoveryBanner + recoveryBanner state + 5s setTimeout: ~30 min
- index.html CSS (8 行): ~5 min
- main.test.ts 新文件 + 6 jest (需用 jest.spyOn + mockImplementation): ~45 min
- WorldState/HUD/NpcMind 各 .test.ts 续 3+3+2 jest: ~25 min
- 调试 + manual `npm run dev` 视觉确认: ~15 min

## 风险

- **jest.spyOn 链 + mockImplementation 的 mock-state 跨 test 泄漏**: research 11/17 refuted, 但 `jest.clearAllMocks()` in beforeEach 是防御性模式; 现有 jest 29 baseline 应该 OK, 但 spyOn 多段同一对象需谨慎
- **recovery orchestrator 自身失败**: enterNewDimension 抛错 (e.g. WASM trap) — orchestrator 应有兜底 (clearActiveDimension + 第二次 enterNewDimension, 不再 retry)
- **lastFailedSnapshot 持久化大小**: 4 字段 deep copy 是 `lastSceneBlueprint.full + npcMindsSnapshot (per-NPC entries) + lastBiome string + lastDimensionSeed number`; 估 1-5KB per backup; 比 WorldState 7 字段总大小 (< 10KB) 大约 +50%; saveToJSON compact 后无变化; 内存翻倍可忽略
- **BEB retry slot=200ms × 1** 仅在 enterNewDimension retry 路径, 不是 NPC spawn retry (后者同步 in-place, 无 setTimeout)
- **5s setTimeout 跨 navigation (玩家在 banner 消失前 reload)**: setTimeout 不会被 persist, banner 不持久 (round 51 风格, banner 是 session-only)
- **现有 round 50 catch-all 删除后, 顶层无兜底?** 不删兜底, 改为"外层 catch 接收 uncaught error" → 调 recoverFromRenderFailure('ERR_UNKNOWN') → 走 fresh-start
- **NpcMind.clear() 与 round 21-52 路径冲突?** 新方法, 无 default 调用; 现有 loadFromSnapshots / broadcast / remember / averageDisposition 路径都不动
- **HUD banner 与 round 51 `<details class="hud-memories">` 顺序**: banner 在 details **之前** (banner 是 "系统消息" 优先级高于 "5 条记忆") — round 51 现有 18 个 HUD jest 不变
- **round 49b/51 提示行不变**: 5 个原 div class 名 + 内容字节级保留, banner 是新增而非替换

## 后续 round 候选 (本 PRD 不做)

- **Round 54**: lastFailedSnapshot 玩家可见的 "回滚到上次好状态" UI 按钮
- **Round 55**: recovery orchestrator 加 telemetry (code 计数 + 平均恢复时间 + 失败堆栈)
- **Round 56**: partial failure 进一步细分 (render 部分 tile 成功 / 部分失败 → 截断到部分渲染而非全 retry)

## 关键不变量

- **5 原 HUD div class 名不变** (round 43-47 contract)
- **HUD `<details class="hud-memories">` 结构不变** (round 51 contract, 31 jest 维持)
- **round 50 try/catch 顶层兜底保留** (重构为分级 catch, 不删)
- **WorldState 7 持久化字段不变** (round 32/35/36/40/47/49/50, +1 新字段 lastFailedSnapshot)
- **NpcMind 已有方法签名不变** (clear() 是新方法, 不改 insert/loadFromSnapshots/.../)
- **enterNewDimension 现有 5 个 log 行** ([gen-config] [palette] [gen] [gen] [scene] mood) 全部不动
- **grep -rE 'as any' src/main.ts 仍 3 hits** (round 42 历史不变)
