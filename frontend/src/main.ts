import './style.css'
import init, { GameEngine } from 'agi-minigame-wasm';
import * as THREE from 'three';

interface EntityRenderData {
    id: number;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: string;
    vx: number;
    vy: number;
    vz: number;
    is_static: boolean;
}

// 预设的 AI 热更新逻辑模板 (3D)
const defaultHotCode = `// AI 生成的实时逻辑
// variables: entities (渲染数据), engine (Rust WASM 引擎)

// 让移动的方块稍微变色，模拟受热
for (let entity of entities) {
    if (!entity.is_static && Math.abs(entity.vy) > 150) {
        // 垂直高速下落时变色
        if (Math.random() > 0.95) {
            entity.color = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        }
    }
}
`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>AGI-miniGame 3D</h1>
  <p>混合架构 (Rust ECS + TS Three.js) | 动态热更新 | AI 实时生成</p>
  
  <div class="layout">
    <div class="game-panel">
        <div id="game-bg" class="game-canvas-container">
            <!-- Canvas 将由 Three.js 动态生成 -->
            <div id="three-container" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"></div>
        </div>
    </div>
    
    <div class="control-panel">
        <h3>AI 造物主控制台</h3>
        <button id="aiGenerateBtn" class="ai-btn">✨ AI 实时生成 3D 场景氛围</button>
        <button id="aiLogicBtn" class="ai-btn">🧠 AI 实时推演 3D 规则</button>
        <button id="addEntityBtn">➕ 生成 3D 实体 (JS -> Rust)</button>
        
        <h4 style="margin-bottom: 5px;">实时热更新逻辑 (JS)</h4>
        <textarea id="ai-code">${defaultHotCode}</textarea>
        <button id="applyCodeBtn">🚀 应用热更新逻辑</button>
        
        <h4 style="margin-bottom: 5px;">系统日志</h4>
        <div id="logs" class="logs">系统已启动，等待 AI 接入...</div>
    </div>
  </div>
`;

function logMsg(msg: string) {
    const logs = document.getElementById('logs')!;
    logs.innerHTML += `<br/>[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.scrollTop = logs.scrollHeight;
}

async function runGame() {
    // Initialize WASM module
    await init();
    logMsg("Rust WASM 3D 引擎已加载完毕！");

    const container = document.getElementById('three-container')!;
    const gameBg = document.getElementById('game-bg')!;

    // --- Three.js Setup ---
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const scene = new THREE.Scene();
    // 允许透明背景，露出背后的 AI 图片
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
    camera.position.set(0, 150, 400); // 抬高并后退相机
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    // 存储 Three.js 的 Mesh 映射
    const meshMap = new Map<number, THREE.Mesh>();

    // --- Rust Engine Setup ---
    const boundsSize = 400.0;
    const engine = new GameEngine(boundsSize);

    // 辅助网格 (表示边界)
    const gridHelper = new THREE.GridHelper(boundsSize, 10, 0x888888, 0x444444);
    gridHelper.position.y = -boundsSize / 2;
    scene.add(gridHelper);

    // AI 生成背景
    const aiGenerateBtn = document.getElementById('aiGenerateBtn')!;
    aiGenerateBtn.addEventListener('click', () => {
        logMsg("AI 正在构思新的 3D 氛围...");
        const themes = ["cyberpunk neon city", "mystical forest ruins", "deep space nebula", "ancient desert temple"];
        const randomTheme = themes[Math.floor(Math.random() * themes.length)];
        
        const prompt = encodeURIComponent(`${randomTheme}, high quality, game background, concept art`);
        const bgUrl = `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${prompt}&image_size=landscape_4_3`;
        
        gameBg.style.backgroundImage = `url('${bgUrl}')`;
        logMsg(`AI 已生成场景氛围: ${randomTheme}`);
    });

    // AI 逻辑定制生成 (模拟服务端 LLM 根据战况推演)
    const aiLogicBtn = document.getElementById('aiLogicBtn')!;
    
    aiLogicBtn.addEventListener('click', () => {
        logMsg("🧠 AI 正在分析 3D 世界状态...");
        
        // 模拟 LLM 思考时间
        setTimeout(() => {
            const renderDataJson = engine.get_render_data();
            const currentEntities = JSON.parse(renderDataJson);
            const count = currentEntities.length;
            
            let generatedLogic = `// 🤖 AI 实时生成的 3D 规则 (当前实体数: ${count})\n\n`;
            
            if (count === 1) {
                // 只有地面时
                generatedLogic += `// 世界太空旷了，AI 决定下一点方块雨\n`;
                generatedLogic += `if (Math.random() < 0.05) {\n    const rx = (Math.random() - 0.5) * 350;\n    const rz = (Math.random() - 0.5) * 350;\n    engine.add_entity(rx, 180, rz, '#00ffff', 0, -50, 0);\n}`;
                logMsg(`AI 觉得太空旷，生成了 [方块雨] 规则`);
            } else if (count > 15) {
                // 实体太多时，改变重力方向为中心吸引
                generatedLogic += `// 实体太多，AI 触发了空间塌缩！\n`;
                generatedLogic += `for (let entity of entities) {\n    if (entity.is_static) continue;\n    // 向中心原点(0,0,0)施加引力\n    entity.vx += (0 - entity.x) * 0.05;\n    entity.vy += (50 - entity.y) * 0.05; // 悬浮在半空\n    entity.vz += (0 - entity.z) * 0.05;\n    entity.color = '#ff3366'; // 警告红\n}`;
                logMsg(`AI 发现实体过多(${count})，生成了 [空间塌缩] 规则`);
            } else {
                // 一般情况，赋予量子纠缠效果（随机瞬间移动）
                generatedLogic += `// 赋予实体量子纠缠特性\n`;
                generatedLogic += `for (let entity of entities) {\n    if (!entity.is_static && Math.random() < 0.01) {\n        entity.x += (Math.random() - 0.5) * 100;\n        entity.z += (Math.random() - 0.5) * 100;\n        entity.color = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');\n    }\n}`;
                logMsg(`AI 结合现状，生成了 [量子跳跃] 规则`);
            }
            
            // 将代码写入文本框
            const codeInput = document.getElementById('ai-code') as HTMLTextAreaElement;
            codeInput.value = generatedLogic;
            
            // 自动点击应用
            document.getElementById('applyCodeBtn')!.click();
            
        }, 1200);
    });

    // 手动添加实体
    const addBtn = document.getElementById('addEntityBtn')!;
    addBtn.addEventListener('click', () => {
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        // 在高空随机位置生成
        const rx = (Math.random() - 0.5) * (boundsSize - 50);
        const ry = (boundsSize / 2) - 20; 
        const rz = (Math.random() - 0.5) * (boundsSize - 50);
        
        const vx = (Math.random() - 0.5) * 300;
        const vy = (Math.random() - 0.5) * 100;
        const vz = (Math.random() - 0.5) * 300;
        
        engine.add_entity(rx, ry, rz, randomColor, vx, vy, vz);
        logMsg(`已向 Rust 引擎发送 3D Spawn 指令`);
    });

    // 热更新逻辑
    let dynamicRules: Function[] = [];
    const applyCodeBtn = document.getElementById('applyCodeBtn')!;
    applyCodeBtn.addEventListener('click', () => {
        const code = (document.getElementById('ai-code') as HTMLTextAreaElement).value;
        try {
            const ruleFn = new Function('entities', 'engine', code);
            dynamicRules = [ruleFn];
            logMsg("✅ 3D 游戏逻辑已热更新！");
        } catch (e: any) {
            logMsg(`❌ 热更新失败: ${e.message}`);
        }
    });

    let lastTime = performance.now();

    function gameLoop(time: number) {
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        // 1. Update Game State in Rust
        engine.update(dt);

        // 2. Get Render Data from Rust
        const renderDataJson = engine.get_render_data();
        const entities: EntityRenderData[] = JSON.parse(renderDataJson);

        // 3. 执行 JS 热更新逻辑
        for (const ruleFn of dynamicRules) {
            try {
                ruleFn(entities, engine);
            } catch(e) {
                console.error(e);
            }
        }

        // 4. Update Three.js Meshes
        // 记录当前帧存在的实体 ID，用于清理已删除的实体
        const currentIds = new Set<number>();

        for (const entity of entities) {
            currentIds.add(entity.id);
            
            let mesh = meshMap.get(entity.id);
            if (!mesh) {
                // 如果是新实体，创建对应的 Three.js Mesh
                const geometry = new THREE.BoxGeometry(entity.width, entity.height, entity.depth);
                
                // 颜色转换
                const matColor = new THREE.Color(entity.color);
                const material = new THREE.MeshLambertMaterial({ 
                    color: matColor,
                    transparent: entity.is_static,
                    opacity: entity.is_static ? 0.5 : 1.0 // 让地面半透明
                });
                
                mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                meshMap.set(entity.id, mesh);
            }

            // 更新位置
            mesh.position.set(entity.x, entity.y, entity.z);
            
            // 更新颜色 (如果热更新逻辑修改了颜色)
            const currentMatColor = (mesh.material as THREE.MeshLambertMaterial).color;
            if ('#'+currentMatColor.getHexString() !== entity.color.toLowerCase()) {
                (mesh.material as THREE.MeshLambertMaterial).color.set(entity.color);
            }
        }

        // 清理 Rust 中已被删除的实体
        for (const [id, mesh] of meshMap.entries()) {
            if (!currentIds.has(id)) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                (mesh.material as THREE.Material).dispose();
                meshMap.delete(id);
            }
        }
        
        // 缓慢旋转相机以展示 3D 效果
        const camRadius = 400;
        const camSpeed = time * 0.0002;
        camera.position.x = Math.sin(camSpeed) * camRadius;
        camera.position.z = Math.cos(camSpeed) * camRadius;
        camera.lookAt(0, 0, 0);

        // Render scene
        renderer.render(scene, camera);

        requestAnimationFrame(gameLoop);
    }

    // 处理窗口大小变化
    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    requestAnimationFrame(gameLoop);
}

runGame().catch(console.error);
