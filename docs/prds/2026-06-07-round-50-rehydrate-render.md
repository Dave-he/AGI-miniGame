# Round 50 — lastSeed 持久化 + lastSceneBlueprint 真重渲染 (反射环路闭环)

> **Selected** (round 50, 2026-06-07): 单一 PRD — 用户已在 Round 50 候选 A+B 合并方向上确认; 单一连贯 vision, 不造伪 strawman.
>
> 草拟日期: 2026-06-07
> 上轮: Round 49 (acc9a2c master — SceneBlueprint 全字段持久化)
> 把 round 49 持久化的数据**真用上** + 持久化 seed 让重渲染**byte-identical**

---

## 目标

把 round 49 持久化的 `lastSceneBlueprint` 在 `loadGame` 后真接入 WFC 重渲染管线 (`generateDungeonWithWeights` + `spawnNpcWave` + `setTimeout(eventChain)`), 并新公开 `WorldState.lastDimensionSeed` 跨 save/load 持久化让重渲染**确定性 byte-identical**, 反射环路从"持久化数据"升级为"重水合 + 真渲染"。

## 用户故事

- **As a** 重启 app 的玩家**, I can** `loadGame` 之后立刻看到上次离开的精确 dungeon (WFC tiles 一致) + 同样的 NPC wave + 同样的 eventChain timed events**, so** 场景延续不止是"HUD 数字一样", 而是"世界一样"。
- **As a** 反射环路调试者**, I can** 在重渲染 log 里看到 `[scene] 真重渲染: seed=42, weights=[4,4,...], NPC×6, biome=cyberpunk, events=4 (round 50)`**, so** 知道 round 49 持久化数据是否真消费。
- **As a** 加载旧 round 47/48 存档的玩家**, I can** 仍看到 round 49 合成的最小 snapshot 触发**部分**重渲染 (defaultWfcWeights + 空 eventChain + 真 npcCount)**, so** 老存档不失效但提示文本明示"部分还原"。
- **As a** 加载没 lastDimensionSeed 字段的旧存档的玩家**, I can** 用确定性 fallback (e.g. snapshot 的某个 stable hash) 让重渲染仍然确定**, so** 旧存档加载两次得到一致 dungeon。

## 引擎层职责

**Rust `cocos4-rust` 本轮无需改动。** 重渲染管线已在 game-layer 完整 (`generateDungeonWithWeights` / `biomeForVisualStyle` / `scene.spawnNpcWave` 都是 TS), seed 持久化也是 TS WorldState concern。

## 游戏层职责 (canonical)

`AGI-miniGame/src/world/WorldState.ts`:
- **字段** 新公开 `public lastDimensionSeed: number | null = null` — 与 round 31 `lastBiome` / round 49 `lastSceneBlueprint` 平级
- **助手** `setLastDimensionSeed(seed: number | null): void` — null 清, number 写; trivial wrapper (单字段无需)
- **saveToJSON** 新写 `lastDimensionSeed: this.lastDimensionSeed ?? undefined` (compact)
- **loadFromJSON** 新读 `this.lastDimensionSeed = typeof data.lastDimensionSeed === 'number' ? data.lastDimensionSeed : null`

`AGI-miniGame/src/world/WorldState.test.ts`:
- `+5 jest`:
  1. `lastDimensionSeed_defaults_to_null`
  2. `setLastDimensionSeed_sets_value_and_null_clears`
  3. `lastDimensionSeed_round_trips_through_saveToJSON_loadFromJSON`
  4. `back_compat_save_without_lastDimensionSeed_loads_as_null`
  5. `headline_seven_fields_coexist_across_save_load` — round 32/35/36/40/47/49/50 同一 save 字段共存

`AGI-miniGame/src/main.ts`:
- **`enterNewDimension`** (line ~382-403): 在 `themeInput.seed = r.seed ?? Date.now()` 计算位置之后, 调 `this.worldState.setLastDimensionSeed(themeInput.seed)` 持久化 (replace `r.seed ?? Date.now()` 的计算让 enterNewDimension + loadGame 共享同一 seed 值定义)
- **`loadGame`** (line ~765 后, 现 round 49 `[scene] 还原 log` 之后): 新 if 守卫 — 当 `snap !== null` 时调真重渲染管线:
  ```ts
  const seed = this.worldState.lastDimensionSeed
      ?? stableSeedFromSnapshot(snap);  // back-compat for round 49 saves without seed
  const dungeon = generateDungeonWithWeights(10, 10, seed, snap.wfcTileWeights);
  const biome = biomeForVisualStyle(snap.biomeId);
  this.scene.renderWfcDungeon(dungeon.tiles, 1.0, biome);
  const spawned = this.scene.spawnNpcWave(snap.npcCount, snap.npcArchetypeHints);
  this.hud.log(`[scene] 真重渲染: seed=${seed}, weights=[${snap.wfcTileWeights.join(',')}], NPC×${spawned.length}, biome=${snap.biomeId}, events=${snap.eventChain.length} (round 50)`);
  for (const evt of snap.eventChain) {
      const capture = evt;
      setTimeout(() => {
          this.hud.log(`[event] ⚡ replay ${capture.kind} (${capture.payload})`);
          this.npcMinds.broadcast(makeEntry('witnessed_event', `${capture.kind}: ${capture.payload}`, ++this.npcTurn, 0.3));
          this.syncNpcDisposition();
          this.npcMindHandle?.refresh();
      }, capture.delaySecs * 1000);
  }
  ```
- **新模块级 pure helper** `stableSeedFromSnapshot(snap): number` — 当老存档无 lastDimensionSeed 时, 从 snapshot 关键字段算个确定性 number (e.g. `weights[0] * 1e6 + npcCount * 1000 + eventChain.length`), 让 round 49 旧存档加载两次得到一致 dungeon (不是 byte-identical 与原 enter 时一致, 但加载两次自身一致)

## 验收标准

1. ✅ `WorldState.lastDimensionSeed: number | null = null` 字段就位
2. ✅ `setLastDimensionSeed(seed | null)` 公开方法存在
3. ✅ saveToJSON 包含 `lastDimensionSeed` (非 null 时), loadFromJSON 还原 + back-compat null
4. ✅ main.ts `enterNewDimension` 在 themeInput 构造后调 `setLastDimensionSeed(themeInput.seed)`
5. ✅ main.ts `loadGame` 当 `lastSceneBlueprint != null` 时真调 `generateDungeonWithWeights` + `renderWfcDungeon` + `spawnNpcWave` + `setTimeout(eventChain)` + `broadcast witnessed_event`
6. ✅ 当 lastDimensionSeed 存在时用真值; 否则用 `stableSeedFromSnapshot(snap)` fallback, 让 round 49 旧存档加载一致
7. ✅ HUD log `[scene] 真重渲染: seed=X, weights=[...], NPC×N, biome=X, events=K (round 50)` 输出
8. ✅ 7 字段共存 headline jest 通过 (round 32/35/36/40/47/49/50)
9. ✅ jest 全套 482 → 487 (+5 新), 0 回归
10. ✅ tsc --noEmit 干净
11. ✅ cargo test --lib 仍 1964 (无 Rust 改动, 基线确认)

## 实现难度

**M (2-3h)**

- WorldState lastDimensionSeed 字段 + save/load: ~15 min
- WorldState +5 jest: ~30 min
- main.ts `enterNewDimension` 写入 seed (一行): ~5 min
- main.ts `loadGame` 真重渲染 + stableSeedFromSnapshot helper: ~40 min (含 import 整理)
- tsc + jest + 修锈: ~30 min

## 风险

- **`scene` 不可用 (jsdom 环境)**: SceneManager.renderWfcDungeon 用 Three.js, jsdom 没 WebGL canvas — `loadGame` 在 jest 不直接测, 我们只在 main.ts 集成路径走过, 由 WorldState round-trip jest 间接覆盖。验收 #5 用 "代码存在" 而非 "执行通过" 标准。
- **stableSeedFromSnapshot 选什么公式**: 用 `weights[0]*1e6 + npcCount*1000 + eventChain.length + biomeId.length`, 简单确定性, 不需要密码学强度。完全不需要 reverse to original seed — 目标只是"加载两次一致"。
- **`setTimeout(eventChain)` 在 loadGame 执行时**: 重渲染立即调度 broadcast, 但玩家可能没在维度里 (loadGame 一般在主菜单), broadcast 仍会触发, 影响 NpcRegistry。**取舍**: 接受 — round 39 已 establish "eventChain 总是 broadcast"。HUD log 会让玩家看见。或者: 加 `if (this.worldState.activeDimension)` 守卫? round 49 `loadFromJSON` 已经 restore `activeDimension` (基于 activeDimensionBiome), 所以守卫为真, broadcast 可触发。
- **重复 broadcast 与 enterNewDimension 二次走**: 玩家 loadGame 后再 enterNewDimension 会得到 2 套 eventChain broadcast — 重复信号会过度 fear/witnessed_event。**缓解**: loadGame 后清掉 `activeDimension` 让玩家"看到上次场景但需要主动进入"; **或** 标记 "is_rehydrate" 让 enterNewDimension 守卫不再二次 broadcast。**round 50 决策**: 不清 activeDimension (round 31/40 已 restore 它); broadcast 信号微弱 (witnessed_event w=0.3 × 4 events ≈ +0.06 fear), 不致饱和。
- **`generateDungeonWithWeights` throw 当 weights.length !== 8**: round 49 `parseSceneBlueprintSnapshot` 已校验 8 元数组, 不会触发, 但加 `try/catch` 防御性兜底 log 失败 + 不抛, 让 loadGame 不因为重渲染失败而 ALL fail。
- **测试覆盖 main.ts loadGame 路径**: main.ts 无 jest, 重渲染分支测不到。**缓解**: WorldState lastDimensionSeed 测全, 重渲染由人工 desktop smoke ("Manual `npm run dev` reload" — PRD 接受 Partial)。

## 后续 round 候选 (本 PRD 不做)

- **Round 51**: HUD 折叠 (round 49b PRD 现成); 或 WASM 扩展 fn; 或 wasm-bindgen 结构化绑定
- **Round 52+**: lastSceneBlueprint 真重渲染失败时优雅降级 (try/catch 已加, 但还可加 "重渲染失败 → 重新走 enterNewDimension" 自动恢复)
