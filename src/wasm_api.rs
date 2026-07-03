use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

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
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct EngineTelemetry {
    pub frame_count: u64,
    pub total_elapsed_secs: f32,
    pub last_dt: f32,
    pub bounds_size: f32,
    pub entity_count: u32,
    pub dynamic_entity_count: u32,
    pub static_entity_count: u32,
    pub last_collision_count: u32,
    pub total_collision_count: u64,
    pub last_removed_count: u32,
    pub total_removed_count: u64,
    pub total_spawned_count: u32,
    pub average_speed: f32,
    pub max_speed: f32,
}

#[wasm_bindgen]
pub struct GameEngine {
    entities: Vec<EntityRenderData>,
    bounds_size: f32,
    gravity: f32,
    next_id: u32,
    telemetry: EngineTelemetry,
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
            hp: 9999.0, max_hp: 9999.0,
            x: 0.0, y: -bounds_size / 2.0, z: 0.0,
            width: bounds_size, height: 10.0, depth: bounds_size,
            color: "#666666".to_string(),
            vx: 0.0, vy: 0.0, vz: 0.0,
            is_static: true,
        });

        let mut engine = GameEngine {
            entities,
            bounds_size,
            gravity: 980.0,
            next_id: 2,
            telemetry: EngineTelemetry {
                bounds_size,
                total_spawned_count: 1,
                ..EngineTelemetry::default()
            },
        };
        engine.refresh_entity_telemetry();
        engine
    }

    pub fn update(&mut self, dt: f32) {
        let num_entities = self.entities.len();
        let mut hp_changes = vec![0.0; num_entities];
        let mut collision_count: u32 = 0;
        
        for i in 0..num_entities {
            if self.entities[i].hp <= 0.0 { continue; }
            
            if !self.entities[i].is_static {
                // 施加重力
                self.entities[i].vy -= self.gravity * dt;
            }
            
            let next_x = self.entities[i].x + self.entities[i].vx * dt;
            let next_y = self.entities[i].y + self.entities[i].vy * dt;
            let next_z = self.entities[i].z + self.entities[i].vz * dt;
            
            let mut collision_x = false;
            let mut collision_y = false;
            let mut collision_z = false;
            
            for j in 0..num_entities {
                if i == j || self.entities[j].hp <= 0.0 { continue; }
                
                let other = &self.entities[j];
                let is_bullet_hitting_enemy = self.entities[i].entity_type == 3 && other.entity_type == 1;
                
                if Self::check_aabb_3d(next_x, self.entities[i].y, self.entities[i].z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_x = true;
                    collision_count += 1;
                    if is_bullet_hitting_enemy { hp_changes[j] -= 50.0; hp_changes[i] -= 999.0; }
                }
                if Self::check_aabb_3d(self.entities[i].x, next_y, self.entities[i].z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_y = true;
                    collision_count += 1;
                    if is_bullet_hitting_enemy { hp_changes[j] -= 50.0; hp_changes[i] -= 999.0; }
                }
                if Self::check_aabb_3d(self.entities[i].x, self.entities[i].y, next_z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_z = true;
                    collision_count += 1;
                    if is_bullet_hitting_enemy { hp_changes[j] -= 50.0; hp_changes[i] -= 999.0; }
                }
            }
            
            if self.entities[i].is_static { continue; }
            
            let half_bounds = self.bounds_size / 2.0;
            
            // 物理反弹与边界约束
            let boundary_x = next_x.abs() + self.entities[i].width / 2.0 > half_bounds;
            if collision_x || boundary_x {
                if boundary_x { collision_count += 1; }
                self.entities[i].vx *= -0.8;
                if next_x > 0.0 { self.entities[i].x = half_bounds - self.entities[i].width / 2.0 - 0.1; }
                else { self.entities[i].x = -half_bounds + self.entities[i].width / 2.0 + 0.1; }
            } else { self.entities[i].x = next_x; }
            
            let boundary_y = next_y + self.entities[i].height / 2.0 > half_bounds || next_y - self.entities[i].height / 2.0 < -half_bounds;
            if collision_y || boundary_y {
                if boundary_y { collision_count += 1; }
                self.entities[i].vy *= -0.6;
                if self.entities[i].vy.abs() < 30.0 { self.entities[i].vy = 0.0; }
                if next_y - self.entities[i].height / 2.0 < -half_bounds { self.entities[i].y = -half_bounds + self.entities[i].height / 2.0 + 0.1; }
            } else { self.entities[i].y = next_y; }
            
            let boundary_z = next_z.abs() + self.entities[i].depth / 2.0 > half_bounds;
            if collision_z || boundary_z {
                if boundary_z { collision_count += 1; }
                self.entities[i].vz *= -0.8;
                if next_z > 0.0 { self.entities[i].z = half_bounds - self.entities[i].depth / 2.0 - 0.1; }
                else { self.entities[i].z = -half_bounds + self.entities[i].depth / 2.0 + 0.1; }
            } else { self.entities[i].z = next_z; }
        }
        
        // 结算伤害并移除死亡实体
        for i in 0..num_entities {
            self.entities[i].hp += hp_changes[i];
        }
        let before_retain = self.entities.len();
        self.entities.retain(|e| e.hp > 0.0);
        let removed_count = before_retain.saturating_sub(self.entities.len()) as u32;

        self.telemetry.frame_count += 1;
        self.telemetry.total_elapsed_secs += dt.max(0.0);
        self.telemetry.last_dt = dt;
        self.telemetry.last_collision_count = collision_count;
        self.telemetry.total_collision_count += collision_count as u64;
        self.telemetry.last_removed_count = removed_count;
        self.telemetry.total_removed_count += removed_count as u64;
        self.refresh_entity_telemetry();
    }
    
    fn check_aabb_3d(x1: f32, y1: f32, z1: f32, w1: f32, h1: f32, d1: f32, x2: f32, y2: f32, z2: f32, w2: f32, h2: f32, d2: f32) -> bool {
        (x1 - x2).abs() * 2.0 < (w1 + w2) &&
        (y1 - y2).abs() * 2.0 < (h1 + h2) &&
        (z1 - z2).abs() * 2.0 < (d1 + d2)
    }

    pub fn get_render_data(&self) -> String {
        serde_json::to_string(&self.entities).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_telemetry_json(&self) -> String {
        serde_json::to_string(&self.telemetry).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn clear_dynamic_entities(&mut self) -> u32 {
        let before_retain = self.entities.len();
        self.entities.retain(|entity| entity.is_static);
        let removed_count = before_retain.saturating_sub(self.entities.len()) as u32;
        self.telemetry.last_removed_count = removed_count;
        self.telemetry.total_removed_count += removed_count as u64;
        self.telemetry.last_collision_count = 0;
        self.refresh_entity_telemetry();
        removed_count
    }

    pub fn reset_scene_entities(&mut self) -> u32 {
        let before_retain = self.entities.len();
        self.entities.retain(|entity| entity.entity_type == 0);
        let removed_count = before_retain.saturating_sub(self.entities.len()) as u32;
        self.telemetry.last_removed_count = removed_count;
        self.telemetry.total_removed_count += removed_count as u64;
        self.telemetry.last_collision_count = 0;
        self.refresh_entity_telemetry();
        removed_count
    }

    pub fn add_entity(&mut self, x: f32, y: f32, z: f32, color: String, vx: f32, vy: f32, vz: f32, entity_type: u32) {
        let id = self.next_id;
        self.next_id += 1;
        self.telemetry.total_spawned_count += 1;
        
        let (width, height, depth, hp) = match entity_type {
            1 => (30.0, 30.0, 30.0, 100.0), // Enemy (敌人方块)
            2 => (20.0, 60.0, 20.0, 500.0), // Tower (防御塔)
            3 => (10.0, 10.0, 10.0, 1.0),   // Bullet (子弹)
            _ => (30.0, 30.0, 30.0, 100.0), // Default
        };

        self.entities.push(EntityRenderData {
            id, entity_type,
            hp, max_hp: hp,
            x, y, z,
            width, height, depth,
            color,
            vx, vy, vz,
            is_static: entity_type == 2, // 防御塔是静态的
        });
        self.refresh_entity_telemetry();
    }
}

impl GameEngine {
    fn refresh_entity_telemetry(&mut self) {
        let mut dynamic_count: u32 = 0;
        let mut static_count: u32 = 0;
        let mut total_speed = 0.0;
        let mut max_speed = 0.0;

        for entity in &self.entities {
            if entity.is_static {
                static_count += 1;
            } else {
                dynamic_count += 1;
            }

            let speed = (entity.vx * entity.vx + entity.vy * entity.vy + entity.vz * entity.vz).sqrt();
            total_speed += speed;
            if speed > max_speed {
                max_speed = speed;
            }
        }

        self.telemetry.bounds_size = self.bounds_size;
        self.telemetry.entity_count = self.entities.len() as u32;
        self.telemetry.dynamic_entity_count = dynamic_count;
        self.telemetry.static_entity_count = static_count;
        self.telemetry.average_speed = if self.entities.is_empty() {
            0.0
        } else {
            total_speed / self.entities.len() as f32
        };
        self.telemetry.max_speed = max_speed;
    }
}
