# Round 49a — SceneBlueprint 全字段持久化 (wfcTileWeights + eventChain + biomeId + densities)

> **Selected** (round 49, 2026-06-07): 40/45 vs B 34/45 — 反射环路持久化链第 7 个信号, round 50 重渲染前置, 与 round 47 一脉相承; B (HUD 折叠) 留 round 50, C (wasm-bindgen 结构化) reject 留 round 51+。
>
> 草拟日期: 2026-06-07
> 上轮: Round 48 (ab651ce master — NpcMind rehydration + 9d41772 WASM POC)
> 接续 round 47 (4 scalars 持久) → 把 SceneBlueprint **完整** snapshot 持久化

---

## 目标

把 round 24 `themeToScene` 产出的 SceneBlueprint **完整 snapshot** (wfcTileWeights[8] + biomeId + densities + eventChain + npcArchetypeHints[]) 在 `enterNewDimension` 时写入 `WorldState`, 跨 saveToJSON/loadFromJSON 持久化, 让玩家重启 app 后**立刻看到上次离开的精确场景结构** — HUD 多打 `[scene] 还原: NPC×N · BPM T · biome=… · events=K (来自 save)` log, 同时让 round 24 的 WFC 渲染管线**可以**从持久化数据直接重放 (不强制本轮接 — 数据先到位, UI 接入留 round 50)。

## 用户故事

- **As a** 重启 app 的玩家**, I can** 看到 HUD log `[scene] 还原: NPC×6 · BPM 130 · biome=cyberpunk · events=4 · weights=[4,4,2,2,0,0,3,1]`**, so** 知道上次离开的场景体感不是"重置", 是"延续"。
- **As a** 反射环路调试者**, I can** 在 `WorldState.lastSceneBlueprint` 直接读完整 SceneBlueprint (不再只是 4 标量)**, so** 不需要重新生成就能分析上次的 wfcTileWeights/eventChain。
- **As a** 加载旧存档的玩家**, I can** 在无 round-49 字段的 JSON 上正常加载 (round 47 4 标量自动回落)**, so** 旧存档不失效。
- **As a** Round 50+ 实现者**, I can** 在 loadGame 后直接拿到完整 SceneBlueprint 调 `generateDungeonWithWeights(10, 10, seed, ws.lastSceneBlueprint.wfcTileWeights)` 重渲染上次离开的精确 dungeon**, so** 重水合管线纯粹由数据驱动。

## 引擎层职责

**Rust `cocos4-rust` 本轮无需改动。** SceneBlueprint 的 canonical 形状在 round 24 已经定型, 持久化是 game-layer concern (与 round 47/40/35/32 同样模式)。

## 游戏层职责 (canonical)

`AGI-miniGame/src/world/WorldState.ts` (canonical):
- **字段** 新公开 `lastSceneBlueprint: SceneBlueprintSnapshot | null = null` (单字段替代 round 47 的 4 个 `lastScene*`; 后者保留, 作为 derived getter 兜底 back-compat)
  - 新导出 `interface SceneBlueprintSnapshot { wfcTileWeights: [u8;8]; biomeId: string; baseNpcDensity: number; npcDensity: number; npcCount: number; eventChain: EventStepSnapshot[]; musicBpm: number; npcArchetypeHints: string[] }`
  - 新导出 `interface EventStepSnapshot { kind: string; delaySecs: number; payload: string }`
- **助手** `updateLastSceneBlueprintFull(snap: SceneBlueprintSnapshot | null)` — null 重置, 对象一次写
- **saveToJSON** 新写 `lastSceneBlueprint: this.lastSceneBlueprint ?? undefined`
- **loadFromJSON** 新读 `data.lastSceneBlueprint as SceneBlueprintSnapshot | null | undefined` 守卫 (类型形状校验 — wfcTileWeights 是 8 元数组 / eventChain 是数组 / biomeId 是 string)
- **back-compat 双向**:
  - **新存档载入旧 round 47 字段**: 当 `lastSceneBlueprint` 缺时, 从 `lastSceneNpcCount` 等 4 标量合成最小 snapshot (`{npcCount, musicBpm, eventChain.length≈0, npcArchetypeHints.length≈0}` — 用占位填), 这样 round 47 → round 49 加载不丢"我知道上次有 N 个 NPC"
  - **旧 round 47 4 标量字段**: 不删, 继续写入 (helper 内同步写 4 标量 + 1 snapshot — 同时支持 round 48 之前的代码读 4 标量), 让 `HUD.setLastSceneBlueprint(scalars)` 路径继续工作

`AGI-miniGame/src/world/WorldState.test.ts`:
- `+8 jest`:
  1. `lastSceneBlueprint_defaults_to_null`
  2. `updateLastSceneBlueprintFull_sets_full_snapshot` — 8 元 weights + biomeId + eventChain
  3. `updateLastSceneBlueprintFull_null_resets_snapshot_and_scalars` — 一次清两边
  4. `updateLastSceneBlueprintFull_syncs_round_47_scalars` — 调用同时写 4 标量
  5. `lastSceneBlueprint_round_trips_through_saveToJSON_loadFromJSON` — 含 8 元数组 + eventChain
  6. `back_compat_save_with_only_round_47_scalars_synthesizes_minimal_snapshot` — 旧 save 加载得最小可用 snapshot
  7. `back_compat_save_without_any_scene_fields_loads_as_null`
  8. `headline_six_fields_coexist_across_save_load` — round 49 snapshot + round 47 scalars + round 32 biome + round 35 disposition + round 36 speaker + round 40 npcMindsSnapshot

`AGI-miniGame/src/main.ts`:
- `enterNewDimension` (sceneScalars 构造点之后) — 同时调 `this.worldState.updateLastSceneBlueprintFull({ ...sceneBp, eventChain: sceneBp.eventChain.map(e => ({...e})) })`; 删 round 47 的 `updateLastSceneBlueprint(sceneScalars)` 单独调用 (full helper 内部已同步 4 标量)
- `loadGame` 后 — 新加 if 守卫: `if (worldState.lastSceneBlueprint) hud.log("[scene] 还原: NPC×N · BPM T · biome=X · events=K · weights=[a,b,c,d,e,f,g,h] (来自 save)")`
- HUD `setLastSceneBlueprint(scalars)` 调用保持 (新 round 49 信息只走 hud.log, 不动 HUD render)

`AGI-miniGame/src/main.ts` (无新测试) — main.ts 集成验证由 jest 间接覆盖 (WorldState round-trip)

## 验收标准

1. ✅ `WorldState.lastSceneBlueprint: SceneBlueprintSnapshot | null` 字段就位 (单字段, 含 8 元 weights + eventChain)
2. ✅ 新导出 `SceneBlueprintSnapshot` + `EventStepSnapshot` interface
3. ✅ `updateLastSceneBlueprintFull(snap)` 公开方法存在, null 重置, 非 null 同时更新 round-47 4 标量
4. ✅ saveToJSON 包含 `lastSceneBlueprint` 完整 snapshot (非 null 时), 8 元 weights + eventChain 写出
5. ✅ loadFromJSON 还原 snapshot, 类型守卫拒绝结构错误
6. ✅ Back-compat: 仅含 round 47 4 标量的旧 save 加载得最小可用 snapshot (npcCount/bpm 实, weights 占位, eventChain []); 无 scene 字段的更老 save 得 null
7. ✅ main.ts `enterNewDimension` 调 `updateLastSceneBlueprintFull(sceneBp)` (替代 round 47 标量单独调用)
8. ✅ main.ts `loadGame` 后, 当 `lastSceneBlueprint` 非 null 时打 `[scene] 还原: ... (来自 save)` log
9. ✅ 6 字段共存 headline jest 通过: snapshot + scalars + biome + disposition + speaker + npcMindsSnapshot 同时持久
10. ✅ jest 全套 474 → 482 (+8 新), 0 回归
11. ✅ tsc --noEmit 干净
12. ✅ cargo test --lib 仍 1964 passed (无 Rust 改动, 基线确认)

## 实现难度

**M (3-4h)**

- WorldState 字段 + interfaces + helper + save/load: ~60 min
- WorldState 8 jest (含 back-compat 双向 + 6 字段共存): ~75 min
- main.ts 替换 + log: ~15 min
- 测试 + 修锈: ~30 min

## 风险

- **field 替换语义边界**: round 47 的 `updateLastSceneBlueprint(scalars)` 不删, 让现有调用站点继续工作; `updateLastSceneBlueprintFull(snap)` 内部同步 4 标量, 替代 main.ts 那 1 个调用站点。**缓解**: jest #4 `updateLastSceneBlueprintFull_syncs_round_47_scalars` 验证两边同步。
- **eventChain JSON 体积**: 5 个 EventStep × `{kind, delaySecs, payload}` ≈ 200-400 字节; 单次 save 增长 < 1KB, 可忽略。
- **wfcTileWeights 是 `[u8; 8]` Rust 类型, TS 用 `[number, number, ...]` 8 元元组**: JSON.parse 还原成普通 number[] 长度 8 — 类型断言 `as [number, ...]` + 守卫 `parsed.length === 8`。
- **Back-compat 合成最小 snapshot 时, weights 用什么占位**? 用 `defaultWfcWeights()` (`[6,3,1,1,0,0,1,1]`) — 来自 `WfcLevelGen` 默认, round 24 canonical。同 round-47 已加载的 4 标量合并, 玩家不会感知 "weights 来自占位"。
- **未来 round 50 真重渲染时, payload 字符串里的 `visualStyleOrdinal(theme.visualStyle)_${i}` 信息丢失**? eventChain.payload 是字符串, 完整保留 — round 50 重渲染 setTimeout 真能用。

## 后续 round 候选 (本 PRD 不做)

- **Round 50**: loadGame 后用持久化的 `lastSceneBlueprint` 真重渲染 dungeon (`generateDungeonWithWeights(10, 10, lastSeed, snapshot.wfcTileWeights)`) + 真 spawn NPC wave + 真 schedule eventChain setTimeout
- **Round 51**: 持久化 lastSeed (current `r.seed ?? Date.now()`) 让 round 50 的重渲染**确定性** byte-identical
