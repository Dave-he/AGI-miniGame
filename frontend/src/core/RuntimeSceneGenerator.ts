export type SceneBiome = 'neon-harbor' | 'verdant-ruins' | 'sunforge-bazaar' | 'orbital-garden';

export interface Vec2 {
  x: number;
  z: number;
}

export interface RuntimePalette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  road: string;
  grid: string;
  tower: string;
  enemy: string;
  projectile: string;
  core: string;
  accent: string;
  fog: string;
}

export interface RuntimeLane {
  id: string;
  spawn: Vec2;
  bend: Vec2;
  width: number;
}

export interface RuntimeWavePlan {
  id: string;
  laneIndex: number;
  count: number;
  intervalMultiplier: number;
  archetypeBias: number;
  spawnSpread: number;
  warningTime: number;
}

export interface RuntimeTowerArchetype {
  id: string;
  label: string;
  rangeMultiplier: number;
  fireIntervalMultiplier: number;
  damageMultiplier: number;
  scale: number;
  color: string;
  buildCost: number;
}

export interface RuntimeBuildHint extends Vec2 {
  id: string;
  anchorIndex: number;
  laneIndex: number;
  towerArchetypeId: string;
  priority: number;
  radius: number;
  color: string;
}

export type RuntimeSetPieceKind = 'spire' | 'arch' | 'monolith' | 'garden';

export interface RuntimeSetPiece extends Vec2 {
  id: string;
  kind: RuntimeSetPieceKind;
  radius: number;
  height: number;
  rotation: number;
  color: string;
  accentColor: string;
}

export interface RuntimeSceneBlueprint {
  id: string;
  title: string;
  seed: number;
  biome: SceneBiome;
  difficulty: number;
  modules: string[];
  palette: RuntimePalette;
  lanes: RuntimeLane[];
  wavePlan: RuntimeWavePlan[];
  towerAnchors: Vec2[];
  towerArchetypes: RuntimeTowerArchetype[];
  buildHints: RuntimeBuildHint[];
  tacticalFields: RuntimeTacticalField[];
  supportNodes: RuntimeSupportNode[];
  enemyArchetypes: RuntimeEnemyArchetype[];
  bossPlan: RuntimeBossPlan;
  commands: RuntimeCommandPlan[];
  commandTargeting: RuntimeCommandTargetingPlan;
  laneSignals: RuntimeLaneSignal[];
  setPieces: RuntimeSetPiece[];
  decorations: Array<Vec2 & { radius: number; height: number; variant: number }>;
  spawn: {
    interval: number;
    enemySpeed: number;
    enemyCap: number;
    waveSize: number;
  };
  camera: {
    distance: number;
    height: number;
    pitch: number;
  };
  lighting: {
    ambient: number;
    key: number;
    bloom: number;
  };
  atmosphere: RuntimeAtmospherePlan;
  controls: RuntimeControlPlan;
  combat: RuntimeCombatPlan;
  scoring: RuntimeScoringPlan;
  objective: RuntimeObjectivePlan;
  events: RuntimeDirectorEvent[];
  rules: RuntimeRulePlan;
  logicSource: string;
}

export type RuntimeDirectorEventKind = 'repair-pulse' | 'tower-overdrive' | 'enemy-surge';

export interface RuntimeDirectorEvent {
  id: string;
  kind: RuntimeDirectorEventKind;
  triggerWave: number;
  cooldown: number;
  magnitude: number;
  duration: number;
  laneIndex: number;
}

export interface RuntimeObjectivePlan {
  summary: string;
  targetWaves: number;
  targetScore: number;
  minIntegrity: number;
  rewardXp: number;
  autoAdvanceDelay: number;
}

export interface RuntimeAtmospherePlan {
  particleCount: number;
  particleSpeed: number;
  wind: Vec2;
  coreHaloRadius: number;
  coreHaloIntensity: number;
  laneBeaconCount: number;
  skyRingCount: number;
}

export interface RuntimeControlPlan {
  cameraPanSpeed: number;
  cameraDamping: number;
  cameraAutoFocusStrength: number;
  cameraThreatLead: number;
  cameraManualOverride: number;
  cameraAlertZoom: number;
  blastForce: number;
  blastCooldown: number;
  blastScoreReward: number;
  buildScoreCost: number;
  pointerAssistRadius: number;
}

export interface RuntimeCombatPlan {
  towerRange: number;
  towerFireInterval: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileLead: number;
}

export interface RuntimeScoringPlan {
  comboWindow: number;
  comboMultiplierStep: number;
  maxComboMultiplier: number;
  blastComboBoost: number;
  commandComboBoost: number;
  supportComboBoost: number;
  perfectWaveBonus: number;
}

export interface RuntimeTacticalField extends Vec2 {
  radius: number;
  slowMultiplier: number;
  damagePerPulse: number;
  pulseInterval: number;
  variant: number;
}

export interface RuntimeSupportNode extends Vec2 {
  id: string;
  radius: number;
  scorePerPulse: number;
  repairPerPulse: number;
  pulseDamage: number;
  pulseInterval: number;
  variant: number;
}

export interface RuntimeEnemyArchetype {
  id: string;
  label: string;
  hp: number;
  speedMultiplier: number;
  scale: number;
  color: string;
  scoreReward: number;
}

export interface RuntimeBossPlan {
  id: string;
  label: string;
  triggerWave: number;
  laneIndex: number;
  hp: number;
  speedMultiplier: number;
  scale: number;
  color: string;
  scoreReward: number;
  warningTime: number;
  auraRadius: number;
  auraDamage: number;
  auraInterval: number;
}

export type RuntimeCommandKind = 'lane-barrage' | 'core-repair' | 'tower-rally';

export interface RuntimeCommandPlan {
  id: string;
  label: string;
  kind: RuntimeCommandKind;
  hotkey: string;
  cooldown: number;
  scoreCost: number;
  magnitude: number;
  radius: number;
  duration: number;
  laneIndex: number;
  color: string;
}

export interface RuntimeCommandTargetingPlan {
  laneAssistRadius: number;
  threatWeight: number;
  pointerWeight: number;
  reticleRadius: number;
  reticlePulseSpeed: number;
  retargetCooldown: number;
}

export interface RuntimeLaneSignal {
  id: string;
  laneIndex: number;
  warningColor: string;
  bossColor: string;
  alertRadius: number;
  pulseSpeed: number;
  beaconHeight: number;
}

export interface RuntimeRulePlan {
  starterTowerEnabled: boolean;
  firstWaveDelay: number;
  steeringLerp: number;
  woundedHealthRatio: number;
  woundedSpeedMultiplier: number;
  weakPointPulseInterval: number;
  weakPointPulseForce: number;
  waypointRadius: number;
  towerSnapRadius: number;
  laneBuildBuffer: number;
  coreBuildRadius: number;
  maxTowers: number;
  breachRadius: number;
  breachDamage: number;
  lowIntegrityThreshold: number;
  lowIntegritySpawnMultiplier: number;
}

export interface RuntimeEntitySnapshot {
  id: number;
  entity_type: number;
  hp: number;
  max_hp: number;
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
  range_multiplier: number;
  fire_interval_multiplier: number;
  damage_multiplier: number;
  cooldown: number;
}

export interface RuntimeStats {
  score: number;
  integrity: number;
  wave: number;
  time: number;
  activeEnemies?: number;
  combo?: number;
  comboMultiplier?: number;
}

export interface RuntimeEngineFacade {
  generate_runtime_scene?(seed: number, playerLevel: number, difficulty: number, themeHint: string, modulesJson: string): string;
  spawn_enemy(x: number, z: number, vx: number, vz: number): number;
  spawn_enemy_variant(x: number, z: number, vx: number, vz: number, hp: number, scale: number, color: string): number;
  build_tower(x: number, z: number): number;
  build_tower_variant?(
    x: number,
    z: number,
    rangeMultiplier: number,
    fireIntervalMultiplier: number,
    damageMultiplier: number,
    scale: number,
    color: string,
  ): number;
  damage_entity(entityId: number, amount: number): boolean;
  explode_entity(entityId: number, force: number): void;
  apply_render_data(renderDataJson: string): boolean;
  clear_dynamic_entities(): void;
  set_gravity(gravity: number): void;
  set_combat_tuning(
    towerRange: number,
    towerFireInterval: number,
    projectileSpeed: number,
    projectileDamage: number,
    projectileLead: number,
  ): void;
}

export interface RuntimeLogicContext {
  dt: number;
  time: number;
  engine: RuntimeEngineFacade;
  entities: RuntimeEntitySnapshot[];
  stats: RuntimeStats;
}

export interface RuntimeLogicProgram {
  name: string;
  source: string;
  tick(ctx: RuntimeLogicContext): string[];
}

export interface RuntimeSceneRequest {
  seed: number;
  playerLevel: number;
  difficulty: number;
  themeHint?: string;
  modules?: string[];
}

export interface BuildPlacementResult {
  valid: boolean;
  position: Vec2;
  snappedToAnchor: boolean;
  anchorIndex: number | null;
  reason: string;
}

export interface BlastTargetResult {
  valid: boolean;
  position: Vec2;
  entityId: number | null;
  distance: number;
  reason: string;
}

export interface RuntimeObjectiveProgress {
  sceneScore: number;
  progress: number;
  complete: boolean;
  reason: 'wave' | 'score' | 'integrity' | 'pending';
}

export interface RuntimeTowerCombatProfile {
  range: number;
  fireInterval: number;
  damage: number;
  buildCost: number;
}

export interface RuntimeCommandResult {
  triggered: boolean;
  mutated: boolean;
  message: string;
}

export function parseRuntimeSceneBlueprint(json: string): RuntimeSceneBlueprint | null {
  try {
    const parsed = JSON.parse(json) as RuntimeSceneBlueprint & { error?: string };
    if (typeof parsed.error === 'string') return null;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return null;
    if (typeof parsed.seed !== 'number' || typeof parsed.difficulty !== 'number') return null;
    if (typeof parsed.biome !== 'string' || !Array.isArray(parsed.modules)) return null;
    if (!parsed.palette || typeof parsed.palette.core !== 'string' || typeof parsed.palette.ground !== 'string') return null;
    if (!Array.isArray(parsed.lanes) || parsed.lanes.length < 2) return null;
    if (
      !Array.isArray(parsed.wavePlan)
      || parsed.wavePlan.length === 0
      || parsed.wavePlan.some((wave) => (
        typeof wave.id !== 'string'
        || typeof wave.laneIndex !== 'number'
        || typeof wave.count !== 'number'
        || typeof wave.intervalMultiplier !== 'number'
        || typeof wave.archetypeBias !== 'number'
        || typeof wave.spawnSpread !== 'number'
        || typeof wave.warningTime !== 'number'
      ))
    ) return null;
    if (!Array.isArray(parsed.towerAnchors) || parsed.towerAnchors.length === 0) return null;
    if (
      !Array.isArray(parsed.towerArchetypes)
      || parsed.towerArchetypes.length === 0
      || parsed.towerArchetypes.some((archetype) => (
        typeof archetype.id !== 'string'
        || typeof archetype.label !== 'string'
        || typeof archetype.rangeMultiplier !== 'number'
        || typeof archetype.fireIntervalMultiplier !== 'number'
        || typeof archetype.damageMultiplier !== 'number'
        || typeof archetype.scale !== 'number'
        || typeof archetype.color !== 'string'
        || typeof archetype.buildCost !== 'number'
      ))
    ) return null;
    if (
      !Array.isArray(parsed.buildHints)
      || parsed.buildHints.length === 0
      || parsed.buildHints.some((hint) => (
        typeof hint.id !== 'string'
        || typeof hint.anchorIndex !== 'number'
        || typeof hint.laneIndex !== 'number'
        || typeof hint.towerArchetypeId !== 'string'
        || typeof hint.priority !== 'number'
        || typeof hint.radius !== 'number'
        || typeof hint.color !== 'string'
        || typeof hint.x !== 'number'
        || typeof hint.z !== 'number'
        || hint.anchorIndex < 0
        || hint.anchorIndex >= parsed.towerAnchors.length
        || hint.laneIndex < 0
        || hint.laneIndex >= parsed.lanes.length
      ))
    ) return null;
    if (
      !Array.isArray(parsed.tacticalFields)
      || parsed.tacticalFields.length === 0
      || parsed.tacticalFields.some((field) => (
        typeof field.x !== 'number'
        || typeof field.z !== 'number'
        || typeof field.radius !== 'number'
        || typeof field.slowMultiplier !== 'number'
        || typeof field.damagePerPulse !== 'number'
        || typeof field.pulseInterval !== 'number'
        || typeof field.variant !== 'number'
      ))
    ) return null;
    if (
      !Array.isArray(parsed.supportNodes)
      || parsed.supportNodes.length === 0
      || parsed.supportNodes.some((node) => (
        typeof node.id !== 'string'
        || typeof node.x !== 'number'
        || typeof node.z !== 'number'
        || typeof node.radius !== 'number'
        || typeof node.scorePerPulse !== 'number'
        || typeof node.repairPerPulse !== 'number'
        || typeof node.pulseDamage !== 'number'
        || typeof node.pulseInterval !== 'number'
        || typeof node.variant !== 'number'
      ))
    ) return null;
    if (
      !Array.isArray(parsed.enemyArchetypes)
      || parsed.enemyArchetypes.length === 0
      || parsed.enemyArchetypes.some((archetype) => (
        typeof archetype.id !== 'string'
        || typeof archetype.label !== 'string'
        || typeof archetype.hp !== 'number'
        || typeof archetype.speedMultiplier !== 'number'
        || typeof archetype.scale !== 'number'
        || typeof archetype.color !== 'string'
        || typeof archetype.scoreReward !== 'number'
      ))
    ) return null;
    if (
      !parsed.bossPlan
      || typeof parsed.bossPlan.id !== 'string'
      || typeof parsed.bossPlan.label !== 'string'
      || typeof parsed.bossPlan.triggerWave !== 'number'
      || typeof parsed.bossPlan.laneIndex !== 'number'
      || typeof parsed.bossPlan.hp !== 'number'
      || typeof parsed.bossPlan.speedMultiplier !== 'number'
      || typeof parsed.bossPlan.scale !== 'number'
      || typeof parsed.bossPlan.color !== 'string'
      || typeof parsed.bossPlan.scoreReward !== 'number'
      || typeof parsed.bossPlan.warningTime !== 'number'
      || typeof parsed.bossPlan.auraRadius !== 'number'
      || typeof parsed.bossPlan.auraDamage !== 'number'
      || typeof parsed.bossPlan.auraInterval !== 'number'
    ) return null;
    if (
      !Array.isArray(parsed.commands)
      || parsed.commands.length === 0
      || parsed.commands.some((command) => (
        typeof command.id !== 'string'
        || typeof command.label !== 'string'
        || typeof command.kind !== 'string'
        || typeof command.hotkey !== 'string'
        || typeof command.cooldown !== 'number'
        || typeof command.scoreCost !== 'number'
        || typeof command.magnitude !== 'number'
        || typeof command.radius !== 'number'
        || typeof command.duration !== 'number'
        || typeof command.laneIndex !== 'number'
        || typeof command.color !== 'string'
      ))
    ) return null;
    if (
      !parsed.commandTargeting
      || typeof parsed.commandTargeting.laneAssistRadius !== 'number'
      || typeof parsed.commandTargeting.threatWeight !== 'number'
      || typeof parsed.commandTargeting.pointerWeight !== 'number'
      || typeof parsed.commandTargeting.reticleRadius !== 'number'
      || typeof parsed.commandTargeting.reticlePulseSpeed !== 'number'
      || typeof parsed.commandTargeting.retargetCooldown !== 'number'
    ) return null;
    if (
      !Array.isArray(parsed.laneSignals)
      || parsed.laneSignals.length !== parsed.lanes.length
      || parsed.laneSignals.some((signal) => (
        typeof signal.id !== 'string'
        || typeof signal.laneIndex !== 'number'
        || typeof signal.warningColor !== 'string'
        || typeof signal.bossColor !== 'string'
        || typeof signal.alertRadius !== 'number'
        || typeof signal.pulseSpeed !== 'number'
        || typeof signal.beaconHeight !== 'number'
      ))
    ) return null;
    if (
      !Array.isArray(parsed.setPieces)
      || parsed.setPieces.length === 0
      || parsed.setPieces.some((setPiece) => (
        typeof setPiece.id !== 'string'
        || typeof setPiece.kind !== 'string'
        || typeof setPiece.x !== 'number'
        || typeof setPiece.z !== 'number'
        || typeof setPiece.radius !== 'number'
        || typeof setPiece.height !== 'number'
        || typeof setPiece.rotation !== 'number'
        || typeof setPiece.color !== 'string'
        || typeof setPiece.accentColor !== 'string'
      ))
    ) return null;
    if (!Array.isArray(parsed.decorations)) return null;
    if (!parsed.spawn || typeof parsed.spawn.enemySpeed !== 'number' || typeof parsed.spawn.interval !== 'number') return null;
    if (!parsed.camera || typeof parsed.camera.distance !== 'number') return null;
    if (!parsed.lighting || typeof parsed.lighting.bloom !== 'number') return null;
    if (
      !parsed.atmosphere
      || typeof parsed.atmosphere.particleCount !== 'number'
      || typeof parsed.atmosphere.particleSpeed !== 'number'
      || !parsed.atmosphere.wind
      || typeof parsed.atmosphere.wind.x !== 'number'
      || typeof parsed.atmosphere.wind.z !== 'number'
      || typeof parsed.atmosphere.coreHaloRadius !== 'number'
      || typeof parsed.atmosphere.coreHaloIntensity !== 'number'
      || typeof parsed.atmosphere.laneBeaconCount !== 'number'
      || typeof parsed.atmosphere.skyRingCount !== 'number'
    ) return null;
    if (
      !parsed.controls
      || typeof parsed.controls.cameraPanSpeed !== 'number'
      || typeof parsed.controls.cameraDamping !== 'number'
      || typeof parsed.controls.cameraAutoFocusStrength !== 'number'
      || typeof parsed.controls.cameraThreatLead !== 'number'
      || typeof parsed.controls.cameraManualOverride !== 'number'
      || typeof parsed.controls.cameraAlertZoom !== 'number'
      || typeof parsed.controls.blastForce !== 'number'
      || typeof parsed.controls.blastCooldown !== 'number'
      || typeof parsed.controls.blastScoreReward !== 'number'
      || typeof parsed.controls.buildScoreCost !== 'number'
      || typeof parsed.controls.pointerAssistRadius !== 'number'
    ) return null;
    if (
      !parsed.combat
      || typeof parsed.combat.towerRange !== 'number'
      || typeof parsed.combat.towerFireInterval !== 'number'
      || typeof parsed.combat.projectileSpeed !== 'number'
      || typeof parsed.combat.projectileDamage !== 'number'
      || typeof parsed.combat.projectileLead !== 'number'
    ) return null;
    if (
      !parsed.scoring
      || typeof parsed.scoring.comboWindow !== 'number'
      || typeof parsed.scoring.comboMultiplierStep !== 'number'
      || typeof parsed.scoring.maxComboMultiplier !== 'number'
      || typeof parsed.scoring.blastComboBoost !== 'number'
      || typeof parsed.scoring.commandComboBoost !== 'number'
      || typeof parsed.scoring.supportComboBoost !== 'number'
      || typeof parsed.scoring.perfectWaveBonus !== 'number'
    ) return null;
    if (!parsed.objective || typeof parsed.objective.targetWaves !== 'number' || typeof parsed.objective.targetScore !== 'number') return null;
    if (!Array.isArray(parsed.events) || parsed.events.some((event) => typeof event.kind !== 'string' || typeof event.cooldown !== 'number')) return null;
    if (
      !parsed.rules
      || typeof parsed.rules.steeringLerp !== 'number'
      || typeof parsed.rules.waypointRadius !== 'number'
      || typeof parsed.rules.towerSnapRadius !== 'number'
      || typeof parsed.rules.maxTowers !== 'number'
      || typeof parsed.rules.breachDamage !== 'number'
    ) return null;
    if (typeof parsed.logicSource !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

const BIOME_PALETTES: Record<SceneBiome, RuntimePalette> = {
  'neon-harbor': {
    skyTop: '#12384A',
    skyBottom: '#091016',
    ground: '#17212A',
    road: '#25313A',
    grid: '#36D5C7',
    tower: '#2DD4BF',
    enemy: '#FF5A6B',
    projectile: '#FFE45E',
    core: '#F6F7D7',
    accent: '#FF9F1C',
    fog: '#0E2028',
  },
  'verdant-ruins': {
    skyTop: '#244034',
    skyBottom: '#111A18',
    ground: '#20362C',
    road: '#3B4634',
    grid: '#9BD86E',
    tower: '#64D2A4',
    enemy: '#E15D44',
    projectile: '#FFE66D',
    core: '#BDF7B7',
    accent: '#56CFE1',
    fog: '#172820',
  },
  'sunforge-bazaar': {
    skyTop: '#593B24',
    skyBottom: '#15110D',
    ground: '#342B22',
    road: '#594935',
    grid: '#FFB703',
    tower: '#3DDC97',
    enemy: '#D62839',
    projectile: '#FFF3B0',
    core: '#F4E285',
    accent: '#00B4D8',
    fog: '#2A2118',
  },
  'orbital-garden': {
    skyTop: '#1E3154',
    skyBottom: '#090A12',
    ground: '#192238',
    road: '#27304A',
    grid: '#7EE7F2',
    tower: '#7BD88F',
    enemy: '#FF477E',
    projectile: '#F9F871',
    core: '#D7FFF1',
    accent: '#F9844A',
    fog: '#111827',
  },
};

export function generateRuntimeScene(request: RuntimeSceneRequest): RuntimeSceneBlueprint {
  const difficulty = clamp(Math.round(request.difficulty), 1, 10);
  const seed = normalizeSeed(request.seed);
  const random = createSeededRandom(seed);
  const biome = pickBiome(request.themeHint, random);
  const modules = request.modules?.length ? [...request.modules] : defaultModules(difficulty);
  const laneCount = clamp(2 + Math.floor(difficulty / 3), 2, 5);
  const lanes = buildLanes(laneCount, random);
  const towerAnchors = buildTowerAnchors(laneCount, random);
  const tacticalFields = buildTacticalFields(difficulty, lanes, modules);
  const supportNodes = buildSupportNodes(difficulty, lanes, towerAnchors, modules);
  const decorations = buildDecorations(18 + difficulty * 2, random);
  const palette = BIOME_PALETTES[biome];
  const controls = buildControlPlan(difficulty, modules);
  const enemyArchetypes = buildEnemyArchetypes(difficulty, modules, palette);
  const towerArchetypes = buildTowerArchetypes(difficulty, modules, palette, controls);
  const buildHints = buildBuildHints(difficulty, lanes, towerAnchors, towerArchetypes, modules, palette);
  const laneSignals = buildLaneSignals(difficulty, lanes, modules, palette);
  const setPieces = buildSetPieces(difficulty, biome, lanes, modules, palette);
  const spawnInterval = roundTo(2.35 - difficulty * 0.13 - request.playerLevel * 0.01, 2);
  const enemySpeed = roundTo(32 + difficulty * 4.8 + request.playerLevel * 0.55, 2);
  const enemyCap = 8 + difficulty * 2;
  const waveSize = clamp(2 + Math.floor(difficulty / 2), 2, 8);
  const title = buildTitle(biome, modules, difficulty);
  const rules = buildRulePlan(difficulty, modules);
  const objective = buildObjectivePlan(difficulty, waveSize, request.playerLevel);
  const bossPlan = buildBossPlan(difficulty, lanes, modules, palette, objective.targetWaves);
  const commands = buildCommandPlan(difficulty, lanes, modules, palette);
  const commandTargeting = buildCommandTargetingPlan(difficulty, modules);
  const wavePlan = buildWavePlan(difficulty, lanes, objective.targetWaves, waveSize, modules);
  const events = buildDirectorEvents(difficulty, laneCount, modules);
  const atmosphere = buildAtmospherePlan(difficulty, biome, modules);
  const combat = buildCombatPlan(difficulty, modules);
  const scoring = buildScoringPlan(difficulty, modules);

  const blueprint: RuntimeSceneBlueprint = {
    id: `runtime_${seed}_${biome}_${difficulty}`,
    title,
    seed,
    biome,
    difficulty,
    modules,
    palette,
    lanes,
    wavePlan,
    towerAnchors,
    towerArchetypes,
    buildHints,
    tacticalFields,
    supportNodes,
    enemyArchetypes,
    bossPlan,
    commands,
    commandTargeting,
    laneSignals,
    setPieces,
    decorations,
    spawn: {
      interval: Math.max(0.75, spawnInterval),
      enemySpeed,
      enemyCap,
      waveSize,
    },
    camera: {
      distance: 310 + laneCount * 18,
      height: 210 + difficulty * 4,
      pitch: 0.58,
    },
    lighting: {
      ambient: roundTo(0.42 + random() * 0.12, 2),
      key: roundTo(0.88 + difficulty * 0.035, 2),
      bloom: roundTo(0.55 + difficulty * 0.04, 2),
    },
    atmosphere,
    controls,
    combat,
    scoring,
    objective,
    events,
    rules,
    logicSource: '',
  };
  blueprint.logicSource = buildLogicSource(blueprint);
  return blueprint;
}

export function resolveBuildPlacement(
  point: Vec2,
  blueprint: RuntimeSceneBlueprint,
  entities: RuntimeEntitySnapshot[],
): BuildPlacementResult {
  const towers = entities.filter((entity) => entity.entity_type === 2);
  const nearestAnchor = findNearest(point, blueprint.towerAnchors);
  const snappedToAnchor = nearestAnchor.distance <= blueprint.rules.towerSnapRadius;
  const position = snappedToAnchor ? nearestAnchor.item : point;

  if (towers.length >= blueprint.rules.maxTowers) {
    return { valid: false, position, snappedToAnchor, anchorIndex: snappedToAnchor ? nearestAnchor.index : null, reason: 'tower limit reached' };
  }

  if (Math.hypot(position.x, position.z) < blueprint.rules.coreBuildRadius) {
    return { valid: false, position, snappedToAnchor, anchorIndex: snappedToAnchor ? nearestAnchor.index : null, reason: 'too close to core' };
  }

  const blockedLane = blueprint.lanes.find((lane) => {
    const clearance = lane.width * 0.5 + blueprint.rules.laneBuildBuffer;
    return (
      distanceToSegmentSquared(position, lane.spawn, lane.bend) < clearance * clearance
      || distanceToSegmentSquared(position, lane.bend, { x: 0, z: 0 }) < clearance * clearance
    );
  });
  if (blockedLane) {
    return { valid: false, position, snappedToAnchor, anchorIndex: snappedToAnchor ? nearestAnchor.index : null, reason: `blocks ${blockedLane.id}` };
  }

  const occupiedRadius = Math.max(24, blueprint.rules.towerSnapRadius * 0.68);
  const occupied = towers.some((tower) => distanceSquared(position, { x: tower.x, z: tower.z }) < occupiedRadius * occupiedRadius);
  if (occupied) {
    return { valid: false, position, snappedToAnchor, anchorIndex: snappedToAnchor ? nearestAnchor.index : null, reason: 'tower pad occupied' };
  }

  return {
    valid: true,
    position,
    snappedToAnchor,
    anchorIndex: snappedToAnchor ? nearestAnchor.index : null,
    reason: snappedToAnchor ? 'snapped to build pad' : 'free build point',
  };
}

export function resolveBlastTarget(
  point: Vec2,
  entities: RuntimeEntitySnapshot[],
  controls: RuntimeControlPlan,
): BlastTargetResult {
  const enemies = entities.filter((entity) => entity.entity_type === 1);
  if (enemies.length === 0) {
    return { valid: false, position: point, entityId: null, distance: Number.POSITIVE_INFINITY, reason: 'no target' };
  }

  const nearest = enemies
    .map((entity) => ({
      entity,
      distance: Math.sqrt(distanceSquared(point, { x: entity.x, z: entity.z })),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (nearest.distance > controls.pointerAssistRadius) {
    return { valid: false, position: point, entityId: null, distance: nearest.distance, reason: 'target out of assist range' };
  }

  return {
    valid: true,
    position: { x: nearest.entity.x, z: nearest.entity.z },
    entityId: nearest.entity.id,
    distance: nearest.distance,
    reason: 'target locked',
  };
}

export function evaluateRuntimeObjective(
  blueprint: RuntimeSceneBlueprint,
  stats: RuntimeStats,
  sceneStartScore: number,
): RuntimeObjectiveProgress {
  const sceneScore = Math.max(0, stats.score - sceneStartScore);
  const waveProgress = clamp(stats.wave / Math.max(1, blueprint.objective.targetWaves), 0, 1);
  const scoreProgress = clamp(sceneScore / Math.max(1, blueprint.objective.targetScore), 0, 1);
  const progress = Math.max(waveProgress, scoreProgress);
  const activeEnemies = stats.activeEnemies ?? 0;
  const reachedByWave = stats.wave >= blueprint.objective.targetWaves && activeEnemies === 0;
  const reachedByScore = sceneScore >= blueprint.objective.targetScore;

  if ((reachedByWave || reachedByScore) && stats.integrity < blueprint.objective.minIntegrity) {
    return { sceneScore, progress, complete: false, reason: 'integrity' };
  }
  if (reachedByWave) return { sceneScore, progress, complete: true, reason: 'wave' };
  if (reachedByScore) return { sceneScore, progress, complete: true, reason: 'score' };
  return { sceneScore, progress, complete: false, reason: 'pending' };
}

export function createRuntimeLogic(blueprint: RuntimeSceneBlueprint): RuntimeLogicProgram {
  let spawnTimer = blueprint.rules.firstWaveDelay;
  let pulseTimer = 0;
  let wave = 0;
  let starterBuilt = false;
  let overdriveTimer = 0;
  let overdriveActive = false;
  let waveWarned = false;
  let bossSpawned = false;
  let bossWarned = false;
  let bossAuraTimer = blueprint.bossPlan.auraInterval * 0.55;
  const fieldTimers = blueprint.tacticalFields.map((field, index) => Math.min(field.pulseInterval * 0.45, 0.35 + index * 0.18));
  const supportNodeTimers = blueprint.supportNodes.map((node, index) => Math.min(node.pulseInterval * 0.5, 0.75 + index * 0.32));
  const eventTimers = blueprint.events.map((event, index) => Math.min(event.cooldown * 0.35, 1.25 + index * 0.65));

  return {
    name: `${blueprint.title} Director`,
    source: blueprint.logicSource,
    tick(ctx: RuntimeLogicContext): string[] {
      const logs: string[] = [];
      const enemies = ctx.entities.filter((entity) => entity.entity_type === 1);
      const towers = ctx.entities.filter((entity) => entity.entity_type === 2);
      for (let i = 0; i < fieldTimers.length; i += 1) {
        fieldTimers[i] -= ctx.dt;
      }
      for (let i = 0; i < supportNodeTimers.length; i += 1) {
        supportNodeTimers[i] -= ctx.dt;
      }
      bossAuraTimer -= ctx.dt;

      if (overdriveActive) {
        overdriveTimer -= ctx.dt;
        if (overdriveTimer <= 0) {
          overdriveActive = false;
          overdriveTimer = 0;
          applyCombatTuning(ctx.engine, blueprint, 1);
          logs.push('Event: tower overdrive cooled');
        }
      }

      if (blueprint.rules.starterTowerEnabled && !starterBuilt && towers.length === 0 && blueprint.towerAnchors.length > 0) {
        const starterHint = selectStarterBuildHint(blueprint);
        const anchor = starterHint
          ? blueprint.towerAnchors[starterHint.anchorIndex % blueprint.towerAnchors.length]
          : blueprint.towerAnchors[0];
        const towerArchetype = starterHint
          ? blueprint.towerArchetypes.find((archetype) => archetype.id === starterHint.towerArchetypeId) ?? selectTowerArchetype(blueprint, 0)
          : selectTowerArchetype(blueprint, 0);
        buildTowerFromArchetype(ctx.engine, anchor.x, anchor.z, towerArchetype);
        starterBuilt = true;
        logs.push(`Director built ${towerArchetype.label} tower at ${Math.round(anchor.x)}, ${Math.round(anchor.z)}${starterHint ? ` from ${starterHint.id}` : ''}`);
      }

      spawnTimer -= ctx.dt;
      const nextWavePlan = selectWavePlan(blueprint, wave);
      if (spawnTimer <= 0 && enemies.length < blueprint.spawn.enemyCap) {
        const wavePlan = nextWavePlan;
        const lane = blueprint.lanes[wavePlan.laneIndex % blueprint.lanes.length];
        const bossDue = !bossSpawned && wave + 1 >= blueprint.bossPlan.triggerWave;
        const capacity = blueprint.spawn.enemyCap - enemies.length;
        const burst = Math.max(0, Math.min(wavePlan.count, capacity - (bossDue ? 1 : 0)));
        for (let i = 0; i < burst; i += 1) {
          const offset = (i - (burst - 1) / 2) * wavePlan.spawnSpread;
          const spawnX = lane.spawn.x + offset;
          const spawnZ = lane.spawn.z - offset * 0.25;
          const archetype = chooseEnemyArchetype(blueprint, wavePlan, wave, i);
          const velocity = velocityToward({ x: spawnX, z: spawnZ }, lane.bend, blueprint.spawn.enemySpeed * archetype.speedMultiplier);
          spawnEnemyFromArchetype(ctx.engine, spawnX, spawnZ, velocity, archetype);
        }
        if (bossDue && capacity > 0) {
          const bossLane = blueprint.lanes[blueprint.bossPlan.laneIndex % blueprint.lanes.length];
          const velocity = velocityToward(bossLane.spawn, bossLane.bend, blueprint.spawn.enemySpeed * blueprint.bossPlan.speedMultiplier);
          spawnBossEnemy(ctx.engine, bossLane.spawn.x, bossLane.spawn.z, velocity, blueprint.bossPlan);
          bossSpawned = true;
          logs.push(`Boss ${blueprint.bossPlan.label} entered from ${bossLane.id}`);
        }
        wave += 1;
        ctx.stats.wave = wave;
        const pressure = ctx.stats.integrity < blueprint.rules.lowIntegrityThreshold
          ? blueprint.rules.lowIntegritySpawnMultiplier
          : 1;
        spawnTimer = blueprint.spawn.interval * pressure * wavePlan.intervalMultiplier;
        waveWarned = false;
        bossWarned = false;
        logs.push(`Wave ${wave} ${wavePlan.id} generated ${burst} enemies from ${lane.id}`);
      } else if (!bossSpawned && !bossWarned && wave + 1 >= blueprint.bossPlan.triggerWave && spawnTimer <= blueprint.bossPlan.warningTime) {
        const lane = blueprint.lanes[blueprint.bossPlan.laneIndex % blueprint.lanes.length];
        bossWarned = true;
        logs.push(`Boss ${blueprint.bossPlan.label} approaching on ${lane.id}`);
      } else if (!waveWarned && spawnTimer <= nextWavePlan.warningTime) {
        const lane = blueprint.lanes[nextWavePlan.laneIndex % blueprint.lanes.length];
        waveWarned = true;
        logs.push(`Wave ${wave + 1} incoming on ${lane.id}: ${nextWavePlan.count} enemies`);
      }

      pulseTimer -= ctx.dt;
      let mutated = false;
      let tacticalHits = 0;
      for (const enemy of enemies) {
        const distanceToCore = Math.hypot(enemy.x, enemy.z);
        const tacticalField = findTacticalField({ x: enemy.x, z: enemy.z }, blueprint.tacticalFields);
        const fieldSlow = tacticalField ? tacticalField.field.slowMultiplier : 1;
        const archetype = matchEnemyArchetype(enemy, blueprint.enemyArchetypes);
        const bossMatch = matchBossPlan(enemy, blueprint.bossPlan);
        const speed = blueprint.spawn.enemySpeed
          * (bossMatch ? blueprint.bossPlan.speedMultiplier : archetype.speedMultiplier)
          * (enemy.hp < enemy.max_hp * blueprint.rules.woundedHealthRatio ? blueprint.rules.woundedSpeedMultiplier : 1)
          * fieldSlow;
        const lane = nearestLaneForEnemy(enemy, blueprint.lanes);
        const target = nextWaypointForEnemy(enemy, lane, blueprint.rules.waypointRadius);
        const velocity = velocityToward({ x: enemy.x, z: enemy.z }, target, speed);
        enemy.vx = lerp(enemy.vx, velocity.x, blueprint.rules.steeringLerp);
        enemy.vz = lerp(enemy.vz, velocity.z, blueprint.rules.steeringLerp);

        if (tacticalField && fieldTimers[tacticalField.index] <= 0) {
          enemy.hp = Math.max(0, enemy.hp - tacticalField.field.damagePerPulse);
          enemy.color = tacticalField.field.variant % 2 === 0 ? blueprint.palette.grid : blueprint.palette.projectile;
          tacticalHits += 1;
          mutated = true;
        }

        if (enemy.hp < enemy.max_hp * blueprint.rules.woundedHealthRatio) {
          enemy.color = blueprint.palette.accent;
        }

        if (distanceToCore < blueprint.rules.breachRadius) {
          ctx.engine.damage_entity(enemy.id, 9999);
          ctx.stats.integrity = Math.max(0, ctx.stats.integrity - blueprint.rules.breachDamage);
          logs.push(`Core breached by entity ${enemy.id}`);
        }
        mutated = true;
      }

      if (tacticalHits > 0) {
        logs.push(`Tactical field pulsed ${tacticalHits} enemies`);
      }
      for (let i = 0; i < fieldTimers.length; i += 1) {
        if (fieldTimers[i] <= 0) {
          fieldTimers[i] = blueprint.tacticalFields[i].pulseInterval;
        }
      }

      for (let i = 0; i < blueprint.supportNodes.length; i += 1) {
        if (supportNodeTimers[i] > 0) {
          continue;
        }
        const node = blueprint.supportNodes[i];
        const nodeEnemies = enemies.filter((enemy) => distanceSquared({ x: enemy.x, z: enemy.z }, node) <= node.radius * node.radius);
        if (nodeEnemies.length === 0) {
          ctx.stats.score += node.scorePerPulse;
          ctx.stats.integrity = Math.min(100, ctx.stats.integrity + node.repairPerPulse);
          logs.push(`Support ${node.id} secured +${node.scorePerPulse} score`);
        } else {
          for (const enemy of nodeEnemies) {
            enemy.hp = Math.max(0, enemy.hp - node.pulseDamage);
            enemy.color = node.variant % 2 === 0 ? blueprint.palette.core : blueprint.palette.accent;
          }
          mutated = true;
          logs.push(`Support ${node.id} shocked ${nodeEnemies.length} enemies`);
        }
        supportNodeTimers[i] = node.pulseInterval;
      }

      if (bossAuraTimer <= 0) {
        bossAuraTimer = blueprint.bossPlan.auraInterval;
        const bosses = enemies.filter((enemy) => matchBossPlan(enemy, blueprint.bossPlan));
        let auraHits = 0;
        for (const boss of bosses) {
          for (const tower of towers) {
            if (distanceSquared({ x: boss.x, z: boss.z }, { x: tower.x, z: tower.z }) > blueprint.bossPlan.auraRadius * blueprint.bossPlan.auraRadius) {
              continue;
            }
            ctx.engine.damage_entity(tower.id, blueprint.bossPlan.auraDamage);
            tower.hp = Math.max(0, tower.hp - blueprint.bossPlan.auraDamage);
            tower.color = blueprint.palette.accent;
            auraHits += 1;
            mutated = true;
          }
        }
        if (auraHits > 0) {
          logs.push(`Boss ${blueprint.bossPlan.label} aura strained ${auraHits} towers`);
        }
      }

      if (pulseTimer <= 0) {
        pulseTimer = blueprint.rules.weakPointPulseInterval;
        const weakEnemy = enemies.find((enemy) => enemy.hp < enemy.max_hp * blueprint.rules.woundedHealthRatio);
        if (weakEnemy) {
          ctx.engine.explode_entity(weakEnemy.id, blueprint.rules.weakPointPulseForce);
          logs.push(`Director triggered weak-point pulse on ${weakEnemy.id}`);
        }
      }

      for (let i = 0; i < blueprint.events.length; i += 1) {
        const event = blueprint.events[i];
        eventTimers[i] -= ctx.dt;
        if (ctx.stats.wave < event.triggerWave || eventTimers[i] > 0) {
          continue;
        }
        const eventResult = applyDirectorEvent(event, blueprint, ctx, enemies);
        if (eventResult.triggered) {
          eventTimers[i] = event.cooldown;
          mutated ||= eventResult.mutated;
          if (eventResult.combatBoostDuration && eventResult.combatBoostDuration > 0) {
            overdriveActive = true;
            overdriveTimer = Math.max(overdriveTimer, eventResult.combatBoostDuration);
            applyCombatTuning(ctx.engine, blueprint, 1.28);
          }
          logs.push(eventResult.message);
        }
      }

      if (mutated) {
        ctx.engine.apply_render_data(JSON.stringify(ctx.entities));
      }
      return logs;
    },
  };
}

function buildLogicSource(blueprint: RuntimeSceneBlueprint): string {
  const lanes = blueprint.lanes
    .map((lane) => `${lane.id}@(${Math.round(lane.spawn.x)},${Math.round(lane.spawn.z)}) -> (${Math.round(lane.bend.x)},${Math.round(lane.bend.z)})`)
    .join(', ');
  return [
    `// Generated runtime logic: ${blueprint.title}`,
    `// Biome: ${blueprint.biome}; modules: ${blueprint.modules.join(' + ')}`,
    `// Lanes: ${lanes}`,
    `const spawnInterval = ${blueprint.spawn.interval};`,
    `const enemySpeed = ${blueprint.spawn.enemySpeed};`,
    `const waveSize = ${blueprint.spawn.waveSize};`,
    `const enemyCap = ${blueprint.spawn.enemyCap};`,
    `const wavePlan = "${blueprint.wavePlan.map((wave) => `${wave.id}@L${wave.laneIndex + 1}x${wave.count}`).join(', ')}";`,
    `const maxWaveCount = ${Math.max(...blueprint.wavePlan.map((wave) => wave.count))};`,
    `const minWaveWarning = ${Math.min(...blueprint.wavePlan.map((wave) => wave.warningTime))};`,
    `const towerArchetypes = "${blueprint.towerArchetypes.map((archetype) => `${archetype.id}:${archetype.buildCost}c@R${archetype.rangeMultiplier}x/D${archetype.damageMultiplier}x`).join(', ')}";`,
    `const maxTowerDamageMultiplier = ${Math.max(...blueprint.towerArchetypes.map((archetype) => archetype.damageMultiplier))};`,
    `const buildHints = "${blueprint.buildHints.map((hint) => `${hint.id}@A${hint.anchorIndex + 1}/L${hint.laneIndex + 1}/${hint.towerArchetypeId}/P${hint.priority}`).join(', ')}";`,
    `const topBuildHint = "${selectStarterBuildHint(blueprint)?.id ?? 'none'}";`,
    `const enemyArchetypes = "${blueprint.enemyArchetypes.map((archetype) => `${archetype.id}:${archetype.hp}hp@${archetype.speedMultiplier}x`).join(', ')}";`,
    `const maxEnemyReward = ${Math.max(...blueprint.enemyArchetypes.map((archetype) => archetype.scoreReward))};`,
    `const bossPlan = "${blueprint.bossPlan.id}@W${blueprint.bossPlan.triggerWave}L${blueprint.bossPlan.laneIndex + 1}:${blueprint.bossPlan.hp}hp";`,
    `const bossReward = ${blueprint.bossPlan.scoreReward};`,
    `const bossAuraDamage = ${blueprint.bossPlan.auraDamage};`,
    `const commandPlan = "${blueprint.commands.map((command) => `${command.id}:${command.kind}/${command.scoreCost}c/${command.cooldown}s`).join(', ')}";`,
    `const maxCommandMagnitude = ${Math.max(...blueprint.commands.map((command) => command.magnitude))};`,
    `const commandLaneAssistRadius = ${blueprint.commandTargeting.laneAssistRadius};`,
    `const commandThreatWeight = ${blueprint.commandTargeting.threatWeight};`,
    `const commandReticleRadius = ${blueprint.commandTargeting.reticleRadius};`,
    `const laneSignals = "${blueprint.laneSignals.map((signal) => `${signal.id}@L${signal.laneIndex + 1}/R${signal.alertRadius}`).join(', ')}";`,
    `const maxLaneSignalHeight = ${Math.max(...blueprint.laneSignals.map((signal) => signal.beaconHeight))};`,
    `const steeringLerp = ${blueprint.rules.steeringLerp};`,
    `const waypointRadius = ${blueprint.rules.waypointRadius};`,
    `const towerSnapRadius = ${blueprint.rules.towerSnapRadius};`,
    `const maxTowers = ${blueprint.rules.maxTowers};`,
    `const targetWaves = ${blueprint.objective.targetWaves};`,
    `const targetScore = ${blueprint.objective.targetScore};`,
    `const directorEvents = "${blueprint.events.map((event) => `${event.kind}@W${event.triggerWave}`).join(', ')}";`,
    `const tacticalFields = ${blueprint.tacticalFields.length};`,
    `const fieldSlowMultiplier = ${Math.min(...blueprint.tacticalFields.map((field) => field.slowMultiplier))};`,
    `const fieldDamagePerPulse = ${Math.max(...blueprint.tacticalFields.map((field) => field.damagePerPulse))};`,
    `const supportNodes = "${blueprint.supportNodes.map((node) => `${node.id}@${Math.round(node.x)},${Math.round(node.z)}:+${node.scorePerPulse}/heal${node.repairPerPulse}`).join(', ')}";`,
    `const supportPulseDamage = ${Math.max(...blueprint.supportNodes.map((node) => node.pulseDamage))};`,
    `const setPieces = "${blueprint.setPieces.map((setPiece) => `${setPiece.id}:${setPiece.kind}@${Math.round(setPiece.x)},${Math.round(setPiece.z)}`).join(', ')}";`,
    `const maxSetPieceHeight = ${Math.max(...blueprint.setPieces.map((setPiece) => setPiece.height))};`,
    `const particleCount = ${blueprint.atmosphere.particleCount};`,
    `const coreHaloRadius = ${blueprint.atmosphere.coreHaloRadius};`,
    `const laneBeaconCount = ${blueprint.atmosphere.laneBeaconCount};`,
    `const cameraPanSpeed = ${blueprint.controls.cameraPanSpeed};`,
    `const cameraAutoFocusStrength = ${blueprint.controls.cameraAutoFocusStrength};`,
    `const cameraThreatLead = ${blueprint.controls.cameraThreatLead};`,
    `const cameraManualOverride = ${blueprint.controls.cameraManualOverride};`,
    `const cameraAlertZoom = ${blueprint.controls.cameraAlertZoom};`,
    `const blastForce = ${blueprint.controls.blastForce};`,
    `const blastCooldown = ${blueprint.controls.blastCooldown};`,
    `const pointerAssistRadius = ${blueprint.controls.pointerAssistRadius};`,
    `const towerRange = ${blueprint.combat.towerRange};`,
    `const towerFireInterval = ${blueprint.combat.towerFireInterval};`,
    `const projectileSpeed = ${blueprint.combat.projectileSpeed};`,
    `const projectileDamage = ${blueprint.combat.projectileDamage};`,
    `const projectileLead = ${blueprint.combat.projectileLead};`,
    `const comboWindow = ${blueprint.scoring.comboWindow};`,
    `const comboMultiplierStep = ${blueprint.scoring.comboMultiplierStep};`,
    `const maxComboMultiplier = ${blueprint.scoring.maxComboMultiplier};`,
    `const perfectWaveBonus = ${blueprint.scoring.perfectWaveBonus};`,
    `const weakPointPulseInterval = ${blueprint.rules.weakPointPulseInterval};`,
    `const breachDamage = ${blueprint.rules.breachDamage};`,
    `// The director spawns lane waves, follows generated bend waypoints,`,
    `// schedules generated wave plans with lane selection, counts, pacing, and warnings,`,
    `// offers generated tower archetypes with distinct range, fire cadence, damage, and cost,`,
    `// recommends generated build hints that pair tower pads with lane pressure and tower archetypes,`,
    `// mixes generated enemy archetypes with distinct hp, speed, scale, and reward,`,
    `// injects a generated boss wave with warning, reward, and tower-straining aura,`,
    `// exposes generated player command slots for lane damage, core repair, and tower rally control,`,
    `// retargets generated lane commands with pointer and threat-weighted assist,`,
    `// highlights generated lane threat signals before wave and boss pressure arrives,`,
    `// builds and constrains towers on generated build pads,`,
    `// applies generated tactical fields that slow and pulse-damage enemies,`,
    `// pulses generated support nodes that reward cleared space or shock contesting enemies,`,
    `// places generated biome set pieces that make each scene silhouette distinct,`,
    `// animates wind particles, core halos, and lane beacons,`,
    `// tunes camera, threat focus, blast, and build controls per generated scene,`,
    `// applies generated tower range, fire rate, projectile lead, and damage,`,
    `// awards generated combo score, active-control bonuses, and perfect-wave bonuses,`,
    `// boosts tower tuning during timed overdrive events,`,
    `// applies wounded-enemy color shifts,`,
    `// and slows pressure when core integrity is low.`,
  ].join('\n');
}

function applyCombatTuning(
  engine: RuntimeEngineFacade,
  blueprint: RuntimeSceneBlueprint,
  overdriveMultiplier: number,
) {
  const boosted = overdriveMultiplier > 1;
  engine.set_combat_tuning(
    roundTo(blueprint.combat.towerRange * (boosted ? 1.08 : 1), 2),
    roundTo(Math.max(0.12, blueprint.combat.towerFireInterval / overdriveMultiplier), 2),
    roundTo(blueprint.combat.projectileSpeed * (boosted ? 1.12 : 1), 2),
    roundTo(blueprint.combat.projectileDamage * overdriveMultiplier, 2),
    roundTo(clamp(blueprint.combat.projectileLead + (boosted ? 0.08 : 0), 0, 0.8), 2),
  );
}

function applyDirectorEvent(
  event: RuntimeDirectorEvent,
  blueprint: RuntimeSceneBlueprint,
  ctx: RuntimeLogicContext,
  enemies: RuntimeEntitySnapshot[],
): { triggered: boolean; mutated: boolean; message: string; combatBoostDuration?: number } {
  if (event.kind === 'repair-pulse') {
    if (ctx.stats.integrity >= 98) {
      return { triggered: false, mutated: false, message: '' };
    }
    const before = ctx.stats.integrity;
    ctx.stats.integrity = Math.min(100, ctx.stats.integrity + event.magnitude);
    return {
      triggered: true,
      mutated: false,
      message: `Event: repair pulse restored ${Math.round(ctx.stats.integrity - before)} core`,
    };
  }

  if (event.kind === 'tower-overdrive') {
    if (enemies.length === 0) {
      return { triggered: false, mutated: false, message: '' };
    }
    const targets = enemies
      .slice()
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
      .slice(0, Math.min(3, Math.max(1, Math.floor(event.magnitude / 12))));
    for (const enemy of targets) {
      enemy.hp = Math.max(0, enemy.hp - event.magnitude);
      enemy.color = blueprint.palette.projectile;
      ctx.engine.damage_entity(enemy.id, event.magnitude);
    }
    return {
      triggered: true,
      mutated: true,
      combatBoostDuration: event.duration,
      message: `Event: tower overdrive hit ${targets.length} enemies for ${event.duration.toFixed(1)}s`,
    };
  }

  if (event.kind === 'enemy-surge') {
    if (enemies.length >= blueprint.spawn.enemyCap) {
      return { triggered: false, mutated: false, message: '' };
    }
    const lane = blueprint.lanes[event.laneIndex % blueprint.lanes.length];
    const archetype = blueprint.enemyArchetypes[blueprint.enemyArchetypes.length - 1] ?? blueprint.enemyArchetypes[0];
    const velocity = velocityToward(lane.spawn, lane.bend, blueprint.spawn.enemySpeed * event.magnitude * archetype.speedMultiplier);
    spawnEnemyFromArchetype(ctx.engine, lane.spawn.x, lane.spawn.z, velocity, archetype);
    return {
      triggered: true,
      mutated: false,
      message: `Event: enemy surge from ${lane.id}`,
    };
  }

  return { triggered: false, mutated: false, message: '' };
}

function buildRulePlan(difficulty: number, modules: string[]): RuntimeRulePlan {
  return {
    starterTowerEnabled: modules.includes('tower_defense'),
    firstWaveDelay: roundTo(Math.max(0.18, 0.65 - difficulty * 0.035), 2),
    steeringLerp: roundTo(Math.min(0.14, 0.065 + difficulty * 0.006), 3),
    woundedHealthRatio: roundTo(Math.max(0.28, 0.42 - difficulty * 0.006), 2),
    woundedSpeedMultiplier: roundTo(1.04 + difficulty * 0.015, 2),
    weakPointPulseInterval: roundTo(Math.max(1.15, 2.1 - difficulty * 0.055), 2),
    weakPointPulseForce: roundTo(36 + difficulty * 4.2, 2),
    waypointRadius: roundTo(Math.max(16, 28 - difficulty * 0.8), 2),
    towerSnapRadius: roundTo(Math.max(28, 42 - difficulty * 1.1), 2),
    laneBuildBuffer: roundTo(12 + difficulty * 0.85, 2),
    coreBuildRadius: roundTo(42 + difficulty * 1.15, 2),
    maxTowers: clamp(3 + Math.floor(difficulty / 2) + (modules.includes('tower_defense') ? 2 : 0), 3, 9),
    breachRadius: roundTo(Math.max(20, 30 - difficulty * 0.45), 2),
    breachDamage: roundTo(Math.min(18, 4 + difficulty * 1.15), 2),
    lowIntegrityThreshold: roundTo(Math.max(28, 48 - difficulty * 1.4), 2),
    lowIntegritySpawnMultiplier: roundTo(1.18 + (10 - difficulty) * 0.018, 2),
  };
}

function buildDirectorEvents(difficulty: number, laneCount: number, modules: string[]): RuntimeDirectorEvent[] {
  const hasTowerDefense = modules.includes('tower_defense');
  const events: RuntimeDirectorEvent[] = [
    {
      id: 'repair-pulse',
      kind: 'repair-pulse',
      triggerWave: 1,
      cooldown: roundTo(Math.max(5.8, 9.6 - difficulty * 0.24), 2),
      magnitude: roundTo(5.5 + difficulty * 0.75, 2),
      duration: 0,
      laneIndex: 0,
    },
    {
      id: 'enemy-surge',
      kind: 'enemy-surge',
      triggerWave: 2 + Math.floor(difficulty / 4),
      cooldown: roundTo(Math.max(5.2, 8.7 - difficulty * 0.18), 2),
      magnitude: roundTo(1.08 + difficulty * 0.025, 2),
      duration: 0,
      laneIndex: difficulty % Math.max(1, laneCount),
    },
  ];
  if (hasTowerDefense) {
    events.splice(1, 0, {
      id: 'tower-overdrive',
      kind: 'tower-overdrive',
      triggerWave: 2,
      cooldown: roundTo(Math.max(5.4, 8.4 - difficulty * 0.16), 2),
      magnitude: roundTo(12 + difficulty * 1.8, 2),
      duration: roundTo(2.2 + difficulty * 0.08, 2),
      laneIndex: 0,
    });
  }
  return events;
}

function buildObjectivePlan(difficulty: number, waveSize: number, playerLevel: number): RuntimeObjectivePlan {
  const targetWaves = clamp(3 + Math.floor(difficulty / 2), 3, 8);
  const targetScore = Math.round(targetWaves * waveSize * (12 + difficulty * 1.6));
  const minIntegrity = roundTo(Math.max(24, 58 - difficulty * 2.2), 2);
  return {
    summary: `Hold ${targetWaves} waves or score ${targetScore} with core >= ${Math.round(minIntegrity)}`,
    targetWaves,
    targetScore,
    minIntegrity,
    rewardXp: 8 + difficulty * 3 + Math.floor(playerLevel / 2),
    autoAdvanceDelay: roundTo(Math.max(1.1, 2.6 - difficulty * 0.08), 2),
  };
}

function buildWavePlan(
  difficulty: number,
  lanes: RuntimeLane[],
  targetWaves: number,
  baseWaveSize: number,
  modules: string[],
): RuntimeWavePlan[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const planLength = clamp(targetWaves + 1, 4, 9);
  const waves: RuntimeWavePlan[] = [];
  for (let i = 0; i < planLength; i += 1) {
    const pressureTier = Math.floor(i / 2);
    const laneIndex = (i * 2 + difficulty + towerFocus) % lanes.length;
    waves.push({
      id: `wave-${i + 1}`,
      laneIndex,
      count: clamp(baseWaveSize + pressureTier + (i % 3 === 2 ? 1 : 0), 2, 11),
      intervalMultiplier: roundTo(clamp(1.08 - difficulty * 0.018 - pressureTier * 0.035, 0.62, 1.12), 2),
      archetypeBias: (i + difficulty + shooterFocus) % 3,
      spawnSpread: roundTo(lanes[laneIndex].width * (0.24 + (i % 3) * 0.07), 2),
      warningTime: roundTo(clamp(0.72 + (10 - difficulty) * 0.035 - shooterFocus * 0.08, 0.42, 0.92), 2),
    });
  }
  return waves;
}

function buildAtmospherePlan(difficulty: number, biome: SceneBiome, modules: string[]): RuntimeAtmospherePlan {
  const densityBonus: Record<SceneBiome, number> = {
    'neon-harbor': 10,
    'verdant-ruins': 18,
    'sunforge-bazaar': 6,
    'orbital-garden': 14,
  };
  const windByBiome: Record<SceneBiome, Vec2> = {
    'neon-harbor': { x: 0.9, z: -0.3 },
    'verdant-ruins': { x: -0.35, z: 0.72 },
    'sunforge-bazaar': { x: 1.05, z: 0.36 },
    'orbital-garden': { x: -0.52, z: -0.88 },
  };
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const windScale = 1 + difficulty * 0.025;
  const wind = windByBiome[biome];
  return {
    particleCount: clamp(36 + difficulty * 6 + densityBonus[biome] + towerFocus * 6, 36, 112),
    particleSpeed: roundTo(0.16 + difficulty * 0.025 + densityBonus[biome] * 0.001, 2),
    wind: {
      x: roundTo(wind.x * windScale, 2),
      z: roundTo(wind.z * windScale, 2),
    },
    coreHaloRadius: roundTo(48 + difficulty * 2.4 + towerFocus * 4, 2),
    coreHaloIntensity: roundTo(0.32 + difficulty * 0.026 + towerFocus * 0.04, 2),
    laneBeaconCount: clamp(2 + Math.floor(difficulty / 3) + towerFocus, 2, 6),
    skyRingCount: clamp(1 + Math.floor(difficulty / 5) + towerFocus, 1, 4),
  };
}

function buildTacticalFields(difficulty: number, lanes: RuntimeLane[], modules: string[]): RuntimeTacticalField[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const fieldCount = clamp(1 + Math.floor(difficulty / 3) + towerFocus, 1, Math.min(lanes.length, 5));
  const fields: RuntimeTacticalField[] = [];
  for (let i = 0; i < fieldCount; i += 1) {
    const lane = lanes[i % lanes.length];
    const offset = i % 2 === 0 ? 0.86 : 0.72;
    fields.push({
      x: roundTo(lane.bend.x * offset, 2),
      z: roundTo(lane.bend.z * offset, 2),
      radius: roundTo(26 + difficulty * 1.45 + (i % 2) * 4, 2),
      slowMultiplier: roundTo(clamp(0.84 - difficulty * 0.018 - puzzleFocus * 0.04, 0.56, 0.84), 2),
      damagePerPulse: roundTo(2.5 + difficulty * 0.55 + towerFocus * 1.35, 2),
      pulseInterval: roundTo(Math.max(0.82, 1.58 - difficulty * 0.052), 2),
      variant: i % 3,
    });
  }
  return fields;
}

function buildSupportNodes(
  difficulty: number,
  lanes: RuntimeLane[],
  towerAnchors: Vec2[],
  modules: string[],
): RuntimeSupportNode[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const nodeCount = clamp(1 + Math.floor(difficulty / 4) + towerFocus, 1, Math.min(4, lanes.length));
  const nodes: RuntimeSupportNode[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const lane = lanes[(i * 2 + difficulty) % lanes.length];
    const anchor = towerAnchors[(i + 1) % towerAnchors.length];
    const anchorWeight = 0.42 + (i % 2) * 0.14;
    nodes.push({
      id: `relay-${i + 1}`,
      x: roundTo(lane.bend.x * (1 - anchorWeight) + anchor.x * anchorWeight, 2),
      z: roundTo(lane.bend.z * (1 - anchorWeight) + anchor.z * anchorWeight, 2),
      radius: roundTo(24 + difficulty * 1.2 + (i % 2) * 5, 2),
      scorePerPulse: clamp(Math.round(4 + difficulty * 0.8 + towerFocus * 2 + i), 4, 16),
      repairPerPulse: roundTo(clamp(1.4 + difficulty * 0.18 + puzzleFocus * 0.75, 1.4, 4.6), 2),
      pulseDamage: roundTo(4.5 + difficulty * 0.72 + towerFocus * 1.4, 2),
      pulseInterval: roundTo(clamp(3.2 - difficulty * 0.08 - i * 0.05, 1.85, 3.25), 2),
      variant: i % 3,
    });
  }
  return nodes;
}

function buildTowerArchetypes(
  difficulty: number,
  modules: string[],
  palette: RuntimePalette,
  controls: RuntimeControlPlan,
): RuntimeTowerArchetype[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const baseCost = controls.buildScoreCost;
  return [
    {
      id: 'sentinel',
      label: 'Sentinel',
      rangeMultiplier: roundTo(1 + towerFocus * 0.03, 2),
      fireIntervalMultiplier: 1,
      damageMultiplier: 1,
      scale: 1,
      color: palette.tower,
      buildCost: baseCost,
    },
    {
      id: 'rail',
      label: 'Rail',
      rangeMultiplier: roundTo(clamp(1.2 + difficulty * 0.006 + shooterFocus * 0.04, 1.18, 1.34), 2),
      fireIntervalMultiplier: roundTo(clamp(1.14 + difficulty * 0.016, 1.12, 1.34), 2),
      damageMultiplier: roundTo(clamp(1.16 + difficulty * 0.022 + towerFocus * 0.06, 1.18, 1.46), 2),
      scale: 1.12,
      color: palette.grid,
      buildCost: clamp(baseCost + 2 + (difficulty >= 7 ? 1 : 0), 3, 12),
    },
    {
      id: 'spark',
      label: 'Spark',
      rangeMultiplier: roundTo(clamp(0.86 - towerFocus * 0.02, 0.78, 0.88), 2),
      fireIntervalMultiplier: roundTo(clamp(0.74 - shooterFocus * 0.05, 0.62, 0.76), 2),
      damageMultiplier: roundTo(clamp(0.76 + difficulty * 0.012, 0.72, 0.9), 2),
      scale: 0.9,
      color: palette.accent,
      buildCost: Math.max(2, baseCost - 1),
    },
  ];
}

function buildBuildHints(
  difficulty: number,
  lanes: RuntimeLane[],
  towerAnchors: Vec2[],
  towerArchetypes: RuntimeTowerArchetype[],
  modules: string[],
  palette: RuntimePalette,
): RuntimeBuildHint[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const sentinel = towerArchetypes.find((archetype) => archetype.id === 'sentinel') ?? towerArchetypes[0];
  const rail = towerArchetypes.find((archetype) => archetype.id === 'rail') ?? sentinel;
  const spark = towerArchetypes.find((archetype) => archetype.id === 'spark') ?? sentinel;

  return towerAnchors.map((anchor, anchorIndex) => {
    const laneRank = lanes
      .map((lane, laneIndex) => ({
        laneIndex,
        distanceSquared: Math.min(
          distanceToSegmentSquared(anchor, lane.spawn, lane.bend),
          distanceToSegmentSquared(anchor, lane.bend, { x: 0, z: 0 }),
        ),
      }))
      .sort((a, b) => a.distanceSquared - b.distanceSquared)[0] ?? { laneIndex: 0, distanceSquared: 0 };
    const coreDistance = Math.hypot(anchor.x, anchor.z);
    const laneDistance = Math.sqrt(laneRank.distanceSquared);
    const recommended = shooterFocus > 0 && (anchorIndex + difficulty) % 3 === 0
      ? rail
      : (coreDistance < 86 || (puzzleFocus > 0 && anchorIndex % 2 === 1))
        ? spark
        : sentinel;
    const laneCoverage = laneDistance < 42 ? 1 : laneDistance < 70 ? 0.55 : 0.25;
    const priority = roundTo(clamp(
      1
      + difficulty * 0.12
      + laneCoverage
      + towerFocus * 0.45
      + (recommended.id === 'rail' ? shooterFocus * 0.35 : 0)
      + (recommended.id === 'spark' ? 0.22 : 0)
      - anchorIndex * 0.04,
      1,
      4.8,
    ), 2);
    return {
      id: `build-hint-${anchorIndex + 1}`,
      anchorIndex,
      laneIndex: laneRank.laneIndex,
      towerArchetypeId: recommended.id,
      priority,
      radius: roundTo(14 + priority * 3.2 + difficulty * 0.45, 2),
      color: recommended.color || palette.tower,
      x: anchor.x,
      z: anchor.z,
    };
  });
}

function buildSetPieces(
  difficulty: number,
  biome: SceneBiome,
  lanes: RuntimeLane[],
  modules: string[],
  palette: RuntimePalette,
): RuntimeSetPiece[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const setPieceCount = clamp(2 + Math.floor(difficulty / 4) + puzzleFocus, 2, 5);
  const kindsByBiome: Record<SceneBiome, RuntimeSetPieceKind[]> = {
    'neon-harbor': ['spire', 'arch', 'spire'],
    'verdant-ruins': ['garden', 'arch', 'monolith'],
    'sunforge-bazaar': ['monolith', 'arch', 'spire'],
    'orbital-garden': ['spire', 'garden', 'arch'],
  };
  const kinds = kindsByBiome[biome];

  return Array.from({ length: setPieceCount }, (_, index) => {
    const lane = lanes[index % lanes.length];
    const laneAngle = Math.atan2(lane.spawn.z, lane.spawn.x);
    const angle = laneAngle + (index % 2 === 0 ? 0.34 : -0.42) + index * 0.18;
    const distance = 132 + difficulty * 3.8 + index * 17;
    const kind = kinds[index % kinds.length];
    const heightBoost = kind === 'spire' ? 18 : kind === 'arch' ? 7 : kind === 'monolith' ? 13 : 4;
    return {
      id: `set-piece-${index + 1}`,
      kind,
      x: roundTo(Math.cos(angle) * distance, 2),
      z: roundTo(Math.sin(angle) * distance, 2),
      radius: roundTo(8 + difficulty * 0.8 + index * 1.4 + (towerFocus ? 1.5 : 0), 2),
      height: roundTo(34 + difficulty * 4.2 + index * 6 + heightBoost, 2),
      rotation: roundTo(angle + Math.PI / 2, 2),
      color: kind === 'monolith' ? palette.road : palette.tower,
      accentColor: index % 2 === 0 ? palette.grid : palette.accent,
    };
  });
}

function buildEnemyArchetypes(
  difficulty: number,
  modules: string[],
  palette: RuntimePalette,
): RuntimeEnemyArchetype[] {
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  return [
    {
      id: 'skirmisher',
      label: 'Skirmisher',
      hp: roundTo(72 + difficulty * 7.5, 2),
      speedMultiplier: roundTo(1.1 + difficulty * 0.018 + shooterFocus * 0.06, 2),
      scale: roundTo(0.86 + difficulty * 0.006, 2),
      color: palette.enemy,
      scoreReward: Math.round(14 + difficulty * 1.2),
    },
    {
      id: 'bulwark',
      label: 'Bulwark',
      hp: roundTo(128 + difficulty * 12.5 + puzzleFocus * 22, 2),
      speedMultiplier: roundTo(Math.max(0.56, 0.82 - difficulty * 0.01), 2),
      scale: roundTo(1.18 + difficulty * 0.018, 2),
      color: palette.accent,
      scoreReward: Math.round(24 + difficulty * 2.2 + puzzleFocus * 4),
    },
    {
      id: 'piercer',
      label: 'Piercer',
      hp: roundTo(92 + difficulty * 9.2 + shooterFocus * 18, 2),
      speedMultiplier: roundTo(0.98 + difficulty * 0.014 + shooterFocus * 0.08, 2),
      scale: roundTo(0.98 + difficulty * 0.01, 2),
      color: palette.grid,
      scoreReward: Math.round(18 + difficulty * 1.7 + shooterFocus * 5),
    },
  ];
}

function buildBossPlan(
  difficulty: number,
  lanes: RuntimeLane[],
  modules: string[],
  palette: RuntimePalette,
  targetWaves: number,
): RuntimeBossPlan {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const triggerWave = clamp(2 + Math.floor(difficulty / 3) + puzzleFocus, 2, Math.max(2, targetWaves));
  const label = shooterFocus > 0
    ? 'Signal Reaver'
    : puzzleFocus > 0
      ? 'Cipher Colossus'
      : 'Apex Warden';
  return {
    id: `boss-wave-${triggerWave}`,
    label,
    triggerWave,
    laneIndex: (difficulty + towerFocus * 2 + shooterFocus) % Math.max(1, lanes.length),
    hp: roundTo(185 + difficulty * 26 + puzzleFocus * 32 + towerFocus * 24, 2),
    speedMultiplier: roundTo(clamp(0.66 + difficulty * 0.012 + shooterFocus * 0.035, 0.62, 0.86), 2),
    scale: roundTo(1.48 + difficulty * 0.035 + puzzleFocus * 0.08, 2),
    color: shooterFocus > 0 ? palette.projectile : palette.core,
    scoreReward: Math.round(46 + difficulty * 7.2 + towerFocus * 8 + puzzleFocus * 6),
    warningTime: roundTo(clamp(1.05 + (10 - difficulty) * 0.04, 0.75, 1.4), 2),
    auraRadius: roundTo(34 + difficulty * 2.2 + puzzleFocus * 5, 2),
    auraDamage: roundTo(4 + difficulty * 0.72 + towerFocus * 1.8, 2),
    auraInterval: roundTo(Math.max(1.15, 2.6 - difficulty * 0.09 - shooterFocus * 0.18), 2),
  };
}

function buildCommandPlan(
  difficulty: number,
  lanes: RuntimeLane[],
  modules: string[],
  palette: RuntimePalette,
): RuntimeCommandPlan[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  const laneCount = Math.max(1, lanes.length);
  return [
    {
      id: 'command-barrage',
      label: shooterFocus > 0 ? 'Pierce Barrage' : 'Lane Barrage',
      kind: 'lane-barrage',
      hotkey: 'KeyQ',
      cooldown: roundTo(Math.max(4.2, 7.2 - difficulty * 0.16 - shooterFocus * 0.55), 2),
      scoreCost: clamp(Math.round(8 + difficulty * 0.75 - shooterFocus * 2), 5, 16),
      magnitude: roundTo(32 + difficulty * 5.8 + shooterFocus * 18, 2),
      radius: roundTo(36 + difficulty * 2.4 + shooterFocus * 8, 2),
      duration: 0,
      laneIndex: (difficulty + shooterFocus) % laneCount,
      color: palette.projectile,
    },
    {
      id: 'command-repair',
      label: puzzleFocus > 0 ? 'Stabilize Core' : 'Core Repair',
      kind: 'core-repair',
      hotkey: 'KeyE',
      cooldown: roundTo(Math.max(6.2, 9.6 - difficulty * 0.14 - puzzleFocus * 0.5), 2),
      scoreCost: clamp(Math.round(10 + difficulty * 0.65 - puzzleFocus * 2), 6, 18),
      magnitude: roundTo(11 + difficulty * 1.35 + puzzleFocus * 4, 2),
      radius: roundTo(44 + difficulty * 1.6, 2),
      duration: 0,
      laneIndex: 0,
      color: palette.core,
    },
    {
      id: 'command-rally',
      label: towerFocus > 0 ? 'Tower Rally' : 'Circuit Rally',
      kind: 'tower-rally',
      hotkey: 'KeyR',
      cooldown: roundTo(Math.max(5.6, 8.8 - difficulty * 0.12 - towerFocus * 0.65), 2),
      scoreCost: clamp(Math.round(7 + difficulty * 0.7 - towerFocus * 2), 4, 15),
      magnitude: roundTo(42 + difficulty * 4.6 + towerFocus * 18, 2),
      radius: roundTo(64 + difficulty * 3.6 + towerFocus * 12, 2),
      duration: roundTo(1.4 + difficulty * 0.05, 2),
      laneIndex: (difficulty + towerFocus * 2) % laneCount,
      color: palette.tower,
    },
  ];
}

function buildCommandTargetingPlan(difficulty: number, modules: string[]): RuntimeCommandTargetingPlan {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const puzzleFocus = modules.includes('puzzle') ? 1 : 0;
  return {
    laneAssistRadius: roundTo(52 + difficulty * 3.4 + shooterFocus * 14 + towerFocus * 6, 2),
    threatWeight: roundTo(clamp(0.52 + difficulty * 0.018 + towerFocus * 0.1, 0.5, 0.82), 2),
    pointerWeight: roundTo(clamp(0.72 + shooterFocus * 0.12 - puzzleFocus * 0.04, 0.62, 0.88), 2),
    reticleRadius: roundTo(18 + difficulty * 1.4 + shooterFocus * 4, 2),
    reticlePulseSpeed: roundTo(1.08 + difficulty * 0.065 + shooterFocus * 0.18, 2),
    retargetCooldown: roundTo(clamp(0.24 - difficulty * 0.012 - shooterFocus * 0.035, 0.08, 0.24), 2),
  };
}

function buildLaneSignals(
  difficulty: number,
  lanes: RuntimeLane[],
  modules: string[],
  palette: RuntimePalette,
): RuntimeLaneSignal[] {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  return lanes.map((lane, index) => ({
    id: `${lane.id}-signal`,
    laneIndex: index,
    warningColor: index % 2 === 0 ? palette.grid : palette.accent,
    bossColor: palette.enemy,
    alertRadius: roundTo(lane.width * (0.78 + difficulty * 0.018 + shooterFocus * 0.08), 2),
    pulseSpeed: roundTo(0.95 + difficulty * 0.075 + towerFocus * 0.16, 2),
    beaconHeight: roundTo(20 + difficulty * 2.4 + (index % 2) * 6 + shooterFocus * 5, 2),
  }));
}

function buildControlPlan(difficulty: number, modules: string[]): RuntimeControlPlan {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const parkourFocus = modules.includes('parkour') ? 1 : 0;
  return {
    cameraPanSpeed: roundTo(96 + difficulty * 5 + parkourFocus * 12, 2),
    cameraDamping: roundTo(clamp(0.1 - difficulty * 0.003 + parkourFocus * 0.006, 0.058, 0.12), 3),
    cameraAutoFocusStrength: roundTo(clamp(0.2 + difficulty * 0.018 + shooterFocus * 0.035 - parkourFocus * 0.025, 0.18, 0.46), 2),
    cameraThreatLead: roundTo(42 + difficulty * 4.2 + shooterFocus * 12 + towerFocus * 6, 2),
    cameraManualOverride: roundTo(1.15 + parkourFocus * 0.38 + Math.max(0, 6 - difficulty) * 0.035, 2),
    cameraAlertZoom: roundTo(18 + difficulty * 2.2 + towerFocus * 5 + shooterFocus * 4, 2),
    blastForce: roundTo(132 + difficulty * 8.5 + shooterFocus * 24, 2),
    blastCooldown: roundTo(Math.max(0.54, 1.22 - difficulty * 0.045 - shooterFocus * 0.12), 2),
    blastScoreReward: Math.round(6 + difficulty * 0.85 + shooterFocus * 3),
    buildScoreCost: clamp(Math.round(7 - difficulty * 0.25 - towerFocus * 2), 2, 7),
    pointerAssistRadius: roundTo(34 + difficulty * 1.85 + shooterFocus * 8 + towerFocus * 3, 2),
  };
}

function buildCombatPlan(difficulty: number, modules: string[]): RuntimeCombatPlan {
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  return {
    towerRange: roundTo(164 + difficulty * 5.8 + towerFocus * 22, 2),
    towerFireInterval: roundTo(Math.max(0.26, 0.62 - difficulty * 0.024 - towerFocus * 0.08), 2),
    projectileSpeed: roundTo(228 + difficulty * 12 + shooterFocus * 34, 2),
    projectileDamage: roundTo(34 + difficulty * 3.4 + towerFocus * 10 + shooterFocus * 6, 2),
    projectileLead: roundTo(clamp(0.18 + difficulty * 0.018 + shooterFocus * 0.06, 0.16, 0.42), 2),
  };
}

function buildScoringPlan(difficulty: number, modules: string[]): RuntimeScoringPlan {
  const shooterFocus = modules.includes('shooter') ? 1 : 0;
  const parkourFocus = modules.includes('parkour') ? 1 : 0;
  const towerFocus = modules.includes('tower_defense') ? 1 : 0;
  return {
    comboWindow: roundTo(clamp(3.4 - difficulty * 0.08 + parkourFocus * 0.38, 2.05, 3.8), 2),
    comboMultiplierStep: roundTo(0.08 + difficulty * 0.006 + shooterFocus * 0.025, 2),
    maxComboMultiplier: roundTo(clamp(1.55 + difficulty * 0.08 + shooterFocus * 0.22 + parkourFocus * 0.12, 1.65, 2.65), 2),
    blastComboBoost: roundTo(1.05 + shooterFocus * 0.35 + parkourFocus * 0.14, 2),
    commandComboBoost: roundTo(1.2 + towerFocus * 0.24 + shooterFocus * 0.18, 2),
    supportComboBoost: roundTo(0.7 + towerFocus * 0.18, 2),
    perfectWaveBonus: Math.round(18 + difficulty * 3.8 + towerFocus * 8 + parkourFocus * 4),
  };
}

function pickBiome(themeHint: string | undefined, random: () => number): SceneBiome {
  const hint = themeHint?.toLowerCase() ?? '';
  if (hint.includes('forest') || hint.includes('ruin')) return 'verdant-ruins';
  if (hint.includes('desert') || hint.includes('temple') || hint.includes('forge')) return 'sunforge-bazaar';
  if (hint.includes('space') || hint.includes('orbit') || hint.includes('nebula')) return 'orbital-garden';
  if (hint.includes('cyber') || hint.includes('neon') || hint.includes('city')) return 'neon-harbor';
  const biomes: SceneBiome[] = ['neon-harbor', 'verdant-ruins', 'sunforge-bazaar', 'orbital-garden'];
  return biomes[Math.floor(random() * biomes.length)];
}

function defaultModules(difficulty: number): string[] {
  if (difficulty < 4) return ['parkour', 'synthesis'];
  if (difficulty < 8) return ['tower_defense', 'puzzle'];
  return ['tower_defense', 'shooter', 'card'];
}

function buildLanes(count: number, random: () => number): RuntimeLane[] {
  const lanes: RuntimeLane[] = [];
  const radius = 182;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + random() * 0.32;
    lanes.push({
      id: `lane-${i + 1}`,
      spawn: {
        x: roundTo(Math.cos(angle) * radius, 2),
        z: roundTo(Math.sin(angle) * radius, 2),
      },
      bend: {
        x: roundTo(Math.cos(angle + 0.42) * radius * 0.45, 2),
        z: roundTo(Math.sin(angle - 0.35) * radius * 0.45, 2),
      },
      width: roundTo(24 + random() * 18, 2),
    });
  }
  return lanes;
}

function buildTowerAnchors(count: number, random: () => number): Vec2[] {
  const anchors: Vec2[] = [];
  const total = count + 2;
  for (let i = 0; i < total; i += 1) {
    const angle = (Math.PI * 2 * i) / total + 0.24;
    const radius = 72 + random() * 38;
    anchors.push({
      x: roundTo(Math.cos(angle) * radius, 2),
      z: roundTo(Math.sin(angle) * radius, 2),
    });
  }
  return anchors;
}

function buildDecorations(count: number, random: () => number): Array<Vec2 & { radius: number; height: number; variant: number }> {
  const decorations: Array<Vec2 & { radius: number; height: number; variant: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 118 + random() * 78;
    decorations.push({
      x: roundTo(Math.cos(angle) * radius, 2),
      z: roundTo(Math.sin(angle) * radius, 2),
      radius: roundTo(2.5 + random() * 7, 2),
      height: roundTo(16 + random() * 48, 2),
      variant: Math.floor(random() * 4),
    });
  }
  return decorations;
}

function buildTitle(biome: SceneBiome, modules: string[], difficulty: number): string {
  const biomeName: Record<SceneBiome, string> = {
    'neon-harbor': 'Neon Harbor',
    'verdant-ruins': 'Verdant Ruins',
    'sunforge-bazaar': 'Sunforge Bazaar',
    'orbital-garden': 'Orbital Garden',
  };
  return `${biomeName[biome]} / ${modules.slice(0, 2).join('+')} D${difficulty}`;
}

function velocityToward(from: Vec2, to: Vec2, speed: number): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: (dx / len) * speed,
    z: (dz / len) * speed,
  };
}

function nearestLaneForEnemy(enemy: RuntimeEntitySnapshot, lanes: RuntimeLane[]): RuntimeLane {
  let bestLane = lanes[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const lane of lanes) {
    const candidate = Math.min(
      distanceToSegmentSquared({ x: enemy.x, z: enemy.z }, lane.spawn, lane.bend),
      distanceToSegmentSquared({ x: enemy.x, z: enemy.z }, lane.bend, { x: 0, z: 0 }),
    );
    if (candidate < bestDistance) {
      bestDistance = candidate;
      bestLane = lane;
    }
  }
  return bestLane;
}

function nextWaypointForEnemy(enemy: RuntimeEntitySnapshot, lane: RuntimeLane, waypointRadius: number): Vec2 {
  const core = { x: 0, z: 0 };
  const enemyPosition = { x: enemy.x, z: enemy.z };
  const bendToCore = { x: -lane.bend.x, z: -lane.bend.z };
  const enemyFromBend = { x: enemy.x - lane.bend.x, z: enemy.z - lane.bend.z };
  const coreProgress = dot(enemyFromBend, bendToCore) / Math.max(1, dot(bendToCore, bendToCore));
  const bendDistance = Math.sqrt(distanceSquared(enemyPosition, lane.bend));
  return bendDistance <= waypointRadius || coreProgress > 0.12 ? core : lane.bend;
}

function chooseEnemyArchetype(
  blueprint: RuntimeSceneBlueprint,
  wavePlan: RuntimeWavePlan,
  wave: number,
  index: number,
): RuntimeEnemyArchetype {
  const archetypes = blueprint.enemyArchetypes;
  if (archetypes.length === 1) return archetypes[0];
  const pressure = (wavePlan.archetypeBias + wave + index + blueprint.difficulty) % archetypes.length;
  if (wave > 0 && wave % 3 === 0) {
    return archetypes.find((archetype) => archetype.id === 'bulwark') ?? archetypes[pressure];
  }
  return archetypes[pressure];
}

function selectWavePlan(blueprint: RuntimeSceneBlueprint, wave: number): RuntimeWavePlan {
  return blueprint.wavePlan[wave % blueprint.wavePlan.length];
}

export function selectStarterBuildHint(blueprint: RuntimeSceneBlueprint): RuntimeBuildHint | null {
  if (blueprint.buildHints.length === 0) return null;
  return blueprint.buildHints
    .slice()
    .sort((a, b) => b.priority - a.priority || a.anchorIndex - b.anchorIndex)[0];
}

export function selectTowerArchetype(blueprint: RuntimeSceneBlueprint, index: number): RuntimeTowerArchetype {
  const archetypes = blueprint.towerArchetypes;
  return archetypes[((index % archetypes.length) + archetypes.length) % archetypes.length] ?? {
    id: 'sentinel',
    label: 'Sentinel',
    rangeMultiplier: 1,
    fireIntervalMultiplier: 1,
    damageMultiplier: 1,
    scale: 1,
    color: blueprint.palette.tower,
    buildCost: blueprint.controls.buildScoreCost,
  };
}

export function towerCombatProfile(
  blueprint: RuntimeSceneBlueprint,
  archetype: RuntimeTowerArchetype,
): RuntimeTowerCombatProfile {
  return {
    range: roundTo(blueprint.combat.towerRange * archetype.rangeMultiplier, 2),
    fireInterval: roundTo(blueprint.combat.towerFireInterval * archetype.fireIntervalMultiplier, 2),
    damage: roundTo(blueprint.combat.projectileDamage * archetype.damageMultiplier, 2),
    buildCost: archetype.buildCost,
  };
}

export function buildTowerFromArchetype(
  engine: RuntimeEngineFacade,
  x: number,
  z: number,
  archetype: RuntimeTowerArchetype,
): number {
  if (typeof engine.build_tower_variant === 'function') {
    return engine.build_tower_variant(
      x,
      z,
      archetype.rangeMultiplier,
      archetype.fireIntervalMultiplier,
      archetype.damageMultiplier,
      archetype.scale,
      archetype.color,
    );
  }
  return engine.build_tower(x, z);
}

export function executeRuntimeCommand(
  command: RuntimeCommandPlan,
  blueprint: RuntimeSceneBlueprint,
  ctx: Pick<RuntimeLogicContext, 'engine' | 'entities' | 'stats'>,
): RuntimeCommandResult {
  if (ctx.stats.score < command.scoreCost) {
    return {
      triggered: false,
      mutated: false,
      message: `${command.label} needs ${command.scoreCost} score`,
    };
  }

  if (command.kind === 'core-repair') {
    if (ctx.stats.integrity >= 100) {
      return { triggered: false, mutated: false, message: `${command.label} has no damaged core` };
    }
    const before = ctx.stats.integrity;
    ctx.stats.score = Math.max(0, ctx.stats.score - command.scoreCost);
    ctx.stats.integrity = Math.min(100, ctx.stats.integrity + command.magnitude);
    return {
      triggered: true,
      mutated: false,
      message: `${command.label} restored ${Math.round(ctx.stats.integrity - before)} core`,
    };
  }

  if (command.kind === 'lane-barrage') {
    const lane = blueprint.lanes[command.laneIndex % blueprint.lanes.length];
    const targets = ctx.entities.filter((entity) => (
      entity.entity_type === 1
      && (
        distanceToSegmentSquared({ x: entity.x, z: entity.z }, lane.spawn, lane.bend) <= command.radius * command.radius
        || distanceToSegmentSquared({ x: entity.x, z: entity.z }, lane.bend, { x: 0, z: 0 }) <= command.radius * command.radius
      )
    ));
    if (targets.length === 0) {
      return { triggered: false, mutated: false, message: `${command.label} found no targets on ${lane.id}` };
    }
    ctx.stats.score = Math.max(0, ctx.stats.score - command.scoreCost);
    for (const target of targets) {
      target.hp = Math.max(0, target.hp - command.magnitude);
      target.color = command.color;
      const push = velocityToward({ x: 0, z: 0 }, { x: target.x, z: target.z }, Math.min(82, command.magnitude * 0.55));
      target.vx += push.x;
      target.vz += push.z;
      ctx.engine.damage_entity(target.id, command.magnitude);
    }
    ctx.engine.apply_render_data(JSON.stringify(ctx.entities));
    return {
      triggered: true,
      mutated: true,
      message: `${command.label} hit ${targets.length} enemies on ${lane.id}`,
    };
  }

  if (command.kind === 'tower-rally') {
    const towers = ctx.entities.filter((entity) => (
      entity.entity_type === 2
      && distanceSquared({ x: entity.x, z: entity.z }, { x: 0, z: 0 }) <= command.radius * command.radius
    ));
    if (towers.length === 0) {
      return { triggered: false, mutated: false, message: `${command.label} found no towers in range` };
    }
    ctx.stats.score = Math.max(0, ctx.stats.score - command.scoreCost);
    for (const tower of towers) {
      tower.hp = Math.min(tower.max_hp, tower.hp + command.magnitude);
      tower.cooldown = 0;
      tower.color = command.color;
    }
    ctx.engine.apply_render_data(JSON.stringify(ctx.entities));
    return {
      triggered: true,
      mutated: true,
      message: `${command.label} refreshed ${towers.length} towers`,
    };
  }

  return { triggered: false, mutated: false, message: `${command.label} is unavailable` };
}

function spawnEnemyFromArchetype(
  engine: RuntimeEngineFacade,
  x: number,
  z: number,
  velocity: Vec2,
  archetype: RuntimeEnemyArchetype,
): number {
  return engine.spawn_enemy_variant(
    x,
    z,
    velocity.x,
    velocity.z,
    archetype.hp,
    archetype.scale,
    archetype.color,
  );
}

function spawnBossEnemy(
  engine: RuntimeEngineFacade,
  x: number,
  z: number,
  velocity: Vec2,
  bossPlan: RuntimeBossPlan,
): number {
  return engine.spawn_enemy_variant(
    x,
    z,
    velocity.x,
    velocity.z,
    bossPlan.hp,
    bossPlan.scale,
    bossPlan.color,
  );
}

export function matchBossPlan(
  enemy: Pick<RuntimeEntitySnapshot, 'max_hp' | 'width' | 'color'>,
  bossPlan: RuntimeBossPlan,
): boolean {
  const widthScale = enemy.width / 30;
  const hpClose = Math.abs(enemy.max_hp - bossPlan.hp) <= Math.max(1, bossPlan.hp * 0.025);
  const scaleClose = Math.abs(widthScale - bossPlan.scale) <= 0.08;
  const colorClose = colorMismatch(bossPlan.color, enemy.color) === 0;
  return hpClose && scaleClose && colorClose;
}

export function matchEnemyArchetype(
  enemy: Pick<RuntimeEntitySnapshot, 'max_hp' | 'width' | 'color'>,
  archetypes: RuntimeEnemyArchetype[],
): RuntimeEnemyArchetype {
  if (archetypes.length === 0) {
    return {
      id: 'default',
      label: 'Default',
      hp: 100,
      speedMultiplier: 1,
      scale: 1,
      color: '#EF4444',
      scoreReward: 18,
    };
  }
  const widthScale = enemy.width / 30;
  return archetypes
    .slice()
    .sort((a, b) => {
      const aScore = Math.abs(a.hp - enemy.max_hp) + Math.abs(a.scale - widthScale) * 18 + colorMismatch(a.color, enemy.color);
      const bScore = Math.abs(b.hp - enemy.max_hp) + Math.abs(b.scale - widthScale) * 18 + colorMismatch(b.color, enemy.color);
      return aScore - bScore;
    })[0];
}

function colorMismatch(expected: string, actual: string): number {
  return expected.toLowerCase() === actual.toLowerCase() ? 0 : 8;
}

function findTacticalField(point: Vec2, fields: RuntimeTacticalField[]): { field: RuntimeTacticalField; index: number } | null {
  let best: { field: RuntimeTacticalField; index: number; distanceSquared: number } | null = null;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const fieldDistanceSquared = distanceSquared(point, field);
    if (fieldDistanceSquared > field.radius * field.radius) continue;
    if (!best || fieldDistanceSquared < best.distanceSquared) {
      best = { field, index, distanceSquared: fieldDistanceSquared };
    }
  }
  return best ? { field: best.field, index: best.index } : null;
}

function distanceToSegmentSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const segment = { x: end.x - start.x, z: end.z - start.z };
  const lengthSquared = dot(segment, segment);
  if (lengthSquared <= 0.0001) return distanceSquared(point, start);
  const t = clamp(dot({ x: point.x - start.x, z: point.z - start.z }, segment) / lengthSquared, 0, 1);
  return distanceSquared(point, { x: start.x + segment.x * t, z: start.z + segment.z * t });
}

function findNearest(point: Vec2, items: Vec2[]): { item: Vec2; distance: number; index: number } {
  let bestItem = items[0] ?? point;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = items.length > 0 ? 0 : -1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const distance = Math.sqrt(distanceSquared(point, item));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestItem = item;
      bestIndex = index;
    }
  }
  return { item: bestItem, distance: bestDistance, index: bestIndex };
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalizeSeed(seed: number): number {
  const normalized = Math.abs(Math.floor(seed));
  return normalized === 0 ? 1 : normalized;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
