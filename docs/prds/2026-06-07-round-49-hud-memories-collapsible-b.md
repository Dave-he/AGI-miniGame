# Round 49b — HUD 顶部提示分组重构 (5 行折叠到 `<details>` + 多列布局)

> **Rejected** (round 49, 2026-06-07): 34/45 — 留作 round 50 候选。UX cleanup 但不延伸反射环路; 5 行堆积是真问题但非阻塞。Round 49 选 A (反射环路第 7 信号)。
>
> 草拟日期: 2026-06-07
> 上轮: Round 48 (ab651ce master)
> 接续 rounds 43/44/45/46/47 — 5 个顶部提示行视觉过载

---

## 目标

把 HUD stats panel 顶部已堆积的 **5 个**持久化提示行 (lastBiome ↩ / lastSpeaker 🗣 / npcSnapshot 🧠 / lastNpcDisposition 🎭 / lastSceneBlueprint 🎬) 折叠为一个可展开的 `<details>` 块 (`<summary>` 显示一行紧凑 emoji 摘要 + 详情 `<div>` 显示完整内容), 同时保留所有现有信息密度。

## 用户故事

- **As a** 玩家**, I can** 在 HUD 顶部看到一行 `↩🗣🧠🎭🎬 5 条记忆 · 点击展开` 而非 5 行堆积**, so** 主要信息密度回归。
- **As a** 想看完整记忆的玩家**, I can** 点击 `<summary>` 展开看 5 行原内容**, so** 信息不丢失。
- **As a** 开发者**, I can** 在 round 50+ 加新持久化字段时直接往 `<details>` 内追加而非继续往顶部堆**, so** 顶部不再视觉过载。
- **As a** 测试者**, I can** 在 jest 里检查 `<details>` 默认折叠 / 展开两态**, so** UX 行为可回归测。

## 引擎层职责

**Rust `cocos4-rust` 无需改动。** 纯 HUD UI 重构。

## 游戏层职责 (canonical)

`AGI-miniGame/src/ui/HUD.ts`:
- **新私有助手** `renderPersistentMemories(s: HUDState): string` — 取出所有 5 个持久化 prompt 的渲染, 包在 `<details class="hud-memories"><summary>` 里
- **summary 内容**: 紧凑 emoji 摘要 `↩🗣🧠🎭🎬 <N> 条记忆` 其中 N = 非 null/非 0 字段数
- **details 默认折叠** (`<details>` 无 `open` 属性, 用户首次点击展开后浏览器记不住状态 — 改用 sessionStorage 持久化展开状态, key `hud-memories-open`)
- **新私有助手** `setupMemoriesToggle(): void` — render 后 querySelector `.hud-memories`, 注入 `toggle` listener 写 sessionStorage
- **render() 修改**: 5 个 `${s.lastXxx ? ...}` 提示行替换为单一 `${this.renderPersistentMemories(s)}` 调用
- **若所有 5 字段都 null**: 整个 `<details>` 块不渲染 (向后兼容 round 43 之前空 HUD)

`AGI-miniGame/src/ui/HUD.test.ts`:
- `+5 jest`:
  1. `details_not_rendered_when_no_persistent_memories` — 0 字段时无 `.hud-memories`
  2. `summary_count_reflects_number_of_set_fields` — 设 2 个 → `2 条记忆`; 设 5 个 → `5 条记忆`
  3. `summary_emoji_includes_only_set_fields` — 仅 biome 设时 summary 含 `↩` 不含其它
  4. `details_collapsed_by_default_unless_sessionStorage_says_open` — 检查 `open` 属性默认缺失; sessionStorage 设 `hud-memories-open=1` 时存在
  5. `details_internal_lines_unchanged_from_round_47` — 展开后 5 个原 div (.hud-biome-remembered 等) 在 `<details>` 内可见

## 验收标准

1. ✅ HUD render 输出含 `<details class="hud-memories">` 元素 (5 字段任一非 null 时)
2. ✅ `<summary>` 紧凑显示 emoji 数量 + 计数
3. ✅ `<details>` 默认折叠 (无 `open` 属性)
4. ✅ sessionStorage `hud-memories-open` = `"1"` 时, render 后 `<details open>`
5. ✅ 点击 `<summary>` toggle 写 sessionStorage (jest 模拟 click + 检查 sessionStorage)
6. ✅ 5 个原 div (lastBiome / lastSpeaker / npcSnapshot / lastNpcDisposition / lastSceneBlueprint) 仍在 details 内, class 不变 (round 43-47 已有 jest 全过)
7. ✅ 0 字段时整个 `<details>` 块不渲染
8. ✅ jest 全套 474 → 479 (+5 新), 0 回归 (round 43-47 已有 18 个 prompt jest 因 div 仍存在所以应仍过)
9. ✅ tsc --noEmit 干净
10. ✅ cargo test --lib 仍 1964 (无 Rust 改动基线)

## 实现难度

**S (1.5h)**

- HUD renderPersistentMemories + setupMemoriesToggle 助手: ~30 min
- render() 改动 + CSS hint (`<details>` 样式留给 HTML/CSS layer): ~15 min
- 5 jest: ~30 min
- 调试 sessionStorage jsdom 行为: ~15 min

## 风险

- **sessionStorage 在 jest jsdom 是真可用还是 mock**? jsdom 提供 sessionStorage, 但 `beforeEach` 必须 `sessionStorage.clear()`。**缓解**: HUD.test.ts 已有 `localStorage.removeItem('agi_locale')` 模式 (round 26 测试), 直接复用。
- **现有 18 个 prompt jest 是否因 div 移到 `<details>` 内而失败**? 不会 — jest 测试都用 `root.innerHTML.toContain(...)` 字面查找, 类名仍在, 不挑 DOM 层级。
- **`<details>` 默认折叠时 `<div class="hud-biome-remembered">` 是否仍在 innerHTML**? 是 — `<details>` 折叠只影响视觉显示, DOM tree 完整。已有 jest `toContain('hud-biome-remembered')` 仍过。
- **toggle 写 sessionStorage 在 SSR/Node 环境抛错**? 加 `typeof sessionStorage !== 'undefined'` 守卫。
- **数量计算 `N 条记忆` 中 N 的定义**: 用"非 null / 非 0" — biome != null / speakerId != null / npcMindsSnapshotCount > 0 / lastNpcDisposition != null / lastSceneNpcCount != null。一字段一票。
- **emoji 顺序在 summary 里**: 按 round 顺序 `↩🗣🧠🎭🎬` (round 43→47), 视觉历史顺序。

## 后续 round 候选 (本 PRD 不做)

- **Round 50+**: 加新持久化字段 (round 49a 的 lastSceneBlueprint 全字段, future world events, etc) 直接进 `<details>`, 不再往顶部堆
- **Round 51**: HUD 完整重设计 (栅格布局, 主题切换, etc)
