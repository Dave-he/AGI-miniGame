# AGI-miniGame

AI 驱动的 3D 小游戏平台 — 基于 Rust ECS + WASM + Three.js 构建的"无限次元城"。

## 特性

- **Rust ECS 引擎** — 高性能实体组件系统，编译为 WASM 在浏览器中运行
- **3D 渲染** — Three.js 驱动的 3D 场景与交互
- **AI 中枢** — 四大 AI 协同：玩法组合、内容生成、数值平衡、智能 NPC
- **模块化玩法** — 塔防、三消、跑酷、射击等独立组件，支持任意组合
- **统一世界** — 统一角色、经济、成长体系，玩法间无缝切换
- **DSL 规则引擎** — 自定义游戏规则描述语言

## 技术栈

| 层 | 技术 |
|---|---|
| 前端渲染 | Three.js + TypeScript + Vite |
| 游戏引擎 | Rust + WASM (wasm-pack) |
| ECS & 物理 | 自研 Rust ECS + 物理系统 |
| AI 中枢 | TypeScript / 云端 API |
| 部署 | GitHub Pages + GitHub Actions |

## 项目结构

```
AGI-miniGame/
├── src/                    # Rust 引擎源码
│   ├── ecs/                # 实体组件系统
│   ├── systems/            # 系统逻辑 (物理等)
│   ├── dsl/                # 规则 DSL 解析器
│   ├── schema/             # 规则 Schema
│   ├── atoms/              # Atom 原子化组件
│   ├── events/             # 事件系统
│   ├── wasm_api.rs         # WASM 导出接口
│   └── lib.rs              # 库入口
├── frontend/               # 前端项目
│   ├── src/
│   │   ├── core/           # 核心模块 (AI、经济、世界状态)
│   │   ├── atoms/          # 前端 Atom 组件
│   │   └── main.ts         # 前端入口
│   ├── index.html
│   └── package.json
├── tests/                  # Rust 测试
├── docs/                   # 设计文档
├── ARCHITECTURE.md         # 架构文档
└── PRD.md                  # 产品需求文档
```

## 快速开始

### 环境要求

- [Rust](https://rustup.rs/) (stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Node.js](https://nodejs.org/) >= 20

### 构建 & 运行

```bash
# 1. 编译 Rust → WASM
wasm-pack build --target web

# 2. 安装前端依赖
cd frontend && npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build
```

### 运行测试

```bash
# Rust 测试
cargo test

# 前端构建检查
cd frontend && npm run build
```

## 在线体验

部署完成后可访问：[https://dave-he.github.io/AGI-miniGame/](https://dave-he.github.io/AGI-miniGame/)

## 文档

- [产品需求文档 (PRD)](PRD.md)
- [技术架构文档](ARCHITECTURE.md)
- [核心玩法设计](docs/specs/2026-05-25-agi-minigame-design.md)
- [实现计划](docs/superpowers/plans/2026-05-25-agi-minigame-core.md)

## License

[MIT](LICENSE)
