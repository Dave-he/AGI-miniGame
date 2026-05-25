# AGI-miniGame 技术架构文档

## 项目概述

**AGI-miniGame** 是基于 cocos4-rust 引擎构建的创新性小游戏平台。已全面升级为以 3D 世界模型、独立组件模块以及 AI 中枢驱动的统一体验层。

### 升级架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一世界与体验层 (Unified World)                │
│  [无限次元城] 统一角色 | 统一经济 | 统一成长 | 无缝模块切换            │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                      超级大脑 (AI Central)                       │
│                                                                 │
│  [A] 玩法组合 AI (LLM+RL)        [B] 内容生成 AI (SD/LLM/WFC)     │
│  [C] 平衡 AI (实时监控/调参)     [D] 智能 NPC / 世界 AI (LLM)     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    AGI-miniGame 游戏层                           │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │ 独立玩法模块   │ │ Three.js 3D  │ │ 音效/动画             │    │
│  │ (Module Mgr) │ │ SceneMgr.ts  │ │ AudioMgr.ts          │    │
│  │ WorldState.ts│ │ UIMgr.ts     │ │ AnimationSystem.ts   │    │
│  │ AIEngine.ts  │ │              │ │                      │    │
│  │ Economy.ts   │ │              │ │                      │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│              JS/TS API Layer (bindings)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Rust 引擎 API  →  JS/TS 绑定                              │   │
│  │  Node, 3D Position, Physics, Input 等                     │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│              cocos4-rust Engine (底层游戏引擎)                   │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────┐ ┌────┐ ┌─────┐ │
│  │  core   │ │3D Physics│ │ State   │ │audio │ │ ui │ │input│ │
│  └─────────┘ └──────────┘ └─────────┘ └──────┘ └────┘ └─────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 架构分层说明

| 层 | 技术 | 职责 |
|---|---|---|
| **统一体验层** | TypeScript | 统一主场景(无限次元城)、角色互通、经济互通、成长反哺、无缝切换 |
| **超级大脑(AI层)** | TS/云端 API | 玩法调度、内容动态生成、实时平衡监控、NPC智能驱动 |
| **游戏逻辑层** | TypeScript | 独立 3D 玩法模块组件化加载、世界状态维护 |
| **API 绑定层** | JS/TS bindings | 引擎 API 的 TypeScript 接口 |
| **引擎层** | Rust | 3D 渲染、物理、音频、输入、场景图 ECS 计算 |

---

## 核心模块 (TypeScript)

### 1. 超级大脑 AI 中枢 (AIEngine)

包含四大 AI 的统一接口与调度：

```typescript
// src/ai/AIEngine.ts
export class AIEngine {
    public gameplayAI: GameplayCombinerAI;
    public contentAI: ContentGeneratorAI;
    public balanceAI: BalanceTunerAI;
    public worldAI: SmartWorldAI;

    constructor() {
        this.gameplayAI = new GameplayCombinerAI();
        this.contentAI = new ContentGeneratorAI();
        this.balanceAI = new BalanceTunerAI();
        this.worldAI = new SmartWorldAI();
    }
}
```

### 2. 独立玩法模块 (GameplayManager)

所有玩法拆分为独立组件（代码、配置、美术分离），由 AI 调度任意组合或动态加载。

```typescript
// src/gameplay/GameplayManager.ts
export class GameplayManager {
    private activeModules: Map<string, GameplayModule>;

    // AI 动态加载，任意组合 (如 塔防 + 三消)
    async loadCombination(moduleIds: string[]): Promise<void> {
        // 无缝加载逻辑，不重启游戏
    }

    toggleModule(moduleId: string, enable: boolean): void;
    update(dt: number): void;
}

export interface GameplayModule {
    id: string;
    name: string;
    config: ModuleConfig; // 独立配置
    assets: string[];     // 独立美术资源
    load(): Promise<void>;
    update(dt: number): void;
    unload(): void;
}
```

### 3. 统一世界状态 (WorldState)

统一所有玩法的底层数据，确保无割裂感。

```typescript
// src/world/WorldState.ts
export class WorldState {
    private unifiedPlayer: PlayerProfile; // 统一角色
    private unifiedEconomy: Wallet;       // 统一经济 (通用货币 + 专属代币)
    private unifiedGrowth: Progression;   // 统一成长 (等级、天赋互通)
    
    // 主场景入口
    public mainHub: "InfiniteDimensionalCity";

    constructor(accountId: string) {
        this.unifiedPlayer = new PlayerProfile(accountId);
        this.unifiedEconomy = new Wallet();
        this.unifiedGrowth = new Progression();
    }
}
```

---

## 项目结构 (升级版)

```
AGI-miniGame/
├── src/                        # TypeScript 游戏代码
│   ├── main.ts                 # 游戏入口
│   ├── world/                  # 统一世界层
│   │   ├── WorldState.ts
│   │   ├── InfiniteCity.ts     # 统一主场景
│   │   └── SharedWorld.ts
│   ├── economy/                # 统一经济系统
│   │   ├── Wallet.ts
│   │   └── Inventory.ts
│   ├── player/                 # 统一玩家系统
│   │   ├── PlayerProfile.ts
│   │   └── Progression.ts
│   ├── ai/                     # 超级大脑 AI 中枢
│   │   ├── AIEngine.ts
│   │   ├── GameplayCombinerAI.ts # 玩法组合 AI
│   │   ├── ContentGeneratorAI.ts # 内容生成 AI
│   │   ├── BalanceTunerAI.ts     # 平衡 AI
│   │   └── SmartWorldAI.ts       # 智能 NPC/世界 AI
│   ├── gameplay/               # 独立玩法模块系统
│   │   ├── GameplayManager.ts
│   │   ├── modules/
│   │   │   ├── Match3Module.ts
│   │   │   ├── TowerModule.ts
│   │   │   ├── ParkourModule.ts
│   │   │   └── ShooterModule.ts
│   ├── ui/                     # UI 系统
│   │   ├── UIManager.ts
│   │   └── HUD.ts
│   └── utils/                  # 工具类
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── ARCHITECTURE.md
```

---

## 数据流：从无限次元城进入 AI 生成组合玩法

```
玩家在无限次元城              超级大脑 AI 层                   底层 ECS 引擎
  │                              │                                │
  │ 点击"探索新维度"入口         │                                │
  ├────────────────────────────>│                                │
  │                              │ 1. GameplayCombinerAI 介入     │
  │                              │    分析玩家等级、偏好         │
  │                              │                                │
  │                              │ 2. 生成玩法组合公式            │
  │                              │    (如: 跑酷 + 合成)           │
  │                              │                                │
  │                              │ 3. ContentGeneratorAI 生成内容 │
  │                              │    (3D场景/BGM/剧情)           │
  │                              │                                │
  │                              │ 4. 无缝加载 GameplayModules    │
  │                              │    gameplayManager.load()      │
  │                              │                                │
  │ 游戏进行中 (混合玩法)        │ 5. BalanceTunerAI 实时监控     │ 6. 3D渲染/物理更新
  ├────────────────────────────>│    自动调参(难度/掉落)          │    engine.update()
  │                              │                                │
  │ 玩法结束                     │ 7. 奖励结算至统一经济/成长     │
  ├────────────────────────────>│    worldState.record()         │
  │                              │    无缝切回无限次元城         │
```

## 总结

升级后的 AGI-miniGame 采用 **3D 引擎 + 独立玩法组件 + 四大 AI 中枢** 的全新架构，通过统一世界体验层消除了玩法拼接的割裂感。玩家不仅能体验由 AI 根据其状态量身定制的“无限次元”，而且所有进步与产出都反哺于一个生生不息的动态世界中。
