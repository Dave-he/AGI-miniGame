import './style.css'
import init, { GameEngine } from 'agi-minigame-wasm';

interface EntityRenderData {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
}

// 预设的 AI 热更新逻辑模板
const defaultHotCode = `// AI 生成的实时逻辑
// variables: entities (渲染数据), engine (Rust WASM 引擎), canvas (画布)

// 让所有方块反弹（而不仅是穿屏）
for (let entity of entities) {
    if (entity.x > canvas.width - entity.width || entity.x < 0) {
        // 这里仅演示 JS 层附加逻辑，实际最好在 Rust 层修改
        entity.color = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }
}
`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="header-container">
    <h1>AGI-miniGame</h1>
    <p class="subtitle">AI-Driven Engine | Rust ECS + TS View | Real-time Logic Generation</p>
  </div>
  
  <div class="layout">
    <div class="game-panel">
        <div class="game-header">
            <div class="stat-badge">Entities: <span id="stat-entities" class="stat-value">0</span></div>
            <div class="stat-badge">FPS: <span id="stat-fps" class="stat-value">0</span></div>
            <div class="stat-badge">Player Score: <span id="stat-score" class="stat-value">0</span></div>
        </div>
        <div id="game-bg" class="game-canvas-container">
            <canvas id="gameCanvas" width="800" height="600"></canvas>
        </div>
    </div>
    
    <div class="control-panel">
        <div class="panel-section">
            <h3>🎨 AI 造物主 (场景)</h3>
            <input type="text" id="aiImagePrompt" class="custom-input" placeholder="输入场景描述 (留空则随机生成)" />
            <div class="btn-group">
                <button id="aiGenerateBtn" class="ai-btn">✨ 实时生成游戏场景</button>
            </div>
        </div>

        <div class="panel-section">
            <h3>🎮 实体控制</h3>
            <div class="btn-group">
                <button id="addEntityBtn">➕ 注入实体 (Rust)</button>
            </div>
        </div>
        
        <div class="panel-section">
            <h3>🧠 AI 逻辑定制生成 (JS)</h3>
            <div class="btn-group">
                <button id="aiLogicBtn" class="ai-btn" style="margin-bottom: 8px;">🤖 根据当前战况定制逻辑</button>
            </div>
            <textarea id="ai-code">${defaultHotCode}</textarea>
            <div class="btn-group" style="margin-top: 8px;">
                <button id="applyCodeBtn">🚀 热更新并应用逻辑</button>
            </div>
        </div>
        
        <div class="panel-section">
            <h3>终端日志</h3>
            <div id="logs" class="logs">
                <div class="log-entry"><span class="log-time">[System]</span><span class="log-info">终端已启动，等待 AI 接入...</span></div>
            </div>
        </div>
    </div>
  </div>
`;

function logMsg(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const logs = document.getElementById('logs')!;
    const time = new Date().toLocaleTimeString();
    logs.innerHTML += `<div class="log-entry"><span class="log-time">[${time}]</span><span class="log-${type}">${msg}</span></div>`;
    logs.scrollTop = logs.scrollHeight;
}

async function runGame() {
    // Initialize WASM module
    await init();
    logMsg("Rust WASM 引擎已加载完毕！");

    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const gameBg = document.getElementById('game-bg')!;

    // Create the Rust Game Engine instance
    const engine = new GameEngine(canvas.width, canvas.height);

    // AI 生成背景
    const aiGenerateBtn = document.getElementById('aiGenerateBtn')!;
    aiGenerateBtn.addEventListener('click', () => {
        const customPrompt = (document.getElementById('aiImagePrompt') as HTMLInputElement).value;
        logMsg("AI 正在构思新的世界...", "info");
        
        let promptText = "";
        let themeName = "";
        
        if (customPrompt.trim().length > 0) {
            themeName = customPrompt;
            promptText = `${customPrompt}, high quality, game background, pixel art style, vibrant colors`;
        } else {
            const themes = ["cyberpunk city", "magical fantasy forest", "futuristic space station", "post-apocalyptic wasteland", "underwater neon base"];
            const randomTheme = themes[Math.floor(Math.random() * themes.length)];
            themeName = randomTheme;
            promptText = `${randomTheme}, high quality, game background, pixel art style`;
        }
        
        const prompt = encodeURIComponent(promptText);
        const bgUrl = "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=" + prompt + "&image_size=landscape_4_3";
        
        gameBg.style.backgroundImage = `url('${bgUrl}')`;
        logMsg(`AI 已生成场景: ${themeName}`, "success");
    });

    // AI 逻辑定制生成
    const aiLogicBtn = document.getElementById('aiLogicBtn')!;
    let playerScore = 0;
    
    aiLogicBtn.addEventListener('click', () => {
        logMsg("AI 正在分析玩家行为...", "warn");
        setTimeout(() => {
            const renderDataJson = engine.get_render_data();
            const currentEntities = JSON.parse(renderDataJson);
            const count = currentEntities.length;
            
            let generatedLogic = `// AI 实时生成的逻辑 (基于玩家当前状态)\n// 当前实体数: ${count}, 玩家得分: ${playerScore}\n\n`;
            
            if (count > 10) {
                generatedLogic += `// 实体太多了！增加引力中心让它们聚集\n`;
                generatedLogic += `for (let entity of entities) {\n    const centerX = canvas.width / 2;\n    const centerY = canvas.height / 2;\n    entity.x += (centerX - entity.x) * 0.01;\n    entity.y += (centerY - entity.y) * 0.01;\n    entity.color = '#ff3366'; // 变红预警\n}`;
                logMsg(`AI 发现实体过多(${count})，已生成 [引力聚集] 逻辑`, "success");
            } else if (playerScore > 50) {
                generatedLogic += `// 玩家得分很高！增加随机跳跃增加难度\n`;
                generatedLogic += `for (let entity of entities) {\n    if (Math.random() < 0.05) {\n        entity.y -= 20; // 随机上跳\n    }\n    entity.color = '#33ffcc';\n}`;
                logMsg(`AI 发现玩家得分较高(${playerScore})，已生成 [随机跳跃] 逻辑`, "success");
            } else {
                generatedLogic += `// 默认游玩状态，赋予呼吸特效\n`;
                generatedLogic += `const time = performance.now() / 200;\nfor (let entity of entities) {\n    entity.width = 20 + Math.sin(time + entity.id) * 10;\n    entity.height = 20 + Math.cos(time + entity.id) * 10;\n    if (entity.x > canvas.width || entity.x < 0) {\n        entity.color = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');\n    }\n}`;
                logMsg(`AI 已生成 [呼吸特效] 逻辑`, "success");
            }
            
            (document.getElementById('ai-code') as HTMLTextAreaElement).value = generatedLogic;
        }, 600); // 模拟思考延迟
    });

    // 手动添加实体
    const addBtn = document.getElementById('addEntityBtn')!;
    addBtn.addEventListener('click', () => {
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const randomY = Math.random() * (canvas.height - 50);
        engine.add_entity(0, randomY, randomColor);
        playerScore += 10; // 模拟得分
        logMsg(`已向 Rust 引擎发送 Spawn 指令。得分 +10`, "info");
    });

    // 热更新逻辑
    let dynamicRules: Function[] = [];
    const applyCodeBtn = document.getElementById('applyCodeBtn')!;
    applyCodeBtn.addEventListener('click', () => {
        const code = (document.getElementById('ai-code') as HTMLTextAreaElement).value;
        try {
            const ruleFn = new Function('entities', 'engine', 'canvas', code);
            dynamicRules = [ruleFn]; // 替换当前逻辑
            logMsg("✅ 游戏逻辑已热更新并注入运行！", "success");
        } catch (e: any) {
            logMsg(`❌ 热更新编译失败: ${e.message}`, "error");
        }
    });

    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsTime = lastTime;
    let currentFps = 0;

    function gameLoop(time: number) {
        const dt = (time - lastTime) / 1000;
        lastTime = time;
        frameCount++;
        
        if (time - lastFpsTime >= 1000) {
            currentFps = frameCount;
            frameCount = 0;
            lastFpsTime = time;
        }

        // 1. Update Game State in Rust
        engine.update(dt);

        // 2. Get Render Data from Rust
        const renderDataJson = engine.get_render_data();
        const entities: EntityRenderData[] = JSON.parse(renderDataJson);

        // 3. 执行 JS 热更新逻辑
        for (const ruleFn of dynamicRules) {
            try {
                ruleFn(entities, engine, canvas);
            } catch(e) {
                // 不在这里 console.error 以免刷屏
            }
        }

        // 4. Render in TS/Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (const entity of entities) {
            ctx.fillStyle = entity.color;
            ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
            
            // Draw ID
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`ID:${entity.id}`, entity.x, entity.y - 5);
        }
        
        // 更新统计 UI
        document.getElementById('stat-entities')!.innerText = entities.length.toString();
        document.getElementById('stat-fps')!.innerText = currentFps.toString();
        document.getElementById('stat-score')!.innerText = playerScore.toString();

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

runGame().catch(console.error);
