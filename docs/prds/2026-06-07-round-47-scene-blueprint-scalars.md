# Round 47 — SceneBlueprint scalars 跨 save/load 持久化 + HUD 提示

> **Selected** (round 47, 2026-06-07): 单一候选；38/45 评分（对齐 5×3 + 难度 5×2 + 对称 4×2 + 可测性 5×1）。完美延续 rounds 31-46 持久化 + HUD 反射环路套路，草稿已写一半，工作量 S。
>
> 草拟日期: 2026-06-07
> 上轮: Round 46 (de71dff master — lastNpcDisposition HUD)
> 接续 rounds 31/32/35/36/40/43/44/45/46 持久化 + HUD 反射环路

---

## 目标

让玩家重载游戏后立即看到"上次维度: NPC×N · BPM T · M 个事件"提示，把 `themeToScene` 的 4 个用户可感标量（NPC 数量 / BPM / 事件数 / archetype hint 数）写入 `WorldState`、跨 `save/load` 持久化、并在 `HUD` 顶部渲染。

## 用户故事

- **As a** 重新打开浏览器的玩家**, I can** 看到 HUD 顶部 "🎬 上次维度: NPC×6 · BPM 130 · 4 个事件 · 1 个 archetype"**, so** 不靠日志也能立刻回想起离开前世界的体感。
- **As a** 开发者**, I can** 在 `WorldState.lastSceneNpcCount` 等字段直接读取最近一次 `themeToScene` 的输出标量**, so** 调试 / 分析时不需要重新触发 dimension 生成。
- **As a** 加载旧存档的玩家**, I can** 在无 round-47 字段的 JSON 上正常加载**, so** 历史存档不会因升级而失效。
- **As a** 反射环路的下游消费者**, I can** 在 `App.enterNewDimension()` 后立即从 `WorldState` 读到当前场景的标量**, so** 后续轮次（如基于 npcCount 的难度反馈）可以直接消费。

## 引擎层职责

**Rust `cocos4-rust` 本轮无需改动。** SceneBlueprint 的 canonical 形状（`npc_count: usize`、`music_bpm: u16`、`event_chain: Vec<EventStep>`、`npc_archetype_hints: Vec<NpcArchetype>`）在 round 24 已经定型，并被 12 个 `theme_to_scene` 单测覆盖。本轮持久化仅发生在 TS 侧（game-layer concern: 持久化是 WorldState 责任）。

## 游戏层职责 (canonical)

`AGI-miniGame/src/world/WorldState.ts` (canonical):
- **字段**（已草拟）`lastSceneNpcCount` / `lastSceneBpm` / `lastSceneEventCount` / `lastSceneArchetypeHintCount` 全部为 `number | null`，默认 `null`
- **助手**（已草拟）`updateLastSceneBlueprint(scalars | null)` — `null` 重置，对象一次写 4 字段
- **`saveToJSON`**（已草拟）4 字段 `?? undefined`（空值不进 JSON）
- **`loadFromJSON`**（已草拟）`typeof === 'number'` 守卫，旧存档回落 `null`

`AGI-miniGame/src/world/WorldState.test.ts`：
- `+6 jest`：
  1. `defaults_to_null_quad` — 全部 4 字段默认 null
  2. `updateLastSceneBlueprint_sets_all_four` — 一次写、4 字段同步
  3. `updateLastSceneBlueprint_null_resets_all_four` — null 重置
  4. `round_trips_through_saveToJSON_loadFromJSON` — 写入 → save → fresh.load → 读出相同 4 标量
  5. `back_compat_save_without_scene_scalars_loads_as_null` — 旧存档 JSON（无字段）加载 → null
  6. `headline_5_fields_coexist_across_save_load` — `lastBiome` + `lastNpcDisposition` + `lastSpeakerId` + `npcMindsSnapshot` + 4 个 scene scalars 同时持久化（headline cross-round test）

`AGI-miniGame/src/main.ts`：
- `enterNewDimension()` — `themeToScene` 调用成功后，在已有 `[scene]` log 之前调 `this.worldState.updateLastSceneBlueprint({ npcCount, bpm, eventCount, archetypeHintCount })`
- `loadGame()` — `loadFromJSON` 成功后调 `this.hud.setLastSceneBlueprint({ ... })` 把字段推到 HUD
- `enterNewDimension()` — 同样在写完 WorldState 后也推 HUD（玩家在线时也能看到当前 dimension 的标量）

`AGI-miniGame/src/ui/HUD.ts`：
- `HUDState` 加 `lastSceneNpcCount?: number | null` / `lastSceneBpm?` / `lastSceneEventCount?` / `lastSceneArchetypeHintCount?` 4 字段（所有 `number | null` 可省）
- 新公开 `setLastSceneBlueprint(scalars | null)` — 同 round 46 助手模式
- `render()` 顶部 panel 加 `<div class="hud-scene-blueprint">🎬 上次维度: NPC×N · BPM T · M 事件 · K archetype</div>`，仅当任一 scalar 非空时渲染
- 字段用 `?? '—'` 在显示前做 nullable 友好兜底

`AGI-miniGame/src/ui/HUD.test.ts`：
- `+3 jest`：
  1. `setLastSceneBlueprint stores all four scalars (and null resets)` — 存储正确
  2. `renders 🎬 line when any scalar is set` — 渲染包含 `🎬 上次维度`、`NPC×6`、`BPM 130`
  3. `does not render 🎬 line when all scalars are null` — 无字段则不渲染（避免空 HUD 行）

无 `index.html` 改动（顶层 `#hud-root` 已存在）。

## 验收标准

每条 → step 6 一一对照。

1. ✅ **WorldState 字段就位**: `grep -n 'lastSceneNpcCount' src/world/WorldState.ts` 4 个 `lastScene*` 字段均存在
2. ✅ **助手存在**: `WorldState.updateLastSceneBlueprint(scalars)` 公开方法存在，null 重置
3. ✅ **saveToJSON 持久化**: JSON.parse(ws.saveToJSON()) 包含 `lastSceneNpcCount` / `lastSceneBpm` / `lastSceneEventCount` / `lastSceneArchetypeHintCount`（非 null 时）
4. ✅ **loadFromJSON 还原 + back-compat**: 旧存档（无字段）加载不报错且 4 字段 = null；新存档加载后字段还原
5. ✅ **main.ts 写入**: `enterNewDimension()` 在 `themeToScene` 后调用 `updateLastSceneBlueprint(...)`
6. ✅ **main.ts 读取至 HUD**: `loadGame()` 与 `enterNewDimension()` 后调用 `setLastSceneBlueprint(...)`
7. ✅ **HUD 渲染**: `🎬 上次维度: NPC×N · BPM T · M 事件 · K archetype` 字符串出现在 `render()` 输出
8. ✅ **HUD 不渲染空态**: 所有 scalar 都 null 时 `render()` 不包含 `🎬`
9. ✅ **测试: 9 新 jest 全过 (WorldState +6 / HUD +3), 0 回归**
10. ✅ **tsc --noEmit 干净**
11. ✅ **cargo test --lib 仍 1951 passed**（无 Rust 改动，仅基线确认）

## 实现难度

**S (≤2h)**

- WorldState 字段 + 助手 + save/load: **已草拟 60 行**（直接复用）
- WorldState +6 jest: ~30 分钟（pattern match round-32/35/36/40 测试）
- main.ts wiring 2 处: ~10 分钟
- HUD `HUDState` + `setLastSceneBlueprint` + render: ~20 分钟（pattern match round-43/44/45/46）
- HUD +3 jest: ~15 分钟
- 跑测试 + 修锈: ~20 分钟

## 风险

- **`musicBpm` 与 `eventChain.length` 是 `themeToScene` 输出, 不是 `SceneBlueprint` 的稳定 ID**：reload 后再次进入同一维度（同 seed）会重算，写入是幂等的；但首次重载玩家看到的是**离开前**的 scene 标量, 进入新 dim 后立刻被覆盖。**取舍**：用户故事就要"上次"，覆盖是设计要求，不是缺陷。
- **null vs undefined 序列化噪声**：`?? undefined` 让 `JSON.stringify` 略去字段；`typeof === 'number'` 守卫让 load 安全。同 round 32/35/36 已验证模式，零风险。
- **HUD 渲染条件竞争**：4 个 scalar 一起设/一起清，但渲染条件用 `lastSceneNpcCount != null` 单一字段即可；其它 3 字段共享生命周期。**约束**：渲染时若任一 scalar 非空就显示完整四元组（`?? '—'` 兜底），避免 "NPC×6 · BPM — · 0 事件 · undefined archetype" 错误产物。
- **跨层一致性**：本轮 TS-only，无 Rust 镜像。若 Round 48 想做 "SceneBlueprint 全字段持久化（含 wfcTileWeights / eventChain 完整 payload）"，则需要重新审视：8 元 weights 数组 + 多个 EventStep 对象。**当前不做**，scope 保持 S。
- **load 路径未触发 HUD 更新**：`loadGame()` 必须显式调 `setLastSceneBlueprint` ——已写入用户故事 + 验收 #6；如忘记则 reload 后 HUD 不显示新字段（已有 lastBiome/lastSpeaker 路径作为参考）。
