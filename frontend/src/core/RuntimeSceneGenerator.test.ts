import { describe, expect, test } from '@jest/globals';
import {
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
  towerCombatProfile,
} from './RuntimeSceneGenerator';
import type { RuntimeEngineFacade, RuntimeEntitySnapshot, RuntimeStats } from './RuntimeSceneGenerator';

function mockEngine(): RuntimeEngineFacade & {
  enemies: Array<{ x: number; z: number; vx: number; vz: number }>;
  enemyVariants: Array<{ x: number; z: number; vx: number; vz: number; hp: number; scale: number; color: string }>;
  towers: Array<{ x: number; z: number }>;
  towerVariants: Array<{
    x: number;
    z: number;
    rangeMultiplier: number;
    fireIntervalMultiplier: number;
    damageMultiplier: number;
    scale: number;
    color: string;
  }>;
  damaged: Array<{ entityId: number; amount: number }>;
  combatTunings: Array<{
    towerRange: number;
    towerFireInterval: number;
    projectileSpeed: number;
    projectileDamage: number;
    projectileLead: number;
  }>;
  applied: number;
} {
  return {
    enemies: [],
    enemyVariants: [],
    towers: [],
    towerVariants: [],
    damaged: [],
    combatTunings: [],
    applied: 0,
    spawn_enemy(x: number, z: number, vx: number, vz: number): number {
      this.enemies.push({ x, z, vx, vz });
      return this.enemies.length + 10;
    },
    spawn_enemy_variant(x: number, z: number, vx: number, vz: number, hp: number, scale: number, color: string): number {
      this.enemyVariants.push({ x, z, vx, vz, hp, scale, color });
      this.enemies.push({ x, z, vx, vz });
      return this.enemies.length + 10;
    },
    build_tower(x: number, z: number): number {
      this.towers.push({ x, z });
      return this.towers.length + 100;
    },
    build_tower_variant(
      x: number,
      z: number,
      rangeMultiplier: number,
      fireIntervalMultiplier: number,
      damageMultiplier: number,
      scale: number,
      color: string,
    ): number {
      this.towerVariants.push({ x, z, rangeMultiplier, fireIntervalMultiplier, damageMultiplier, scale, color });
      this.towers.push({ x, z });
      return this.towers.length + 100;
    },
    damage_entity(entityId: number, amount: number): boolean {
      this.damaged.push({ entityId, amount });
      return true;
    },
    explode_entity(): void {},
    apply_render_data(): boolean {
      this.applied += 1;
      return true;
    },
    clear_dynamic_entities(): void {},
    set_gravity(): void {},
    set_combat_tuning(
      towerRange: number,
      towerFireInterval: number,
      projectileSpeed: number,
      projectileDamage: number,
      projectileLead: number,
    ): void {
      this.combatTunings.push({ towerRange, towerFireInterval, projectileSpeed, projectileDamage, projectileLead });
    },
  };
}

function enemy(overrides: Partial<RuntimeEntitySnapshot> = {}): RuntimeEntitySnapshot {
  return {
    id: 7,
    entity_type: 1,
    hp: 40,
    max_hp: 100,
    x: 80,
    y: -185,
    z: 0,
    width: 30,
    height: 30,
    depth: 30,
    color: '#EF4444',
    vx: 0,
    vy: 0,
    vz: 0,
    is_static: false,
    range_multiplier: 1,
    fire_interval_multiplier: 1,
    damage_multiplier: 1,
    cooldown: 0,
    ...overrides,
  };
}

function velocityTargetAlignment(origin: { x: number; z: number }, velocity: { vx: number; vz: number }, target: { x: number; z: number }): number {
  const targetX = target.x - origin.x;
  const targetZ = target.z - origin.z;
  const targetLength = Math.hypot(targetX, targetZ) || 1;
  const velocityLength = Math.hypot(velocity.vx, velocity.vz) || 1;
  return (targetX * velocity.vx + targetZ * velocity.vz) / (targetLength * velocityLength);
}

describe('RuntimeSceneGenerator', () => {
  test('generates deterministic blueprints for the same request', () => {
    const first = generateRuntimeScene({ seed: 42, playerLevel: 6, difficulty: 5, themeHint: 'space nebula', modules: ['tower_defense'] });
    const second = generateRuntimeScene({ seed: 42, playerLevel: 6, difficulty: 5, themeHint: 'space nebula', modules: ['tower_defense'] });

    expect(first).toEqual(second);
    expect(first.biome).toBe('orbital-garden');
  });

  test('scales lanes and enemy pressure with difficulty', () => {
    const easy = generateRuntimeScene({ seed: 5, playerLevel: 1, difficulty: 2, themeHint: 'forest' });
    const hard = generateRuntimeScene({ seed: 5, playerLevel: 20, difficulty: 9, themeHint: 'forest' });

    expect(easy.biome).toBe('verdant-ruins');
    expect(hard.lanes.length).toBeGreaterThan(easy.lanes.length);
    expect(hard.spawn.enemySpeed).toBeGreaterThan(easy.spawn.enemySpeed);
    expect(hard.spawn.interval).toBeLessThan(easy.spawn.interval);
    expect(hard.wavePlan.length).toBeGreaterThanOrEqual(easy.wavePlan.length);
    expect(hard.wavePlan[0].count).toBeGreaterThanOrEqual(easy.wavePlan[0].count);
    expect(hard.wavePlan[0].intervalMultiplier).toBeLessThanOrEqual(easy.wavePlan[0].intervalMultiplier);
    expect(hard.wavePlan[0].spawnSpread).toBeGreaterThan(0);
    expect(hard.towerArchetypes.length).toBe(3);
    expect(hard.towerArchetypes[1].damageMultiplier).toBeGreaterThan(hard.towerArchetypes[0].damageMultiplier);
    expect(hard.towerArchetypes[1].rangeMultiplier).toBeGreaterThan(hard.towerArchetypes[0].rangeMultiplier);
    expect(hard.towerArchetypes[2].fireIntervalMultiplier).toBeLessThan(hard.towerArchetypes[0].fireIntervalMultiplier);
    expect(hard.towerArchetypes[1].buildCost).toBeGreaterThanOrEqual(hard.towerArchetypes[0].buildCost);
    expect(hard.buildHints).toHaveLength(hard.towerAnchors.length);
    expect(hard.buildHints[0].priority).toBeGreaterThan(easy.buildHints[0].priority);
    expect(hard.buildHints.every((hint) => hard.towerArchetypes.some((archetype) => archetype.id === hint.towerArchetypeId))).toBe(true);
    expect(selectStarterBuildHint(hard)?.priority).toBe(Math.max(...hard.buildHints.map((hint) => hint.priority)));
    expect(hard.enemyArchetypes.length).toBe(3);
    expect(hard.enemyArchetypes[0].hp).toBeGreaterThan(easy.enemyArchetypes[0].hp);
    expect(hard.enemyArchetypes[0].scoreReward).toBeGreaterThan(easy.enemyArchetypes[0].scoreReward);
    expect(hard.enemyArchetypes[1].scale).toBeGreaterThan(easy.enemyArchetypes[1].scale);
    expect(hard.bossPlan.hp).toBeGreaterThan(easy.bossPlan.hp);
    expect(hard.bossPlan.scoreReward).toBeGreaterThan(easy.bossPlan.scoreReward);
    expect(hard.bossPlan.auraDamage).toBeGreaterThan(easy.bossPlan.auraDamage);
    expect(hard.bossPlan.triggerWave).toBeLessThanOrEqual(hard.objective.targetWaves);
    expect(hard.commands.length).toBe(3);
    expect(hard.commands[0].magnitude).toBeGreaterThan(easy.commands[0].magnitude);
    expect(hard.commands[2].radius).toBeGreaterThan(easy.commands[2].radius);
    expect(hard.commands.some((command) => command.kind === 'core-repair')).toBe(true);
    expect(hard.commandTargeting.laneAssistRadius).toBeGreaterThan(easy.commandTargeting.laneAssistRadius);
    expect(hard.commandTargeting.reticleRadius).toBeGreaterThan(easy.commandTargeting.reticleRadius);
    expect(hard.commandTargeting.retargetCooldown).toBeLessThan(easy.commandTargeting.retargetCooldown);
    expect(hard.laneSignals).toHaveLength(hard.lanes.length);
    expect(hard.laneSignals[0].pulseSpeed).toBeGreaterThan(easy.laneSignals[0].pulseSpeed);
    expect(hard.laneSignals[0].beaconHeight).toBeGreaterThan(easy.laneSignals[0].beaconHeight);
    expect(hard.setPieces.length).toBeGreaterThanOrEqual(easy.setPieces.length);
    expect(Math.max(...hard.setPieces.map((setPiece) => setPiece.height))).toBeGreaterThan(Math.max(...easy.setPieces.map((setPiece) => setPiece.height)));
    expect(hard.setPieces.every((setPiece) => setPiece.radius > 0 && setPiece.color.startsWith('#'))).toBe(true);
    expect(hard.tacticalFields.length).toBeGreaterThanOrEqual(easy.tacticalFields.length);
    expect(hard.tacticalFields[0].radius).toBeGreaterThan(easy.tacticalFields[0].radius);
    expect(hard.tacticalFields[0].damagePerPulse).toBeGreaterThan(easy.tacticalFields[0].damagePerPulse);
    expect(hard.tacticalFields[0].pulseInterval).toBeLessThan(easy.tacticalFields[0].pulseInterval);
    expect(hard.supportNodes.length).toBeGreaterThanOrEqual(easy.supportNodes.length);
    expect(hard.supportNodes[0].scorePerPulse).toBeGreaterThan(easy.supportNodes[0].scorePerPulse);
    expect(hard.supportNodes[0].repairPerPulse).toBeGreaterThanOrEqual(easy.supportNodes[0].repairPerPulse);
    expect(hard.supportNodes[0].pulseDamage).toBeGreaterThan(easy.supportNodes[0].pulseDamage);
    expect(hard.supportNodes[0].pulseInterval).toBeLessThan(easy.supportNodes[0].pulseInterval);
    expect(hard.rules.steeringLerp).toBeGreaterThan(easy.rules.steeringLerp);
    expect(hard.rules.waypointRadius).toBeLessThan(easy.rules.waypointRadius);
    expect(hard.rules.laneBuildBuffer).toBeGreaterThan(easy.rules.laneBuildBuffer);
    expect(hard.rules.coreBuildRadius).toBeGreaterThan(easy.rules.coreBuildRadius);
    expect(hard.rules.maxTowers).toBeGreaterThanOrEqual(easy.rules.maxTowers);
    expect(hard.rules.breachDamage).toBeGreaterThan(easy.rules.breachDamage);
    expect(hard.objective.targetWaves).toBeGreaterThanOrEqual(easy.objective.targetWaves);
    expect(hard.objective.targetScore).toBeGreaterThan(easy.objective.targetScore);
    expect(hard.objective.rewardXp).toBeGreaterThan(easy.objective.rewardXp);
    expect(hard.atmosphere.particleCount).toBeGreaterThan(easy.atmosphere.particleCount);
    expect(hard.atmosphere.coreHaloRadius).toBeGreaterThan(easy.atmosphere.coreHaloRadius);
    expect(hard.controls.cameraPanSpeed).toBeGreaterThan(easy.controls.cameraPanSpeed);
    expect(hard.controls.cameraAutoFocusStrength).toBeGreaterThan(easy.controls.cameraAutoFocusStrength);
    expect(hard.controls.cameraThreatLead).toBeGreaterThan(easy.controls.cameraThreatLead);
    expect(easy.controls.cameraManualOverride).toBeGreaterThan(hard.controls.cameraManualOverride);
    expect(hard.controls.cameraAlertZoom).toBeGreaterThan(easy.controls.cameraAlertZoom);
    expect(hard.controls.blastForce).toBeGreaterThan(easy.controls.blastForce);
    expect(hard.controls.blastCooldown).toBeLessThan(easy.controls.blastCooldown);
    expect(hard.controls.pointerAssistRadius).toBeGreaterThan(easy.controls.pointerAssistRadius);
    expect(hard.combat.towerRange).toBeGreaterThan(easy.combat.towerRange);
    expect(hard.combat.towerFireInterval).toBeLessThan(easy.combat.towerFireInterval);
    expect(hard.combat.projectileDamage).toBeGreaterThan(easy.combat.projectileDamage);
    expect(hard.combat.projectileSpeed).toBeGreaterThan(easy.combat.projectileSpeed);
    expect(hard.combat.projectileLead).toBeGreaterThan(easy.combat.projectileLead);
    expect(hard.scoring.comboWindow).toBeLessThan(easy.scoring.comboWindow);
    expect(hard.scoring.comboMultiplierStep).toBeGreaterThanOrEqual(easy.scoring.comboMultiplierStep);
    expect(hard.scoring.maxComboMultiplier).toBeGreaterThan(easy.scoring.maxComboMultiplier);
    expect(hard.scoring.perfectWaveBonus).toBeGreaterThan(easy.scoring.perfectWaveBonus);
    expect(hard.events.length).toBeGreaterThanOrEqual(easy.events.length);
    expect(hard.events.some((event) => event.kind === 'enemy-surge')).toBe(true);
  });

  test('generated logic builds a starter tower and spawns lane waves', () => {
    const scene = generateRuntimeScene({ seed: 9, playerLevel: 4, difficulty: 4, themeHint: 'cyber city', modules: ['tower_defense'] });
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 1 };

    const logs = logic.tick({ dt: scene.rules.firstWaveDelay + 0.1, time: 1, engine, entities: [], stats });
    const starterHint = selectStarterBuildHint(scene)!;
    const starterArchetype = scene.towerArchetypes.find((archetype) => archetype.id === starterHint.towerArchetypeId)!;

    expect(engine.towers.length).toBe(1);
    expect(engine.towerVariants).toHaveLength(1);
    expect(engine.towerVariants[0].x).toBe(scene.towerAnchors[starterHint.anchorIndex].x);
    expect(engine.towerVariants[0].z).toBe(scene.towerAnchors[starterHint.anchorIndex].z);
    expect(engine.towerVariants[0].rangeMultiplier).toBe(starterArchetype.rangeMultiplier);
    expect(engine.towerVariants[0].damageMultiplier).toBe(starterArchetype.damageMultiplier);
    expect(logs.join('\n')).toContain(starterHint.id);
    expect(engine.enemies.length).toBe(scene.wavePlan[0].count);
    expect(engine.enemyVariants.length).toBe(scene.wavePlan[0].count);
    expect(engine.enemyVariants.some((variant) => variant.hp !== 100 || variant.scale !== 1)).toBe(true);
    expect(velocityTargetAlignment(engine.enemies[0], engine.enemies[0], scene.lanes[0].bend)).toBeGreaterThan(0.97);
    expect(stats.wave).toBe(1);
    expect(scene.logicSource).toContain('wavePlan');
    expect(scene.logicSource).toContain('maxWaveCount');
    expect(scene.logicSource).toContain('minWaveWarning');
    expect(scene.logicSource).toContain('towerArchetypes');
    expect(scene.logicSource).toContain('maxTowerDamageMultiplier');
    expect(scene.logicSource).toContain('buildHints');
    expect(scene.logicSource).toContain('topBuildHint');
    expect(scene.logicSource).toContain('steeringLerp');
    expect(scene.logicSource).toContain('waypointRadius');
    expect(scene.logicSource).toContain('towerSnapRadius');
    expect(scene.logicSource).toContain('maxTowers');
    expect(scene.logicSource).toContain('targetWaves');
    expect(scene.logicSource).toContain('targetScore');
    expect(scene.logicSource).toContain('directorEvents');
    expect(scene.logicSource).toContain('enemyArchetypes');
    expect(scene.logicSource).toContain('maxEnemyReward');
    expect(scene.logicSource).toContain('bossPlan');
    expect(scene.logicSource).toContain('bossReward');
    expect(scene.logicSource).toContain('bossAuraDamage');
    expect(scene.logicSource).toContain('commandPlan');
    expect(scene.logicSource).toContain('maxCommandMagnitude');
    expect(scene.logicSource).toContain('commandLaneAssistRadius');
    expect(scene.logicSource).toContain('commandThreatWeight');
    expect(scene.logicSource).toContain('commandReticleRadius');
    expect(scene.logicSource).toContain('laneSignals');
    expect(scene.logicSource).toContain('maxLaneSignalHeight');
    expect(scene.logicSource).toContain('tacticalFields');
    expect(scene.logicSource).toContain('fieldSlowMultiplier');
    expect(scene.logicSource).toContain('fieldDamagePerPulse');
    expect(scene.logicSource).toContain('supportNodes');
    expect(scene.logicSource).toContain('supportPulseDamage');
    expect(scene.logicSource).toContain('setPieces');
    expect(scene.logicSource).toContain('maxSetPieceHeight');
    expect(scene.logicSource).toContain('particleCount');
    expect(scene.logicSource).toContain('coreHaloRadius');
    expect(scene.logicSource).toContain('laneBeaconCount');
    expect(scene.logicSource).toContain('cameraPanSpeed');
    expect(scene.logicSource).toContain('cameraAutoFocusStrength');
    expect(scene.logicSource).toContain('cameraThreatLead');
    expect(scene.logicSource).toContain('cameraManualOverride');
    expect(scene.logicSource).toContain('cameraAlertZoom');
    expect(scene.logicSource).toContain('blastCooldown');
    expect(scene.logicSource).toContain('pointerAssistRadius');
    expect(scene.logicSource).toContain('towerRange');
    expect(scene.logicSource).toContain('towerFireInterval');
    expect(scene.logicSource).toContain('projectileSpeed');
    expect(scene.logicSource).toContain('projectileDamage');
    expect(scene.logicSource).toContain('projectileLead');
    expect(scene.logicSource).toContain('comboWindow');
    expect(scene.logicSource).toContain('comboMultiplierStep');
    expect(scene.logicSource).toContain('maxComboMultiplier');
    expect(scene.logicSource).toContain('perfectWaveBonus');
    expect(logs.join('\n')).toContain('Wave 1');
  });

  test('generated logic warns before the next planned wave', () => {
    const scene = generateRuntimeScene({ seed: 10, playerLevel: 4, difficulty: 4, themeHint: 'cyber city', modules: ['tower_defense'] });
    scene.rules.starterTowerEnabled = false;
    scene.rules.firstWaveDelay = scene.wavePlan[0].warningTime + 0.05;
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 0.1 };

    const warningLogs = logic.tick({ dt: 0.06, time: 0.1, engine, entities: [], stats });

    expect(engine.enemyVariants.length).toBe(0);
    expect(warningLogs.join('\n')).toContain('Wave 1 incoming');
    expect(warningLogs.join('\n')).toContain(scene.lanes[scene.wavePlan[0].laneIndex].id);
  });

  test('generated logic injects the boss plan at its trigger wave', () => {
    const scene = generateRuntimeScene({ seed: 81, playerLevel: 6, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    scene.rules.starterTowerEnabled = false;
    scene.rules.firstWaveDelay = 0.05;
    scene.bossPlan.triggerWave = 1;
    scene.spawn.enemyCap = 99;
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 0.1 };

    const logs = logic.tick({ dt: 0.1, time: 0.1, engine, entities: [], stats });
    const bossVariant = engine.enemyVariants.find((variant) => (
      variant.hp === scene.bossPlan.hp
      && variant.scale === scene.bossPlan.scale
      && variant.color === scene.bossPlan.color
    ));

    expect(bossVariant).toBeDefined();
    expect(engine.enemyVariants).toHaveLength(scene.wavePlan[0].count + 1);
    expect(logs.join('\n')).toContain(`Boss ${scene.bossPlan.label} entered`);
    expect(stats.wave).toBe(1);
  });

  test('boss matching identifies generated boss enemies for aura and rewards', () => {
    const scene = generateRuntimeScene({ seed: 82, playerLevel: 6, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    const bossEnemy = enemy({
      max_hp: scene.bossPlan.hp,
      hp: scene.bossPlan.hp,
      width: 30 * scene.bossPlan.scale,
      color: scene.bossPlan.color,
    });

    expect(matchBossPlan(bossEnemy, scene.bossPlan)).toBe(true);
    expect(scene.bossPlan.scoreReward).toBeGreaterThan(matchEnemyArchetype(bossEnemy, scene.enemyArchetypes).scoreReward);
  });

  test('boss aura strains nearby towers from generated logic', () => {
    const scene = generateRuntimeScene({ seed: 83, playerLevel: 6, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    scene.rules.starterTowerEnabled = false;
    scene.rules.firstWaveDelay = 99;
    scene.bossPlan.auraInterval = 1;
    scene.bossPlan.auraRadius = 60;
    scene.tacticalFields = [
      { x: -180, z: -180, radius: 12, slowMultiplier: 1, damagePerPulse: 0, pulseInterval: 10, variant: 0 },
    ];
    scene.supportNodes = [];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 2, time: 2 };
    const entities = [
      enemy({ id: 10, max_hp: scene.bossPlan.hp, hp: scene.bossPlan.hp, width: 30 * scene.bossPlan.scale, color: scene.bossPlan.color, x: 90, z: 0 }),
      enemy({ id: 20, entity_type: 2, x: 116, z: 0, hp: 120, max_hp: 120 }),
    ];

    const logs = logic.tick({ dt: 0.7, time: 2, engine, entities, stats });

    expect(engine.damaged).toEqual([{ entityId: 20, amount: scene.bossPlan.auraDamage }]);
    expect(entities[1].hp).toBe(120 - scene.bossPlan.auraDamage);
    expect(engine.applied).toBe(1);
    expect(logs.join('\n')).toContain(`Boss ${scene.bossPlan.label} aura strained 1 towers`);
  });

  test('generated lane barrage command spends score and damages lane enemies', () => {
    const scene = generateRuntimeScene({ seed: 84, playerLevel: 6, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    scene.lanes = [
      { id: 'lane-command', spawn: { x: 180, z: 0 }, bend: { x: 80, z: 0 }, width: 28 },
      ...scene.lanes.slice(1),
    ];
    const command = scene.commands.find((item) => item.kind === 'lane-barrage')!;
    command.laneIndex = 0;
    command.scoreCost = 8;
    command.magnitude = 27;
    command.radius = 32;
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 30, integrity: 100, wave: 1, time: 4 };
    const entities = [
      enemy({ id: 10, x: 96, z: 4, hp: 90 }),
      enemy({ id: 11, x: -140, z: 120, hp: 90 }),
    ];

    const result = executeRuntimeCommand(command, scene, { engine, entities, stats });

    expect(result.triggered).toBe(true);
    expect(result.mutated).toBe(true);
    expect(stats.score).toBe(22);
    expect(entities[0].hp).toBe(63);
    expect(entities[1].hp).toBe(90);
    expect(engine.damaged).toEqual([{ entityId: 10, amount: 27 }]);
    expect(engine.applied).toBe(1);
    expect(result.message).toContain('hit 1 enemies');
  });

  test('generated repair and tower rally commands improve recovery control', () => {
    const scene = generateRuntimeScene({ seed: 85, playerLevel: 6, difficulty: 6, themeHint: 'forest ruins', modules: ['tower_defense', 'puzzle'] });
    const repair = scene.commands.find((item) => item.kind === 'core-repair')!;
    const rally = scene.commands.find((item) => item.kind === 'tower-rally')!;
    repair.scoreCost = 6;
    repair.magnitude = 17;
    rally.scoreCost = 5;
    rally.radius = 80;
    rally.magnitude = 50;
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 40, integrity: 71, wave: 2, time: 5 };
    const entities = [
      enemy({ id: 20, entity_type: 2, x: 30, z: 0, hp: 420, max_hp: 500, cooldown: 1.4 }),
      enemy({ id: 21, entity_type: 2, x: 140, z: 0, hp: 420, max_hp: 500, cooldown: 1.4 }),
    ];

    const repairResult = executeRuntimeCommand(repair, scene, { engine, entities, stats });
    const rallyResult = executeRuntimeCommand(rally, scene, { engine, entities, stats });

    expect(repairResult.triggered).toBe(true);
    expect(stats.integrity).toBe(88);
    expect(stats.score).toBe(29);
    expect(rallyResult.triggered).toBe(true);
    expect(rallyResult.mutated).toBe(true);
    expect(entities[0].hp).toBe(470);
    expect(entities[0].cooldown).toBe(0);
    expect(entities[1].hp).toBe(420);
    expect(engine.applied).toBe(1);
  });

  test('director events repair core and overdrive towers from generated logic', () => {
    const scene = generateRuntimeScene({ seed: 77, playerLevel: 6, difficulty: 5, themeHint: 'cyber city', modules: ['tower_defense'] });
    scene.rules.starterTowerEnabled = false;
    scene.tacticalFields = [
      { x: -180, z: -180, radius: 12, slowMultiplier: 1, damagePerPulse: 0, pulseInterval: 10, variant: 0 },
    ];
    scene.supportNodes = [];
    scene.events = [
      { id: 'repair', kind: 'repair-pulse', triggerWave: 0, cooldown: 0.1, magnitude: 9, duration: 0, laneIndex: 0 },
      { id: 'overdrive', kind: 'tower-overdrive', triggerWave: 0, cooldown: 0.1, magnitude: 18, duration: 1.5, laneIndex: 0 },
    ];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 72, wave: 2, time: 8 };
    const entities = [
      enemy({ id: 10, x: 60, z: 0, hp: 60 }),
      enemy({ id: 20, entity_type: 2, x: 0, z: 0, hp: 500 }),
    ];

    const logs = logic.tick({ dt: 1, time: 8, engine, entities, stats });

    expect(stats.integrity).toBe(81);
    expect(engine.damaged).toEqual([{ entityId: 10, amount: 18 }]);
    expect(engine.combatTunings).toHaveLength(1);
    expect(engine.combatTunings[0].towerFireInterval).toBeLessThan(scene.combat.towerFireInterval);
    expect(engine.combatTunings[0].projectileDamage).toBeGreaterThan(scene.combat.projectileDamage);
    expect(engine.combatTunings[0].projectileLead).toBeGreaterThan(scene.combat.projectileLead);
    expect(entities[0].hp).toBe(42);
    expect(logs.join('\n')).toContain('repair pulse');
    expect(logs.join('\n')).toContain('tower overdrive');
  });

  test('tower overdrive duration restores generated combat tuning after expiry', () => {
    const scene = generateRuntimeScene({ seed: 78, playerLevel: 6, difficulty: 5, themeHint: 'cyber city', modules: ['tower_defense'] });
    scene.rules.starterTowerEnabled = false;
    scene.tacticalFields = [
      { x: -180, z: -180, radius: 12, slowMultiplier: 1, damagePerPulse: 0, pulseInterval: 10, variant: 0 },
    ];
    scene.supportNodes = [];
    scene.events = [
      { id: 'overdrive', kind: 'tower-overdrive', triggerWave: 0, cooldown: 10, magnitude: 10, duration: 1.5, laneIndex: 0 },
    ];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 2, time: 8 };
    const entities = [enemy({ id: 10, x: 60, z: 0, hp: 80 })];

    const boostLogs = logic.tick({ dt: 1.4, time: 8, engine, entities, stats });
    const cooldownLogs = logic.tick({ dt: 1.6, time: 9.6, engine, entities, stats });

    expect(boostLogs.join('\n')).toContain('tower overdrive');
    expect(cooldownLogs.join('\n')).toContain('overdrive cooled');
    expect(engine.combatTunings).toHaveLength(2);
    expect(engine.combatTunings[0].projectileDamage).toBeGreaterThan(scene.combat.projectileDamage);
    expect(engine.combatTunings[1]).toEqual({
      towerRange: scene.combat.towerRange,
      towerFireInterval: scene.combat.towerFireInterval,
      projectileSpeed: scene.combat.projectileSpeed,
      projectileDamage: scene.combat.projectileDamage,
      projectileLead: scene.combat.projectileLead,
    });
  });

  test('runtime objective progress uses per-scene score and core integrity gate', () => {
    const scene = generateRuntimeScene({ seed: 13, playerLevel: 5, difficulty: 4, themeHint: 'cyber', modules: ['tower_defense'] });
    const sceneStartScore = 200;
    const pending = evaluateRuntimeObjective(scene, { score: 220, integrity: 100, wave: 1, time: 4 }, sceneStartScore);
    const scoreComplete = evaluateRuntimeObjective(scene, { score: sceneStartScore + scene.objective.targetScore, integrity: 100, wave: 1, time: 5 }, sceneStartScore);
    const waveWaiting = evaluateRuntimeObjective(scene, { score: 205, integrity: 100, wave: scene.objective.targetWaves, activeEnemies: 2, time: 6 }, sceneStartScore);
    const waveComplete = evaluateRuntimeObjective(scene, { score: 205, integrity: 100, wave: scene.objective.targetWaves, activeEnemies: 0, time: 6 }, sceneStartScore);
    const integrityBlocked = evaluateRuntimeObjective(scene, { score: sceneStartScore + scene.objective.targetScore, integrity: scene.objective.minIntegrity - 1, wave: 1, time: 7 }, sceneStartScore);

    expect(pending.complete).toBe(false);
    expect(pending.sceneScore).toBe(20);
    expect(scoreComplete.complete).toBe(true);
    expect(scoreComplete.reason).toBe('score');
    expect(waveWaiting.complete).toBe(false);
    expect(waveComplete.complete).toBe(true);
    expect(waveComplete.reason).toBe('wave');
    expect(integrityBlocked.complete).toBe(false);
    expect(integrityBlocked.reason).toBe('integrity');
  });

  test('build placement snaps to generated pads and blocks invalid build points', () => {
    const scene = generateRuntimeScene({ seed: 41, playerLevel: 4, difficulty: 5, themeHint: 'space', modules: ['tower_defense'] });
    scene.towerAnchors = [{ x: 100, z: 100 }];
    scene.lanes = [
      { id: 'lane-a', spawn: { x: 200, z: 0 }, bend: { x: 100, z: 0 }, width: 24 },
      { id: 'lane-b', spawn: { x: -200, z: 0 }, bend: { x: -100, z: 0 }, width: 24 },
    ];
    scene.rules.towerSnapRadius = 35;
    scene.rules.laneBuildBuffer = 12;
    scene.rules.coreBuildRadius = 42;
    scene.rules.maxTowers = 3;

    const snapped = resolveBuildPlacement({ x: 109, z: 94 }, scene, []);
    expect(snapped.valid).toBe(true);
    expect(snapped.snappedToAnchor).toBe(true);
    expect(snapped.anchorIndex).toBe(0);
    expect(snapped.position).toEqual(scene.towerAnchors[0]);

    const laneBlocked = resolveBuildPlacement({ x: 150, z: 0 }, scene, []);
    expect(laneBlocked.valid).toBe(false);
    expect(laneBlocked.reason).toContain('lane-a');

    const occupied = resolveBuildPlacement({ x: 108, z: 95 }, scene, [enemy({ entity_type: 2, x: 100, z: 100 })]);
    expect(occupied.valid).toBe(false);
    expect(occupied.reason).toContain('occupied');

    const atLimit = resolveBuildPlacement({ x: -120, z: 100 }, scene, [
      enemy({ id: 1, entity_type: 2, x: -150, z: 100 }),
      enemy({ id: 2, entity_type: 2, x: -120, z: 120 }),
      enemy({ id: 3, entity_type: 2, x: -90, z: 100 }),
    ]);
    expect(atLimit.valid).toBe(false);
    expect(atLimit.reason).toContain('limit');
  });

  test('blast target assist locks the nearest enemy within generated range', () => {
    const scene = generateRuntimeScene({ seed: 46, playerLevel: 4, difficulty: 5, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    scene.controls.pointerAssistRadius = 38;
    const entities = [
      enemy({ id: 1, x: 10, z: 10 }),
      enemy({ id: 2, x: 26, z: 3 }),
      enemy({ id: 3, entity_type: 2, x: 3, z: 2 }),
    ];

    const locked = resolveBlastTarget({ x: 24, z: 0 }, entities, scene.controls);
    expect(locked.valid).toBe(true);
    expect(locked.entityId).toBe(2);
    expect(locked.position).toEqual({ x: 26, z: 3 });
    expect(locked.reason).toContain('locked');

    const missed = resolveBlastTarget({ x: 120, z: 120 }, entities, scene.controls);
    expect(missed.valid).toBe(false);
    expect(missed.reason).toContain('range');
  });

  test('generated logic follows lane bend waypoints before steering to the core', () => {
    const scene = generateRuntimeScene({ seed: 31, playerLevel: 4, difficulty: 5, themeHint: 'forest ruins', modules: ['tower_defense'] });
    scene.lanes = [
      { id: 'lane-test', spawn: { x: 180, z: 0 }, bend: { x: 80, z: 80 }, width: 28 },
      ...scene.lanes.slice(1),
    ];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 0.1 };
    const entities = [enemy({ x: 180, z: 0, vx: 0, vz: 0 })];

    logic.tick({ dt: 0.1, time: 0.1, engine, entities, stats });

    const bendAlignment = velocityTargetAlignment(entities[0], entities[0], scene.lanes[0].bend);
    const coreAlignment = velocityTargetAlignment(entities[0], entities[0], { x: 0, z: 0 });
    expect(engine.applied).toBe(1);
    expect(bendAlignment).toBeGreaterThan(0.97);
    expect(bendAlignment).toBeGreaterThan(coreAlignment + 0.12);
  });

  test('generated tactical fields slow and pulse-damage enemies', () => {
    const scene = generateRuntimeScene({ seed: 32, playerLevel: 4, difficulty: 5, themeHint: 'forest ruins', modules: ['tower_defense', 'puzzle'] });
    scene.rules.starterTowerEnabled = false;
    scene.rules.steeringLerp = 1;
    scene.tacticalFields = [
      { x: 80, z: 0, radius: 36, slowMultiplier: 0.5, damagePerPulse: 9, pulseInterval: 1, variant: 1 },
    ];
    scene.lanes = [
      { id: 'lane-test', spawn: { x: 180, z: 0 }, bend: { x: 80, z: 0 }, width: 28 },
      ...scene.lanes.slice(1),
    ];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 0.5 };
    const entities = [enemy({ x: 80, z: 0, hp: 90 })];

    const logs = logic.tick({ dt: 0.6, time: 0.6, engine, entities, stats });

    expect(engine.applied).toBe(1);
    expect(entities[0].hp).toBe(81);
    expect(Math.hypot(entities[0].vx, entities[0].vz)).toBeLessThan(scene.spawn.enemySpeed * 0.62);
    expect(logs.join('\n')).toContain('Tactical field pulsed 1 enemies');
  });

  test('generated support nodes reward cleared space and shock contesting enemies', () => {
    const scene = generateRuntimeScene({ seed: 35, playerLevel: 4, difficulty: 5, themeHint: 'forest ruins', modules: ['tower_defense', 'puzzle'] });
    scene.rules.starterTowerEnabled = false;
    scene.rules.steeringLerp = 1;
    scene.supportNodes = [
      { id: 'relay-safe', x: 120, z: 0, radius: 24, scorePerPulse: 7, repairPerPulse: 3, pulseDamage: 5, pulseInterval: 1, variant: 0 },
      { id: 'relay-hot', x: 80, z: 0, radius: 30, scorePerPulse: 6, repairPerPulse: 2, pulseDamage: 11, pulseInterval: 1, variant: 1 },
    ];
    scene.tacticalFields = [
      { x: -180, z: -180, radius: 12, slowMultiplier: 1, damagePerPulse: 0, pulseInterval: 10, variant: 0 },
    ];
    scene.lanes = [
      { id: 'lane-test', spawn: { x: 180, z: 0 }, bend: { x: 80, z: 0 }, width: 28 },
      ...scene.lanes.slice(1),
    ];
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 10, integrity: 91, wave: 0, time: 0.5 };
    const entities = [enemy({ x: 80, z: 0, hp: 90 })];

    const logs = logic.tick({ dt: 0.6, time: 0.6, engine, entities, stats });

    expect(stats.score).toBe(17);
    expect(stats.integrity).toBe(94);
    expect(entities[0].hp).toBe(79);
    expect(engine.applied).toBe(1);
    expect(logs.join('\n')).toContain('Support relay-safe secured +7 score');
    expect(logs.join('\n')).toContain('Support relay-hot shocked 1 enemies');
  });

  test('enemy archetype matching drives generated rewards and speed classes', () => {
    const scene = generateRuntimeScene({ seed: 33, playerLevel: 5, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    const bulwark = scene.enemyArchetypes.find((archetype) => archetype.id === 'bulwark')!;
    const matched = matchEnemyArchetype(
      enemy({
        max_hp: bulwark.hp,
        hp: bulwark.hp,
        width: 30 * bulwark.scale,
        color: bulwark.color,
      }),
      scene.enemyArchetypes,
    );

    expect(matched.id).toBe('bulwark');
    expect(matched.scoreReward).toBeGreaterThan(scene.enemyArchetypes[0].scoreReward);
    expect(matched.speedMultiplier).toBeLessThan(scene.enemyArchetypes[0].speedMultiplier);
  });

  test('tower combat profiles expose generated range, cadence, damage, and build cost', () => {
    const scene = generateRuntimeScene({ seed: 34, playerLevel: 5, difficulty: 6, themeHint: 'space', modules: ['tower_defense', 'shooter'] });
    const sentinel = scene.towerArchetypes.find((archetype) => archetype.id === 'sentinel')!;
    const rail = scene.towerArchetypes.find((archetype) => archetype.id === 'rail')!;
    const spark = scene.towerArchetypes.find((archetype) => archetype.id === 'spark')!;

    const sentinelProfile = towerCombatProfile(scene, sentinel);
    const railProfile = towerCombatProfile(scene, rail);
    const sparkProfile = towerCombatProfile(scene, spark);

    expect(railProfile.range).toBeGreaterThan(sentinelProfile.range);
    expect(railProfile.damage).toBeGreaterThan(sentinelProfile.damage);
    expect(railProfile.fireInterval).toBeGreaterThan(sentinelProfile.fireInterval);
    expect(sparkProfile.range).toBeLessThan(sentinelProfile.range);
    expect(sparkProfile.fireInterval).toBeLessThan(sentinelProfile.fireInterval);
    expect(sparkProfile.buildCost).toBeLessThanOrEqual(sentinelProfile.buildCost);
  });

  test('generated logic steers enemies, applies render data, and damages core breaches', () => {
    const scene = generateRuntimeScene({ seed: 12, playerLevel: 8, difficulty: 6, themeHint: 'desert temple', modules: ['tower_defense'] });
    const logic = createRuntimeLogic(scene);
    const engine = mockEngine();
    const stats: RuntimeStats = { score: 0, integrity: 100, wave: 0, time: 2 };
    const entities = [enemy({ x: 10, z: 8 })];

    const logs = logic.tick({ dt: 0.1, time: 2, engine, entities, stats });

    expect(engine.applied).toBe(1);
    expect(entities[0].vx).not.toBe(0);
    expect(stats.integrity).toBeLessThan(100);
    expect(logs.join('\n')).toContain('Core breached');
  });

  test('parses engine-authored runtime scene JSON with camelCase fields', () => {
    const scene = generateRuntimeScene({ seed: 22, playerLevel: 5, difficulty: 4, themeHint: 'space', modules: ['tower_defense'] });
    const parsed = parseRuntimeSceneBlueprint(JSON.stringify(scene));

    expect(parsed).toEqual(scene);
    expect(parseRuntimeSceneBlueprint('not json')).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ error: 'bad scene' }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, rules: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, objective: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, events: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, wavePlan: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, towerArchetypes: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, buildHints: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, buildHints: [{ ...scene.buildHints[0], anchorIndex: scene.towerAnchors.length }]}))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, tacticalFields: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, supportNodes: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, enemyArchetypes: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, bossPlan: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, commands: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, commandTargeting: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, laneSignals: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, setPieces: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, atmosphere: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, controls: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, controls: { ...scene.controls, cameraAutoFocusStrength: undefined } }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, combat: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, scoring: undefined }))).toBeNull();
    expect(parseRuntimeSceneBlueprint(JSON.stringify({ ...scene, rules: { ...scene.rules, towerSnapRadius: undefined } }))).toBeNull();
  });
});
