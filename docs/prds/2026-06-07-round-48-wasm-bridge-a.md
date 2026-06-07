# Round 48a — WASM POC slice: `theme_to_scene` via JSON bridge + AIBridge 兜底

> **Selected** (round 48, 2026-06-07): 41/45 vs B 35/45 — POC slice 单轮可收, 打通 wasm 链路 + 1 个函数 + 兜底, round 49/50/51 加更多函数为复制粘贴; B 单轮风险高且 17 测试改名易回归。
>
> 草拟日期: 2026-06-07
> 上轮: Round 47 (3f2fc38 master — SceneBlueprint scalars 持久化)
> 第一次把 cocos4-rust 真编译到 wasm32 并被 AGI-miniGame 真消费

---

## 目标

把 `cocos4_rust::agi_minigame::scene_gen::theme_to_scene` 编译到 `wasm32-unknown-unknown`, 通过 wasm-pack 产出 ES module, 让 `AGI-miniGame/src/ai/SceneGenWasm.ts` 异步加载并调用; `AIBridge.ts` 检测到 WASM 就绪时优先用 WASM, 未就绪则兜底到现 TS `themeToScene` 镜像。**仅 1 个函数, JSON-in JSON-out, 不做结构化绑定。**

## 用户故事

- **As a** 游戏运行时**, I can** 在浏览器加载页面后异步获取一份 wasm 编译的 `themeToScene`**, so** 后续每次 `enterNewDimension` 不再走 TS 镜像分支 (镜像保留为兜底, 不删)。
- **As a** 引擎开发者**, I can** 修改 `scene_gen.rs` 重跑 `wasm-pack build`, 游戏端无需改 TS 即可获得最新行为**, so** Rust 真正成为 canonical, TS 镜像不再是 "并行实现"。
- **As a** 集成测试**, I can** 在 jest 里 mock 一个最小 WASM stub, 验证 AIBridge 在 WASM 就绪/失败时分别走 WASM/兜底**, so** 反射环路两条路径都能在 CI 跑通。
- **As a** 玩家**, I can** 在 wasm 加载失败 (404 / 浏览器禁用 wasm) 时仍能正常进入维度**, so** WASM 不是硬依赖, 是渐进增强。

## 引擎层职责 (canonical)

`cocos4-rust/Cargo.toml`:
- 新 `[lib]` `crate-type = ["cdylib", "rlib"]` (cdylib 给 wasm, rlib 保留给现有 lib 调用方)
- 新 `[features]` 条目 `wasm-bindings = ["dep:wasm-bindgen", "dep:serde", "dep:serde_json"]`
- `[dependencies]` 加 `wasm-bindgen = { version = "0.2", optional = true }`、`serde = { version = "1", features = ["derive"], optional = true }`、`serde_json = { version = "1", optional = true }` (复用现 optional 条目)

`cocos4-rust/src/agi_minigame/wasm_exports.rs` (新, canonical 入口):
- `#![cfg(feature = "wasm-bindings")]`
- 私有 `serde::{Serialize, Deserialize}` 派生:
  - `ThemeInputJson { visual_style, music_mood, difficulty, seed }` (string enum)
  - `SceneBlueprintJson { wfc_tile_weights, biome_id, base_npc_density, npc_density, npc_count, event_chain, music_bpm, npc_archetype_hints }`
  - `EventStepJson { kind, delay_secs, payload }`
- 私有 `from_json/to_json` 助手在 `ThemeInput ↔ ThemeInputJson`, `SceneBlueprint ↔ SceneBlueprintJson` 互转 (映射 enum→string, [u8; 8] → Vec)
- `#[wasm_bindgen]` 公开 fn `pub fn theme_to_scene_json(theme_json: &str) -> String` — 解析 JSON → 调原生 `theme_to_scene` → 序列化结果。失败时返回 `"{\"error\":\"...\"}"` JSON (不 panic)
- `#[wasm_bindgen]` 公开 fn `pub fn wasm_module_version() -> String` 返回 `"0.1.0-round48"` 用作健康检查
- `src/agi_minigame/mod.rs` 加 `#[cfg(feature = "wasm-bindings")] pub mod wasm_exports;`

`cocos4-rust/src/agi_minigame/wasm_exports.rs` 单测 (cargo test 路径, 不需 wasm):
- 仅测 `from_json/to_json` round-trip + `theme_to_scene_json` 字符串路径
- 4 tests:
  1. `theme_input_json_roundtrip` — string enum 互转
  2. `scene_blueprint_json_roundtrip` — 含 wfc_tile_weights 数组 + event_chain
  3. `theme_to_scene_json_returns_valid_scene_for_cyberpunk_pulse` — 解析输出 JSON 验证 npc_count > 0 / biome_id == "cyberpunk"
  4. `theme_to_scene_json_returns_error_on_bad_input` — 给非法 JSON 返回 `{"error":...}`

`cocos4-rust/scripts/build-wasm.sh` (新):
- `wasm-pack build --target web --no-default-features --features wasm-bindings --out-dir ../AGI-miniGame/wasm-pkg`
- 仅本地手动跑, 不进 CI; 输出物路径写入 PRD (供游戏侧装载)

## 游戏层职责

`AGI-miniGame/src/ai/SceneGenWasm.ts` (新):
- `export interface SceneGenWasmModule { theme_to_scene_json(s: string): string; wasm_module_version(): string; }`
- `export async function loadSceneGenWasm(): Promise<SceneGenWasmModule | null>` — 动态 `import('../../wasm-pkg/cocos4_rust.js')`, init() 后返回 module; 任何抛错 → 返回 `null` (兜底信号)
- `export function callThemeToScene(mod, themeInput) -> SceneBlueprint | null` — 序列化 ThemeInput → 调 wasm → 解析返回; `{error:...}` 返回 null
- 输入/输出 string enum 与 TS `themeToScene` 字段一致 (canonical 兼容)

`AGI-miniGame/src/ai/SceneGenWasm.test.ts` (新, +5 jest):
- mock `loadSceneGenWasm` 返回 stub module (无真 wasm)
- 测 `callThemeToScene` 解析 stub 输出为合法 SceneBlueprint
- 测 stub 抛 → 返 null
- 测 stub 返 `{error:...}` → 返 null
- 测 module = null → callThemeToScene 防御性返 null
- 测 version helper 调通

`AGI-miniGame/src/gameplay/AIBridge.ts`:
- 加私有 `private sceneGenWasm: SceneGenWasmModule | null = null` 字段
- 新公开 `async setSceneGenWasm(mod): void` 由 App 启动时调用
- `planAndLoad`: 在 `themeToScene(...)` 调用点先尝试 `callThemeToScene(this.sceneGenWasm, themeInput)`, 失败/null 时 fallback 原 TS 调用
- 新 log line `[scene] WASM 真出 (round 48)` 或 `[scene] WASM 兜底→ TS 镜像`

`AGI-miniGame/src/main.ts`:
- `bootstrap()`: `await loadSceneGenWasm().then(mod => bridge.setSceneGenWasm(mod))`; 失败时 console.warn + 继续 (不阻塞启动)

`AGI-miniGame/wasm-pkg/.gitignore` 加 `*.wasm`(默认提交 .js 胶水, 不提交 .wasm 二进制 — 跨平台保险, 开发者本地 build)。或反过来: 都提交 (CI 简单, 二进制小)。**默认: 都提交**, 让首次 clone 后 jest 能跑。

`AGI-miniGame/src/gameplay/AIBridge.test.ts` (扩):
- +3 jest: WASM 注入 + 调用走 WASM / WASM 未注入 → 走 TS / WASM 抛 → fallback TS

## 验收标准

1. ✅ `wasm-pack build --target web --no-default-features --features wasm-bindings` 成功产出 `AGI-miniGame/wasm-pkg/cocos4_rust.js` + `.wasm`
2. ✅ wasm 体积合理 (<200KB gz, <500KB raw — sanity check, 不强卡)
3. ✅ `cargo test --lib --features wasm-bindings agi_minigame::wasm_exports` 4/4 passed
4. ✅ `cargo test --lib` 全套通过 (1951 → 1955, +4 新测试, 0 回归)
5. ✅ `wasm-pkg/cocos4_rust.js` exports `theme_to_scene_json` 函数 (grep + jest mock 验证)
6. ✅ `SceneGenWasm.ts` 异步加载 + JSON 桥接通顺, 5 jest 全过
7. ✅ `AIBridge.ts` 真使用 WASM (注入时), 兜底到 TS (未注入/失败时), 3 集成 jest 全过
8. ✅ `main.ts:bootstrap` 启动时 await wasm 加载, 失败不阻塞 (jest mock 验证)
9. ✅ `tsc --noEmit` 干净
10. ✅ jest 全套 448 → 456 (+8 新 jest), 0 回归
11. ⚠ Headline: 在真实浏览器 `npm run dev` 加载页面后, HUD log 应出现 `[scene] WASM 真出 (round 48)` — 受限于 desktop-only (无 lsof:5173 上的 vite live), Step 5 标记为 Partial 验收, 文档要求开发者 manual smoke

## 实现难度

**M-L (5-6h)**

- Cargo.toml wasm-bindings feature + crate-type = ["cdylib", "rlib"]: ~10 min
- wasm_exports.rs JSON 桥 + 4 单测: ~90 min
- scripts/build-wasm.sh + 第一次跑通 wasm-pack: ~60 min (含 troubleshoot)
- AGI-miniGame SceneGenWasm.ts + 5 jest (mock 路径): ~60 min
- AIBridge.ts 注入 + fallback + 3 jest: ~45 min
- main.ts bootstrap wiring + 文档: ~30 min
- 跑测试 + 修锈: ~45 min

## 风险

- **`crate-type = ["cdylib", "rlib"]` 对现有 rlib 用户的影响**: rlib 兼容现 cargo test 用法, 添加 cdylib 不破坏。但 link 时间会变慢。已识别, 接受。
- **`--no-default-features` 仍编译失败**: cocos4-rust 30 模块即使最少 features 也可能含 `std::fs` 等 wasm 不支持的 API。**缓解**: 若失败, 先把 `wasm-bindings` 改为 `default-features = false` 并显式按需 include 模块; 必要时把 wasm_exports.rs 放在 `#[cfg(feature = "wasm-bindings")] pub mod wasm_exports;` 并让 wasm-pack 只 link 这一支。**最差**: 把 scene_gen 提到独立 sub-crate (round 48b 风险, 本 PRD 不接受)。Step 4 第一个 60-min 子任务必须先验证此假设。
- **`getrandom` on wasm**: scene_gen 用 `rand::StdRng::seed_from_u64`, 不需要 entropy, 但 `rand` 默认 features 可能拉 `getrandom`, 后者在 wasm 需 `getrandom = { features = ["js"] }`。**缓解**: 必要时 pin `rand = { version = "0.8", default-features = false, features = ["std_rng"] }` 或 explicit add getrandom feature。
- **wasm-pack 输出路径与 Vite 静态资产**: Vite 支持 `import('./wasm-pkg/cocos4_rust.js')` 动态导入, 但 `.wasm` 文件需在 build 时被 vite 处理。**缓解**: SceneGenWasm.ts 用 `import('./../../wasm-pkg/cocos4_rust.js?init')` 形式; 失败时 try-catch + 兜底。
- **JSON 桥的性能开销**: 每次 `enterNewDimension` 多了一次 JSON.stringify + parse。`themeToScene` 是低频调用 (维度切换时), 性能开销 <1ms 可忽略。已识别, 接受。
- **wasm 二进制体积**: cdylib + scene_gen 估算 60-150KB raw + lto。若超 500KB 触发 PRD 验收 #2 警告, 需 wasm-opt 压缩或裁切 features。
- **jest jsdom 无 WebAssembly 真支持**: jest 不在浏览器, jsdom 无 wasm runtime。**缓解**: jest 全 mock SceneGenWasm 模块 (loadSceneGenWasm → 返 stub), 不在 jest 跑真 wasm。真 wasm 验证由 manual smoke 在 `npm run dev` 完成 (PRD 验收 #11 Partial)。

## 后续 round 候选 (本 PRD 不做)

- **Round 49**: `build_generation_config_with_mood` 也走 WASM (本 PRD 只做 `theme_to_scene`)
- **Round 50**: `mood_palette` 走 WASM, TS palette 镜像降为兜底
- **Round 51**: `wasm-bindgen` 结构化绑定 (替换 JSON 桥, struct 直接互转), 性能进一步优化
