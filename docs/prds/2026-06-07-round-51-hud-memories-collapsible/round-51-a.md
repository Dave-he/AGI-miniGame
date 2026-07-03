# Round 51 — HUD 顶部持久化提示分组重构 (5 行折叠到 `<details>` + sessionStorage 展开状态)

> 草拟日期: 2026-06-07
> 上轮: Round 50 (c97387f master, lastSeed 持久化 + 真重渲染)
> 接续 rounds 43/44/45/46/47 — 5 个顶部提示行视觉过载
>
> **研究支撑 (deep-research 2026-06-07)**: 10 项高置信度 claim 全部确认设计正确, 0 关键发现推翻 PRD。`<details>/<summary>` 是 MDN "First Rule of ARIA Use" 的首选方案, sessionStorage 跨 tab 不同步恰好契合"新窗口默认折叠"语义, jsdom 26.1.0 (远高于 22.x 阈值) 让 toggle-on-click 在 jest 中原生工作。

---

## 目标

把 HUD stats panel 顶部已堆积的 **5 个**持久化提示行折叠为一个可展开的 `<details>` 块 (`<summary>` 显示一行紧凑 emoji 摘要 + 详情 `<div>` 显示完整内容), 同时保留所有现有信息密度 + 状态在 sessionStorage 中持久化。

## 用户故事

- **As a** 玩家**, I can** 在 HUD 顶部看到一行 `↩🗣🧠🎭🎬 5 条记忆 · 点击展开` 而非 5 行堆积**, so** 主要信息密度回归。
- **As a** 想看完整记忆的玩家**, I can** 点击 `<summary>` 展开看 5 行原内容**, so** 信息不丢失。
- **As a** 开发者**, I can** 在 round 52+ 加新持久化字段时直接往 `<details>` 内追加而非继续往顶部堆**, so** 顶部不再视觉过载。
- **As a** 重启浏览器的玩家**, I can** 看到新窗口默认折叠 (sessionStorage 不跨 tab 同步)**, so** 折叠行为不会被全局污染。

## 引擎层职责

**Rust `cocos4-rust` 无需改动。** 纯 HUD UI 重构, 无 game logic 变化。

## 游戏层职责 (canonical)

`AGI-miniGame/src/ui/HUD.ts`:
- **新私有助手** `renderPersistentMemories(s: HUDState): string` — 取出所有 5 个持久化 prompt 的渲染, 包在 `<details class="hud-memories"><summary>` 里
- **summary 内容**: 紧凑 emoji 摘要 `↩🗣🧠🎭🎬 <N> 条记忆 · 点击展开` 其中 N = 非 null/非 0 字段数 (一字段一票)
- **`<details>` 默认折叠** — 无 `open` 属性
- **sessionStorage 持久化** — render 后读 `sessionStorage.getItem('hud-memories-open')` 决定是否在 HTML 中加 `open` 属性; render 后通过 `addEventListener('toggle', ...)` 监听用户 toggle, 写 `sessionStorage.setItem('hud-memories-open', e.newState === 'open' ? '1' : '0')`
- **新私有助手** `setupMemoriesToggle(details: HTMLDetailsElement): void` — render 后注入 toggle listener (用 `e.newState` 字符串, 不读 DOM state)
- **render() 修改**: 5 个 `${s.lastXxx ? ...}` 提示行替换为单一 `${this.renderPersistentMemories(s)}` 调用; 5 个原 div (.hud-biome-remembered 等) 移到 details 内部
- **若所有 5 字段都 null/0**: 整个 `<details>` 块不渲染 (向后兼容 round 43 之前空 HUD)
- **SSR/Node 守卫**: `typeof sessionStorage !== 'undefined'` 守卫, 避免 jest 直接构造时抛错 (虽然 jest 30+ jsdom 26 提供 sessionStorage, 留防御)

`AGI-miniGame/src/ui/HUD.test.ts`:
- **`+5 jest`** (round-51 describe 块):
  1. `details_not_rendered_when_no_persistent_memories` — 0 字段时无 `.hud-memories`
  2. `summary_count_reflects_number_of_set_fields` — 设 2 个 → `2 条记忆`; 设 5 个 → `5 条记忆`
  3. `summary_emoji_includes_only_set_fields` — 仅 biome 设时 summary 含 `↩` 不含其它 4 个 emoji
  4. `details_collapsed_by_default_unless_sessionStorage_says_open` — 默认无 `open`; sessionStorage 设 `'1'` 后 render 出 `open` 属性
  5. `toggle_event_writes_sessionStorage` — 模拟 `dispatchEvent(new Event('toggle'))` 验证 sessionStorage 写入 (用 jsdom 26 的 `Event` 因为 `ToggleEvent` 不是全局; 实际代码用 `instanceof ToggleEvent` 守卫, 走字符串检查 path)
- 现有 round 43-47 的 18 个 prompt jest **应全过** — jest 用 `root.innerHTML.toContain('hud-biome-remembered')` 等字面查找, 类名不变, `<details>` 折叠不影响 DOM tree 完整性

`AGI-miniGame/index.html` (CSS additions, ~10 lines, 在 .hud-row 之后):
```css
.hud-memories { margin: 0 0 4px 0; }
.hud-memories > summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--text-1);
  list-style: none;  /* hide default disclosure triangle in WebKit */
  padding: 2px 0;
}
.hud-memories > summary::-webkit-details-marker { display: none; }
.hud-memories[open] > summary { color: var(--neon-cyan); margin-bottom: 2px; }
.hud-memories > .hud-biome-remembered,
.hud-memories > .hud-speaker-remembered,
.hud-memories > .hud-npc-snapshot,
.hud-memories > .hud-npc-mood,
.hud-memories > .hud-scene-blueprint {
  padding: 1px 0 1px 8px;
  border-left: 1px solid rgba(160, 108, 213, 0.25);
}
```

## 验收标准

1. ✅ HUD render 输出含 `<details class="hud-memories">` 元素 (5 字段任一非 null 时)
2. ✅ `<summary>` 紧凑显示 emoji + `N 条记忆` + `点击展开` 提示
3. ✅ `<details>` 默认无 `open` 属性
4. ✅ sessionStorage `hud-memories-open` = `'1'` 时, render 后 `<details>` 有 `open` 属性
5. ✅ `addEventListener('toggle', ...)` 回调在 state 变化时写 sessionStorage (e.newState `'open'` → `'1'`, `'closed'` → `'0'`)
6. ✅ 5 个原 div class (.hud-biome-remembered / .hud-speaker-remembered / .hud-npc-snapshot / .hud-npc-mood / .hud-scene-blueprint) 仍存在, 位置在 `<details>` 内, 渲染内容字节级不变 (round 43-47 现有 18 个 jest 全过)
7. ✅ 0 字段时整个 `<details>` 块不渲染 (无 orphan `<details>`)
8. ✅ jest 全套 487 → 492 (+5 新), 0 回归
9. ✅ tsc --noEmit 干净
10. ✅ cargo test --lib 仍 1964 (无 Rust 改动基线)
11. ✅ `grep -rE 'as any' src/ui/HUD.ts` 仍 0 hit (round 26-42 持续的不变量)
12. ✅ `lsof -i :5173` (Vite dev) 显示 server up, manual `npm run dev` 在浏览器里点击 summary 视觉确认 toggle + 刷新页面 sessionStorage 持久展开状态

## 实现难度

**S (1.5h)**

- HUD renderPersistentMemories + setupMemoriesToggle 助手: ~30 min
- render() 改动 (5 行 → 1 个调用): ~15 min
- CSS (10 行, .hud-memories + summary + 子 div 左边框): ~10 min
- 5 jest (含 1 个 sessionStorage mock): ~30 min
- manual `npm run dev` 视觉确认: ~5 min

## 风险

- **sessionStorage 在 jsdom 是真可用还是 mock**? jsdom 26 提供真 sessionStorage; 现有 round 26 HUD.test.ts 已有 `localStorage.removeItem('agi_locale')` 模式, 直接复用 + 加 `sessionStorage.clear()` in beforeEach。
- **`<details>` `toggle` 事件在 jsdom 是否触发**? jsdom 26 (>= 22.x) 支持 `dispatchEvent(new Event('toggle'))` 但**不会**在用户 click `<summary>` 时自动触发 — 测试需手动 dispatch。**缓解**: 测试用 `detailsEl.open = true; detailsEl.dispatchEvent(new Event('toggle'))` 模拟用户 toggle。
- **`ToggleEvent` 类型在 TypeScript DOM lib 中是否可用**? TS 5.0+ lib.dom.d.ts 含 `ToggleEvent` 接口; 项目 TS ^5.0, 安全。
- **现有 18 个 prompt jest 是否因 div 移到 `<details>` 内而失败**? 不会 — jest 测试都用 `root.innerHTML.toContain(...)` 字面查找, 类名仍在, 不挑 DOM 层级。
- **`<details>` 默认折叠时 `<div class="hud-biome-remembered">` 是否仍在 innerHTML**? 是 — `<details>` 折叠只影响视觉显示, DOM tree 完整。已有 jest `toContain('hud-biome-remembered')` 仍过。
- **sessionStorage 跨 tab 同步是 false-positive 需求吗**? 是 — 用户 reload 整个窗口 (新 tab) 走 sessionStorage 重建, 默认折叠, 这是 PRD 想要的 (新窗口默认折叠, 不被历史状态污染)。
- **数量计算 `N 条记忆` 中 N 的定义**: 用"非 null / 非 0" — biome != null / speakerId != null / npcMindsSnapshotCount > 0 / lastNpcDisposition != null / lastSceneNpcCount != null。一字段一票。
- **emoji 顺序在 summary 里**: 按 round 顺序 `↩🗣🧠🎭🎬` (round 43→47), 视觉历史顺序。
- **CSS `:open` 伪类 vs `details[open]` 属性选择器**: 用 `[open]` 更广泛兼容 (Safari 15.4+ 才支持 `:open`, 不必要冒险)。

## 后续 round 候选 (本 PRD 不做)

- **Round 52**: 加新持久化字段 (e.g. round 49a 之后的 world events 链 / archetype 偏好) 直接进 `<details>`, 不再往顶部堆
- **Round 53**: HUD 完整重设计 (栅格布局, 主题切换, 左下 + 右上 + 右下三 panel 信息密度再平衡)
- **Round 54**: 把 `<details>` 的 `name` 属性 (mutually-exclusive accordion) 用上 — 当未来加多个可折叠 group 时, 互斥展开

## 关键不变量

- **`grep -rE 'as any' src/ui/HUD.ts` → 0 hit** (round 26-42 持续保持)
- **`<details>` 内 5 个原 div class 名不变** (round 43-47 现有 18 个 jest 是 contract)
- **HUD render() 单次同步调用** (无 microtask, 无 race) — 现有 487 jest 建立的同步约定
- **sessionStorage key = `hud-memories-open`** (单 key, 不需要 namespacing — 单一可折叠 surface)
