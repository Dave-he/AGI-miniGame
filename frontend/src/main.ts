import './style.css';
import init, { GameEngine } from 'agi-minigame-wasm';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AiEngine, GameplayManager, UnifiedWorldState } from './agi_minigame';
import {
  buildTowerFromArchetype,
  createRuntimeLogic,
  evaluateRuntimeObjective,
  executeRuntimeCommand,
  generateRuntimeScene,
  matchBossPlan,
  matchEnemyArchetype,
  parseRuntimeSceneBlueprint,
  resolveBlastTarget,
  resolveBuildPlacement,
  selectStarterBuildHint,
  selectTowerArchetype,
  towerCombatProfile,
} from './core/RuntimeSceneGenerator';
import type {
  BlastTargetResult,
  BuildPlacementResult,
  RuntimeEngineFacade,
  RuntimeEntitySnapshot,
  RuntimeLogicProgram,
  RuntimeCommandPlan,
  RuntimeSceneBlueprint,
  RuntimeStats,
  Vec2,
} from './core/RuntimeSceneGenerator';

type InteractionMode = 'build' | 'blast';
type RuntimeEngine = GameEngine & RuntimeEngineFacade;

declare global {
  interface Window {
    __AGI_DEBUG__?: {
      buildPreview: THREE.Object3D;
      entities: () => RuntimeEntitySnapshot[];
      bossPlan: () => RuntimeSceneBlueprint['bossPlan'];
      commands: () => RuntimeSceneBlueprint['commands'];
      supportNodes: () => RuntimeSceneBlueprint['supportNodes'];
      setScore: (score: number) => void;
    };
  }
}

const boundsSize = 400;
const groundTopY = -boundsSize / 2 + 6;
const themes = ['cyberpunk neon city', 'verdant forest ruins', 'ancient desert forge', 'deep space orbital garden'];

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">AGI-miniGame</span>
        <h1>无限次元城</h1>
      </div>
      <div class="stat-strip">
        <div><span>Score</span><strong id="stat-score">0</strong></div>
        <div><span>Core</span><strong id="stat-integrity">100</strong></div>
        <div><span>Wave</span><strong id="stat-wave">0</strong></div>
        <div><span>Goal</span><strong id="stat-objective">0%</strong></div>
        <div><span>Combo</span><strong id="stat-combo">0</strong></div>
        <div><span>Tower</span><strong id="stat-tower">Sentinel</strong></div>
        <div><span>Mode</span><strong id="stat-mode">Build</strong></div>
      </div>
    </header>

    <main class="layout">
      <section class="game-surface">
        <div class="scene-ribbon">
          <div>
            <span id="scene-biome">runtime</span>
            <strong id="scene-title">Loading</strong>
            <em id="scene-objective">Preparing objective</em>
          </div>
          <div id="scene-modules" class="module-pills"></div>
        </div>
        <div id="game-stage" class="game-stage">
          <div id="three-container" class="three-container"></div>
          <div id="build-marker" class="build-marker"></div>
          <div id="blast-marker" class="blast-marker"></div>
          <div id="event-flash" class="event-flash"></div>
        </div>
      </section>

      <aside class="control-panel">
        <section class="panel-section">
          <h2>AI Director</h2>
          <div class="button-grid">
            <button id="generate-scene-btn" type="button">生成次元</button>
            <button id="regenerate-logic-btn" type="button">重写规则</button>
            <button id="build-mode-btn" type="button" class="is-active">建塔</button>
            <button id="blast-mode-btn" type="button">冲击</button>
            <button id="tower-type-btn" type="button">塔型</button>
          </div>
          <div id="command-buttons" class="command-row"></div>
          <button id="spawn-enemy-btn" type="button" class="wide-btn">生成一波敌人</button>
        </section>

        <section class="panel-section">
          <h2>Generated Logic</h2>
          <textarea id="logic-preview" readonly spellcheck="false"></textarea>
        </section>

        <section class="panel-section">
          <h2>Runtime Log</h2>
          <div id="logs" class="logs"></div>
        </section>
      </aside>
    </main>
  </div>
`;

const logEl = document.getElementById('logs')!;
const logicPreview = document.getElementById('logic-preview') as HTMLTextAreaElement;
const sceneTitleEl = document.getElementById('scene-title')!;
const sceneObjectiveEl = document.getElementById('scene-objective')!;
const sceneBiomeEl = document.getElementById('scene-biome')!;
const sceneModulesEl = document.getElementById('scene-modules')!;
const stageEl = document.getElementById('game-stage')!;
const container = document.getElementById('three-container')!;
const buildMarkerEl = document.getElementById('build-marker')!;
const blastMarkerEl = document.getElementById('blast-marker')!;
const eventFlashEl = document.getElementById('event-flash')!;
const commandButtonsEl = document.getElementById('command-buttons')!;

function logMsg(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const time = new Date().toLocaleTimeString();
  logEl.insertAdjacentHTML('beforeend', `<div class="log-entry log-${type}"><span>${time}</span>${escapeHtml(message)}</div>`);
  while (logEl.children.length > 80) {
    logEl.firstElementChild?.remove();
  }
  logEl.scrollTop = logEl.scrollHeight;
}

async function runGame() {
  await init();

  const worldState = new UnifiedWorldState('player_1');
  const aiEngine = new AiEngine();
  const gameplayManager = new GameplayManager();
  const engine = new GameEngine(boundsSize) as RuntimeEngine;
  const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 0, combo: 0, comboMultiplier: 1 };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, container.clientWidth / container.clientHeight, 0.1, 1200);
  camera.position.set(0, 230, 330);

  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 190;
  controls.maxDistance = 520;
  controls.maxPolarAngle = 1.28;
  controls.target.set(0, -130, 0);

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x111827, 0.5);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(-120, 260, 140);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0xffffff, 1.4, 420);
  fillLight.position.set(0, -110, 0);
  scene.add(fillLight);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.8, 0.35, 0.18);
  composer.addPass(bloomPass);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundTopY);
  const groundPoint = new THREE.Vector3();
  const meshMap = new Map<number, THREE.Object3D>();
  const generatedObjects: THREE.Object3D[] = [];
  const buildPreview = createBuildPreviewObject();
  scene.add(buildPreview);
  const keys = new Set<string>();
  let mode: InteractionMode = 'build';
  let activeScene = generateRuntimeScene({ seed: 1, playerLevel: 1, difficulty: 2, themeHint: themes[0], modules: ['tower_defense', 'synthesis'] });
  let runtimeLogic: RuntimeLogicProgram = createRuntimeLogic(activeScene);
  let lastTime = performance.now();
  let previousEnemyIds = new Set<number>();
  let previousEnemyRewards = new Map<number, number>();
  let latestEntities: RuntimeEntitySnapshot[] = [];
  let activeBuildPlacement: BuildPlacementResult | null = null;
  let activeBlastTarget: BlastTargetResult | null = null;
  let blastCooldownRemaining = 0;
  let sceneStartScore = 0;
  let objectiveCompleted = false;
  let objectiveAdvanceTimer = 0;
  let sceneIndex = 0;
  let selectedTowerArchetypeIndex = 0;
  let manualCameraHold = 0;
  let activeCameraFocus: { laneIndex: number; until: number; boss: boolean } | null = null;
  let comboCount = 0;
  let comboTimer = 0;
  let comboMultiplier = 1;
  let lastPerfectWaveBonusWave = 0;
  let commandTargetLaneIndex = 0;
  let commandTargetPoint: Vec2 | null = null;
  let lastCommandRetargetTime = 0;
  let commandTargetReticle: THREE.Object3D | null = null;
  const commandCooldowns = new Map<string, number>();

  if (import.meta.env.DEV) {
    window.__AGI_DEBUG__ = {
      buildPreview,
      entities: () => latestEntities,
      bossPlan: () => activeScene.bossPlan,
      commands: () => activeScene.commands,
      supportNodes: () => activeScene.supportNodes,
      setScore(score: number) {
        stats.score = Math.max(0, score);
        updateHud(stats);
        if (mode === 'build' && activeBuildPlacement) {
          updateBuildAffordance(activeBuildPlacement);
        }
      },
    };
  }

  function setMode(nextMode: InteractionMode) {
    mode = nextMode;
    document.getElementById('stat-mode')!.textContent = nextMode === 'build' ? 'Build' : 'Blast';
    document.getElementById('build-mode-btn')!.classList.toggle('is-active', nextMode === 'build');
    document.getElementById('blast-mode-btn')!.classList.toggle('is-active', nextMode === 'blast');
    if (nextMode !== 'build') {
      buildMarkerEl.classList.remove('is-visible');
      hideBuildPreview();
    } else if (activeBuildPlacement) {
      updateBuildAffordance(activeBuildPlacement);
    }
    if (nextMode !== 'blast') {
      blastMarkerEl.classList.remove('is-visible');
    } else if (activeBlastTarget) {
      updateBlastMarker(activeBlastTarget);
    }
  }

  function selectedTowerArchetype() {
    return selectTowerArchetype(activeScene, selectedTowerArchetypeIndex);
  }

  function updateTowerTypeButton() {
    const archetype = selectedTowerArchetype();
    const profile = towerCombatProfile(activeScene, archetype);
    const button = document.getElementById('tower-type-btn')!;
    button.textContent = `${archetype.label} ${archetype.buildCost}`;
    button.style.borderColor = archetype.color;
    button.title = `${archetype.label}: R${Math.round(profile.range)} / D${Math.round(profile.damage)} / ${profile.fireInterval.toFixed(2)}s`;
  }

  function cycleTowerArchetype() {
    selectedTowerArchetypeIndex = (selectedTowerArchetypeIndex + 1) % activeScene.towerArchetypes.length;
    updateTowerTypeButton();
    updateHud(stats);
    const archetype = selectedTowerArchetype();
    const profile = towerCombatProfile(activeScene, archetype);
    if (mode === 'build' && activeBuildPlacement) {
      updateBuildAffordance(activeBuildPlacement);
    }
    logMsg(`Tower type: ${archetype.label} R${Math.round(profile.range)} D${Math.round(profile.damage)}`, 'info');
  }

  function renderCommandButtons() {
    commandButtonsEl.innerHTML = activeScene.commands
      .map((command, index) => (
        `<button type="button" class="command-button" data-command-index="${index}" title="${escapeHtml(command.label)} / ${command.scoreCost} score / ${command.cooldown.toFixed(1)}s">
          <span>${escapeHtml(command.label)}</span>
          <strong>${command.scoreCost}</strong>
        </button>`
      ))
      .join('');
    commandButtonsEl.querySelectorAll<HTMLButtonElement>('[data-command-index]').forEach((button) => {
      button.addEventListener('click', () => executeCommand(Number(button.dataset.commandIndex ?? 0)));
    });
    updateCommandButtons();
  }

  function updateCommandCooldowns(dt: number) {
    for (const command of activeScene.commands) {
      const remaining = commandCooldowns.get(command.id) ?? 0;
      if (remaining > 0) {
        commandCooldowns.set(command.id, Math.max(0, remaining - dt));
      }
    }
  }

  function updateCommandButtons() {
    commandButtonsEl.querySelectorAll<HTMLButtonElement>('[data-command-index]').forEach((button) => {
      const command = activeScene.commands[Number(button.dataset.commandIndex ?? 0)];
      if (!command) return;
      const cooldown = commandCooldowns.get(command.id) ?? 0;
      const affordable = stats.score >= command.scoreCost;
      button.classList.toggle('is-cooling', cooldown > 0);
      button.classList.toggle('is-insufficient', cooldown <= 0 && !affordable);
      button.disabled = cooldown > 0 || !affordable;
      const targetSuffix = command.kind === 'lane-barrage' ? ` L${commandTargetLaneIndex + 1}` : '';
      const label = button.querySelector('span');
      const cost = button.querySelector('strong');
      if (label) label.textContent = cooldown > 0
        ? `${command.label}${targetSuffix} ${cooldown.toFixed(1)}`
        : `${command.label}${targetSuffix}`;
      if (cost) cost.textContent = command.scoreCost.toString();
      button.title = `${command.label}${targetSuffix} / ${command.scoreCost} score / ${command.cooldown.toFixed(1)}s`;
      button.style.borderColor = command.color;
    });
  }

  function defaultCommandTargetLaneIndex(blueprint: RuntimeSceneBlueprint) {
    const laneCommand = blueprint.commands.find((command) => command.kind === 'lane-barrage');
    return normalizeLaneIndex(laneCommand?.laneIndex ?? 0, blueprint.lanes.length);
  }

  function defaultCommandTargetPoint(laneIndex: number): Vec2 {
    const lane = activeScene.lanes[normalizeLaneIndex(laneIndex, activeScene.lanes.length)];
    if (!lane) return { x: 0, z: 0 };
    return laneThreatFocusPoint(lane, activeScene.controls.cameraThreatLead * 0.72, false);
  }

  function updateCommandTarget(point: Vec2, force = false) {
    const now = performance.now();
    const retargetCooldownMs = activeScene.commandTargeting.retargetCooldown * 1000;
    if (!force && now - lastCommandRetargetTime < retargetCooldownMs) {
      commandTargetPoint = commandTargetPointForLane(commandTargetLaneIndex, point);
      updateCommandTargetReticle();
      return;
    }

    const nextLaneIndex = resolveCommandTargetLane(point);
    const changed = nextLaneIndex !== commandTargetLaneIndex;
    commandTargetLaneIndex = nextLaneIndex;
    commandTargetPoint = commandTargetPointForLane(commandTargetLaneIndex, point);
    lastCommandRetargetTime = now;
    updateCommandTargetReticle();
    if (changed) {
      updateCommandButtons();
    }
  }

  function resolveCommandTargetLane(point: Vec2): number {
    const assist = activeScene.commandTargeting;
    let bestLaneIndex = commandTargetLaneIndex;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < activeScene.lanes.length; index += 1) {
      const lane = activeScene.lanes[index];
      const pointerDistance = Math.sqrt(distanceToRuntimeLaneSquared(point, lane));
      const pointerScore = Math.min(pointerDistance / Math.max(1, assist.laneAssistRadius), 2) * assist.pointerWeight;
      const pressureScore = (1 - commandLanePressure(lane)) * assist.threatWeight;
      const score = pointerScore + pressureScore;
      if (score < bestScore) {
        bestScore = score;
        bestLaneIndex = index;
      }
    }
    return normalizeLaneIndex(bestLaneIndex, activeScene.lanes.length);
  }

  function commandLanePressure(lane: RuntimeSceneBlueprint['lanes'][number]): number {
    const radius = lane.width + activeScene.commandTargeting.laneAssistRadius;
    let pressure = 0;
    for (const entity of latestEntities) {
      if (entity.entity_type !== 1) continue;
      const distanceSquared = distanceToRuntimeLaneSquared({ x: entity.x, z: entity.z }, lane);
      if (distanceSquared > radius * radius) continue;
      const coreDistance = Math.hypot(entity.x, entity.z);
      const corePressure = clamp(1 - coreDistance / (boundsSize * 0.7), 0, 1);
      const healthPressure = clamp(entity.hp / Math.max(1, entity.max_hp), 0, 1) * 0.25;
      pressure += 0.65 + corePressure + healthPressure;
    }
    return clamp(pressure / 4, 0, 1);
  }

  function commandTargetPointForLane(laneIndex: number, pointerPoint?: Vec2): Vec2 {
    const lane = activeScene.lanes[normalizeLaneIndex(laneIndex, activeScene.lanes.length)];
    if (!lane) return { x: 0, z: 0 };
    return pointerPoint
      ? closestPointOnRuntimeLane(pointerPoint, lane)
      : defaultCommandTargetPoint(laneIndex);
  }

  function updateCommandTargetReticle() {
    if (!commandTargetReticle) return;
    const laneCommand = activeScene.commands.find((command) => command.kind === 'lane-barrage');
    const lane = activeScene.lanes[normalizeLaneIndex(commandTargetLaneIndex, activeScene.lanes.length)];
    commandTargetReticle.visible = Boolean(laneCommand && lane);
    if (!laneCommand || !lane) return;

    const target = commandTargetPoint ?? defaultCommandTargetPoint(commandTargetLaneIndex);
    commandTargetReticle.position.set(target.x, groundTopY + 4.4, target.z);
    commandTargetReticle.userData.laneIndex = commandTargetLaneIndex;
    commandTargetReticle.userData.baseRadius = activeScene.commandTargeting.reticleRadius;
    commandTargetReticle.userData.pulseSpeed = activeScene.commandTargeting.reticlePulseSpeed;
    setObjectColor(commandTargetReticle, laneCommand.color);
  }

  function executeCommand(index: number) {
    const command: RuntimeCommandPlan | undefined = activeScene.commands[index];
    if (!command) return;
    const cooldown = commandCooldowns.get(command.id) ?? 0;
    if (cooldown > 0) {
      logMsg(`${command.label} cooling: ${cooldown.toFixed(1)}s`, 'warn');
      return;
    }
    const commandToExecute = command.kind === 'lane-barrage'
      ? { ...command, laneIndex: commandTargetLaneIndex }
      : command;
    const result = executeRuntimeCommand(commandToExecute, activeScene, { engine, entities: latestEntities, stats });
    if (!result.triggered) {
      logMsg(result.message, 'warn');
      updateCommandButtons();
      return;
    }
    registerCombo(activeScene.scoring.commandComboBoost);
    commandCooldowns.set(command.id, command.cooldown);
    latestEntities = JSON.parse(engine.get_render_data()) as RuntimeEntitySnapshot[];
    updateHud(stats);
    updateCommandButtons();
    logMsg(result.message, result.mutated ? 'success' : 'info');
    if (commandToExecute.kind === 'lane-barrage') {
      triggerLaneSignal(commandToExecute.laneIndex, false, result.message);
    }
    triggerEventFlash(`${command.label} combo x${comboMultiplier.toFixed(2)}`);
  }

  function triggerLaneSignal(laneIndex: number, boss: boolean, label: string) {
    const alertDuration = boss ? 2.4 : 1.55;
    const now = performance.now();
    activeCameraFocus = {
      laneIndex,
      until: now + (alertDuration + 0.45) * 1000,
      boss,
    };
    for (const object of generatedObjects) {
      if (!object.userData.laneSignal || object.userData.laneIndex !== laneIndex) {
        continue;
      }
      object.userData.alertUntil = now + alertDuration * 1000;
      object.userData.alertBoss = boss;
    }
    triggerEventFlash(label);
  }

  function triggerLaneSignalFromLog(line: string): boolean {
    if (!line.startsWith('Wave ') && !line.startsWith('Boss ')) {
      return false;
    }
    const laneIndex = activeScene.lanes.findIndex((lane) => line.includes(lane.id));
    if (laneIndex < 0) {
      return false;
    }
    triggerLaneSignal(laneIndex, line.startsWith('Boss '), line);
    return true;
  }

  function canAffordSelectedTower() {
    return stats.score >= selectedTowerArchetype().buildCost;
  }

  function isBuildPlacementInsideBounds(placement: BuildPlacementResult) {
    return Math.abs(placement.position.x) < boundsSize / 2 - 20
      && Math.abs(placement.position.z) < boundsSize / 2 - 20;
  }

  async function enterGeneratedScene(reason: string) {
    sceneIndex += 1;
    stats.integrity = 100;
    stats.wave = 0;
    stats.time = 0;
    stats.combo = 0;
    stats.comboMultiplier = 1;
    previousEnemyIds = new Set();
    previousEnemyRewards = new Map();
    latestEntities = [];
    activeBuildPlacement = null;
    activeBlastTarget = null;
    blastCooldownRemaining = 0;
    selectedTowerArchetypeIndex = 0;
    manualCameraHold = 0;
    activeCameraFocus = null;
    comboCount = 0;
    comboTimer = 0;
    comboMultiplier = 1;
    lastPerfectWaveBonusWave = 0;
    sceneStartScore = stats.score;
    objectiveCompleted = false;
    objectiveAdvanceTimer = 0;
    commandCooldowns.clear();
    const themeHint = themes[sceneIndex % themes.length];
    const runtimeSeed = Date.now() % 100000;
    const requestedDifficulty = clamp(2 + sceneIndex + Math.floor(worldState.player.level / 2), 1, 10);
    const dimension = await aiEngine.generateDimension({
      seed: Date.now() % 100000,
      difficulty: requestedDifficulty,
      playerLevel: worldState.player.level,
      themeHint,
    });
    const modules = dimension.modules.includes('tower_defense') ? dimension.modules : ['tower_defense', ...dimension.modules.slice(0, 2)];
    const runtimeDifficulty = Math.max(requestedDifficulty, dimension.difficulty);
    activeScene = generateSceneFromEngine(runtimeSeed, worldState.player.level, runtimeDifficulty, themeHint, modules)
      ?? generateRuntimeScene({
        seed: runtimeSeed,
        playerLevel: worldState.player.level,
        difficulty: runtimeDifficulty,
        themeHint,
        modules,
      });
    commandTargetLaneIndex = defaultCommandTargetLaneIndex(activeScene);
    commandTargetPoint = defaultCommandTargetPoint(commandTargetLaneIndex);
    lastCommandRetargetTime = 0;
    runtimeLogic = createRuntimeLogic(activeScene);
    await gameplayManager.loadCombination({ ...dimension, modules, difficulty: activeScene.difficulty });
    applySceneVisuals(activeScene);
    updateScenePanel(activeScene);
    renderCommandButtons();
    updateTowerTypeButton();
    updateHud(stats);
    logMsg(`${reason}: ${activeScene.title}`, 'success');
  }

  function generateSceneFromEngine(
    seed: number,
    playerLevel: number,
    difficulty: number,
    themeHint: string,
    modules: string[],
  ): RuntimeSceneBlueprint | null {
    if (typeof engine.generate_runtime_scene !== 'function') {
      return null;
    }
    const sceneJson = engine.generate_runtime_scene(seed, playerLevel, difficulty, themeHint, JSON.stringify(modules));
    const parsed = parseRuntimeSceneBlueprint(sceneJson);
    if (!parsed) {
      logMsg('Engine runtime scene bridge returned invalid JSON; TS fallback used', 'warn');
      return null;
    }
    logMsg('cocos4-rust generated runtime scene blueprint', 'success');
    return parsed;
  }

  function regenerateLogic() {
    runtimeLogic = createRuntimeLogic(activeScene);
    logicPreview.value = runtimeLogic.source;
    logMsg(`Generated rule program refreshed for ${activeScene.biome}`, 'success');
  }

  function applySceneVisuals(blueprint: RuntimeSceneBlueprint) {
    engine.clear_dynamic_entities();
    engine.set_gravity(620);
    engine.set_combat_tuning(
      blueprint.combat.towerRange,
      blueprint.combat.towerFireInterval,
      blueprint.combat.projectileSpeed,
      blueprint.combat.projectileDamage,
      blueprint.combat.projectileLead,
    );
    logicPreview.value = blueprint.logicSource;
    hideBuildPreview();

    for (const object of generatedObjects.splice(0)) {
      scene.remove(object);
      disposeObject(object);
    }
    commandTargetReticle = null;
    for (const [id, object] of meshMap.entries()) {
      scene.remove(object);
      disposeObject(object);
      meshMap.delete(id);
    }

    const palette = blueprint.palette;
    scene.background = new THREE.Color(palette.skyBottom);
    scene.fog = new THREE.Fog(palette.fog, 260, 760);
    ambientLight.intensity = blueprint.lighting.ambient;
    keyLight.intensity = blueprint.lighting.key;
    fillLight.color.set(palette.core);
    bloomPass.strength = blueprint.lighting.bloom;
    controls.dampingFactor = blueprint.controls.cameraDamping;
    renderer.domElement.style.background = `linear-gradient(${palette.skyTop}, ${palette.skyBottom})`;
    stageEl.style.setProperty('--accent', palette.accent);
    stageEl.style.setProperty('--core', palette.core);

    const terrain = createTerrain(blueprint);
    scene.add(terrain);
    generatedObjects.push(terrain);

    for (const lane of blueprint.lanes) {
      const road = createLaneMesh(lane.spawn, lane.bend, palette.road, lane.width);
      scene.add(road);
      generatedObjects.push(road);
    }

    for (const signal of blueprint.laneSignals) {
      const lane = blueprint.lanes[signal.laneIndex % blueprint.lanes.length];
      const laneSignal = createLaneSignal(signal, lane);
      scene.add(laneSignal);
      generatedObjects.push(laneSignal);
    }

    commandTargetReticle = createCommandTargetReticle(blueprint);
    scene.add(commandTargetReticle);
    generatedObjects.push(commandTargetReticle);
    updateCommandTargetReticle();

    for (const field of blueprint.tacticalFields) {
      const tacticalField = createTacticalField(field, palette);
      scene.add(tacticalField);
      generatedObjects.push(tacticalField);
    }

    for (const node of blueprint.supportNodes) {
      const supportNode = createSupportNode(node, palette);
      scene.add(supportNode);
      generatedObjects.push(supportNode);
    }

    for (const anchor of blueprint.towerAnchors) {
      const pad = createTowerPad(anchor, palette);
      scene.add(pad);
      generatedObjects.push(pad);
    }

    const starterHintId = selectStarterBuildHint(blueprint)?.id ?? null;
    for (const hint of blueprint.buildHints) {
      const buildHint = createBuildHint(hint, blueprint, hint.id === starterHintId);
      scene.add(buildHint);
      generatedObjects.push(buildHint);
    }

    for (const decoration of blueprint.decorations) {
      const deco = createDecoration(decoration, palette);
      scene.add(deco);
      generatedObjects.push(deco);
    }

    for (const setPiece of blueprint.setPieces) {
      const landmark = createSetPiece(setPiece);
      scene.add(landmark);
      generatedObjects.push(landmark);
    }

    const core = createCore(palette);
    scene.add(core);
    generatedObjects.push(core);

    const atmosphere = createAtmosphere(blueprint);
    scene.add(atmosphere);
    generatedObjects.push(atmosphere);

    camera.position.set(0, blueprint.camera.height, blueprint.camera.distance);
    controls.target.set(0, -145, 0);
    controls.update();
  }

  function updateScenePanel(blueprint: RuntimeSceneBlueprint) {
    sceneTitleEl.textContent = blueprint.title;
    sceneObjectiveEl.textContent = blueprint.objective.summary;
    sceneBiomeEl.textContent = blueprint.biome;
    sceneModulesEl.innerHTML = blueprint.modules.map((module) => `<span>${escapeHtml(module)}</span>`).join('');
  }

  function updateHud(currentStats: RuntimeStats) {
    const objective = evaluateRuntimeObjective(activeScene, currentStats, sceneStartScore);
    document.getElementById('stat-score')!.textContent = Math.floor(currentStats.score).toString();
    document.getElementById('stat-integrity')!.textContent = Math.floor(currentStats.integrity).toString();
    document.getElementById('stat-wave')!.textContent = `${currentStats.wave}/${activeScene.objective.targetWaves}`;
    document.getElementById('stat-objective')!.textContent = objectiveCompleted ? 'Next' : `${Math.floor(objective.progress * 100)}%`;
    document.getElementById('stat-combo')!.textContent = `${Math.floor(currentStats.combo ?? 0)} x${(currentStats.comboMultiplier ?? 1).toFixed(2)}`;
    document.getElementById('stat-tower')!.textContent = `${selectedTowerArchetype().label} ${selectedTowerArchetype().buildCost}`;
    document.getElementById('stat-mode')!.textContent = mode === 'blast' && blastCooldownRemaining > 0
      ? `Blast ${blastCooldownRemaining.toFixed(1)}`
      : mode === 'build'
        ? 'Build'
        : 'Blast';
  }

  function updateComboTimer(dt: number) {
    if (comboTimer > 0) {
      comboTimer = Math.max(0, comboTimer - dt);
    }
    if (comboTimer <= 0 && comboCount > 0) {
      comboCount = 0;
      comboMultiplier = 1;
      stats.combo = 0;
      stats.comboMultiplier = 1;
    }
  }

  function registerCombo(boost: number) {
    comboCount += Math.max(0.25, boost);
    comboTimer = activeScene.scoring.comboWindow;
    comboMultiplier = Math.min(
      activeScene.scoring.maxComboMultiplier,
      1 + Math.max(0, comboCount - 1) * activeScene.scoring.comboMultiplierStep,
    );
    stats.combo = comboCount;
    stats.comboMultiplier = comboMultiplier;
  }

  function awardScore(baseScore: number, label: string, comboBoost = 1, flash = false) {
    if (baseScore <= 0) return 0;
    registerCombo(comboBoost);
    const gained = Math.max(1, Math.round(baseScore * comboMultiplier));
    stats.score += gained;
    if (flash || comboMultiplier >= 1.25) {
      triggerEventFlash(`${label} x${comboMultiplier.toFixed(2)} +${gained}`);
    }
    return gained;
  }

  function spawnEnemyWave() {
    const wavePlan = activeScene.wavePlan[stats.wave % activeScene.wavePlan.length];
    const lane = activeScene.lanes[wavePlan.laneIndex % activeScene.lanes.length];
    for (let i = 0; i < wavePlan.count; i += 1) {
      const spawnX = lane.spawn.x + i * 10;
      const spawnZ = lane.spawn.z - i * 6;
      const archetype = activeScene.enemyArchetypes[(wavePlan.archetypeBias + stats.wave + i) % activeScene.enemyArchetypes.length];
      const velocity = velocityToward({ x: spawnX, z: spawnZ }, lane.bend, activeScene.spawn.enemySpeed * archetype.speedMultiplier);
      engine.spawn_enemy_variant(
        spawnX,
        spawnZ,
        velocity.x,
        velocity.z,
        archetype.hp,
        archetype.scale,
        archetype.color,
      );
    }
    stats.wave += 1;
    updateHud(stats);
    logMsg(`Manual ${wavePlan.id} inserted on ${lane.id}`, 'info');
  }

  function updateCamera(dt: number) {
    const speed = activeScene.controls.cameraPanSpeed * dt;
    const move = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.z -= speed;
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.z += speed;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.x -= speed;
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.x += speed;
    if (move.lengthSq() === 0) {
      manualCameraHold = Math.max(0, manualCameraHold - dt);
      return;
    }
    manualCameraHold = activeScene.controls.cameraManualOverride;
    const nextTarget = controls.target.clone().add(move);
    nextTarget.x = clamp(nextTarget.x, -boundsSize * 0.42, boundsSize * 0.42);
    nextTarget.z = clamp(nextTarget.z, -boundsSize * 0.42, boundsSize * 0.42);
    const delta = nextTarget.sub(controls.target);
    camera.position.add(delta);
    controls.target.add(delta);
  }

  function updateCameraDirector(dt: number) {
    if (!activeCameraFocus) return;
    const now = performance.now();
    if (now >= activeCameraFocus.until) {
      activeCameraFocus = null;
      return;
    }
    if (manualCameraHold > 0) return;

    const lane = activeScene.lanes[activeCameraFocus.laneIndex % activeScene.lanes.length];
    if (!lane) return;
    const focusPoint = laneThreatFocusPoint(lane, activeScene.controls.cameraThreatLead, activeCameraFocus.boss);
    const desiredTarget = new THREE.Vector3(focusPoint.x, -145, focusPoint.z);
    const alertZoom = activeScene.controls.cameraAlertZoom * (activeCameraFocus.boss ? 1.35 : 1);
    const desiredCamera = desiredTarget.clone().add(new THREE.Vector3(
      0,
      activeScene.camera.height + (activeCameraFocus.boss ? 12 : 0),
      Math.max(220, activeScene.camera.distance - alertZoom),
    ));
    const focusStrength = clamp(
      activeScene.controls.cameraAutoFocusStrength * dt * (activeCameraFocus.boss ? 1.45 : 1),
      0,
      0.08,
    );
    controls.target.lerp(desiredTarget, focusStrength);
    camera.position.lerp(desiredCamera, focusStrength);
  }

  function updatePointer(event: PointerEvent): boolean {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, groundPoint);
    if (!hit) {
      buildMarkerEl.classList.remove('is-visible');
      hideBuildPreview();
      blastMarkerEl.classList.remove('is-visible');
      activeBuildPlacement = null;
      activeBlastTarget = null;
      return false;
    }
    updateCommandTarget({ x: groundPoint.x, z: groundPoint.z });
    if (mode === 'build') {
      activeBuildPlacement = resolveBuildPlacement(
        { x: groundPoint.x, z: groundPoint.z },
        activeScene,
        latestEntities,
      );
      updateBuildAffordance(activeBuildPlacement);
    } else {
      buildMarkerEl.classList.remove('is-visible');
      hideBuildPreview();
      activeBuildPlacement = null;
      activeBlastTarget = resolveBlastTarget(
        { x: groundPoint.x, z: groundPoint.z },
        latestEntities,
        activeScene.controls,
      );
      updateBlastMarker(activeBlastTarget);
    }
    return true;
  }

  function updateBuildAffordance(placement: BuildPlacementResult) {
    const canAfford = canAffordSelectedTower();
    const insideBounds = isBuildPlacementInsideBounds(placement);
    updateBuildMarker(placement, canAfford, insideBounds);
    updateBuildPreview(placement, canAfford, insideBounds);
  }

  function updateBuildMarker(placement: BuildPlacementResult, canAfford: boolean, insideBounds: boolean) {
    const markerPosition = new THREE.Vector3(placement.position.x, groundTopY + 2, placement.position.z);
    markerPosition.project(camera);
    const hint = buildHintForPlacement(placement);
    const hintedTower = hint
      ? activeScene.towerArchetypes.find((archetype) => archetype.id === hint.towerArchetypeId)
      : null;
    buildMarkerEl.style.left = `${(markerPosition.x * 0.5 + 0.5) * 100}%`;
    buildMarkerEl.style.top = `${(-markerPosition.y * 0.5 + 0.5) * 100}%`;
    buildMarkerEl.dataset.state = !insideBounds
      ? 'outside arena'
      : canAfford
        ? hintedTower
          ? `hint ${hintedTower.label} / ${placement.reason}`
          : placement.reason
        : `need ${selectedTowerArchetype().buildCost} score`;
    buildMarkerEl.classList.add('is-visible');
    buildMarkerEl.classList.toggle('is-blocked', !placement.valid || !canAfford || !insideBounds);
    buildMarkerEl.classList.toggle('is-insufficient', placement.valid && insideBounds && !canAfford);
    buildMarkerEl.classList.toggle('is-snapped', placement.snappedToAnchor);
  }

  function updateBuildPreview(placement: BuildPlacementResult, canAfford: boolean, insideBounds: boolean) {
    const archetype = selectedTowerArchetype();
    const profile = towerCombatProfile(activeScene, archetype);
    const valid = placement.valid && canAfford && insideBounds;
    const color = valid ? archetype.color : activeScene.palette.enemy;
    buildPreview.visible = mode === 'build';
    buildPreview.position.set(placement.position.x, groundTopY + 2.2, placement.position.z);
    buildPreview.userData.phase = performance.now() * 0.001;
    buildPreview.userData.valid = valid;

    const rangeDisk = buildPreview.getObjectByName('rangeDisk');
    const rangeRing = buildPreview.getObjectByName('rangeRing');
    const towerGhost = buildPreview.getObjectByName('towerGhost');
    rangeDisk?.scale.set(profile.range, profile.range, 1);
    rangeRing?.scale.set(profile.range, profile.range, 1);
    towerGhost?.scale.setScalar(archetype.scale);

    setObjectColor(buildPreview, color);
    setObjectOpacity(buildPreview, valid ? 1 : 0.56);
  }

  function buildHintForPlacement(placement: BuildPlacementResult) {
    if (placement.anchorIndex === null) return null;
    return activeScene.buildHints.find((hint) => hint.anchorIndex === placement.anchorIndex) ?? null;
  }

  function hideBuildPreview() {
    buildPreview.visible = false;
  }

  function updateBlastMarker(target: BlastTargetResult) {
    const markerPosition = new THREE.Vector3(target.position.x, groundTopY + 18, target.position.z);
    markerPosition.project(camera);
    blastMarkerEl.style.left = `${(markerPosition.x * 0.5 + 0.5) * 100}%`;
    blastMarkerEl.style.top = `${(-markerPosition.y * 0.5 + 0.5) * 100}%`;
    blastMarkerEl.dataset.state = target.reason;
    blastMarkerEl.classList.add('is-visible');
    blastMarkerEl.classList.toggle('is-locked', target.valid);
    blastMarkerEl.classList.toggle('is-cooling', blastCooldownRemaining > 0);
  }

  function handleStagePointerDown(event: PointerEvent) {
    if (!updatePointer(event)) {
      return;
    }
    raycaster.setFromCamera(pointer, camera);

    if (mode === 'blast') {
      const target = activeBlastTarget ?? resolveBlastTarget({ x: groundPoint.x, z: groundPoint.z }, latestEntities, activeScene.controls);
      updateBlastMarker(target);
      if (blastCooldownRemaining > 0) {
        logMsg(`Blast cooling: ${blastCooldownRemaining.toFixed(1)}s`, 'warn');
        return;
      }
      if (target.valid && target.entityId !== null) {
        engine.explode_entity(target.entityId, activeScene.controls.blastForce);
        blastCooldownRemaining = activeScene.controls.blastCooldown;
        const gained = awardScore(activeScene.controls.blastScoreReward, 'Blast', activeScene.scoring.blastComboBoost, true);
        updateHud(stats);
        logMsg(`Blast locked entity ${target.entityId} at ${Math.round(target.distance)}m +${gained}`, 'info');
        return;
      }
      logMsg(`Blast missed: ${target.reason}`, 'warn');
      return;
    }

    if (mode === 'build') {
      const placement = activeBuildPlacement ?? resolveBuildPlacement({ x: groundPoint.x, z: groundPoint.z }, activeScene, latestEntities);
      const insideBounds = isBuildPlacementInsideBounds(placement);
      const towerArchetype = selectedTowerArchetype();
      const canAfford = canAffordSelectedTower();
      if (!placement.valid || !insideBounds) {
        logMsg(`Build blocked: ${insideBounds ? placement.reason : 'outside arena'}`, 'warn');
        return;
      }
      if (!canAfford) {
        updateBuildAffordance(placement);
        logMsg(`Build blocked: ${towerArchetype.label} needs ${towerArchetype.buildCost} score`, 'warn');
        return;
      }
      const towerId = buildTowerFromArchetype(engine, placement.position.x, placement.position.z, towerArchetype);
      latestEntities = JSON.parse(engine.get_render_data()) as RuntimeEntitySnapshot[];
      activeBuildPlacement = resolveBuildPlacement(placement.position, activeScene, latestEntities);
      stats.score = Math.max(0, stats.score - towerArchetype.buildCost);
      updateHud(stats);
      updateBuildAffordance(activeBuildPlacement);
      logMsg(`${towerArchetype.label} tower ${towerId} placed at ${Math.round(placement.position.x)}, ${Math.round(placement.position.z)}${placement.snappedToAnchor ? ' on pad' : ''}`, 'success');
    }
  }

  function renderEntities(entities: RuntimeEntitySnapshot[], time: number) {
    const currentIds = new Set<number>();
    for (const entity of entities) {
      currentIds.add(entity.id);
      let object = meshMap.get(entity.id);
      if (!object) {
        object = createEntityObject(entity, activeScene);
        scene.add(object);
        meshMap.set(entity.id, object);
      }
      updateEntityObject(object, entity, activeScene, time);
    }

    for (const [id, object] of meshMap.entries()) {
      if (currentIds.has(id)) continue;
      scene.remove(object);
      disposeObject(object);
      meshMap.delete(id);
    }
  }

  function scoreResolvedEnemies(entities: RuntimeEntitySnapshot[]) {
    const currentEnemies = new Set<number>();
    for (const entity of entities) {
      if (entity.entity_type !== 1) continue;
      currentEnemies.add(entity.id);
      const reward = matchBossPlan(entity, activeScene.bossPlan)
        ? activeScene.bossPlan.scoreReward
        : matchEnemyArchetype(entity, activeScene.enemyArchetypes).scoreReward;
      previousEnemyRewards.set(entity.id, reward);
    }
    for (const previousId of previousEnemyIds) {
      if (!currentEnemies.has(previousId)) {
        const reward = previousEnemyRewards.get(previousId) ?? 18;
        const gained = awardScore(reward, `Resolved ${previousId}`, 1, reward >= activeScene.bossPlan.scoreReward);
        worldState.player.addExperience(Math.max(2, Math.round(reward / 12)));
        previousEnemyRewards.delete(previousId);
        if (gained > reward) {
          logMsg(`Combo reward ${previousId}: +${gained}`, 'success');
        }
      }
    }
    previousEnemyIds = currentEnemies;
  }

  function updatePerfectWaveBonus() {
    if (
      stats.wave <= 0
      || stats.wave <= lastPerfectWaveBonusWave
      || (stats.activeEnemies ?? 0) > 0
      || stats.integrity < 100
    ) {
      return;
    }
    lastPerfectWaveBonusWave = stats.wave;
    const gained = awardScore(activeScene.scoring.perfectWaveBonus, `Perfect wave ${stats.wave}`, activeScene.scoring.commandComboBoost, true);
    logMsg(`Perfect wave ${stats.wave}: +${gained}`, 'success');
  }

  function updateObjective(dt: number) {
    if (stats.integrity <= 0) return;

    if (objectiveCompleted) {
      objectiveAdvanceTimer -= dt;
      if (objectiveAdvanceTimer <= 0) {
        objectiveAdvanceTimer = Number.POSITIVE_INFINITY;
        aiEngine.balanceAI.recordSession({ difficulty: activeScene.difficulty, score: stats.score, winRate: 0.9 });
        void enterGeneratedScene('Objective complete');
      }
      return;
    }

    const objective = evaluateRuntimeObjective(activeScene, stats, sceneStartScore);
    if (objective.complete) {
      objectiveCompleted = true;
      objectiveAdvanceTimer = activeScene.objective.autoAdvanceDelay;
      worldState.player.addExperience(activeScene.objective.rewardXp);
      stats.score += activeScene.objective.rewardXp * 3;
      logMsg(`Objective complete: +${activeScene.objective.rewardXp} XP`, 'success');
    }
  }

  function gameLoop(time: number) {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    stats.time += dt;
    blastCooldownRemaining = Math.max(0, blastCooldownRemaining - dt);
    updateCommandCooldowns(dt);
    updateComboTimer(dt);

    updateCamera(dt);
    updateCameraDirector(dt);
    gameplayManager.update(dt);
    engine.update(dt);

    const logicInputEntities: RuntimeEntitySnapshot[] = JSON.parse(engine.get_render_data());
    const logicLogs = runtimeLogic.tick({ dt, time: stats.time, engine, entities: logicInputEntities, stats });
    for (const line of logicLogs) {
      if (line.startsWith('Support ') && line.includes(' secured ')) {
        registerCombo(activeScene.scoring.supportComboBoost);
      }
    }
    const entities: RuntimeEntitySnapshot[] = JSON.parse(engine.get_render_data());
    stats.activeEnemies = entities.filter((entity) => entity.entity_type === 1).length;
    latestEntities = entities;
    const visibleLogs = [
      ...logicLogs.slice(0, 3),
      ...logicLogs.filter((line) => line.startsWith('Event:') && !logicLogs.slice(0, 3).includes(line)),
    ];
    for (const line of visibleLogs) {
      logMsg(line, 'info');
      const laneAlerted = triggerLaneSignalFromLog(line);
      if (line.startsWith('Event:') && !laneAlerted) {
        triggerEventFlash(line);
      }
    }

    renderEntities(entities, time);
    animateGeneratedObjects(generatedObjects, time);
    animateBuildPreview(buildPreview, time);
    scoreResolvedEnemies(entities);
    updatePerfectWaveBonus();
    updateObjective(dt);
    updateHud(stats);
    updateCommandButtons();
    if (mode === 'build' && activeBuildPlacement) {
      updateBuildAffordance(activeBuildPlacement);
    }
    if (mode === 'blast' && activeBlastTarget) {
      updateBlastMarker(activeBlastTarget);
    }

    if (stats.integrity <= 0) {
      aiEngine.balanceAI.recordSession({ difficulty: activeScene.difficulty, score: stats.score, winRate: 0.15 });
      void enterGeneratedScene('Core reset');
    }

    controls.update();
    composer.render();
    requestAnimationFrame(gameLoop);
  }

  document.getElementById('generate-scene-btn')!.addEventListener('click', () => {
    aiEngine.balanceAI.recordSession({ difficulty: activeScene.difficulty, score: stats.score, winRate: stats.integrity > 70 ? 0.85 : 0.35 });
    void enterGeneratedScene('AI scene generated');
  });
  document.getElementById('regenerate-logic-btn')!.addEventListener('click', regenerateLogic);
  document.getElementById('build-mode-btn')!.addEventListener('click', () => setMode('build'));
  document.getElementById('blast-mode-btn')!.addEventListener('click', () => setMode('blast'));
  document.getElementById('tower-type-btn')!.addEventListener('click', cycleTowerArchetype);
  document.getElementById('spawn-enemy-btn')!.addEventListener('click', spawnEnemyWave);
  renderer.domElement.addEventListener('pointermove', updatePointer);
  renderer.domElement.addEventListener('pointerdown', handleStagePointerDown);
  controls.addEventListener('start', () => {
    manualCameraHold = activeScene.controls.cameraManualOverride;
  });
  window.addEventListener('keydown', (event) => {
    if (isTextEntryTarget(event.target)) {
      return;
    }
    keys.add(event.code);
    if (event.code === 'Digit1') setMode('build');
    if (event.code === 'Digit2') setMode('blast');
    if (event.code === 'Digit3') cycleTowerArchetype();
    if (!event.repeat && event.code === 'KeyQ') executeCommand(0);
    if (!event.repeat && event.code === 'KeyE') executeCommand(1);
    if (!event.repeat && event.code === 'KeyR') executeCommand(2);
    if (event.code === 'Space') spawnEnemyWave();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
  });

  setMode('build');
  await enterGeneratedScene('Runtime online');
  logMsg('Rust WASM engine and AI director are running', 'success');
  requestAnimationFrame(gameLoop);
}

function triggerEventFlash(label: string) {
  eventFlashEl.textContent = label.replace(/^Event:\s*/, '');
  eventFlashEl.classList.remove('is-visible');
  void eventFlashEl.offsetWidth;
  eventFlashEl.classList.add('is-visible');
}

function createTerrain(blueprint: RuntimeSceneBlueprint): THREE.Object3D {
  const group = new THREE.Group();
  const texture = createTerrainTexture(blueprint);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(boundsSize, boundsSize, 96, 96),
    new THREE.MeshStandardMaterial({
      color: blueprint.palette.ground,
      map: texture,
      roughness: 0.82,
      metalness: 0.18,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundTopY;
  ground.receiveShadow = true;
  group.add(ground);

  const grid = new THREE.GridHelper(boundsSize, 24, blueprint.palette.grid, '#2A3440');
  grid.position.y = groundTopY + 0.35;
  group.add(grid);
  return group;
}

function createLaneMesh(spawn: Vec2, bend: Vec2, color: string, width: number): THREE.Object3D {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(spawn.x, groundTopY + 1.2, spawn.z),
    new THREE.Vector3(bend.x, groundTopY + 1.6, bend.z),
    new THREE.Vector3(0, groundTopY + 1.2, 0),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 36, Math.max(2.4, width * 0.08), 8, false);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.28,
    transparent: true,
    opacity: 0.72,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function createLaneSignal(
  signal: RuntimeSceneBlueprint['laneSignals'][number],
  lane: RuntimeSceneBlueprint['lanes'][number],
): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.laneSignal = true;
  group.userData.laneIndex = signal.laneIndex;
  group.userData.warningColor = signal.warningColor;
  group.userData.bossColor = signal.bossColor;
  group.userData.pulseSpeed = signal.pulseSpeed;
  group.userData.alertUntil = 0;
  group.userData.alertBoss = false;
  group.userData.phase = signal.laneIndex * 0.68;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(lane.spawn.x, groundTopY + 2.6, lane.spawn.z),
    new THREE.Vector3(lane.bend.x, groundTopY + 3.2, lane.bend.z),
    new THREE.Vector3(0, groundTopY + 2.6, 0),
  ]);
  const path = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 44, Math.max(1.2, signal.alertRadius * 0.045), 8, false),
    new THREE.MeshBasicMaterial({
      color: signal.warningColor,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  path.userData.laneSignalPart = 'path';
  group.add(path);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(signal.alertRadius, 1.25, 8, 64),
    new THREE.MeshBasicMaterial({
      color: signal.warningColor,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(lane.spawn.x, groundTopY + 3.1, lane.spawn.z);
  ring.userData.laneSignalPart = 'ring';
  group.add(ring);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.6, signal.beaconHeight, 10),
    new THREE.MeshBasicMaterial({
      color: signal.warningColor,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beacon.position.set(lane.spawn.x, groundTopY + signal.beaconHeight * 0.5 + 4, lane.spawn.z);
  beacon.userData.laneSignalPart = 'beacon';
  group.add(beacon);

  return group;
}

function createCommandTargetReticle(blueprint: RuntimeSceneBlueprint): THREE.Object3D {
  const laneCommand = blueprint.commands.find((command) => command.kind === 'lane-barrage');
  const radius = blueprint.commandTargeting.reticleRadius;
  const color = laneCommand?.color ?? blueprint.palette.projectile;
  const group = new THREE.Group();
  group.userData.commandTargetReticle = true;
  group.userData.baseRadius = radius;
  group.userData.pulseSpeed = blueprint.commandTargeting.reticlePulseSpeed;

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.82, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.userData.commandTargetDisk = true;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 1.15, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.commandTargetRing = true;

  const barMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const crossX = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.55, 1, 1.4), barMaterial);
  const crossZ = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, radius * 1.55), barMaterial.clone());
  crossX.userData.commandTargetCross = true;
  crossZ.userData.commandTargetCross = true;
  group.add(disk, ring, crossX, crossZ);
  return group;
}

function createBuildPreviewObject(): THREE.Group {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.buildPreview = true;

  const rangeDisk = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  rangeDisk.name = 'rangeDisk';
  rangeDisk.rotation.x = -Math.PI / 2;
  rangeDisk.position.y = 0.15;

  const rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.988, 1, 96),
    new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  rangeRing.name = 'rangeRing';
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.42;

  const towerGhost = new THREE.Group();
  towerGhost.name = 'towerGhost';
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 12, 34, 10),
    new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  base.position.y = 17;
  const turret = new THREE.Mesh(
    new THREE.ConeGeometry(9.5, 18, 10),
    new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  turret.position.y = 43;
  towerGhost.add(base, turret);

  group.add(rangeDisk, rangeRing, towerGhost);
  return group;
}

function createTowerPad(anchor: Vec2, palette: RuntimeSceneBlueprint['palette']): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.towerPad = true;
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(16, 36),
    new THREE.MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(anchor.x, groundTopY + 1.15, anchor.z);
  group.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10, 15, 36),
    new THREE.MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(anchor.x, groundTopY + 1.4, anchor.z);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 20, 8),
    new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.28 }),
  );
  beacon.position.set(anchor.x, groundTopY + 11, anchor.z);
  group.add(ring, beacon);
  return group;
}

function createBuildHint(
  hint: RuntimeSceneBlueprint['buildHints'][number],
  blueprint: RuntimeSceneBlueprint,
  starter: boolean,
): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.buildHint = true;
  group.userData.phase = hint.anchorIndex * 0.57;
  group.userData.priority = hint.priority;
  group.userData.starter = starter;
  group.position.set(hint.x, groundTopY + 2.1, hint.z);

  const archetype = blueprint.towerArchetypes.find((item) => item.id === hint.towerArchetypeId);
  const color = archetype?.color ?? hint.color;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(hint.radius, starter ? 1.45 : 0.9, 8, 72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: starter ? 0.74 : 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.buildHintRing = true;

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(hint.radius * 0.72, 42),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: starter ? 0.1 : 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.rotation.x = -Math.PI / 2;

  const pylon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.8, 12 + hint.priority * 3.2, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: starter ? 0.72 : 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pylon.position.y = 6 + hint.priority * 1.6;
  pylon.userData.buildHintPylon = true;

  const symbol = createBuildHintSymbol(hint.towerArchetypeId, color);
  symbol.position.y = 17 + hint.priority * 2;
  symbol.userData.buildHintSymbol = true;
  group.add(disk, ring, pylon, symbol);
  return group;
}

function createBuildHintSymbol(towerArchetypeId: string, color: string): THREE.Object3D {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (towerArchetypeId === 'rail') {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 3), material);
    rail.rotation.z = Math.PI / 5;
    return rail;
  }
  if (towerArchetypeId === 'spark') {
    return new THREE.Mesh(new THREE.TetrahedronGeometry(7, 0), material);
  }
  return new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), material);
}

function createTacticalField(
  field: RuntimeSceneBlueprint['tacticalFields'][number],
  palette: RuntimeSceneBlueprint['palette'],
): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.tacticalField = true;
  group.userData.phase = field.variant * 0.78;
  group.position.set(field.x, groundTopY + 1.8, field.z);

  const color = field.variant % 2 === 0 ? palette.grid : palette.accent;
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(field.radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.rotation.x = -Math.PI / 2;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(field.radius, 1.15, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.tacticalRing = true;

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 2.4, 22, 8),
    new THREE.MeshBasicMaterial({
      color: palette.projectile,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beacon.position.y = 10;
  group.add(disk, ring, beacon);
  return group;
}

function createSupportNode(
  node: RuntimeSceneBlueprint['supportNodes'][number],
  palette: RuntimeSceneBlueprint['palette'],
): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.supportNode = true;
  group.userData.phase = node.variant * 0.92;
  group.position.set(node.x, groundTopY + 2.4, node.z);

  const color = node.variant % 2 === 0 ? palette.core : palette.accent;
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(node.radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.rotation.x = -Math.PI / 2;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(node.radius, 0.9, 8, 80),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.supportRing = true;

  const pylon = new THREE.Mesh(
    new THREE.OctahedronGeometry(6 + node.variant * 1.2, 0),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pylon.position.y = 18;
  pylon.userData.supportPylon = true;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.4, 26, 8),
    new THREE.MeshBasicMaterial({
      color: palette.grid,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 11;
  group.add(disk, ring, beam, pylon);
  return group;
}

function createDecoration(decoration: Vec2 & { radius: number; height: number; variant: number }, palette: RuntimeSceneBlueprint['palette']): THREE.Object3D {
  const geometry = decoration.variant % 2 === 0
    ? new THREE.ConeGeometry(decoration.radius, decoration.height, 5)
    : new THREE.CylinderGeometry(decoration.radius * 0.75, decoration.radius, decoration.height, 6);
  const material = new THREE.MeshStandardMaterial({
    color: decoration.variant > 1 ? palette.accent : palette.tower,
    roughness: 0.38,
    metalness: 0.36,
    emissive: new THREE.Color(decoration.variant > 1 ? palette.accent : palette.grid).multiplyScalar(0.16),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(decoration.x, groundTopY + decoration.height / 2, decoration.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSetPiece(setPiece: RuntimeSceneBlueprint['setPieces'][number]): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.setPiece = true;
  group.userData.phase = setPiece.rotation;
  group.userData.kind = setPiece.kind;
  group.position.set(setPiece.x, groundTopY + 1, setPiece.z);
  group.rotation.y = setPiece.rotation;

  const mainMaterial = new THREE.MeshStandardMaterial({
    color: setPiece.color,
    emissive: new THREE.Color(setPiece.accentColor).multiplyScalar(0.16),
    roughness: 0.42,
    metalness: 0.32,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: setPiece.accentColor,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  if (setPiece.kind === 'arch') {
    const columnGeometry = new THREE.BoxGeometry(setPiece.radius * 0.75, setPiece.height * 0.72, setPiece.radius * 0.75);
    const left = new THREE.Mesh(columnGeometry, mainMaterial);
    const right = new THREE.Mesh(columnGeometry.clone(), mainMaterial.clone());
    left.position.set(-setPiece.radius * 1.25, setPiece.height * 0.36, 0);
    right.position.set(setPiece.radius * 1.25, setPiece.height * 0.36, 0);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(setPiece.radius * 3.2, setPiece.radius * 0.58, setPiece.radius),
      mainMaterial.clone(),
    );
    lintel.position.y = setPiece.height * 0.76;
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(setPiece.radius * 1.45, 0.72, 8, 52, Math.PI),
      glowMaterial,
    );
    trim.position.y = setPiece.height * 0.72;
    trim.rotation.z = Math.PI;
    group.add(left, right, lintel, trim);
  } else if (setPiece.kind === 'monolith') {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(setPiece.radius * 1.2, setPiece.height, setPiece.radius * 0.82),
      mainMaterial,
    );
    slab.position.y = setPiece.height * 0.5;
    slab.rotation.z = 0.08;
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(setPiece.radius * 0.12, setPiece.height * 0.82, setPiece.radius * 0.9),
      glowMaterial,
    );
    seam.position.y = setPiece.height * 0.52;
    seam.position.x = setPiece.radius * 0.18;
    group.add(slab, seam);
  } else if (setPiece.kind === 'garden') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(setPiece.radius * 1.45, setPiece.radius * 1.8, setPiece.height * 0.22, 8),
      mainMaterial,
    );
    base.position.y = setPiece.height * 0.11;
    group.add(base);
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI * 2 * i) / 4;
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(setPiece.radius * (0.35 + i * 0.04), setPiece.height * (0.42 + i * 0.05), 5),
        i % 2 === 0 ? mainMaterial.clone() : glowMaterial.clone(),
      );
      shard.position.set(Math.cos(angle) * setPiece.radius * 0.78, setPiece.height * 0.28, Math.sin(angle) * setPiece.radius * 0.78);
      shard.rotation.z = Math.sin(angle) * 0.2;
      group.add(shard);
    }
  } else {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(setPiece.radius * 0.38, setPiece.radius * 0.86, setPiece.height * 0.78, 9),
      mainMaterial,
    );
    tower.position.y = setPiece.height * 0.39;
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(setPiece.radius * 0.95, setPiece.height * 0.28, 9),
      glowMaterial,
    );
    cap.position.y = setPiece.height * 0.88;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(setPiece.radius * 1.05, 0.85, 8, 64),
      glowMaterial.clone(),
    );
    ring.position.y = setPiece.height * 0.54;
    ring.rotation.x = Math.PI / 2;
    ring.userData.setPieceRing = true;
    group.add(tower, cap, ring);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return group;
}

function createCore(palette: RuntimeSceneBlueprint['palette']): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.spinCore = true;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(20, 2),
    new THREE.MeshStandardMaterial({
      color: palette.core,
      emissive: palette.core,
      emissiveIntensity: 0.55,
      roughness: 0.24,
      metalness: 0.2,
    }),
  );
  core.position.y = groundTopY + 28;
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(34, 1.8, 8, 72),
    new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = groundTopY + 4;
  group.add(ring);
  return group;
}

function createAtmosphere(blueprint: RuntimeSceneBlueprint): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.atmosphere = true;
  const palette = blueprint.palette;
  const random = createVisualRandom(blueprint.seed + blueprint.difficulty * 4099);
  const particleCount = blueprint.atmosphere.particleCount;
  const positions = new Float32Array(particleCount * 3);
  const halfBounds = boundsSize * 0.56;
  const lowY = groundTopY + 26;
  const highY = groundTopY + 188;

  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (random() - 0.5) * halfBounds * 2;
    positions[i * 3 + 1] = lowY + random() * (highY - lowY);
    positions[i * 3 + 2] = (random() - 0.5) * halfBounds * 2;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: palette.accent,
    size: 3.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.userData.windField = true;
  particles.userData.bounds = halfBounds;
  particles.userData.lowY = lowY;
  particles.userData.highY = highY;
  particles.userData.windX = blueprint.atmosphere.wind.x * blueprint.atmosphere.particleSpeed * 54;
  particles.userData.windZ = blueprint.atmosphere.wind.z * blueprint.atmosphere.particleSpeed * 54;
  particles.userData.lift = blueprint.atmosphere.particleSpeed * 18;
  group.add(particles);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: palette.core,
    transparent: true,
    opacity: blueprint.atmosphere.coreHaloIntensity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const groundHalo = new THREE.Mesh(
    new THREE.TorusGeometry(blueprint.atmosphere.coreHaloRadius, 1.4, 10, 96),
    haloMaterial,
  );
  groundHalo.rotation.x = Math.PI / 2;
  groundHalo.position.y = groundTopY + 5;
  groundHalo.userData.coreHalo = true;
  groundHalo.userData.phase = 0.2;
  group.add(groundHalo);

  const verticalHalo = new THREE.Mesh(
    new THREE.TorusGeometry(blueprint.atmosphere.coreHaloRadius * 0.62, 0.9, 8, 72),
    new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: Math.min(0.36, blueprint.atmosphere.coreHaloIntensity * 0.62),
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  verticalHalo.rotation.y = Math.PI / 2;
  verticalHalo.position.y = groundTopY + 34;
  verticalHalo.userData.coreHalo = true;
  verticalHalo.userData.phase = 1.6;
  group.add(verticalHalo);

  blueprint.lanes.forEach((lane, laneIndex) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lane.spawn.x, groundTopY + 6, lane.spawn.z),
      new THREE.Vector3(lane.bend.x, groundTopY + 8, lane.bend.z),
      new THREE.Vector3(0, groundTopY + 7, 0),
    ]);
    for (let i = 1; i <= blueprint.atmosphere.laneBeaconCount; i += 1) {
      const point = curve.getPoint(i / (blueprint.atmosphere.laneBeaconCount + 1));
      const beacon = createLaneBeacon(point, palette, laneIndex * 0.7 + i * 0.42);
      group.add(beacon);
    }
  });

  for (let i = 0; i < blueprint.atmosphere.skyRingCount; i += 1) {
    const skyRing = new THREE.Mesh(
      new THREE.TorusGeometry(165 + i * 18, 0.7, 8, 128),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? palette.grid : palette.accent,
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    skyRing.rotation.x = Math.PI / 2 + i * 0.07;
    skyRing.rotation.y = i * 0.13;
    skyRing.position.y = groundTopY + 118 + i * 22;
    skyRing.userData.skyRing = true;
    skyRing.userData.phase = i * 0.9;
    group.add(skyRing);
  }

  return group;
}

function createLaneBeacon(point: THREE.Vector3, palette: RuntimeSceneBlueprint['palette'], phase: number): THREE.Object3D {
  const group = new THREE.Group();
  group.position.copy(point);
  group.userData.laneBeacon = true;
  group.userData.phase = phase;

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 14, 14),
    new THREE.MeshBasicMaterial({
      color: palette.grid,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  orb.position.y = 3.5;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 18, 8),
    new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 8;
  group.add(orb, beam);
  return group;
}

function animateGeneratedObjects(objects: THREE.Object3D[], time: number) {
  for (const object of objects) {
    if (object.userData.spinCore) {
      object.rotation.y = time * 0.00035;
      const core = object.children[0];
      const ring = object.children[1];
      if (core) {
        core.rotation.x = time * 0.00055;
        core.rotation.z = time * 0.0004;
      }
      if (ring) {
        ring.rotation.z = time * 0.0012;
      }
    }
    if (object.userData.atmosphere) {
      animateAtmosphere(object, time);
    }
    if (object.userData.tacticalField) {
      animateTacticalField(object, time);
    }
    if (object.userData.supportNode) {
      animateSupportNode(object, time);
    }
    if (object.userData.buildHint) {
      animateBuildHint(object, time);
    }
    if (object.userData.setPiece) {
      animateSetPiece(object, time);
    }
    if (object.userData.laneSignal) {
      animateLaneSignal(object, time);
    }
    if (object.userData.commandTargetReticle) {
      animateCommandTargetReticle(object, time);
    }
  }
}

function animateBuildPreview(group: THREE.Object3D, time: number) {
  if (!group.visible) return;
  const ring = group.getObjectByName('rangeRing');
  if (ring) {
    ring.rotation.z = time * 0.0009;
  }
  const towerGhost = group.getObjectByName('towerGhost');
  if (towerGhost) {
    towerGhost.rotation.y = time * 0.0014;
    const pulse = 1 + Math.sin(time * 0.006) * 0.035;
    towerGhost.scale.y = pulse;
  }
}

function animateTacticalField(group: THREE.Object3D, time: number) {
  const phase = group.userData.phase as number;
  const pulse = 1 + Math.sin(time * 0.004 + phase) * 0.045;
  group.scale.set(pulse, 1, pulse);
  group.rotation.y = Math.sin(time * 0.0018 + phase) * 0.08;
  const ring = group.children.find((child) => child.userData.tacticalRing);
  if (ring) {
    ring.rotation.z = time * 0.0011 + phase;
  }
}

function animateSupportNode(group: THREE.Object3D, time: number) {
  const phase = group.userData.phase as number;
  const pulse = 1 + Math.sin(time * 0.0048 + phase) * 0.075;
  group.scale.set(pulse, 1, pulse);
  const ring = group.children.find((child) => child.userData.supportRing);
  if (ring) {
    ring.rotation.z = time * 0.0014 + phase;
  }
  const pylon = group.children.find((child) => child.userData.supportPylon);
  if (pylon) {
    pylon.rotation.y = time * 0.0022 + phase;
    pylon.position.y = 18 + Math.sin(time * 0.005 + phase) * 2.2;
  }
}

function animateBuildHint(group: THREE.Object3D, time: number) {
  const phase = group.userData.phase as number;
  const priority = group.userData.priority as number;
  const starter = Boolean(group.userData.starter);
  const pulse = 1 + Math.sin(time * 0.0035 + phase) * (starter ? 0.09 : 0.045);
  const ring = group.children.find((child) => child.userData.buildHintRing);
  if (ring) {
    ring.rotation.z = time * 0.0011 + phase;
    ring.scale.setScalar(pulse);
  }
  const pylon = group.children.find((child) => child.userData.buildHintPylon);
  if (pylon) {
    pylon.scale.y = 1 + Math.sin(time * 0.0042 + phase) * 0.08;
  }
  const symbol = group.children.find((child) => child.userData.buildHintSymbol);
  if (symbol) {
    symbol.rotation.y = time * 0.0018 + phase;
    symbol.position.y = 17 + priority * 2 + Math.sin(time * 0.004 + phase) * 1.5;
  }
}

function animateSetPiece(group: THREE.Object3D, time: number) {
  const phase = group.userData.phase as number;
  const pulse = 1 + Math.sin(time * 0.0018 + phase) * 0.018;
  group.scale.setScalar(pulse);
  const ring = group.children.find((child) => child.userData.setPieceRing);
  if (ring) {
    ring.rotation.z = time * 0.0007 + phase;
  }
}

function animateLaneSignal(group: THREE.Object3D, time: number) {
  const active = performance.now() < ((group.userData.alertUntil as number | undefined) ?? 0);
  const warningColor = group.userData.warningColor as string;
  const bossColor = group.userData.bossColor as string;
  const color = active && group.userData.alertBoss ? bossColor : warningColor;
  const phase = group.userData.phase as number;
  const speed = group.userData.pulseSpeed as number;
  const pulse = 1 + Math.sin(time * 0.0028 * speed + phase) * (active ? 0.16 : 0.05);
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (!material?.color) return;
    material.color.set(color);
    const part = child.userData.laneSignalPart;
    if (part === 'path') material.opacity = active ? 0.44 : 0.13;
    if (part === 'ring') material.opacity = active ? 0.78 : 0.22;
    if (part === 'beacon') material.opacity = active ? 0.62 : 0.18;
  });
  const ring = group.children.find((child) => child.userData.laneSignalPart === 'ring');
  if (ring) {
    ring.rotation.z = time * 0.0018 * speed + phase;
    ring.scale.setScalar(pulse);
  }
  const beacon = group.children.find((child) => child.userData.laneSignalPart === 'beacon');
  if (beacon) {
    beacon.scale.x = active ? pulse : 1;
    beacon.scale.z = active ? pulse : 1;
  }
}

function animateCommandTargetReticle(group: THREE.Object3D, time: number) {
  if (!group.visible) return;
  const speed = (group.userData.pulseSpeed as number | undefined) ?? 1;
  const pulse = 1 + Math.sin(time * 0.0034 * speed) * 0.105;
  group.rotation.y = time * 0.00075 * speed;
  for (const child of group.children) {
    if (child.userData.commandTargetRing) {
      child.scale.setScalar(pulse);
    }
    if (child.userData.commandTargetCross) {
      child.scale.y = 1 + Math.sin(time * 0.0042 * speed) * 0.25;
    }
  }
}

function animateAtmosphere(group: THREE.Object3D, time: number) {
  group.traverse((child) => {
    if (child.userData.windField) {
      animateWindField(child as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>, time);
      return;
    }
    if (child.userData.coreHalo) {
      const phase = child.userData.phase as number;
      const pulse = 1 + Math.sin(time * 0.0024 + phase) * 0.06;
      child.scale.set(pulse, pulse, pulse);
      child.rotation.z = time * 0.00032 + phase;
      return;
    }
    if (child.userData.laneBeacon) {
      const phase = child.userData.phase as number;
      const pulse = 1 + Math.sin(time * 0.0046 + phase) * 0.22;
      child.scale.setScalar(pulse);
      return;
    }
    if (child.userData.skyRing) {
      const phase = child.userData.phase as number;
      child.rotation.z = time * 0.00016 + phase;
    }
  });
}

function animateWindField(points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>, time: number) {
  const lastTime = (points.userData.lastTime as number | undefined) ?? time;
  const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
  points.userData.lastTime = time;
  const geometry = points.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const values = position.array as Float32Array;
  const bounds = points.userData.bounds as number;
  const lowY = points.userData.lowY as number;
  const highY = points.userData.highY as number;
  const windX = points.userData.windX as number;
  const windZ = points.userData.windZ as number;
  const lift = points.userData.lift as number;

  for (let i = 0; i < values.length; i += 3) {
    values[i] += windX * dt;
    values[i + 1] += lift * dt;
    values[i + 2] += windZ * dt;
    if (values[i] > bounds) values[i] = -bounds;
    if (values[i] < -bounds) values[i] = bounds;
    if (values[i + 1] > highY) values[i + 1] = lowY;
    if (values[i + 2] > bounds) values[i + 2] = -bounds;
    if (values[i + 2] < -bounds) values[i + 2] = bounds;
  }
  position.needsUpdate = true;
}

function createEntityObject(entity: RuntimeEntitySnapshot, blueprint: RuntimeSceneBlueprint): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.id = entity.id;
  group.userData.entityType = entity.entity_type;

  if (entity.entity_type === 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(entity.width, 8, entity.depth),
      new THREE.MeshStandardMaterial({ color: blueprint.palette.ground, transparent: true, opacity: 0.12 }),
    );
    mesh.userData.id = entity.id;
    group.add(mesh);
    return group;
  }

  if (entity.entity_type === 2) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(entity.width * 0.5, entity.width * 0.62, entity.height * 0.78, 10),
      entityMaterial(entity.color, 0.25),
    );
    base.position.y = -entity.height * 0.05;
    base.castShadow = true;
    base.userData.id = entity.id;
    const turret = new THREE.Mesh(
      new THREE.ConeGeometry(entity.width * 0.52, entity.height * 0.35, 10),
      entityMaterial(blueprint.palette.grid, 0.38),
    );
    turret.position.y = entity.height * 0.42;
    turret.castShadow = true;
    turret.userData.id = entity.id;
    group.add(base, turret);
    return group;
  }

  const isBoss = entity.entity_type === 1 && matchBossPlan(entity, blueprint.bossPlan);
  const geometry = isBoss
    ? new THREE.DodecahedronGeometry(entity.width * 0.56, 1)
    : entity.entity_type === 1
      ? new THREE.IcosahedronGeometry(entity.width * 0.52, 1)
      : entity.entity_type === 3
        ? new THREE.SphereGeometry(entity.width * 0.5, 14, 14)
        : new THREE.BoxGeometry(entity.width, entity.height, entity.depth);
  const color = entity.entity_type === 3 ? blueprint.palette.projectile : entity.color;
  const mesh = new THREE.Mesh(geometry, entityMaterial(color, isBoss ? 0.56 : entity.entity_type === 3 ? 0.8 : 0.28));
  mesh.castShadow = entity.entity_type !== 3;
  mesh.userData.id = entity.id;
  group.add(mesh);
  if (isBoss) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(entity.width * 0.72, 1.8, 8, 48),
      entityMaterial(blueprint.palette.projectile, 0.45),
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.userData.id = entity.id;
    ring.userData.bossRing = true;
    group.add(ring);
  }
  return group;
}

function updateEntityObject(object: THREE.Object3D, entity: RuntimeEntitySnapshot, blueprint: RuntimeSceneBlueprint, time: number) {
  object.position.set(entity.x, entity.y, entity.z);
  if (entity.entity_type === 1) {
    const isBoss = matchBossPlan(entity, blueprint.bossPlan);
    object.rotation.y += isBoss ? 0.038 : 0.025;
    object.position.y += Math.sin(time * (isBoss ? 0.0048 : 0.006) + entity.id) * (isBoss ? 2.2 : 1.2);
    const ring = object.children.find((child) => child.userData.bossRing);
    if (ring) {
      ring.rotation.z = time * 0.0012;
      ring.scale.setScalar(1 + Math.sin(time * 0.005 + entity.id) * 0.08);
    }
  } else if (entity.entity_type === 3) {
    object.scale.setScalar(1 + Math.sin(time * 0.02) * 0.08);
  }

  const color = entity.entity_type === 2
    ? entity.color
    : entity.entity_type === 3
      ? blueprint.palette.projectile
      : entity.color;
  setObjectColor(object, color);
}

function entityMaterial(color: string, emissiveIntensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity,
    roughness: 0.34,
    metalness: 0.18,
  });
}

function setObjectColor(object: THREE.Object3D, color: string) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!material?.color) return;
    material.color.set(color);
    if (material.emissive) {
      material.emissive.set(color);
    }
  });
}

function setObjectOpacity(object: THREE.Object3D, intensity: number) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of materials) {
      const baseOpacity = (item.userData.baseOpacity as number | undefined) ?? item.opacity;
      item.userData.baseOpacity = baseOpacity;
      item.transparent = true;
      item.opacity = baseOpacity * intensity;
    }
  });
}

function createTerrainTexture(blueprint: RuntimeSceneBlueprint): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = blueprint.palette.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = blueprint.palette.grid;
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 47 + blueprint.seed * 13) % canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo((x + 210) % canvas.width, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = blueprint.palette.accent;
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 37 + blueprint.seed * 11) % canvas.width;
    const y = (i * 53 + blueprint.seed * 7) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

function velocityToward(from: Vec2, to: Vec2, speed: number): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: (dx / len) * speed, z: (dz / len) * speed };
}

function normalizeLaneIndex(index: number, laneCount: number): number {
  if (laneCount <= 0) return 0;
  return ((Math.trunc(index) % laneCount) + laneCount) % laneCount;
}

function distanceToRuntimeLaneSquared(point: Vec2, lane: RuntimeSceneBlueprint['lanes'][number]): number {
  return Math.min(
    distanceToSegmentSquared2D(point, lane.spawn, lane.bend),
    distanceToSegmentSquared2D(point, lane.bend, { x: 0, z: 0 }),
  );
}

function closestPointOnRuntimeLane(point: Vec2, lane: RuntimeSceneBlueprint['lanes'][number]): Vec2 {
  const spawnToBend = closestPointOnSegment2D(point, lane.spawn, lane.bend);
  const bendToCore = closestPointOnSegment2D(point, lane.bend, { x: 0, z: 0 });
  return spawnToBend.distanceSquared <= bendToCore.distanceSquared ? spawnToBend.point : bendToCore.point;
}

function distanceToSegmentSquared2D(point: Vec2, start: Vec2, end: Vec2): number {
  return closestPointOnSegment2D(point, start, end).distanceSquared;
}

function closestPointOnSegment2D(point: Vec2, start: Vec2, end: Vec2): { point: Vec2; distanceSquared: number } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= Number.EPSILON) {
    const px = point.x - start.x;
    const pz = point.z - start.z;
    return { point: start, distanceSquared: px * px + pz * pz };
  }
  const t = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
  const closest = {
    x: start.x + dx * t,
    z: start.z + dz * t,
  };
  const px = point.x - closest.x;
  const pz = point.z - closest.z;
  return { point: closest, distanceSquared: px * px + pz * pz };
}

function laneThreatFocusPoint(
  lane: RuntimeSceneBlueprint['lanes'][number],
  leadDistance: number,
  boss: boolean,
): Vec2 {
  const from = boss ? lane.spawn : lane.bend;
  const to = boss ? lane.bend : { x: 0, z: 0 };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz) || 1;
  const t = clamp(leadDistance / distance, 0.12, boss ? 0.62 : 0.82);
  return {
    x: from.x + dx * t,
    z: from.z + dz * t,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createVisualRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

runGame().catch((error) => {
  console.error(error);
  logMsg(error instanceof Error ? error.message : String(error), 'error');
});
