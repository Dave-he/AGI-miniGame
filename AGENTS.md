# AGI-miniGame 项目规则 (AGENTS.md)

## 项目概述

**AGI-miniGame** 是基于 cocos4-rust 引擎构建的创新性小游戏平台。

### 核心理念
- **统一大世界** - 所有玩法共享同一个世界状态
- **统一账号** - 玩家身份、进度、资产全局通用
- **统一经济** - 货币、道具、资源跨玩法流通
- **AI 生成内容** - AI 自动做内容、调平衡、生成关卡、剧情、NPC

### 核心特性
- 随时切换、组合、生成任意玩法（射击、三消、塔防、卡牌、回合、跑酷、解谜、养成……）
- 玩家体验：永远有新玩法、永远不重样、像在玩所有游戏
- 技术本质：模块化玩法库 + AI 调度生成引擎 + 统一世界状态

---

## 架构设计

### 技术栈

| 层 | 技术 | 职责 |
|---|---|---|
| **引擎层** | Rust (cocos4-rust) | 渲染、物理、音频、输入、场景图 |
| **游戏层** | TypeScript (AGI-miniGame) | 世界状态、经济系统、AI 生成、玩法模块 |

### 项目结构

```
AGI-miniGame/
├── src/                        # TypeScript 游戏代码
│   ├── main.ts                 # 游戏入口和 GameManager
│   ├── index.ts                # 模块导出
│   ├── world/                  # 统一世界状态
│   │   └── WorldState.ts
│   ├── economy/                # 经济系统
│   │   ├── Wallet.ts           # 货币管理
│   │   └── Inventory.ts        # 背包系统
│   ├── player/                 # 玩家系统
│   │   └── PlayerProfile.ts    # 玩家档案和进度
│   ├── ai/                     # AI 内容生成引擎
│   │   └── AIEngine.ts
│   ├── dimension/              # 维度系统
│   │   └── DimensionRunner.ts
│   ├── gameplay/               # 玩法模块
│   │   └── GameplayManager.ts  # 玩法管理器和原子模块
│   ├── ui/                     # UI 系统 (待实现)
│   └── utils/                  # 工具类 (待实现)
│
├── package.json
├── tsconfig.json
├── build.sh                    # 构建脚本
├── ARCHITECTURE.md             # 技术架构文档
└── AGENTS.md                   # 项目规则 (本文件)
```

---

## 开发规范

### 1. 命名规范

#### TypeScript
- **类名**: PascalCase (例: `WorldState`, `GameManager`)
- **接口名**: PascalCase (例: `GameplayModule`, `DimensionConfig`)
- **方法名**: camelCase (例: `addGold()`, `recordDimensionComplete()`)
- **变量名**: camelCase (例: `playerLevel`, `dimensionId`)
- **常量名**: UPPER_SNAKE_CASE (例: `MAX_CAPACITY`)
- **文件名**: PascalCase.ts (例: `WorldState.ts`, `AIEngine.ts`)

#### 模块 ID
- 使用 snake_case (例: `match3`, `tower_defense`, `turn_combat`)

### 2. 代码风格

```typescript
// ✅ 正确：类型注解
export class WorldState {
    public player: PlayerProfile;
    public wallet: Wallet;
}

// ✅ 正确：接口定义
export interface GameplayModule {
    id: string;
    name: string;
    load(): Promise<void>;
    update(dt: number): void;
}

// ✅ 正确：错误处理
try {
    this.loadFromJSON(data);
} catch (e) {
    console.error('Failed to load:', e);
    return false;
}
```

### 3. 模块职责

#### WorldState (统一世界状态)
- 管理玩家档案、经济、进度
- 跨玩法状态持久化
- 提供经济操作接口 (addGold, spendGem)
- 不处理具体玩法逻辑

#### AIEngine (AI 内容生成引擎)
- 生成随机维度蓝图
- 动态调整难度
- 记录玩家表现
- 不处理运行时游戏逻辑

#### DimensionRunner (维度系统)
- 管理维度生命周期
- 跟踪目标和进度
- 处理维度事件
- 不处理具体玩法模块

#### GameplayManager (玩法管理器)
- 注册和加载玩法模块
- 调度玩法更新循环
- 不实现具体玩法逻辑

#### GameplayModule (玩法模块接口)
- 每个玩法实现 GameplayModule 接口
- 独立管理自己的状态
- 通过 WorldState 与全局交互

### 4. 数据流规则

```
玩家操作 → GameManager → WorldState (状态变更)
                    ↓
              AIEngine (内容生成)
                    ↓
              DimensionRunner (维度管理)
                    ↓
              GameplayManager (玩法调度)
                    ↓
              GameplayModule (具体玩法)
```

**规则**:
- 状态变更必须通过 WorldState
- 玩法模块不能直接修改其他玩法的状态
- AI 生成的内容通过 DimensionConfig 传递
- 经济操作通过 Wallet 统一处理

---

## 模块实现指南

### 新增玩法模块

1. **实现 GameplayModule 接口**

```typescript
export class MyNewModule implements GameplayModule {
    id = 'my_new_game';
    name = '我的新玩法';
    
    private score: number = 0;

    async load(): Promise<void> {
        // 初始化
    }

    update(dt: number): void {
        // 游戏逻辑
    }

    pause(): void {}
    resume(): void {}
    unload(): void {}
    getScore(): number { return this.score; }
}
```

2. **注册到 GameplayManager**

```typescript
this.gameplayManager.registerModule('my_new_game', () => new MyNewModule());
```

3. **AI 自动识别** - AIEngine 的 getDefaultAtoms() 中添加新玩法

### 新增货币类型

```typescript
// 在 Wallet.ts 中
this.currencies.set('new_currency', 0);
this.currencyCaps.set('new_currency', 10000);
```

### 自定义 AI 生成规则

```typescript
// 扩展 DimensionGenerator
private generateCustomRules(): GeneratedRule[] {
    // 自定义规则生成逻辑
}
```

---

## 经济系统规则

### 货币类型
- `gold` - 金币 (基础货币)
- `gem` - 宝石 (高级货币)
- `energy` - 体力 (限制游戏次数)
- `token` - 代币 (活动货币)

### 经济操作
```typescript
// ✅ 正确：通过 WorldState 操作
worldState.addGold(100);
worldState.spendGem(50);

// ❌ 错误：直接修改内部状态
worldState.wallet.currencies.set('gold', 9999);
```

### 奖励发放
```typescript
// 维度完成时自动发放
worldState.recordDimensionComplete(
    dimensionId,
    score,
    [
        { itemId: 'gold', quantity: 100 },
        { itemId: 'gem', quantity: 5 },
    ]
);
```

---

## AI 生成规则

### 维度生成配置

```typescript
const config: GenerationConfig = {
    minAtoms: 2,           // 最少玩法数
    maxAtoms: 4,           // 最多玩法数
    difficultyRange: [0.3, 0.8],  // 难度范围
    playerLevel: 5,        // 玩家等级
    preferredTypes: [],    // 偏好玩法
    excludedTypes: [],     // 排除玩法
    rewardMultiplier: 1.0, // 奖励倍率
};
```

### 难度调整
- AI 根据玩家历史表现动态调整难度
- 目标胜率: 60%
- 根据最近 20 次游戏记录调整

### 内容生成
- 维度名称: 形容词 + 名词 (例: "混沌迷宫")
- 主题: 随机选择视觉主题
- 规则: 根据难度生成 1-5 条规则
- 奖励: 根据难度和倍率计算

---

## 测试规范

### 单元测试

```typescript
describe('WorldState', () => {
    it('should add gold correctly', () => {
        const ws = new WorldState('test_player');
        ws.addGold(100);
        expect(ws.getGold()).toBe(100);
    });

    it('should fail to spend insufficient gold', () => {
        const ws = new WorldState('test_player');
        expect(ws.spendGold(100)).toBe(false);
    });
});
```

### 玩法模块测试

```typescript
describe('Match3Module', () => {
    it('should detect matches', async () => {
        const module = new Match3Module();
        await module.load();
        // 测试匹配检测
    });
});
```

---

## 构建和部署

### 开发模式

```bash
cd AGI-miniGame
npm install
npm run dev
```

### 生产构建

```bash
npm run build
```

### 一键构建

```bash
chmod +x build.sh
./build.sh
```

---

## 性能优化

### 1. 对象复用
```typescript
// ✅ 正确：复用对象池
const pool = new ObjectPool<Enemy>();
const enemy = pool.acquire();

// ❌ 错误：频繁创建对象
for (let i = 0; i < 100; i++) {
    const enemy = new Enemy();
}
```

### 2. 批量更新
```typescript
// ✅ 正确：批量更新 UI
uiManager.applyBatch(updates);

// ❌ 错误：逐个更新
for (const update of updates) {
    uiManager.updateOne(update);
}
```

### 3. 资源预加载
```typescript
// 预加载可能切换的玩法资源
await gameplayManager.preloadGameplay(['match3', 'tower_defense']);
```

---

## 安全规则

### 1. 客户端验证
- 所有经济操作需要服务器验证
- 关键状态变更使用事务

### 2. 反作弊
- 检测异常游戏数据
- 限制操作频率
- 验证游戏逻辑一致性

### 3. 数据持久化
```typescript
// 定期保存
setInterval(() => {
    worldState.saveToStorage();
}, 60000); // 每分钟保存

// 关键操作立即保存
worldState.addGold(1000);
worldState.saveToStorage();
```

---

## 常见问题

### Q: 如何添加新玩法？
A: 实现 GameplayModule 接口，注册到 GameplayManager，在 AIEngine 的 getDefaultAtoms() 中添加。

### Q: 如何跨玩法共享数据？
A: 通过 WorldState 的 globalData Map 存储和读取。

### Q: 如何自定义 AI 生成？
A: 扩展 DimensionGenerator 类，覆写生成方法。

### Q: 如何处理玩法切换？
A: 使用 GameplayManager.loadGameplay() 加载新玩法，旧玩法自动卸载。

---

## 版本历史

- **v0.1.0** (2026-05-25)
  - 初始架构设计
  - 核心模块实现 (WorldState, AIEngine, DimensionRunner)
  - 基础玩法模块 (Match3, Tower, Card, Parkour, Puzzle)
  - TypeScript 项目结构

---

## 联系方式

- 项目地址: `/Users/hyx/workspace/cocos-engine/AGI-miniGame`
- 架构文档: `ARCHITECTURE.md`
- 引擎项目: `/Users/hyx/workspace/cocos-engine/cocos4-rust`
