import './style.css'
import init, { GameEngine } from 'agi-minigame-wasm';
import * as THREE from 'three';
import { AiEngine, UnifiedWorldState, GameplayManager, SceneLifecycleManager, EngineTelemetrySampler, SceneDirector, SceneWorldBuilder, SceneAestheticSystem, SceneObjectiveSystem } from './agi_minigame';
import type { GeneratedSceneRecord, PlayerSceneProfile, SceneDirectorPlan, SceneAestheticReport, SceneObjectiveSession } from './agi_minigame';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

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
    entity_type?: number;
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
  <div class="header-container">
    <h1>AGI-miniGame 3D</h1>
    <p class="subtitle">Rust ECS + Three.js + AGI Scene Orchestrator</p>
  </div>
  
  <div class="layout">
    <div class="game-panel">
        <div class="game-header">
            <div class="stat-badge">场景 <span id="stat-scene" class="stat-value">Hub</span></div>
            <div class="stat-badge">玩家 <span id="stat-player" class="stat-value">P1</span></div>
            <div class="stat-badge">热度 <span id="stat-hotness" class="stat-value">0.00</span></div>
            <div class="stat-badge">审美 <span id="stat-aesthetic" class="stat-value">0.00</span></div>
            <div class="stat-badge">得分 <span id="stat-score" class="stat-value">0</span></div>
            <div class="stat-badge">金币 <span id="stat-gold" class="stat-value">0</span></div>
            <div class="stat-badge">实体 <span id="stat-entities" class="stat-value">0</span></div>
            <div class="stat-badge">碰撞 <span id="stat-collisions" class="stat-value">0</span></div>
            <div class="stat-badge">压力 <span id="stat-pressure" class="stat-value">0.00</span></div>
        </div>
        <div id="game-bg" class="game-canvas-container">
            <!-- Canvas 将由 Three.js 动态生成 -->
            <div id="three-container" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"></div>
        </div>
    </div>
    
    <div class="control-panel">
        <div class="panel-section">
            <h3>AGI 场景调度</h3>
            <div id="scene-status" class="scene-status">场景调度器初始化中...</div>
            <div id="director-status" class="director-status">导演策略初始化中...</div>
            <div id="objective-status" class="objective-status">目标系统等待场景...</div>
            <div class="btn-group">
                <button id="aiGenerateBtn" class="ai-btn">生成个性场景</button>
                <button id="revisitSceneBtn">复访灰度场景</button>
                <button id="switchPlayerBtn">切换玩家画像</button>
            </div>
            <div id="scene-pool" class="scene-pool"></div>
        </div>

        <div class="panel-section">
            <h3>玩法控制</h3>
            <div class="btn-group">
                <button id="aiLogicBtn" class="ai-btn">AI 推演 3D 规则</button>
                <div style="display: flex; gap: 10px;">
                    <button id="addTowerBtn" style="flex: 1; background-color: #2e7d32;">建塔</button>
                    <button id="addEntityBtn" style="flex: 1; background-color: #c62828;">刷怪</button>
                </div>
            </div>
        </div>
        
        <div class="panel-section">
            <h3>实时规则</h3>
            <textarea id="ai-code">${defaultHotCode}</textarea>
            <button id="applyCodeBtn">应用热更新逻辑</button>
        </div>

        <div class="panel-section">
            <h3>系统日志</h3>
            <div id="logs" class="logs">系统已启动，等待 AI 接入...</div>
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
    logMsg("Rust WASM 3D 引擎已加载完毕！");

    const container = document.getElementById('three-container')!;
    const gameBg = document.getElementById('game-bg')!;

    // ---------------------------------------------------------
    // 初始化新的 AGI-miniGame 核心架构
    // ---------------------------------------------------------
    const worldState = new UnifiedWorldState('player_1');
    const aiEngine = new AiEngine();
    const gameplayManager = new GameplayManager();
    const sceneLifecycle = new SceneLifecycleManager();
    const telemetrySampler = new EngineTelemetrySampler();
    const sceneDirector = new SceneDirector();
    const sceneWorldBuilder = new SceneWorldBuilder();
    const sceneAestheticSystem = new SceneAestheticSystem();
    const sceneObjectiveSystem = new SceneObjectiveSystem();
    const restoredSceneLifecycle = sceneLifecycle.loadFromStorage();
    const playerSceneProfiles: PlayerSceneProfile[] = [
        {
            playerId: worldState.player.accountId,
            level: worldState.player.level,
            preferredModules: ['tower_defense', 'match3', 'parkour'],
            noveltyBias: 0.72,
            aestheticTaste: {
                mood: 'neon adaptive city',
                palette: ['cyan', 'amber', 'magenta'],
                density: 'balanced',
            },
        },
        {
            playerId: 'player_runner',
            level: 11,
            preferredModules: ['parkour', 'shooter', 'turn_combat'],
            avoidedModules: ['card'],
            noveltyBias: 0.86,
            aestheticTaste: {
                mood: 'kinetic skyline',
                palette: ['lime', 'magenta', 'cyan'],
                density: 'clean',
            },
        },
        {
            playerId: 'player_curator',
            level: 6,
            preferredModules: ['puzzle', 'synthesis', 'card'],
            avoidedModules: ['shooter'],
            noveltyBias: 0.38,
            aestheticTaste: {
                mood: 'quiet artifact archive',
                palette: ['emerald', 'gold', 'indigo'],
                density: 'dense',
            },
        },
    ];
    let activePlayerIndex = 0;
    let playerSceneProfile: PlayerSceneProfile = playerSceneProfiles[activePlayerIndex];
    let currentGeneratedScene: GeneratedSceneRecord | null = null;
    let currentRuleLabels: string[] = [];
    let currentDirectorPlan: SceneDirectorPlan | null = null;
    let currentAestheticReport: SceneAestheticReport | null = null;
    let currentObjectiveSession: SceneObjectiveSession | null = null;
    let currentRewardMultiplier = 1;
    logMsg("✅ 统一世界层 (Unified World) 已加载", "success");
    logMsg("✅ 超级大脑 (AI Central) 已上线", "success");
    if (restoredSceneLifecycle) {
        logMsg("✅ AGI 场景池已从本地存档恢复", "success");
    }

    // ---------------------------------------------------------
    // 初始化 Three.js 3D 渲染环境
    // ---------------------------------------------------------
    const scene = new THREE.Scene();
    
    // Camera
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 150, 300);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    (window as any).__renderer = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Post-processing: Bloom
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        1.5, // strength
        0.4, // radius
        0.85 // threshold
    );
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    (window as any).__composer = composer;

    // Raycaster for mouse interaction
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    
    container.addEventListener('pointerdown', (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        
        if (intersects.length > 0) {
            const object = intersects[0].object as THREE.Mesh;
            const entityId = object.userData.id;
            if (entityId) {
                if (typeof (engine as any).explode_entity === 'function') {
                    (engine as any).explode_entity(entityId, 150.0);
                } else {
                    engine.add_entity(
                        object.position.x,
                        object.position.y + 40,
                        object.position.z,
                        '#facc15',
                        (Math.random() - 0.5) * 120,
                        120,
                        (Math.random() - 0.5) * 120,
                        3
                    );
                }
                logMsg(`👉 玩家施展了神力，点击了实体 ID: ${entityId}`, "info");
                // Update score via DOM if playerScore is not directly accessible here
                const scoreSpan = document.getElementById('stat-score');
                if (scoreSpan) {
                    let currentScore = parseInt(scoreSpan.innerText) || 0;
                    scoreSpan.innerText = (currentScore + 5).toString();
                }
            }
        }
    });

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // Mesh cache
    const meshMap = new Map<number, THREE.Mesh>();
    const landmarkGroup = new THREE.Group();
    landmarkGroup.name = 'agi-scene-landmarks';
    scene.add(landmarkGroup);

    const boundsSize = 400.0;
    const engine = new GameEngine(boundsSize);
    // 挂载到 global 供模块调用
    (window as any).gameEngine = engine;

    // 辅助网格 (表示边界)
    const gridHelper = new THREE.GridHelper(boundsSize, 20, 0x444444, 0x222222);
    gridHelper.position.y = -10; // 和地平线对齐
    scene.add(gridHelper);

    function escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function blueprintFromSceneRecord(sceneRecord: GeneratedSceneRecord): any {
        return {
            id: sceneRecord.id,
            name: sceneRecord.name,
            description: sceneRecord.description,
            modules: sceneRecord.modules,
            difficulty: sceneRecord.difficulty,
            objectives: [],
            rules: [],
            rewards: [],
            theme: sceneRecord.themeHint,
            content: {
                prompt3DScene: sceneRecord.visualPrompt,
                uiStyle: `${sceneRecord.themeHint} tactical ui`,
                story: sceneRecord.story,
                bgmPrompt: `Adaptive score for ${sceneRecord.name}`,
                npcConfig: [],
                visualTokens: [],
                guardrails: [],
            },
            config: { restoredFromLifecycle: true },
        };
    }

    function renderSceneDashboard(activeScene: GeneratedSceneRecord | null = currentGeneratedScene) {
        const sceneStatus = document.getElementById('scene-status')!;
        const directorStatus = document.getElementById('director-status')!;
        const objectiveStatus = document.getElementById('objective-status')!;
        const scenePool = document.getElementById('scene-pool')!;
        const sceneStat = document.getElementById('stat-scene')!;
        const playerStat = document.getElementById('stat-player')!;
        const hotnessStat = document.getElementById('stat-hotness')!;
        const aestheticStat = document.getElementById('stat-aesthetic')!;
        const telemetry = telemetrySampler.getLatest();
        const telemetrySignal = telemetrySampler.getSignal();
        currentDirectorPlan = sceneDirector.planForPlayer(playerSceneProfile, sceneLifecycle, telemetrySignal);
        playerStat.textContent = playerSceneProfile.playerId;

        if (!activeScene) {
            sceneStatus.textContent = '等待 AGI 生成第一个场景';
            sceneStat.textContent = 'Hub';
            hotnessStat.textContent = '0.00';
            aestheticStat.textContent = '0.00';
        } else {
            sceneStat.textContent = activeScene.name;
            hotnessStat.textContent = activeScene.metrics.hotnessScore.toFixed(2);
            aestheticStat.textContent = activeScene.metrics.aestheticScore.toFixed(2);
            sceneStatus.innerHTML = `
                <div class="scene-title">${escapeHtml(activeScene.name)}</div>
                <div class="scene-meta">${escapeHtml(activeScene.status)} · ${escapeHtml(activeScene.modules.join(' + '))} · rollout ${(activeScene.rollout * 100).toFixed(0)}%</div>
                ${currentRuleLabels.length > 0 ? `<div class="scene-rules">${currentRuleLabels.slice(0, 4).map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>` : ''}
                ${currentAestheticReport ? `<div class="aesthetic-report"><strong>${escapeHtml(currentAestheticReport.label)}</strong><span>${escapeHtml(currentAestheticReport.summary)}</span></div>` : ''}
                ${activeScene.warning ? `<div class="scene-warning">${escapeHtml(activeScene.warning)}</div>` : ''}
            `;
        }

        document.getElementById('stat-entities')!.textContent = telemetry.entity_count.toString();
        document.getElementById('stat-collisions')!.textContent = telemetry.last_collision_count.toString();
        document.getElementById('stat-pressure')!.textContent = telemetrySignal.pressureScore.toFixed(2);
        document.getElementById('stat-gold')!.textContent = worldState.wallet.getBalance('gold').toString();

        directorStatus.innerHTML = `
            <div class="director-title">${escapeHtml(currentDirectorPlan.headline)}</div>
            <div class="director-meta">${escapeHtml(currentDirectorPlan.intent)} · ${escapeHtml(currentDirectorPlan.exposure.originLabel)} · ${escapeHtml(currentDirectorPlan.exposure.aestheticPromise)}</div>
            <div class="director-rules">
                ${currentDirectorPlan.exposure.consistencyChecks.map(check => `<span>${escapeHtml(check)}</span>`).join('')}
                ${currentAestheticReport ? currentAestheticReport.strengths.slice(0, 2).map(strength => `<span>${escapeHtml(strength)}</span>`).join('') : ''}
            </div>
            ${currentAestheticReport?.warnings.length ? `<div class="scene-warning">${escapeHtml(currentAestheticReport.warnings[0])}</div>` : ''}
            ${currentDirectorPlan.warnings.length > 0 ? `<div class="scene-warning">${escapeHtml(currentDirectorPlan.warnings[0])}</div>` : ''}
        `;
        const generateBtn = document.getElementById('aiGenerateBtn');
        if (generateBtn) {
            generateBtn.textContent = currentDirectorPlan.actionLabel;
        }

        objectiveStatus.innerHTML = renderObjectiveStatus();

        const scenes = sceneLifecycle.getScenes({ includeRetired: true }).slice(0, 6);
        scenePool.innerHTML = scenes.map(sceneRecord => `
            <div class="scene-chip scene-${sceneRecord.status}">
                <span>${escapeHtml(sceneRecord.name)}</span>
                <strong>${sceneRecord.metrics.hotnessScore.toFixed(2)}</strong>
            </div>
        `).join('');
    }

    function renderObjectiveStatus(): string {
        if (!currentObjectiveSession) {
            return '目标系统等待场景...';
        }

        const objectives = currentObjectiveSession.objectives.map(objective => {
            const progress = Math.min(1, objective.current / Math.max(1, objective.target));
            return `
                <div class="objective-row ${objective.completed ? 'objective-done' : ''}">
                    <div>
                        <strong>${escapeHtml(objective.label)}</strong>
                        <span>${objective.optional ? '可选' : '必达'} · ${Math.floor(progress * 100)}%</span>
                    </div>
                    <em>${formatObjectiveValue(objective.current)} / ${formatObjectiveValue(objective.target)}${escapeHtml(objective.unit)}</em>
                </div>
            `;
        }).join('');

        return `
            <div class="objective-title">${currentObjectiveSession.completed ? '场景目标已完成' : '场景目标进行中'}</div>
            <div class="objective-reward">奖励: ${currentObjectiveSession.rewards.gold} gold · ${currentObjectiveSession.rewards.token} token${currentObjectiveSession.rewards.gem > 0 ? ` · ${currentObjectiveSession.rewards.gem} gem` : ''}</div>
            <div class="objective-list">${objectives}</div>
        `;
    }

    function formatObjectiveValue(value: number): string {
        return value >= 10 ? Math.floor(value).toString() : value.toFixed(1);
    }

    function applySceneAtmosphere(sceneRecord: GeneratedSceneRecord) {
        const worldPlan = sceneWorldBuilder.build(sceneRecord, playerSceneProfile, boundsSize);
        currentAestheticReport = sceneAestheticSystem.evaluate(sceneRecord, playerSceneProfile, worldPlan);
        sceneLifecycle.recordAestheticReport(sceneRecord.id, currentAestheticReport);
        currentObjectiveSession = sceneObjectiveSystem.createSession(
            sceneRecord,
            worldPlan,
            currentAestheticReport,
            currentRewardMultiplier
        );
        resetSceneEntities();
        resetLandmarks();

        gameBg.style.backgroundColor = worldPlan.palette[0];
        gameBg.style.backgroundImage = worldPlan.backgroundLayers.join(',');

        bloomPass.strength = 0.9 + sceneRecord.metrics.hotnessScore * 1.2;
        scene.fog = new THREE.FogExp2(0x020617, 0.002 + (1 - sceneRecord.rollout) * 0.004);

        for (const landmark of worldPlan.landmarks) {
            const geometry = landmark.kind === 'portal'
                ? new THREE.TorusGeometry(landmark.radius, 2.4, 8, 32)
                : new THREE.CylinderGeometry(landmark.radius, landmark.radius * 0.72, landmark.height, 6);
            const material = new THREE.MeshLambertMaterial({
                color: new THREE.Color(landmark.color),
                transparent: true,
                opacity: 0.62,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(landmark.x, landmark.y + landmark.height / 2, landmark.z);
            if (landmark.kind === 'portal') {
                mesh.rotation.x = Math.PI / 2;
                mesh.position.y = -boundsSize / 2 + 70;
            }
            landmarkGroup.add(mesh);
        }

        for (const spawn of worldPlan.spawnPlans) {
            engine.add_entity(spawn.x, spawn.y, spawn.z, spawn.color, spawn.vx, spawn.vy, spawn.vz, spawn.entityType);
        }
        logMsg(`场景空间锚点已生成: ${worldPlan.memoryAnchors.map(anchor => anchor.label).join(' / ')}`, "info");
        logMsg(`审美定理评估: ${currentAestheticReport.label} (${currentAestheticReport.overallScore.toFixed(2)}) · ${currentAestheticReport.summary}`, "info");
        logMsg(`目标链已生成: ${currentObjectiveSession.objectives.map(objective => objective.label).join(' / ')}`, "info");
    }

    function resetSceneEntities() {
        if (typeof (engine as any).reset_scene_entities === 'function') {
            (engine as any).reset_scene_entities();
        } else if (typeof (engine as any).clear_dynamic_entities === 'function') {
            (engine as any).clear_dynamic_entities();
        }

        for (const [id, mesh] of meshMap.entries()) {
            if (id === 1) continue;
            scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
            meshMap.delete(id);
        }
    }

    function resetLandmarks() {
        for (const child of [...landmarkGroup.children]) {
            landmarkGroup.remove(child);
            const mesh = child as THREE.Mesh;
            mesh.geometry?.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) {
                material.forEach(item => item.dispose());
            } else {
                material?.dispose();
            }
        }
    }

    async function activateScene(sceneRecord: GeneratedSceneRecord, blueprint: any, logPrefix: string) {
        currentGeneratedScene = sceneLifecycle.recordVisit(sceneRecord.id, playerSceneProfile.playerId, Date.now(), 30) ?? sceneRecord;
        worldState.enterDimension(sceneRecord.id);
        worldState.progression.recordDimensionVisit(sceneRecord.id);
        for (const moduleId of sceneRecord.modules) {
            worldState.progression.recordModulePlay(moduleId);
        }

        await gameplayManager.loadCombination(blueprint);
        currentRuleLabels = gameplayManager.getActiveRuleSummary();
        applySceneAtmosphere(currentGeneratedScene);
        renderSceneDashboard(currentGeneratedScene);
        sceneLifecycle.saveToStorage();
        logMsg(`${logPrefix}: ${currentGeneratedScene.name} [${currentGeneratedScene.modules.join(' + ')}]`, "success");
        logMsg(`AGI 规则已编译: ${currentRuleLabels.join(' | ')}`, "info");
        if (currentGeneratedScene.warning) {
            logMsg(currentGeneratedScene.warning, "warn");
        }
    }

    async function generatePersonalScene() {
        const directives = currentDirectorPlan?.generationDirectives ??
            sceneDirector.planForPlayer(playerSceneProfile, sceneLifecycle, telemetrySampler.getSignal()).generationDirectives;
        currentRewardMultiplier = directives.rewardMultiplier;
        const blueprint = await aiEngine.generateDimension({
            seed: Date.now(),
            difficulty: Math.max(1, Math.round(4 + directives.difficultyBias * 10)),
            playerLevel: worldState.player.level,
            playerId: playerSceneProfile.playerId,
            themeHint: directives.themeHint,
            preferences: playerSceneProfile.preferredModules,
            lifecycleDirectives: directives,
        });
        const sceneRecord = sceneLifecycle.createScene(blueprint, playerSceneProfile);
        await activateScene(sceneRecord, blueprint, "AGI 已生成个性场景");
    }

    async function revisitCoolingScene() {
        const directorTarget = currentDirectorPlan?.targetSceneId
            ? sceneLifecycle.getScene(currentDirectorPlan.targetSceneId)
            : null;
        const candidate = directorTarget && (directorTarget.status === 'gray' || directorTarget.status === 'retired')
            ? directorTarget
            : sceneLifecycle
            .getScenes({ statuses: ['gray', 'retired'], includeRetired: true })
            .sort((a, b) => a.metrics.hotnessScore - b.metrics.hotnessScore)[0];

        if (!candidate) {
            logMsg("当前没有灰度或已淘汰场景，先生成更多场景。", "warn");
            return;
        }

        currentRewardMultiplier = currentDirectorPlan?.generationDirectives.rewardMultiplier ?? 1.12;
        await activateScene(candidate, blueprintFromSceneRecord(candidate), "复访触发场景恢复");
    }

    async function seedLifecycleScenes() {
        if (sceneLifecycle.getScenes({ includeRetired: true }).length > 0) {
            renderSceneDashboard();
            return;
        }

        const now = Date.now();
        const day = 1000 * 60 * 60 * 24;
        const seedProfiles: PlayerSceneProfile[] = [
            { ...playerSceneProfile, playerId: 'seed_casual', preferredModules: ['match3', 'synthesis'], noveltyBias: 0.35 },
            { ...playerSceneProfile, playerId: 'seed_strategy', preferredModules: ['tower_defense', 'card', 'puzzle'], noveltyBias: 0.45 },
            { ...playerSceneProfile, playerId: 'seed_action', preferredModules: ['parkour', 'turn_combat'], noveltyBias: 0.8 },
        ];

        for (let i = 0; i < seedProfiles.length; i++) {
            const profile = seedProfiles[i];
            const createdAt = now - (12 + i * 4) * day;
            const directives = sceneLifecycle.buildGenerationDirectives(profile, createdAt);
            const blueprint = await aiEngine.generateDimension({
                seed: 9000 + i,
                difficulty: 3 + i,
                gameplayTypes: profile.preferredModules,
                playerLevel: profile.level,
                playerId: profile.playerId,
                themeHint: directives.themeHint,
                lifecycleDirectives: directives,
            });
            const seededScene = sceneLifecycle.createScene(blueprint, profile, createdAt);
            sceneLifecycle.recordVisit(seededScene.id, profile.playerId, createdAt + 60 * 60 * 1000, 70 + i * 20);
            sceneLifecycle.recordCompletion(seededScene.id, i === 0, createdAt + 2 * 60 * 60 * 1000);
            sceneLifecycle.recordAestheticVote(seededScene.id, 2.5 + i * 0.4, createdAt + 3 * 60 * 60 * 1000);
        }

        sceneLifecycle.tick(now - 4 * day);
        sceneLifecycle.tick(now);
        sceneLifecycle.saveToStorage();
        renderSceneDashboard();
    }

    await seedLifecycleScenes();

    // AI 生成背景
    const aiGenerateBtn = document.getElementById('aiGenerateBtn')!;
    aiGenerateBtn.addEventListener('click', () => {
        generatePersonalScene().catch(error => logMsg(`AGI 场景生成失败: ${error.message}`, "error"));
    });

    const revisitSceneBtn = document.getElementById('revisitSceneBtn')!;
    revisitSceneBtn.addEventListener('click', () => {
        revisitCoolingScene().catch(error => logMsg(`复访恢复失败: ${error.message}`, "error"));
    });

    const switchPlayerBtn = document.getElementById('switchPlayerBtn')!;
    switchPlayerBtn.addEventListener('click', () => {
        activePlayerIndex = (activePlayerIndex + 1) % playerSceneProfiles.length;
        playerSceneProfile = playerSceneProfiles[activePlayerIndex];
        currentDirectorPlan = sceneDirector.planForPlayer(playerSceneProfile, sceneLifecycle, telemetrySampler.getSignal());
        renderSceneDashboard(currentGeneratedScene);
        logMsg(`已切换玩家画像: ${playerSceneProfile.playerId}，导演策略: ${currentDirectorPlan.headline}`, "info");
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
                generatedLogic += `if (Math.random() < 0.05) {\n    const rx = (Math.random() - 0.5) * 350;\n    const rz = (Math.random() - 0.5) * 350;\n    engine.add_entity(rx, 180, rz, '#00ffff', 0, -50, 0, 1);\n}`;
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

    // 手动建塔
    const addTowerBtn = document.getElementById('addTowerBtn')!;
    addTowerBtn.addEventListener('click', () => {
        const rx = (Math.random() - 0.5) * (boundsSize - 50);
        const rz = (Math.random() - 0.5) * (boundsSize - 50);
        const ry = -boundsSize / 2 + 35; // 放在地面上
        
        // 生成类型为 2 的防御塔
        engine.add_entity(rx, ry, rz, '#00ff00', 0, 0, 0, 2);
        logMsg(`已建立 3D 防御塔 (类型: 2)`);
    });

    // 手动刷怪
    const addEntityBtn = document.getElementById('addEntityBtn')!;
    addEntityBtn.addEventListener('click', () => {
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        // 在高空边缘生成
        const rx = (Math.random() - 0.5) * (boundsSize - 50);
        const ry = (boundsSize / 2) - 20; 
        const rz = (Math.random() - 0.5) * (boundsSize - 50);
        
        const vx = (Math.random() - 0.5) * 100;
        const vy = -100;
        const vz = (Math.random() - 0.5) * 100;
        
        // 生成类型为 1 的敌人
        engine.add_entity(rx, ry, rz, randomColor, vx, vy, vz, 1);
        logMsg(`已生成 3D 怪物 (类型: 1)`);
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
    let lifecycleDashboardTimer = 0;

    function gameLoop(time: number) {
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        // 1. Update Game State in Rust
        engine.update(dt);
        const engineTelemetry = telemetrySampler.ingest(
            typeof (engine as any).get_telemetry_json === 'function'
                ? (engine as any).get_telemetry_json()
                : '{}'
        );
        const telemetrySignal = telemetrySampler.getSignal();
        (window as any).__agiEntityCount = engineTelemetry.entity_count;
        (window as any).__agiPressureScore = telemetrySignal.pressureScore;
        gameplayManager.update(dt);
        const moduleScore = gameplayManager.getTotalScore();
        const scoreSpan = document.getElementById('stat-score');
        if (scoreSpan) {
            const clickScore = parseInt(scoreSpan.innerText) || 0;
            scoreSpan.innerText = Math.max(clickScore, moduleScore).toString();
        }
        if (currentObjectiveSession && currentGeneratedScene) {
            sceneObjectiveSystem.update(currentObjectiveSession, {
                dt,
                score: moduleScore,
                telemetry: engineTelemetry,
                signal: telemetrySignal,
            });
            const completion = sceneObjectiveSystem.settle(currentObjectiveSession, worldState);
            if (completion) {
                sceneLifecycle.recordCompletion(currentGeneratedScene.id, true);
                worldState.recordGameplay({
                    dimensionId: currentGeneratedScene.id,
                    modules: [...currentGeneratedScene.modules],
                    score: completion.score,
                    timestamp: Date.now(),
                    duration: currentObjectiveSession.elapsedSeconds,
                });
                sceneLifecycle.saveToStorage();
                logMsg(`场景目标完成，奖励 ${completion.rewards.gold} gold / ${completion.rewards.token} token / ${completion.rewards.experience} exp`, "success");
            }
        }
        if (currentGeneratedScene) {
            sceneLifecycle.recordPlayTime(currentGeneratedScene.id, dt);
            sceneLifecycle.recordRuntimeTelemetry(currentGeneratedScene.id, {
                pressureScore: telemetrySignal.pressureScore,
                activityScore: telemetrySignal.activityScore,
                entityCount: engineTelemetry.entity_count,
                collisionCount: engineTelemetry.last_collision_count,
            });
        }
        lifecycleDashboardTimer += dt;
        if (lifecycleDashboardTimer >= 5) {
            sceneLifecycle.tick();
            renderSceneDashboard(currentGeneratedScene);
            sceneLifecycle.saveToStorage();
            lifecycleDashboardTimer = 0;
        }

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
                // 根据实体类型创建不同的几何体
                let geometry: THREE.BufferGeometry;
                // 使用 Rust WASM 引擎导出的 entity_type 保持渲染与引擎状态一致。
                if (entity.entity_type === 2) { // Tower
                    geometry = new THREE.CylinderGeometry(entity.width / 2, entity.width / 2, entity.height, 8);
                } else if (entity.entity_type === 1) { // Enemy
                    geometry = new THREE.SphereGeometry(entity.width / 2, 16, 16);
                } else {
                    geometry = new THREE.BoxGeometry(entity.width, entity.height, entity.depth);
                }
                
                // 颜色转换
                const matColor = new THREE.Color(entity.color);
                const material = new THREE.MeshLambertMaterial({ 
                    color: matColor,
                    transparent: entity.is_static,
                    opacity: entity.is_static ? 0.8 : 1.0 // 让地面半透明
                });
                
                mesh = new THREE.Mesh(geometry, material);
                mesh.userData.id = entity.id; // Store ID for Raycaster
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
        controls.update();
        renderer.render(scene, camera);

        requestAnimationFrame(gameLoop);
    }

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    requestAnimationFrame(gameLoop);
}

runGame().catch(console.error);
