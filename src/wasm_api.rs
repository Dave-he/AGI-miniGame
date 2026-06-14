use cocos4_rust::agi_minigame::{
    generate_runtime_scene as engine_generate_runtime_scene, RuntimeBiome,
    RuntimeSceneBlueprint as EngineRuntimeSceneBlueprint,
    RuntimeSceneRequest as EngineRuntimeSceneRequest,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize, Clone)]
pub struct EntityRenderData {
    pub id: u32,
    pub entity_type: u32, // 0: 地面, 1: 敌人(Enemy), 2: 防御塔(Tower), 3: 子弹(Bullet)
    pub hp: f32,
    pub max_hp: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub width: f32,
    pub height: f32,
    pub depth: f32,
    pub color: String,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub is_static: bool,
    pub range_multiplier: f32,
    pub fire_interval_multiplier: f32,
    pub damage_multiplier: f32,
    pub cooldown: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSceneJson {
    id: String,
    title: String,
    seed: u64,
    biome: String,
    difficulty: u32,
    modules: Vec<String>,
    palette: RuntimePaletteJson,
    lanes: Vec<RuntimeLaneJson>,
    wave_plan: Vec<RuntimeWavePlanJson>,
    tower_anchors: Vec<RuntimeVec2Json>,
    tower_archetypes: Vec<RuntimeTowerArchetypeJson>,
    build_hints: Vec<RuntimeBuildHintJson>,
    tactical_fields: Vec<RuntimeTacticalFieldJson>,
    support_nodes: Vec<RuntimeSupportNodeJson>,
    enemy_archetypes: Vec<RuntimeEnemyArchetypeJson>,
    boss_plan: RuntimeBossPlanJson,
    commands: Vec<RuntimeCommandPlanJson>,
    command_targeting: RuntimeCommandTargetingJson,
    lane_signals: Vec<RuntimeLaneSignalJson>,
    set_pieces: Vec<RuntimeSetPieceJson>,
    decorations: Vec<RuntimeDecorationJson>,
    spawn: RuntimeSpawnJson,
    camera: RuntimeCameraJson,
    lighting: RuntimeLightingJson,
    atmosphere: RuntimeAtmosphereJson,
    controls: RuntimeControlJson,
    combat: RuntimeCombatJson,
    scoring: RuntimeScoringJson,
    objective: RuntimeObjectiveJson,
    events: Vec<RuntimeDirectorEventJson>,
    rules: RuntimeRulePlanJson,
    logic_source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePaletteJson {
    sky_top: String,
    sky_bottom: String,
    ground: String,
    road: String,
    grid: String,
    tower: String,
    enemy: String,
    projectile: String,
    core: String,
    accent: String,
    fog: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeLaneJson {
    id: String,
    spawn: RuntimeVec2Json,
    bend: RuntimeVec2Json,
    width: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeWavePlanJson {
    id: String,
    lane_index: u32,
    count: u32,
    interval_multiplier: f32,
    archetype_bias: u32,
    spawn_spread: f32,
    warning_time: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeTowerArchetypeJson {
    id: String,
    label: String,
    range_multiplier: f32,
    fire_interval_multiplier: f32,
    damage_multiplier: f32,
    scale: f32,
    color: String,
    build_cost: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBuildHintJson {
    id: String,
    anchor_index: u32,
    lane_index: u32,
    tower_archetype_id: String,
    priority: f32,
    radius: f32,
    color: String,
    x: f32,
    z: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeVec2Json {
    x: f32,
    z: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeDecorationJson {
    x: f32,
    z: f32,
    radius: f32,
    height: f32,
    variant: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeTacticalFieldJson {
    x: f32,
    z: f32,
    radius: f32,
    slow_multiplier: f32,
    damage_per_pulse: f32,
    pulse_interval: f32,
    variant: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSupportNodeJson {
    id: String,
    x: f32,
    z: f32,
    radius: f32,
    score_per_pulse: u32,
    repair_per_pulse: f32,
    pulse_damage: f32,
    pulse_interval: f32,
    variant: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEnemyArchetypeJson {
    id: String,
    label: String,
    hp: f32,
    speed_multiplier: f32,
    scale: f32,
    color: String,
    score_reward: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBossPlanJson {
    id: String,
    label: String,
    trigger_wave: u32,
    lane_index: u32,
    hp: f32,
    speed_multiplier: f32,
    scale: f32,
    color: String,
    score_reward: u32,
    warning_time: f32,
    aura_radius: f32,
    aura_damage: f32,
    aura_interval: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCommandPlanJson {
    id: String,
    label: String,
    kind: String,
    hotkey: String,
    cooldown: f32,
    score_cost: u32,
    magnitude: f32,
    radius: f32,
    duration: f32,
    lane_index: u32,
    color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCommandTargetingJson {
    lane_assist_radius: f32,
    threat_weight: f32,
    pointer_weight: f32,
    reticle_radius: f32,
    reticle_pulse_speed: f32,
    retarget_cooldown: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeLaneSignalJson {
    id: String,
    lane_index: u32,
    warning_color: String,
    boss_color: String,
    alert_radius: f32,
    pulse_speed: f32,
    beacon_height: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSetPieceJson {
    id: String,
    kind: String,
    x: f32,
    z: f32,
    radius: f32,
    height: f32,
    rotation: f32,
    color: String,
    accent_color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSpawnJson {
    interval: f32,
    enemy_speed: f32,
    enemy_cap: u32,
    wave_size: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCameraJson {
    distance: f32,
    height: f32,
    pitch: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeLightingJson {
    ambient: f32,
    key: f32,
    bloom: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeAtmosphereJson {
    particle_count: u32,
    particle_speed: f32,
    wind: RuntimeVec2Json,
    core_halo_radius: f32,
    core_halo_intensity: f32,
    lane_beacon_count: u32,
    sky_ring_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeControlJson {
    camera_pan_speed: f32,
    camera_damping: f32,
    camera_auto_focus_strength: f32,
    camera_threat_lead: f32,
    camera_manual_override: f32,
    camera_alert_zoom: f32,
    blast_force: f32,
    blast_cooldown: f32,
    blast_score_reward: u32,
    build_score_cost: u32,
    pointer_assist_radius: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCombatJson {
    tower_range: f32,
    tower_fire_interval: f32,
    projectile_speed: f32,
    projectile_damage: f32,
    projectile_lead: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeScoringJson {
    combo_window: f32,
    combo_multiplier_step: f32,
    max_combo_multiplier: f32,
    blast_combo_boost: f32,
    command_combo_boost: f32,
    support_combo_boost: f32,
    perfect_wave_bonus: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeObjectiveJson {
    summary: String,
    target_waves: u32,
    target_score: u32,
    min_integrity: f32,
    reward_xp: u32,
    auto_advance_delay: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeDirectorEventJson {
    id: String,
    kind: String,
    trigger_wave: u32,
    cooldown: f32,
    magnitude: f32,
    duration: f32,
    lane_index: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeRulePlanJson {
    starter_tower_enabled: bool,
    first_wave_delay: f32,
    steering_lerp: f32,
    wounded_health_ratio: f32,
    wounded_speed_multiplier: f32,
    weak_point_pulse_interval: f32,
    weak_point_pulse_force: f32,
    waypoint_radius: f32,
    tower_snap_radius: f32,
    lane_build_buffer: f32,
    core_build_radius: f32,
    max_towers: u32,
    breach_radius: f32,
    breach_damage: f32,
    low_integrity_threshold: f32,
    low_integrity_spawn_multiplier: f32,
}

impl From<EngineRuntimeSceneBlueprint> for RuntimeSceneJson {
    fn from(scene: EngineRuntimeSceneBlueprint) -> Self {
        Self {
            id: scene.id,
            title: scene.title,
            seed: scene.seed,
            biome: runtime_biome_id(scene.biome).to_string(),
            difficulty: scene.difficulty,
            modules: scene.modules,
            palette: RuntimePaletteJson {
                sky_top: scene.palette.sky_top.to_string(),
                sky_bottom: scene.palette.sky_bottom.to_string(),
                ground: scene.palette.ground.to_string(),
                road: scene.palette.road.to_string(),
                grid: scene.palette.grid.to_string(),
                tower: scene.palette.tower.to_string(),
                enemy: scene.palette.enemy.to_string(),
                projectile: scene.palette.projectile.to_string(),
                core: scene.palette.core.to_string(),
                accent: scene.palette.accent.to_string(),
                fog: scene.palette.fog.to_string(),
            },
            lanes: scene
                .lanes
                .into_iter()
                .map(|lane| RuntimeLaneJson {
                    id: lane.id,
                    spawn: RuntimeVec2Json {
                        x: lane.spawn.x,
                        z: lane.spawn.z,
                    },
                    bend: RuntimeVec2Json {
                        x: lane.bend.x,
                        z: lane.bend.z,
                    },
                    width: lane.width,
                })
                .collect(),
            wave_plan: scene
                .wave_plan
                .into_iter()
                .map(|wave| RuntimeWavePlanJson {
                    id: wave.id,
                    lane_index: wave.lane_index,
                    count: wave.count,
                    interval_multiplier: wave.interval_multiplier,
                    archetype_bias: wave.archetype_bias,
                    spawn_spread: wave.spawn_spread,
                    warning_time: wave.warning_time,
                })
                .collect(),
            tower_anchors: scene
                .tower_anchors
                .into_iter()
                .map(|anchor| RuntimeVec2Json {
                    x: anchor.x,
                    z: anchor.z,
                })
                .collect(),
            tower_archetypes: scene
                .tower_archetypes
                .into_iter()
                .map(|archetype| RuntimeTowerArchetypeJson {
                    id: archetype.id,
                    label: archetype.label,
                    range_multiplier: archetype.range_multiplier,
                    fire_interval_multiplier: archetype.fire_interval_multiplier,
                    damage_multiplier: archetype.damage_multiplier,
                    scale: archetype.scale,
                    color: archetype.color.to_string(),
                    build_cost: archetype.build_cost,
                })
                .collect(),
            build_hints: scene
                .build_hints
                .into_iter()
                .map(|hint| RuntimeBuildHintJson {
                    id: hint.id,
                    anchor_index: hint.anchor_index,
                    lane_index: hint.lane_index,
                    tower_archetype_id: hint.tower_archetype_id,
                    priority: hint.priority,
                    radius: hint.radius,
                    color: hint.color.to_string(),
                    x: hint.x,
                    z: hint.z,
                })
                .collect(),
            tactical_fields: scene
                .tactical_fields
                .into_iter()
                .map(|field| RuntimeTacticalFieldJson {
                    x: field.x,
                    z: field.z,
                    radius: field.radius,
                    slow_multiplier: field.slow_multiplier,
                    damage_per_pulse: field.damage_per_pulse,
                    pulse_interval: field.pulse_interval,
                    variant: field.variant,
                })
                .collect(),
            support_nodes: scene
                .support_nodes
                .into_iter()
                .map(|node| RuntimeSupportNodeJson {
                    id: node.id,
                    x: node.x,
                    z: node.z,
                    radius: node.radius,
                    score_per_pulse: node.score_per_pulse,
                    repair_per_pulse: node.repair_per_pulse,
                    pulse_damage: node.pulse_damage,
                    pulse_interval: node.pulse_interval,
                    variant: node.variant,
                })
                .collect(),
            enemy_archetypes: scene
                .enemy_archetypes
                .into_iter()
                .map(|archetype| RuntimeEnemyArchetypeJson {
                    id: archetype.id,
                    label: archetype.label,
                    hp: archetype.hp,
                    speed_multiplier: archetype.speed_multiplier,
                    scale: archetype.scale,
                    color: archetype.color.to_string(),
                    score_reward: archetype.score_reward,
                })
                .collect(),
            boss_plan: RuntimeBossPlanJson {
                id: scene.boss_plan.id,
                label: scene.boss_plan.label,
                trigger_wave: scene.boss_plan.trigger_wave,
                lane_index: scene.boss_plan.lane_index,
                hp: scene.boss_plan.hp,
                speed_multiplier: scene.boss_plan.speed_multiplier,
                scale: scene.boss_plan.scale,
                color: scene.boss_plan.color.to_string(),
                score_reward: scene.boss_plan.score_reward,
                warning_time: scene.boss_plan.warning_time,
                aura_radius: scene.boss_plan.aura_radius,
                aura_damage: scene.boss_plan.aura_damage,
                aura_interval: scene.boss_plan.aura_interval,
            },
            commands: scene
                .commands
                .into_iter()
                .map(|command| RuntimeCommandPlanJson {
                    id: command.id,
                    label: command.label,
                    kind: command.kind,
                    hotkey: command.hotkey,
                    cooldown: command.cooldown,
                    score_cost: command.score_cost,
                    magnitude: command.magnitude,
                    radius: command.radius,
                    duration: command.duration,
                    lane_index: command.lane_index,
                    color: command.color.to_string(),
                })
                .collect(),
            command_targeting: RuntimeCommandTargetingJson {
                lane_assist_radius: scene.command_targeting.lane_assist_radius,
                threat_weight: scene.command_targeting.threat_weight,
                pointer_weight: scene.command_targeting.pointer_weight,
                reticle_radius: scene.command_targeting.reticle_radius,
                reticle_pulse_speed: scene.command_targeting.reticle_pulse_speed,
                retarget_cooldown: scene.command_targeting.retarget_cooldown,
            },
            lane_signals: scene
                .lane_signals
                .into_iter()
                .map(|signal| RuntimeLaneSignalJson {
                    id: signal.id,
                    lane_index: signal.lane_index,
                    warning_color: signal.warning_color.to_string(),
                    boss_color: signal.boss_color.to_string(),
                    alert_radius: signal.alert_radius,
                    pulse_speed: signal.pulse_speed,
                    beacon_height: signal.beacon_height,
                })
                .collect(),
            set_pieces: scene
                .set_pieces
                .into_iter()
                .map(|set_piece| RuntimeSetPieceJson {
                    id: set_piece.id,
                    kind: set_piece.kind,
                    x: set_piece.x,
                    z: set_piece.z,
                    radius: set_piece.radius,
                    height: set_piece.height,
                    rotation: set_piece.rotation,
                    color: set_piece.color.to_string(),
                    accent_color: set_piece.accent_color.to_string(),
                })
                .collect(),
            decorations: scene
                .decorations
                .into_iter()
                .map(|decoration| RuntimeDecorationJson {
                    x: decoration.x,
                    z: decoration.z,
                    radius: decoration.radius,
                    height: decoration.height,
                    variant: decoration.variant,
                })
                .collect(),
            spawn: RuntimeSpawnJson {
                interval: scene.spawn.interval,
                enemy_speed: scene.spawn.enemy_speed,
                enemy_cap: scene.spawn.enemy_cap,
                wave_size: scene.spawn.wave_size,
            },
            camera: RuntimeCameraJson {
                distance: scene.camera.distance,
                height: scene.camera.height,
                pitch: scene.camera.pitch,
            },
            lighting: RuntimeLightingJson {
                ambient: scene.lighting.ambient,
                key: scene.lighting.key,
                bloom: scene.lighting.bloom,
            },
            atmosphere: RuntimeAtmosphereJson {
                particle_count: scene.atmosphere.particle_count,
                particle_speed: scene.atmosphere.particle_speed,
                wind: RuntimeVec2Json {
                    x: scene.atmosphere.wind.x,
                    z: scene.atmosphere.wind.z,
                },
                core_halo_radius: scene.atmosphere.core_halo_radius,
                core_halo_intensity: scene.atmosphere.core_halo_intensity,
                lane_beacon_count: scene.atmosphere.lane_beacon_count,
                sky_ring_count: scene.atmosphere.sky_ring_count,
            },
            controls: RuntimeControlJson {
                camera_pan_speed: scene.controls.camera_pan_speed,
                camera_damping: scene.controls.camera_damping,
                camera_auto_focus_strength: scene.controls.camera_auto_focus_strength,
                camera_threat_lead: scene.controls.camera_threat_lead,
                camera_manual_override: scene.controls.camera_manual_override,
                camera_alert_zoom: scene.controls.camera_alert_zoom,
                blast_force: scene.controls.blast_force,
                blast_cooldown: scene.controls.blast_cooldown,
                blast_score_reward: scene.controls.blast_score_reward,
                build_score_cost: scene.controls.build_score_cost,
                pointer_assist_radius: scene.controls.pointer_assist_radius,
            },
            combat: RuntimeCombatJson {
                tower_range: scene.combat.tower_range,
                tower_fire_interval: scene.combat.tower_fire_interval,
                projectile_speed: scene.combat.projectile_speed,
                projectile_damage: scene.combat.projectile_damage,
                projectile_lead: scene.combat.projectile_lead,
            },
            scoring: RuntimeScoringJson {
                combo_window: scene.scoring.combo_window,
                combo_multiplier_step: scene.scoring.combo_multiplier_step,
                max_combo_multiplier: scene.scoring.max_combo_multiplier,
                blast_combo_boost: scene.scoring.blast_combo_boost,
                command_combo_boost: scene.scoring.command_combo_boost,
                support_combo_boost: scene.scoring.support_combo_boost,
                perfect_wave_bonus: scene.scoring.perfect_wave_bonus,
            },
            objective: RuntimeObjectiveJson {
                summary: scene.objective.summary,
                target_waves: scene.objective.target_waves,
                target_score: scene.objective.target_score,
                min_integrity: scene.objective.min_integrity,
                reward_xp: scene.objective.reward_xp,
                auto_advance_delay: scene.objective.auto_advance_delay,
            },
            events: scene
                .events
                .into_iter()
                .map(|event| RuntimeDirectorEventJson {
                    id: event.id,
                    kind: event.kind,
                    trigger_wave: event.trigger_wave,
                    cooldown: event.cooldown,
                    magnitude: event.magnitude,
                    duration: event.duration,
                    lane_index: event.lane_index,
                })
                .collect(),
            rules: RuntimeRulePlanJson {
                starter_tower_enabled: scene.rules.starter_tower_enabled,
                first_wave_delay: scene.rules.first_wave_delay,
                steering_lerp: scene.rules.steering_lerp,
                wounded_health_ratio: scene.rules.wounded_health_ratio,
                wounded_speed_multiplier: scene.rules.wounded_speed_multiplier,
                weak_point_pulse_interval: scene.rules.weak_point_pulse_interval,
                weak_point_pulse_force: scene.rules.weak_point_pulse_force,
                waypoint_radius: scene.rules.waypoint_radius,
                tower_snap_radius: scene.rules.tower_snap_radius,
                lane_build_buffer: scene.rules.lane_build_buffer,
                core_build_radius: scene.rules.core_build_radius,
                max_towers: scene.rules.max_towers,
                breach_radius: scene.rules.breach_radius,
                breach_damage: scene.rules.breach_damage,
                low_integrity_threshold: scene.rules.low_integrity_threshold,
                low_integrity_spawn_multiplier: scene.rules.low_integrity_spawn_multiplier,
            },
            logic_source: scene.logic_source,
        }
    }
}

fn runtime_biome_id(biome: RuntimeBiome) -> &'static str {
    match biome {
        RuntimeBiome::NeonHarbor => "neon-harbor",
        RuntimeBiome::VerdantRuins => "verdant-ruins",
        RuntimeBiome::SunforgeBazaar => "sunforge-bazaar",
        RuntimeBiome::OrbitalGarden => "orbital-garden",
    }
}

#[wasm_bindgen]
pub struct GameEngine {
    entities: Vec<EntityRenderData>,
    bounds_size: f32,
    gravity: f32,
    next_id: u32,
    tower_range: f32,
    tower_fire_interval: f32,
    projectile_speed: f32,
    projectile_damage: f32,
    projectile_lead: f32,
}

#[wasm_bindgen]
impl GameEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(bounds_size: f32) -> GameEngine {
        let mut entities = Vec::new();

        // 静态地面
        entities.push(EntityRenderData {
            id: 1,
            entity_type: 0,
            hp: 9999.0,
            max_hp: 9999.0,
            x: 0.0,
            y: -bounds_size / 2.0,
            z: 0.0,
            width: bounds_size,
            height: 10.0,
            depth: bounds_size,
            color: "#666666".to_string(),
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            is_static: true,
            range_multiplier: 1.0,
            fire_interval_multiplier: 1.0,
            damage_multiplier: 1.0,
            cooldown: 0.0,
        });

        GameEngine {
            entities,
            bounds_size,
            gravity: 980.0,
            next_id: 2,
            tower_range: 190.0,
            tower_fire_interval: 0.45,
            projectile_speed: 260.0,
            projectile_damage: 50.0,
            projectile_lead: 0.22,
        }
    }

    pub fn update(&mut self, dt: f32) {
        let dt = dt.clamp(0.0, 0.1);
        for entity in &mut self.entities {
            if entity.entity_type == 2 {
                entity.cooldown = (entity.cooldown - dt).max(0.0);
            }
        }
        let num_entities = self.entities.len();
        let mut hp_changes = vec![0.0; num_entities];

        for i in 0..num_entities {
            if self.entities[i].hp <= 0.0 {
                continue;
            }

            if !self.entities[i].is_static
                && self.entities[i].entity_type != 1
                && self.entities[i].entity_type != 3
            {
                self.entities[i].vy -= self.gravity * dt;
            }

            let next_x = self.entities[i].x + self.entities[i].vx * dt;
            let next_y = self.entities[i].y + self.entities[i].vy * dt;
            let next_z = self.entities[i].z + self.entities[i].vz * dt;

            let mut collision_x = false;
            let mut collision_y = false;
            let mut collision_z = false;

            for j in 0..num_entities {
                if i == j || self.entities[j].hp <= 0.0 {
                    continue;
                }

                let self_type = self.entities[i].entity_type;
                let other = &self.entities[j];
                let other_type = other.entity_type;
                let bullet_enemy_pair =
                    (self_type == 3 && other_type == 1) || (self_type == 1 && other_type == 3);
                if bullet_enemy_pair {
                    if self_type == 3
                        && Self::check_aabb_3d(
                            next_x,
                            next_y,
                            next_z,
                            self.entities[i].width,
                            self.entities[i].height,
                            self.entities[i].depth,
                            other.x,
                            other.y,
                            other.z,
                            other.width,
                            other.height,
                            other.depth,
                        )
                    {
                        hp_changes[j] -= self.projectile_damage
                            * self.entities[i].damage_multiplier.clamp(0.1, 5.0);
                        hp_changes[i] -= 999.0;
                    }
                    continue;
                }
                if self_type == 3 || other_type == 3 {
                    continue;
                }

                if other.entity_type != 0
                    && Self::check_aabb_3d(
                        next_x,
                        self.entities[i].y,
                        self.entities[i].z,
                        self.entities[i].width,
                        self.entities[i].height,
                        self.entities[i].depth,
                        other.x,
                        other.y,
                        other.z,
                        other.width,
                        other.height,
                        other.depth,
                    )
                {
                    collision_x = true;
                }
                if Self::check_aabb_3d(
                    self.entities[i].x,
                    next_y,
                    self.entities[i].z,
                    self.entities[i].width,
                    self.entities[i].height,
                    self.entities[i].depth,
                    other.x,
                    other.y,
                    other.z,
                    other.width,
                    other.height,
                    other.depth,
                ) {
                    collision_y = true;
                }
                if other.entity_type != 0
                    && Self::check_aabb_3d(
                        self.entities[i].x,
                        self.entities[i].y,
                        next_z,
                        self.entities[i].width,
                        self.entities[i].height,
                        self.entities[i].depth,
                        other.x,
                        other.y,
                        other.z,
                        other.width,
                        other.height,
                        other.depth,
                    )
                {
                    collision_z = true;
                }
            }

            if self.entities[i].is_static {
                continue;
            }

            let half_bounds = self.bounds_size / 2.0;

            // 物理反弹与边界约束
            if collision_x || next_x.abs() + self.entities[i].width / 2.0 > half_bounds {
                self.entities[i].vx *= -0.8;
                if next_x > 0.0 {
                    self.entities[i].x = half_bounds - self.entities[i].width / 2.0 - 0.1;
                } else {
                    self.entities[i].x = -half_bounds + self.entities[i].width / 2.0 + 0.1;
                }
            } else {
                self.entities[i].x = next_x;
            }

            if collision_y
                || next_y + self.entities[i].height / 2.0 > half_bounds
                || next_y - self.entities[i].height / 2.0 < -half_bounds
            {
                self.entities[i].vy *= -0.6;
                if self.entities[i].vy.abs() < 30.0 {
                    self.entities[i].vy = 0.0;
                }
                if next_y - self.entities[i].height / 2.0 < -half_bounds {
                    self.entities[i].y = -half_bounds + self.entities[i].height / 2.0 + 0.1;
                }
            } else {
                self.entities[i].y = next_y;
            }

            if collision_z || next_z.abs() + self.entities[i].depth / 2.0 > half_bounds {
                self.entities[i].vz *= -0.8;
                if next_z > 0.0 {
                    self.entities[i].z = half_bounds - self.entities[i].depth / 2.0 - 0.1;
                } else {
                    self.entities[i].z = -half_bounds + self.entities[i].depth / 2.0 + 0.1;
                }
            } else {
                self.entities[i].z = next_z;
            }
        }

        // 结算伤害并移除死亡实体
        for i in 0..num_entities {
            self.entities[i].hp += hp_changes[i];
        }
        self.entities.retain(|e| e.hp > 0.0);

        self.auto_fire_towers();
    }

    fn check_aabb_3d(
        x1: f32,
        y1: f32,
        z1: f32,
        w1: f32,
        h1: f32,
        d1: f32,
        x2: f32,
        y2: f32,
        z2: f32,
        w2: f32,
        h2: f32,
        d2: f32,
    ) -> bool {
        (x1 - x2).abs() * 2.0 < (w1 + w2)
            && (y1 - y2).abs() * 2.0 < (h1 + h2)
            && (z1 - z2).abs() * 2.0 < (d1 + d2)
    }

    pub fn get_render_data(&self) -> String {
        serde_json::to_string(&self.entities).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn add_entity(
        &mut self,
        x: f32,
        y: f32,
        z: f32,
        color: String,
        vx: f32,
        vy: f32,
        vz: f32,
        entity_type: u32,
    ) -> u32 {
        self.push_entity(x, y, z, color, vx, vy, vz, entity_type)
    }

    pub fn build_tower(&mut self, x: f32, z: f32) -> u32 {
        self.build_tower_variant(
            x,
            z,
            1.0,
            1.0,
            1.0,
            1.0,
            "#22C55E".to_string(),
        )
    }

    pub fn build_tower_variant(
        &mut self,
        x: f32,
        z: f32,
        range_multiplier: f32,
        fire_interval_multiplier: f32,
        damage_multiplier: f32,
        scale: f32,
        color: String,
    ) -> u32 {
        let scale = scale.clamp(0.65, 1.7);
        self.push_entity_with_stats(
            x,
            self.ground_y() + 30.0 * scale,
            z,
            Self::normalize_color(&color),
            0.0,
            0.0,
            0.0,
            2,
            20.0 * scale,
            60.0 * scale,
            20.0 * scale,
            500.0,
            range_multiplier.clamp(0.35, 2.6),
            fire_interval_multiplier.clamp(0.3, 3.0),
            damage_multiplier.clamp(0.2, 4.0),
            0.0,
        )
    }

    pub fn spawn_enemy(&mut self, x: f32, z: f32, vx: f32, vz: f32) -> u32 {
        self.spawn_enemy_variant(x, z, vx, vz, 100.0, 1.0, "#EF4444".to_string())
    }

    pub fn spawn_enemy_variant(
        &mut self,
        x: f32,
        z: f32,
        vx: f32,
        vz: f32,
        hp: f32,
        scale: f32,
        color: String,
    ) -> u32 {
        let (vx, vz) = if vx.abs() + vz.abs() < 0.01 {
            let dx = -x;
            let dz = -z;
            let len = (dx * dx + dz * dz).sqrt().max(1.0);
            (dx / len * 42.0, dz / len * 42.0)
        } else {
            (vx, vz)
        };
        let scale = scale.clamp(0.65, 1.8);
        self.push_entity_with_stats(
            x,
            self.ground_y() + 15.0,
            z,
            Self::normalize_color(&color),
            vx,
            0.0,
            vz,
            1,
            30.0 * scale,
            30.0 * scale,
            30.0 * scale,
            hp.clamp(10.0, 1000.0),
            1.0,
            1.0,
            1.0,
            0.0,
        )
    }

    pub fn explode_entity(&mut self, entity_id: u32, force: f32) {
        let Some(target) = self.entities.iter().find(|e| e.id == entity_id).cloned() else {
            return;
        };
        let radius = force.max(40.0);
        for entity in &mut self.entities {
            if entity.is_static || entity.id == target.id {
                continue;
            }
            let dx = entity.x - target.x;
            let dy = entity.y - target.y;
            let dz = entity.z - target.z;
            let dist_sq = dx * dx + dy * dy + dz * dz;
            if dist_sq > radius * radius {
                continue;
            }
            let dist = dist_sq.sqrt().max(1.0);
            let impulse = (1.0 - dist / radius).max(0.15) * force;
            entity.vx += dx / dist * impulse;
            entity.vy += dy / dist * impulse + impulse * 0.35;
            entity.vz += dz / dist * impulse;
            if entity.entity_type == 1 {
                entity.hp -= force * 0.18;
            }
        }
        if let Some(entity) = self
            .entities
            .iter_mut()
            .find(|e| e.id == entity_id && e.entity_type == 1)
        {
            entity.hp -= force * 0.35;
        }
        self.entities.retain(|e| e.hp > 0.0);
    }

    pub fn damage_entity(&mut self, entity_id: u32, amount: f32) -> bool {
        let Some(entity) = self.entities.iter_mut().find(|e| e.id == entity_id) else {
            return false;
        };
        entity.hp -= amount.max(0.0);
        self.entities.retain(|e| e.hp > 0.0);
        true
    }

    pub fn clear_dynamic_entities(&mut self) {
        self.entities.retain(|e| e.entity_type == 0);
        self.next_id = self.entities.iter().map(|e| e.id).max().unwrap_or(0) + 1;
    }

    pub fn set_gravity(&mut self, gravity: f32) {
        self.gravity = gravity.clamp(0.0, 2000.0);
    }

    pub fn set_combat_tuning(
        &mut self,
        tower_range: f32,
        tower_fire_interval: f32,
        projectile_speed: f32,
        projectile_damage: f32,
        projectile_lead: f32,
    ) {
        self.tower_range = tower_range.clamp(60.0, self.bounds_size);
        self.tower_fire_interval = tower_fire_interval.clamp(0.12, 2.0);
        self.projectile_speed = projectile_speed.clamp(80.0, 900.0);
        self.projectile_damage = projectile_damage.clamp(1.0, 500.0);
        self.projectile_lead = projectile_lead.clamp(0.0, 0.8);
    }

    pub fn apply_render_data(&mut self, render_data_json: String) -> bool {
        let Ok(updates) = serde_json::from_str::<Vec<EntityRenderData>>(&render_data_json) else {
            return false;
        };
        let half_bounds = self.bounds_size / 2.0;
        for update in updates {
            let Some(entity) = self.entities.iter_mut().find(|e| e.id == update.id) else {
                continue;
            };
            entity.color = Self::normalize_color(&update.color);
            entity.range_multiplier = update.range_multiplier.clamp(0.35, 2.6);
            entity.fire_interval_multiplier = update.fire_interval_multiplier.clamp(0.3, 3.0);
            entity.damage_multiplier = update.damage_multiplier.clamp(0.1, 5.0);
            entity.cooldown = update.cooldown.clamp(0.0, 8.0);
            if entity.is_static {
                continue;
            }
            entity.x = update.x.clamp(
                -half_bounds + entity.width / 2.0,
                half_bounds - entity.width / 2.0,
            );
            entity.y = update.y.clamp(
                -half_bounds + entity.height / 2.0,
                half_bounds - entity.height / 2.0,
            );
            entity.z = update.z.clamp(
                -half_bounds + entity.depth / 2.0,
                half_bounds - entity.depth / 2.0,
            );
            entity.vx = update.vx.clamp(-800.0, 800.0);
            entity.vy = update.vy.clamp(-800.0, 800.0);
            entity.vz = update.vz.clamp(-800.0, 800.0);
            entity.hp = update.hp.clamp(0.0, entity.max_hp);
        }
        self.entities.retain(|e| e.hp > 0.0);
        true
    }

    pub fn entity_count(&self) -> u32 {
        self.entities.len() as u32
    }

    pub fn generate_runtime_scene(
        &self,
        seed: u32,
        player_level: u32,
        difficulty: u32,
        theme_hint: String,
        modules_json: String,
    ) -> String {
        let modules = serde_json::from_str::<Vec<String>>(&modules_json).unwrap_or_default();
        let scene = engine_generate_runtime_scene(EngineRuntimeSceneRequest {
            seed: seed as u64,
            player_level,
            difficulty,
            theme_hint,
            modules,
        });
        serde_json::to_string(&RuntimeSceneJson::from(scene))
            .unwrap_or_else(|_| String::from(r#"{"error":"serialize runtime scene"}"#))
    }

    fn push_entity(
        &mut self,
        x: f32,
        y: f32,
        z: f32,
        color: String,
        vx: f32,
        vy: f32,
        vz: f32,
        entity_type: u32,
    ) -> u32 {
        let (width, height, depth, hp) = match entity_type {
            1 => (30.0, 30.0, 30.0, 100.0), // Enemy (敌人方块)
            2 => (20.0, 60.0, 20.0, 500.0), // Tower (防御塔)
            3 => (10.0, 10.0, 10.0, 1.0),   // Bullet (子弹)
            _ => (30.0, 30.0, 30.0, 100.0), // Default
        };
        self.push_entity_with_stats(
            x,
            y,
            z,
            color,
            vx,
            vy,
            vz,
            entity_type,
            width,
            height,
            depth,
            hp,
            1.0,
            1.0,
            1.0,
            0.0,
        )
    }

    fn push_entity_with_stats(
        &mut self,
        x: f32,
        y: f32,
        z: f32,
        color: String,
        vx: f32,
        vy: f32,
        vz: f32,
        entity_type: u32,
        width: f32,
        height: f32,
        depth: f32,
        hp: f32,
        range_multiplier: f32,
        fire_interval_multiplier: f32,
        damage_multiplier: f32,
        cooldown: f32,
    ) -> u32 {
        let id = self.next_id;
        self.next_id += 1;

        self.entities.push(EntityRenderData {
            id,
            entity_type,
            hp,
            max_hp: hp,
            x,
            y,
            z,
            width,
            height,
            depth,
            color,
            vx,
            vy,
            vz,
            is_static: entity_type == 2, // 防御塔是静态的
            range_multiplier,
            fire_interval_multiplier,
            damage_multiplier,
            cooldown,
        });
        id
    }

    fn auto_fire_towers(&mut self) {
        let towers: Vec<EntityRenderData> = self
            .entities
            .iter()
            .filter(|entity| entity.entity_type == 2 && entity.hp > 0.0 && entity.cooldown <= 0.0)
            .cloned()
            .collect();
        let enemies: Vec<EntityRenderData> = self
            .entities
            .iter()
            .filter(|entity| entity.entity_type == 1 && entity.hp > 0.0)
            .cloned()
            .collect();
        let mut bullets = Vec::new();
        let mut cooldown_updates = Vec::new();

        for tower in towers {
            let tower_range = self.tower_range * tower.range_multiplier.clamp(0.35, 2.6);
            let range_sq = tower_range * tower_range;
            let nearest = enemies
                .iter()
                .filter_map(|enemy| {
                    let dx = enemy.x - tower.x;
                    let dz = enemy.z - tower.z;
                    let dist_sq = dx * dx + dz * dz;
                    if dist_sq <= range_sq {
                        Some((enemy, dist_sq))
                    } else {
                        None
                    }
                })
                .min_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            let Some((enemy, _)) = nearest else {
                continue;
            };
            let muzzle_y = tower.y + 35.0;
            let initial_dx = enemy.x - tower.x;
            let initial_dy = enemy.y - muzzle_y;
            let initial_dz = enemy.z - tower.z;
            let initial_distance =
                (initial_dx * initial_dx + initial_dy * initial_dy + initial_dz * initial_dz)
                    .sqrt()
                    .max(1.0);
            let speed = self.projectile_speed;
            let lead_seconds = initial_distance / speed * self.projectile_lead;
            let target_x = enemy.x + enemy.vx * lead_seconds;
            let target_y = enemy.y + enemy.vy * lead_seconds;
            let target_z = enemy.z + enemy.vz * lead_seconds;
            let dx = target_x - tower.x;
            let dy = target_y - muzzle_y;
            let dz = target_z - tower.z;
            let len = (dx * dx + dy * dy + dz * dz).sqrt().max(1.0);
            bullets.push((
                tower.x,
                muzzle_y,
                tower.z,
                "#F8E16C".to_string(),
                dx / len * speed,
                dy / len * speed,
                dz / len * speed,
                tower.damage_multiplier.clamp(0.2, 4.0),
            ));
            let cooldown = (self.tower_fire_interval
                * tower.fire_interval_multiplier.clamp(0.3, 3.0))
                .clamp(0.08, 6.0);
            cooldown_updates.push((tower.id, cooldown));
        }

        for (tower_id, cooldown) in cooldown_updates {
            if let Some(tower) = self.entities.iter_mut().find(|entity| entity.id == tower_id) {
                tower.cooldown = cooldown;
            }
        }

        for (x, y, z, color, vx, vy, vz, damage_multiplier) in bullets {
            self.push_entity_with_stats(
                x,
                y,
                z,
                color,
                vx,
                vy,
                vz,
                3,
                10.0,
                10.0,
                10.0,
                1.0,
                1.0,
                1.0,
                damage_multiplier,
                0.0,
            );
        }
    }

    fn ground_y(&self) -> f32 {
        -self.bounds_size / 2.0
    }

    fn normalize_color(color: &str) -> String {
        if color.len() == 7 && color.starts_with('#') {
            color.to_ascii_uppercase()
        } else {
            "#FFFFFF".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entities(engine: &GameEngine) -> Vec<EntityRenderData> {
        serde_json::from_str(&engine.get_render_data()).unwrap()
    }

    #[test]
    fn build_tower_and_spawn_enemy_return_stable_ids() {
        let mut engine = GameEngine::new(400.0);
        let tower_id = engine.build_tower(10.0, -20.0);
        let enemy_id = engine.spawn_enemy(180.0, 0.0, 0.0, 0.0);

        assert_eq!(tower_id, 2);
        assert_eq!(enemy_id, 3);
        assert_eq!(engine.entity_count(), 3);

        let data = entities(&engine);
        assert!(data
            .iter()
            .any(|entity| entity.id == tower_id && entity.entity_type == 2));
        assert!(data
            .iter()
            .any(|entity| entity.id == enemy_id && entity.entity_type == 1 && entity.vx < 0.0));
    }

    #[test]
    fn spawn_enemy_variant_applies_generated_stats() {
        let mut engine = GameEngine::new(400.0);
        let enemy_id = engine.spawn_enemy_variant(
            120.0,
            0.0,
            -55.0,
            8.0,
            180.0,
            1.35,
            "#00ffaa".to_string(),
        );

        let data = entities(&engine);
        let enemy = data.iter().find(|entity| entity.id == enemy_id).unwrap();
        assert_eq!(enemy.entity_type, 1);
        assert_eq!(enemy.hp, 180.0);
        assert_eq!(enemy.max_hp, 180.0);
        assert_eq!(enemy.width, 40.5);
        assert_eq!(enemy.height, 40.5);
        assert_eq!(enemy.color, "#00FFAA");
        assert_eq!(enemy.vx, -55.0);
        assert_eq!(enemy.vz, 8.0);
    }

    #[test]
    fn build_tower_variant_applies_generated_combat_stats() {
        let mut engine = GameEngine::new(400.0);
        let tower_id = engine.build_tower_variant(
            10.0,
            -20.0,
            1.35,
            0.7,
            1.8,
            1.25,
            "#00ffaa".to_string(),
        );

        let data = entities(&engine);
        let tower = data.iter().find(|entity| entity.id == tower_id).unwrap();
        assert_eq!(tower.entity_type, 2);
        assert_eq!(tower.color, "#00FFAA");
        assert_eq!(tower.width, 25.0);
        assert_eq!(tower.height, 75.0);
        assert_eq!(tower.range_multiplier, 1.35);
        assert_eq!(tower.fire_interval_multiplier, 0.7);
        assert_eq!(tower.damage_multiplier, 1.8);
        assert_eq!(tower.cooldown, 0.0);
    }

    #[test]
    fn apply_render_data_mutates_real_engine_state() {
        let mut engine = GameEngine::new(400.0);
        let enemy_id = engine.spawn_enemy(100.0, 0.0, 0.0, 0.0);
        let mut data = entities(&engine);
        let enemy = data
            .iter_mut()
            .find(|entity| entity.id == enemy_id)
            .unwrap();
        enemy.vx = -123.0;
        enemy.vz = 45.0;
        enemy.color = "#00ffaa".to_string();
        enemy.hp = 20.0;

        assert!(engine.apply_render_data(serde_json::to_string(&data).unwrap()));

        let data = entities(&engine);
        let enemy = data.iter().find(|entity| entity.id == enemy_id).unwrap();
        assert_eq!(enemy.vx, -123.0);
        assert_eq!(enemy.vz, 45.0);
        assert_eq!(enemy.color, "#00FFAA");
        assert_eq!(enemy.hp, 20.0);
    }

    #[test]
    fn towers_auto_fire_at_nearby_enemies() {
        let mut engine = GameEngine::new(400.0);
        engine.build_tower(0.0, 0.0);
        engine.spawn_enemy(90.0, 0.0, -10.0, 0.0);

        engine.update(0.1);

        let data = entities(&engine);
        assert!(data.iter().any(|entity| entity.entity_type == 3));
    }

    #[test]
    fn combat_tuning_changes_tower_range_fire_rate_speed_damage_and_lead() {
        let mut engine = GameEngine::new(400.0);
        engine.set_combat_tuning(70.0, 0.1, 520.0, 25.0, 0.0);
        engine.build_tower(0.0, 0.0);
        engine.spawn_enemy(120.0, 0.0, -10.0, 0.0);

        engine.update(0.2);
        let data = entities(&engine);
        assert!(!data.iter().any(|entity| entity.entity_type == 3));

        engine.set_combat_tuning(150.0, 0.1, 520.0, 25.0, 0.0);
        engine.update(0.1);
        let data = entities(&engine);
        let bullet = data.iter().find(|entity| entity.entity_type == 3).unwrap();
        let bullet_speed =
            (bullet.vx * bullet.vx + bullet.vy * bullet.vy + bullet.vz * bullet.vz).sqrt();
        assert!((bullet_speed - 520.0).abs() < 0.5);
        assert!(bullet.vz.abs() < 0.1);

        let mut lead_engine = GameEngine::new(400.0);
        lead_engine.set_combat_tuning(150.0, 0.1, 300.0, 25.0, 0.8);
        lead_engine.build_tower(0.0, 0.0);
        lead_engine.spawn_enemy(120.0, 0.0, 0.0, 80.0);
        lead_engine.update(0.1);
        lead_engine.update(0.1);
        let data = entities(&lead_engine);
        let lead_bullet = data.iter().find(|entity| entity.entity_type == 3).unwrap();
        assert!(lead_bullet.vz > 45.0);

        let mut damage_engine = GameEngine::new(400.0);
        damage_engine.set_combat_tuning(150.0, 0.1, 320.0, 25.0, 0.0);
        let enemy_id = damage_engine.spawn_enemy(20.0, 0.0, 0.0, 0.0);
        let bullet_id = damage_engine.add_entity(20.0, -185.0, 0.0, "#F8E16C".to_string(), 0.0, 0.0, 0.0, 3);
        let mut data = entities(&damage_engine);
        let bullet = data.iter_mut().find(|entity| entity.id == bullet_id).unwrap();
        bullet.damage_multiplier = 2.0;
        assert!(damage_engine.apply_render_data(serde_json::to_string(&data).unwrap()));
        damage_engine.update(0.01);
        let data = entities(&damage_engine);
        let enemy = data.iter().find(|entity| entity.id == enemy_id).unwrap();
        assert_eq!(enemy.hp, 50.0);
    }

    #[test]
    fn tower_archetype_stats_change_range_fire_rate_and_projectile_damage() {
        let mut range_engine = GameEngine::new(400.0);
        range_engine.set_combat_tuning(100.0, 0.2, 300.0, 20.0, 0.0);
        range_engine.build_tower_variant(0.0, 0.0, 0.5, 1.0, 1.0, 1.0, "#22C55E".to_string());
        range_engine.spawn_enemy(70.0, 0.0, 0.0, 0.0);
        range_engine.update(0.1);
        let data = entities(&range_engine);
        assert!(!data.iter().any(|entity| entity.entity_type == 3));

        let mut damage_engine = GameEngine::new(400.0);
        damage_engine.set_combat_tuning(150.0, 0.2, 300.0, 20.0, 0.0);
        damage_engine.build_tower_variant(0.0, 0.0, 1.4, 1.8, 2.5, 1.1, "#00ffaa".to_string());
        damage_engine.spawn_enemy(40.0, 0.0, 0.0, 0.0);
        damage_engine.update(0.1);
        let data = entities(&damage_engine);
        let tower = data.iter().find(|entity| entity.entity_type == 2).unwrap();
        let bullet = data.iter().find(|entity| entity.entity_type == 3).unwrap();
        assert!((tower.cooldown - 0.36).abs() < 0.02);
        assert_eq!(bullet.damage_multiplier, 2.5);
    }

    #[test]
    fn explosion_damages_enemy_and_pushes_neighbors() {
        let mut engine = GameEngine::new(400.0);
        let enemy_id = engine.spawn_enemy(50.0, 0.0, 0.0, 0.0);
        let neighbor_id = engine.spawn_enemy(70.0, 0.0, 0.0, 0.0);

        engine.explode_entity(enemy_id, 120.0);

        let data = entities(&engine);
        let enemy = data.iter().find(|entity| entity.id == enemy_id).unwrap();
        let neighbor = data.iter().find(|entity| entity.id == neighbor_id).unwrap();
        assert!(enemy.hp < enemy.max_hp);
        assert!(neighbor.vx.abs() > 0.0 || neighbor.vz.abs() > 0.0);
    }

    #[test]
    fn clear_dynamic_entities_preserves_ground_only() {
        let mut engine = GameEngine::new(400.0);
        engine.build_tower(0.0, 0.0);
        engine.spawn_enemy(100.0, 0.0, 0.0, 0.0);

        engine.clear_dynamic_entities();

        let data = entities(&engine);
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].entity_type, 0);
    }

    #[test]
    fn generate_runtime_scene_delegates_to_cocos4_rust() {
        let engine = GameEngine::new(400.0);
        let out = engine.generate_runtime_scene(
            42,
            6,
            5,
            "space nebula".to_string(),
            r#"["tower_defense","parkour"]"#.to_string(),
        );
        let json: serde_json::Value = serde_json::from_str(&out).unwrap();

        assert_eq!(json["biome"], "orbital-garden");
        assert_eq!(json["modules"][0], "tower_defense");
        assert!(json["lanes"].as_array().unwrap().len() >= 2);
        assert!(json["wavePlan"].as_array().unwrap().len() >= 4);
        assert!(json["wavePlan"][0]["count"].as_u64().unwrap() >= 2);
        assert!(json["wavePlan"][0]["warningTime"].as_f64().unwrap() > 0.0);
        assert!(json["logicSource"]
            .as_str()
            .unwrap()
            .contains("Generated runtime logic"));
        assert_eq!(json["towerArchetypes"].as_array().unwrap().len(), 3);
        assert!(json["towerArchetypes"][0]["rangeMultiplier"].as_f64().unwrap() > 0.0);
        assert!(json["towerArchetypes"][0]["buildCost"].as_u64().unwrap() > 0);
        assert_eq!(
            json["buildHints"].as_array().unwrap().len(),
            json["towerAnchors"].as_array().unwrap().len()
        );
        assert!(json["buildHints"][0]["anchorIndex"].as_u64().unwrap() < json["towerAnchors"].as_array().unwrap().len() as u64);
        assert!(json["buildHints"][0]["priority"].as_f64().unwrap() > 0.0);
        assert!(json["buildHints"][0]["towerArchetypeId"].as_str().unwrap().len() > 0);
        assert!(json["spawn"]["enemySpeed"].as_f64().unwrap() > 0.0);
        assert!(json["tacticalFields"].as_array().unwrap().len() >= 1);
        assert!(json["tacticalFields"][0]["radius"].as_f64().unwrap() > 0.0);
        assert!(json["tacticalFields"][0]["damagePerPulse"].as_f64().unwrap() > 0.0);
        assert!(json["supportNodes"].as_array().unwrap().len() >= 1);
        assert!(json["supportNodes"][0]["scorePerPulse"].as_u64().unwrap() > 0);
        assert!(json["supportNodes"][0]["pulseDamage"].as_f64().unwrap() > 0.0);
        assert_eq!(json["enemyArchetypes"].as_array().unwrap().len(), 3);
        assert!(json["enemyArchetypes"][0]["hp"].as_f64().unwrap() > 0.0);
        assert!(json["enemyArchetypes"][0]["scoreReward"].as_u64().unwrap() > 0);
        assert!(json["bossPlan"]["hp"].as_f64().unwrap() > json["enemyArchetypes"][1]["hp"].as_f64().unwrap());
        assert!(json["bossPlan"]["triggerWave"].as_u64().unwrap() >= 2);
        assert!(json["bossPlan"]["scoreReward"].as_u64().unwrap() > json["enemyArchetypes"][1]["scoreReward"].as_u64().unwrap());
        assert!(json["bossPlan"]["auraDamage"].as_f64().unwrap() > 0.0);
        assert_eq!(json["commands"].as_array().unwrap().len(), 3);
        assert_eq!(json["commands"][0]["kind"], "lane-barrage");
        assert!(json["commands"][0]["magnitude"].as_f64().unwrap() > 0.0);
        assert!(json["commands"][1]["scoreCost"].as_u64().unwrap() > 0);
        assert!(json["commandTargeting"]["laneAssistRadius"].as_f64().unwrap() > 0.0);
        assert!(json["commandTargeting"]["reticleRadius"].as_f64().unwrap() > 0.0);
        assert!(json["commandTargeting"]["retargetCooldown"].as_f64().unwrap() > 0.0);
        assert_eq!(
            json["laneSignals"].as_array().unwrap().len(),
            json["lanes"].as_array().unwrap().len()
        );
        assert!(json["laneSignals"][0]["alertRadius"].as_f64().unwrap() > 0.0);
        assert!(json["laneSignals"][0]["beaconHeight"].as_f64().unwrap() > 0.0);
        assert!(json["setPieces"].as_array().unwrap().len() >= 2);
        assert!(json["setPieces"][0]["height"].as_f64().unwrap() > 0.0);
        assert!(json["setPieces"][0]["accentColor"].as_str().unwrap().starts_with('#'));
        assert!(json["controls"]["cameraAutoFocusStrength"].as_f64().unwrap() > 0.0);
        assert!(json["controls"]["cameraThreatLead"].as_f64().unwrap() > 0.0);
        assert!(json["controls"]["cameraManualOverride"].as_f64().unwrap() > 0.0);
        assert!(json["controls"]["cameraAlertZoom"].as_f64().unwrap() > 0.0);
        assert!(json["controls"]["blastForce"].as_f64().unwrap() > 0.0);
        assert!(json["controls"]["pointerAssistRadius"].as_f64().unwrap() > 0.0);
        assert!(json["combat"]["towerRange"].as_f64().unwrap() > 0.0);
        assert!(json["combat"]["projectileDamage"].as_f64().unwrap() > 0.0);
        assert!(json["scoring"]["comboWindow"].as_f64().unwrap() > 0.0);
        assert!(json["scoring"]["maxComboMultiplier"].as_f64().unwrap() > 1.0);
        assert!(json["scoring"]["perfectWaveBonus"].as_u64().unwrap() > 0);
        assert!(json["rules"]["steeringLerp"].as_f64().unwrap() > 0.0);
        assert!(json["rules"]["weakPointPulseForce"].as_f64().unwrap() > 0.0);
    }
}
