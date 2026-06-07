# Round 48b — WASM 完整 vision: 3 函数 + 结构化绑定 + TS 镜像降为 fallback-only

> **Rejected** (round 48, 2026-06-07): 35/45 — 留作 round 51+ 蓝图。Single-round 收不完 (L, 8-10h) 且 17 个 SceneGen.test.ts 改名易引入回归; 把 wrapper struct boilerplate + 三函数 + 全测试改名堆在一轮风险过高。Round 48 选 A (POC slice)。
>
> 草拟日期: 2026-06-07
> 上轮: Round 47 (3f2fc38 master)
> 把候选 a 的"WASM 绑定 (L, 6+h)"一次性做到完整 vision

---

## 目标

把 `cocos4_rust::agi_minigame::scene_gen` 中所有 3 个 canonical 公开 fn 一次性编到 wasm32 + 直接通过 `wasm-bindgen` `#[wasm_bindgen]` 派生导出 `SceneBlueprint` / `GenerationConfig` / `Palette` 结构 (`serde-wasm-bindgen` JS ↔ Rust 直转); 游戏侧 `SceneGen.ts` 整体降为兜底镜像 (注释明确 "fallback only — canonical is `wasm_exports`")。

## 用户故事

- **As a** 引擎开发者**, I can** 改 `scene_gen.rs` 任意一处, 重跑 `wasm-pack`, 游戏端无需任何 TS 改动即可获得最新行为**, so** TS 镜像彻底脱离"并行实现", 仅作 wasm 加载失败的兜底。
- **As a** 玩家**, I can** 在 wasm 就绪时调用 `themeToScene` / `buildGenerationConfigWithMood` / `moodPalette` 全部走原生 Rust 算法**, so** 跨层数值差异 (f32 ↔ Number 1e-6) 不再可能, 反射环路完全无歧义。
- **As a** wasm-pack 输出消费者**, I can** 直接调用 `wasmModule.theme_to_scene(themeInput)` 获得真 SceneBlueprint 对象 (而非 JSON 字符串)**, so** 性能与开发体验都更好。

## 引擎层职责 (canonical)

`cocos4-rust/Cargo.toml`:
- 同 a; 加 `serde-wasm-bindgen = { version = "0.6", optional = true }`、`getrandom = { version = "0.2", features = ["js"], optional = true }`
- `wasm-bindings` feature 拉这些 deps

`cocos4-rust/src/agi_minigame/wasm_exports.rs` (新, canonical):
- 同 a 的 module gating
- `#[wasm_bindgen]` 派生 `SceneBlueprintWasm` / `GenerationConfigWasm` / `PaletteWasm` 等 wrapper struct (因为原始类型不能直接 #[wasm_bindgen] — 含 Vec / String)
- 派生 `From<SceneBlueprint> for SceneBlueprintWasm` 三对
- `#[wasm_bindgen]` 三个 fn:
  - `pub fn theme_to_scene(theme_js: JsValue) -> Result<JsValue, JsValue>` — serde-wasm-bindgen 反序列化 → 调原生 → 序列化回 JsValue
  - `pub fn build_generation_config_with_mood(level: u32, losses: u32, mood_js: JsValue, hint_js: JsValue, seed: u64) -> Result<JsValue, JsValue>`
  - `pub fn mood_palette(mood_js: JsValue) -> Result<JsValue, JsValue>`
- 共享 helper `to_value/from_value` 错误用 `js_sys::Error::new(&msg)`
- `wasm_module_version()` 健康检查

`cocos4-rust/src/agi_minigame/wasm_exports.rs` 单测 (cargo test, 不走 wasm-pack):
- `#[cfg(test)]` 仅测 serde round-trip (不需要 wasm-bindgen 运行时)
- 8 tests 覆盖 3 fn × { round-trip / 边界值 / 错误处理 }

`cocos4-rust/scripts/build-wasm.sh`: 同 a

## 游戏层职责

`AGI-miniGame/src/ai/SceneGenWasm.ts` (新):
- `loadSceneGenWasm()` 异步加载
- `themeToSceneWasm(mod, theme)` / `buildGenerationConfigWithMoodWasm(mod, lvl, losses, mood, hint, seed)` / `moodPaletteWasm(mod, mood)` 三个 wrapper
- `Promise.all` 测试 wasm 三个 fn 都通

`AGI-miniGame/src/ai/SceneGen.ts`:
- 顶部加注释 `// Canonical implementation lives in cocos4-rust wasm_exports. This TS mirror is fallback only.`
- 三 fn 改名加 `Fallback` 后缀 (`themeToSceneFallback` / `buildGenerationConfigWithMoodFallback` / `moodPaletteFallback`)
- 旧名保留为 re-export 默认导出, 但内部加日志警告 `console.warn('[scene_gen] WASM not loaded, using TS fallback')`

`AGI-miniGame/src/gameplay/AIBridge.ts`:
- 注入 wasm module 后, 所有 3 个调用站点统一走 wasm helper, 失败兜底到 `*Fallback`
- `planAndLoad` 内三处替换

`AGI-miniGame/src/main.ts`:
- bootstrap 加 `await loadSceneGenWasm()` + 注入

`AGI-miniGame/src/ai/SceneGen.test.ts`:
- 全部 17 测试改名走 `*Fallback` (canonical 是 wasm)
- 加新 jest 16: 3 wasm wrapper × { stub-success / stub-error / null-module 兜底 / version round-trip }

`AGI-miniGame/src/gameplay/AIBridge.test.ts`:
- +6 jest: 3 fn × { wasm 走 / 兜底走 }

## 验收标准

1. ✅ wasm-pack 成功
2. ⚠ wasm 体积 ~300KB raw (serde-wasm-bindgen 额外开销, 比 a 大)
3. ✅ `cargo test --features wasm-bindings agi_minigame::wasm_exports` 8/8 passed
4. ✅ `cargo test --lib` 全套通 (1951 → 1959)
5. ✅ wasm-pkg 导出 3 fn (grep 验证)
6. ✅ SceneGenWasm.ts 三 wrapper, 16 jest
7. ✅ AIBridge 三调用站点 wasm 走 / 兜底走, 6 jest
8. ✅ main.ts bootstrap wiring
9. ✅ tsc 干净
10. ✅ jest 448 → 470 (+22)
11. ✅ SceneGen.ts 3 fn 改名 + 注释明确 "fallback only"
12. ⚠ Headline: 浏览器 smoke test (Partial, 同 a)
13. ⚠ 风险: 17 个现有 SceneGen.test.ts 测试改名 → 字面修改 ~100 处, 易引入回归

## 实现难度

**L (8-10h)**

- Cargo.toml + wasm 工具链初探: 15 min
- wasm_exports.rs 三 fn 含 wrapper struct + 8 单测: 3h
- scripts/build-wasm + 跑通: 60 min
- SceneGenWasm.ts 三 wrapper + 16 jest mock: 2.5h
- SceneGen.ts 17 测试改名 + Fallback 后缀: 90 min
- AIBridge.ts 三调用站点 wiring + 6 jest: 90 min
- main.ts + 文档: 30 min
- 测试 + 修锈 + 调试: 90 min

## 风险

- **wrapper struct boilerplate**: 6 个 `#[wasm_bindgen]` wrapper + 12 个 `From` impl, ~300 行 boilerplate (可用 derive macro 但 wasm-bindgen 不支持). 这是 L 工作量的主要原因。
- **`getrandom` js feature**: rand crate 拉 getrandom, wasm 需 js feature, dep tree 可能冲突 (现 cocos4-rust 不拉 getrandom)。
- **现 17 个 SceneGen 测试改名引入回归**: 大批字面替换 (themeToScene → themeToSceneFallback), 易漏改, jest 会爆。**缓解**: 一次性 sed, 然后 jest 确认。
- **wasm-bindgen + serde-wasm-bindgen 版本兼容**: 0.2 / 0.6 当前组合稳定, 但 cargo 解析可能出 lock file 漂移。
- **scope 与单轮目标**: L 工作量 (8-10h) 接近"两轮"边界, 有可能本轮跑不完, 需要 Step 6 决定 defer。
- **同 a 的 `--no-default-features` 编译失败风险**: 同样存在。

## 后续 round 候选 (本 PRD 自包含)

无 — 本 PRD 一次性完成 WASM 绑定 vision。下一轮可做反射环路其它候选 (NpcMind rehydration / SceneBlueprint 全字段持久化)。
