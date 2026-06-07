# Round 54 — lastFailedSnapshot 玩家可见 rollback UI (recovery banner inline "🔙 回滚" 按钮)

> 草拟日期: 2026-06-07
> 上轮: Round 53 (dbca163 master, 真重渲染失败优雅恢复) + Round 53b (196aa1c master, 4th 句 hash unify, 与本轮无关)
> 接续 round 53 — 把已备份的 4 字段 (lastSceneBlueprint / lastDimensionSeed / lastBiome / npcMindsSnapshot) 变 actionable
>
> **研究支撑 (deep-research 2026-06-07, 94 agents, 7/21 claims confirmed)**: rollback UI 触发仅在 banner 可见时 (避免 HUD 杂乱 + 给玩家 deliberate escape); rollback 操作 = restore 4 字段 + 调 round 50 loadGame 真重渲染管线 (不是 enterNewDimension — 玩家应回到 literal last good); backup 语义保持 one-deep + clear-on-success (避免 recursive rollback 链); NpcMind rehydration 用 round 48 loadFromSnapshots 但 defensive guard 验证 snapshot 非空 (path 在 backup 失败后可能再 throw); jest 测试用 `toHaveBeenNthCalledWith` 验证 ordered payload 序列; 按钮放 banner 内, neon-cyan (与 neon-pink banner body 区分 affordance); 失败时 final-answer (二次 banner 告知 "snapshot 自身无法 rehydrate", 不递归 chain)。

---

## 目标

把 round 53 已备份到 `worldState.lastFailedSnapshot` 的 4 字段 (blueprint / seed / biome / npcSnapshot) 通过 **inline rollback 按钮** 暴露给玩家: 玩家看到 round 53 recovery banner 时, 可在 banner 内点 "🔙 回滚" 把世界恢复到 auto-recover 前的 last good 状态 (调 round 50 loadGame 真重渲染管线), 失败时 final-answer 不递归 chain。

## 用户故事

- **As a** 玩家**, I can** 在 round 53 recovery banner 5 秒内点 "🔙 回滚" 按钮**, so** 我能回到 auto-recover 前的 last good 世界 (不用手动重启 app 或读档)。
- **As a** 玩家**, I can** 在 banner auto-hide 后再点 "🔙 回滚" 仍有效 (只要 `lastFailedSnapshot` 还在)**, so** 我有时间决定 rollback 而不抢 5s 窗口。
- **As a** 玩家**, I can** 点 banner dismiss "✕" 但 backup 仍保留 (直到下次 enterNewDimension 才覆盖)**, so** 我 dismiss banner 不等于放弃 rollback 选项。
- **As a** 开发者**, I can** 用 jest spyOn chain 验证 "auto-recover 触发 → backup 4 字段 → user click rollback → 4 字段被 restore + loadGame 真重渲染管线被调" 完整序列**, so** 失败路径可回归测。

## 引擎层职责

**Rust `cocos4-rust` 无需改动。** 纯 TS UI + main.ts rollback 路径, 反射环路 8 字段 schema 不变。

## 游戏层职责 (canonical)

`AGI-miniGame/src/main.ts` (recovery orchestrator 扩展):
- **新私有方法** `rollbackToLastGood(): void` — 玩家点 rollback 按钮后调:
  1. **守卫**: `worldState.lastFailedSnapshot` 必须非 null, 否则 log warning + 静默 no-op
  2. **Restore 4 字段**: `worldState.lastSceneBlueprint = snap.blueprint; worldState.setLastDimensionSeed(snap.seed); worldState.lastBiome = snap.biome; worldState.updateNpcMindsSnapshot(snap.npcSnapshot)`
  3. **NpcMind rehydration (defensive)**: try `npcMinds.loadFromSnapshots(snap.npcSnapshot)`; catch → `npcMinds.clear()` + log + 继续 (round 53 rehydrate-failure path)
  4. **真重渲染管线**: 直接调 `loadGame()` 内部真重渲染逻辑 (或抽个 `rehydrateAndRender()` 助手, main.ts:927-1077 的 3 段 catch 段) — 这是 round 50 已知工作管线
  5. **Clear backup + 5 个 HUD 提示**: `worldState.clearFailedSnapshot()` + `hud.setLastBiome(biome)` + `hud.setLastNpcDisposition(...)` + `hud.setNpcMindsSnapshot(snap.npcSnapshot)` + `hud.setLastSceneBlueprint(scalars)` (round 43-47 5 个 setter) + `hud.hideRecoveryBanner()` (新公开助手, 见下)
  6. **NpcMind refresh + syncNpcDisposition**: round 48 同款
  7. **Log**: `[scene] 玩家回滚 → #${biome} (round 54)`
  8. **Try/catch 包裹**: rollback 自身 re-render 失败时 (e.g. WebGL 仍挂) — final-answer: 调 `hud.showRecoveryBanner('ERR_ROLLBACK_FAILED', null)` + log + 不递归 chain (one-deep invariant)
- **renderRecoveryBanner 扩展** (HUD.ts, 见下): banner 内部加 inline "🔙 回滚" button, click → `app.rollbackToLastGood()`
- **rollback button 可见性条件**: HUD `state.recoveryBanner?.visible && worldState.lastFailedSnapshot != null` — banner 不可见时按钮不渲染 (保持 round 53 banner 5s auto-hide 行为); backup 不存在时按钮也不渲染 (no-op safety)

`AGI-miniGame/src/ui/HUD.ts`:
- **新公开助手** `hideRecoveryBanner(): void` — 立即 hide banner, 清 timer, 不动 backup (dismiss ≠ 清 backup, backup 仍可被 rollbackToLastGood 消费); 在 `rollbackToLastGood` 第 5 步调
- **`renderRecoveryBanner()` 扩展**: banner 内部加 inline button `<button class="hud-recovery-rollback" type="button">🔙 回滚到上次</button>`, 在 backup 存在时显示; click 事件在 render() 末尾 wire
- **`recoveryBanner` state 字段不变** (round 53 已有) — rollback 是 banner 内的 action, 不需新 state
- **新私有状态** `recoveryRollbackHandler: (() => void) | null` — round 54 wiring: render() 末尾存 `app.rollbackToLastGood` reference, click 时调; App 注入通过 `setRollbackHandler(fn)` 公开方法 (见下)

`AGI-miniGame/src/ui/HUD.ts` 公开接口扩展:
- **新公开方法** `setRollbackHandler(handler: (() => void) | null): void` — App 注入 rollback 回调, 避免 HUD 直接 import App (循环依赖); render() 时如果 handler 不为 null 且 backup 存在 → render rollback button + wire click

`AGI-miniGame/src/main.ts` (App 构造):
- **App 构造末尾** (constructor 末尾) 调 `this.hud.setRollbackHandler(() => this.rollbackToLastGood())` — 注入 rollback 回调

`AGI-miniGame/src/world/WorldState.ts`:
- **新公开助手** `hasFailedSnapshot(): boolean` — `this.lastFailedSnapshot != null` (用于 HUD 渲染 button 可见性守卫)
- **save/load 行为不变** (round 53 已支持, round 54 不动)

`AGI-miniGame/index.html`:
- **新 CSS** `.hud-recovery-rollback` (8-10 行): `background: none; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 2px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; margin-left: 8px;` + `hover: { color: white; background: var(--neon-cyan); }` — 与 banner body (neon-pink) 区分, action affordance
- **新 CSS** `.hud-recovery-banner` 微调: 加 `align-items: center` (banner 已有, 但 rollback button 高度更小, 需 justify 调整)

`AGI-miniGame/src/main.test.ts` (新文件, round 54):
- **+6 jest** (round-54 describe 块):
  1. `rollback_button_visible_when_banner_visible_and_backup_exists` — setLastBiome + showRecoveryBanner + setRollbackHandler, 验证 root.innerHTML 含 `hud-recovery-rollback`
  2. `rollback_button_hidden_when_banner_dismissed` — showRecoveryBanner → click dismiss → 验证 root.innerHTML 不含 `hud-recovery-rollback` (banner hidden → button hidden)
  3. `rollback_button_hidden_when_no_backup` — showRecoveryBanner 但 lastFailedSnapshot === null, 验证 button 不渲染
  4. `click_rollback_calls_handler_with_correct_arg` — spyOn handler, click rollback button, 验证 handler 被调 1 次
  5. `rollbackToLastGood_restores_4_fields_and_triggers_rehydrate` — set backup, spyOn npcMinds.loadFromSnapshots, 调 app.rollbackToLastGood, 验证 4 字段被 restore + loadFromSnapshots 被调
  6. `rollbackToLastGood_silent_noop_when_no_backup` — 不设 backup, 调 rollbackToLastGood, 验证 4 字段不变 (无 throw) + HUD 不变

`AGI-miniGame/src/ui/HUD.test.ts` (round 54 续):
- **+3 jest** (round-54 describe 块):
  1. `hideRecoveryBanner_clears_visible_and_timer` — showRecoveryBanner + hideRecoveryBanner, 验证 recoveryBanner.visible === false
  2. `rollback_button_only_renders_when_handler_set_and_banner_visible` — setRollbackHandler(null) 时不渲染, setRollbackHandler(fn) + showRecoveryBanner 时渲染
  3. `rollback_button_click_invokes_handler` — 注入 handler, click button, spyOn handler 验证被调 1 次

`AGI-miniGame/src/world/WorldState.test.ts` (round 54 续):
- **+1 jest**: `hasFailedSnapshot_returns_true_when_lastFailedSnapshot_set` — set + clear 双向覆盖

## 验收标准

1. ✅ HUD banner 可见 + `lastFailedSnapshot != null` → banner 内渲染 "🔙 回滚" 按钮 (inline, neon-cyan)
2. ✅ Banner dismiss (点 ✕) → 按钮消失, 但 `lastFailedSnapshot` 保留
3. ✅ Banner auto-hide 5s 后 → 按钮消失, `lastFailedSnapshot` 保留
4. ✅ `lastFailedSnapshot === null` → 按钮不渲染 (no backup to roll back to)
5. ✅ 点 "🔙 回滚" → `App.rollbackToLastGood()` 被调 1 次
6. ✅ rollback 成功: 4 字段被 restore + NpcMind rehydrated (defensive) + 真重渲染管线触发 + banner 立即 hide + 5 个 HUD setter 同步
7. ✅ rollback 自身 re-render 失败: 二次 banner `ERR_ROLLBACK_FAILED` 提示, 不递归 chain (one-deep invariant)
8. ✅ rollback 成功: `lastFailedSnapshot` 被 clear (避免 "rollback to rollback")
9. ✅ jest 全套 528 → 538 (+10: 6 main + 3 HUD + 1 WorldState), 0 回归
10. ✅ tsc --noEmit 干净
11. ✅ cargo test --lib 仍 1964 (无 Rust 改动基线)
12. ✅ 关键不变量: round 53 banner 行为不变 (5s auto-hide + dismiss button); 5 原 HUD div class 名不变; `as any` in main.ts 仍 3 hits; NpcMind loadFromSnapshots / clear 行为不变
13. ✅ 关键不变量: HUD `setRollbackHandler(null)` 是默认状态 (round 51-53 行为不变, backward compat); banner 不变 (round 53 contract)
14. ✅ 关键不变量: WorldState 8 持久化字段不变 (round 53 lastFailedSnapshot + round 32-50 7 字段)
15. ✅ manual `npm run dev` 视觉确认: 模拟 rehydrate 失败 → 看到 banner + rollback 按钮 → 点 rollback → 世界恢复到 last good + banner hide + 5 个 HUD 提示同步

## 实现难度

**S-M (1.5-2h)**

- main.ts rollbackToLastGood (~30 min) + renderRecoveryBanner 扩展 (~15 min) + setRollbackHandler wiring (~10 min)
- HUD hideRecoveryBanner + rollback button render (~25 min)
- index.html CSS (~5 min)
- main.test.ts 6 jest (~30 min)
- HUD.test.ts 3 jest + WorldState.test.ts 1 jest (~15 min)
- manual `npm run dev` 视觉确认 (~10 min)

## 风险

- **NpcMind rehydration 在 rollback 中可能再 throw**: round 53 已 defensive guard (try/catch + clear) — round 54 沿用同款, 不增加新风险
- **rollback button + dismiss button 都 click, 玩家误触**: dismiss 仅 hide banner, 不动 backup; rollback 真正操作 world; 两个 button 视觉区分 (neon-cyan vs 默认 button), 不混淆
- **`hud.setRollbackHandler` App→HUD 循环依赖**: 通过 setRollbackHandler 注入回调避免直接 import App; HUD 不知道 App 存在, 只接收 callback; 已有 round 26 getState / round 31 setLastBiome / round 43 setNpcMindsSnapshot / round 47 setLastSceneBlueprint 公开 setter 模式, setRollbackHandler 沿用同款
- **rollback 自身失败时二次 banner 是否会让玩家困惑**: `ERR_ROLLBACK_FAILED` 文本明确告知 "rollback 自身失败, 当前仍是 auto-recovered 状态, 无递归 chain"; 玩家看到 "回滚失败" + "可点 dismiss 接受当前状态" 即可
- **rollback 后 HUD 5 个 setter 顺序**: round 43-47 顺序与 round 50 loadGame 同步, 不引入新 race
- **jsdom click 不触发 ToggleEvent 类比**: jest mock 注入 + click trigger 是 jsdom 已知 pattern, round 51 HUD.test.ts 已用; round 54 沿用
- **rollback 期间其他 enterNewDimension 竞态**: rollbackToLastGood 同步调用, 不与 async enterNewDimension 冲突; 假设玩家不会在 auto-recover 期间 (banner 可见 5s 内) 触发 enterNewDimension 按钮 (UI 已 disable 假设)
- **CSS `:hover` 在 jsdom 不触发**: 不需要 hover 测, jest 只测 visible / hidden; hover 是 manual `npm run dev` 视觉确认项

## 后续 round 候选 (本 PRD 不做)

- **Round 55**: rollback 多次撤销 (multi-step undo, 需 backup stack 替代 one-deep)
- **Round 56**: rollback 失败时自动 `window.location.reload()` 兜底 (3rd-line safety net)
- **Round 57**: WebGL context-lost listener 显式 hook (`event.preventDefault()` + `webglcontextrestored` 监听, 让 orchestrator 可触发)

## 关键不变量

- **5 原 HUD div class 名不变** (round 43-47 contract)
- **HUD `<details class="hud-memories">` 结构不变** (round 51 contract, 34 jest 维持)
- **round 53 banner 5s auto-hide + dismiss 行为不变** (round 53 contract, 3 banner jest 维持)
- **WorldState 8 持久化字段不变** (round 53 lastFailedSnapshot + round 32-50 7 字段)
- **NpcMind 已有方法签名不变** (clear / loadFromSnapshots / insert / broadcast / averageDisposition)
- **grep -rE 'as any' src/main.ts 仍 3 hits** (round 42 历史不变)
- **HUD 不直接 import App** (通过 setRollbackHandler 注入 callback, 避免循环依赖)
- **one-deep backup invariant**: rollback 成功 → clearFailedSnapshot, 不允许 "rollback to rollback"
