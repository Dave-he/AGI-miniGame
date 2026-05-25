use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct EntityRenderData {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub width: f32,
    pub height: f32,
    pub depth: f32,
    pub color: String,
    // 物理属性
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub is_static: bool,
}

#[wasm_bindgen]
pub struct GameEngine {
    entities: Vec<EntityRenderData>,
    bounds_size: f32,
    gravity: f32,
}

#[wasm_bindgen]
impl GameEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(bounds_size: f32) -> GameEngine {
        let mut entities = Vec::new();
        
        // 静态地面 (一个大的平面)
        entities.push(EntityRenderData {
            id: 1,
            x: 0.0,
            y: -bounds_size / 2.0, // 地面在最底部
            z: 0.0,
            width: bounds_size,
            height: 10.0,
            depth: bounds_size,
            color: "#666666".to_string(),
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            is_static: true,
        });

        GameEngine {
            entities,
            bounds_size,
            gravity: 980.0, // 保持重力向下 (y轴负方向)
        }
    }

    pub fn update(&mut self, dt: f32) {
        let num_entities = self.entities.len();
        
        for i in 0..num_entities {
            if self.entities[i].is_static {
                continue;
            }
            
            // 施加重力 (Y轴向下)
            self.entities[i].vy -= self.gravity * dt;
            
            // 预测下一帧位置
            let next_x = self.entities[i].x + self.entities[i].vx * dt;
            let next_y = self.entities[i].y + self.entities[i].vy * dt;
            let next_z = self.entities[i].z + self.entities[i].vz * dt;
            
            let mut collision_x = false;
            let mut collision_y = false;
            let mut collision_z = false;
            
            // 简单的 3D AABB 碰撞检测
            for j in 0..num_entities {
                if i == j { continue; }
                
                let other = &self.entities[j];
                
                // 检查 X 轴碰撞
                if Self::check_aabb_3d(next_x, self.entities[i].y, self.entities[i].z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_x = true;
                }
                
                // 检查 Y 轴碰撞
                if Self::check_aabb_3d(self.entities[i].x, next_y, self.entities[i].z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_y = true;
                }
                
                // 检查 Z 轴碰撞
                if Self::check_aabb_3d(self.entities[i].x, self.entities[i].y, next_z, self.entities[i].width, self.entities[i].height, self.entities[i].depth,
                                     other.x, other.y, other.z, other.width, other.height, other.depth) {
                    collision_z = true;
                }
            }
            
            let half_bounds = self.bounds_size / 2.0;
            
            // 处理 X 轴边界与碰撞
            if collision_x || next_x.abs() + self.entities[i].width / 2.0 > half_bounds {
                self.entities[i].vx *= -0.8;
                // 限制在边界内
                if next_x > 0.0 {
                    self.entities[i].x = half_bounds - self.entities[i].width / 2.0 - 0.1;
                } else {
                    self.entities[i].x = -half_bounds + self.entities[i].width / 2.0 + 0.1;
                }
            } else {
                self.entities[i].x = next_x;
            }
            
            // 处理 Y 轴边界与碰撞
            if collision_y || next_y + self.entities[i].height / 2.0 > half_bounds || next_y - self.entities[i].height / 2.0 < -half_bounds {
                self.entities[i].vy *= -0.6;
                if self.entities[i].vy.abs() < 30.0 {
                    self.entities[i].vy = 0.0;
                }
                // 如果落到最低点，强制位置贴地
                if next_y - self.entities[i].height / 2.0 < -half_bounds {
                     self.entities[i].y = -half_bounds + self.entities[i].height / 2.0 + 0.1;
                }
            } else {
                self.entities[i].y = next_y;
            }
            
            // 处理 Z 轴边界与碰撞
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
    }
    
    // 3D AABB 碰撞检测 (基于中心点)
    fn check_aabb_3d(x1: f32, y1: f32, z1: f32, w1: f32, h1: f32, d1: f32, x2: f32, y2: f32, z2: f32, w2: f32, h2: f32, d2: f32) -> bool {
        (x1 - x2).abs() * 2.0 < (w1 + w2) &&
        (y1 - y2).abs() * 2.0 < (h1 + h2) &&
        (z1 - z2).abs() * 2.0 < (d1 + d2)
    }

    pub fn get_render_data(&self) -> String {
        serde_json::to_string(&self.entities).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn add_entity(&mut self, x: f32, y: f32, z: f32, color: String, vx: f32, vy: f32, vz: f32) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y,
            z,
            width: 30.0,
            height: 30.0,
            depth: 30.0,
            color,
            vx,
            vy,
            vz,
            is_static: false,
        });
    }

    pub fn add_static_entity(&mut self, x: f32, y: f32, z: f32, w: f32, h: f32, d: f32, color: String) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y,
            z,
            width: w,
            height: h,
            depth: d,
            color,
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            is_static: true,
        });
    }

    // ---------------------------------------------------------
    // 扩展玩法层 API (例如：塔防/三消 等 ECS 操作)
    // ---------------------------------------------------------
    
    pub fn spawn_tower(&mut self, x: f32, z: f32) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y: 0.0, // 放置在地表
            z,
            width: 5.0,
            height: 15.0,
            depth: 5.0,
            color: "#00FF00".to_string(), // 绿色代表防御塔
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            is_static: true,
        });
    }

    pub fn spawn_monster(&mut self, x: f32, z: f32, vx: f32, vz: f32) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y: 2.0, // 稍微高出地表
            z,
            width: 4.0,
            height: 4.0,
            depth: 4.0,
            color: "#FF0000".to_string(), // 红色代表怪物
            vx,
            vy: 0.0,
            vz,
            is_static: false,
        });
    }
}
