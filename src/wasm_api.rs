use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct EntityRenderData {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub color: String,
    // 新增物理属性
    pub vx: f32,
    pub vy: f32,
    pub is_static: bool,
}

#[wasm_bindgen]
pub struct GameEngine {
    entities: Vec<EntityRenderData>,
    width: f32,
    height: f32,
    gravity: f32,
}

#[wasm_bindgen]
impl GameEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(width: f32, height: f32) -> GameEngine {
        let mut entities = Vec::new();
        // Create some initial entities (e.g., bouncing boxes)
        entities.push(EntityRenderData {
            id: 1,
            x: 50.0,
            y: 50.0,
            width: 30.0,
            height: 30.0,
            color: "#FF5733".to_string(),
            vx: 150.0,
            vy: 0.0,
            is_static: false,
        });
        
        // 静态地面
        entities.push(EntityRenderData {
            id: 2,
            x: 0.0,
            y: height - 40.0,
            width,
            height: 40.0,
            color: "#666666".to_string(),
            vx: 0.0,
            vy: 0.0,
            is_static: true,
        });

        GameEngine {
            entities,
            width,
            height,
            gravity: 980.0, // 增加重力
        }
    }

    pub fn update(&mut self, dt: f32) {
        // 简易物理引擎 (AABB 碰撞检测 + 重力)
        let num_entities = self.entities.len();
        
        for i in 0..num_entities {
            if self.entities[i].is_static {
                continue;
            }
            
            // 施加重力
            self.entities[i].vy += self.gravity * dt;
            
            // 预测下一帧位置
            let next_x = self.entities[i].x + self.entities[i].vx * dt;
            let next_y = self.entities[i].y + self.entities[i].vy * dt;
            
            let mut collision_x = false;
            let mut collision_y = false;
            
            // 简单的 AABB 碰撞检测 (与所有其他实体比较)
            for j in 0..num_entities {
                if i == j { continue; }
                
                let other = &self.entities[j];
                
                // 检查 X 轴碰撞
                if Self::check_aabb(next_x, self.entities[i].y, self.entities[i].width, self.entities[i].height,
                                  other.x, other.y, other.width, other.height) {
                    collision_x = true;
                }
                
                // 检查 Y 轴碰撞
                if Self::check_aabb(self.entities[i].x, next_y, self.entities[i].width, self.entities[i].height,
                                  other.x, other.y, other.width, other.height) {
                    collision_y = true;
                }
            }
            
            // 处理 X 轴碰撞反弹
            if collision_x || next_x < 0.0 || next_x + self.entities[i].width > self.width {
                self.entities[i].vx *= -0.8; // 能量损耗
            } else {
                self.entities[i].x = next_x;
            }
            
            // 处理 Y 轴碰撞反弹
            if collision_y || next_y < 0.0 || next_y + self.entities[i].height > self.height {
                self.entities[i].vy *= -0.6; // Y轴地面摩擦与损耗
                // 避免在地面微小弹跳
                if self.entities[i].vy.abs() < 20.0 {
                    self.entities[i].vy = 0.0;
                }
            } else {
                self.entities[i].y = next_y;
            }
        }
    }
    
    // AABB 碰撞检测辅助函数
    fn check_aabb(x1: f32, y1: f32, w1: f32, h1: f32, x2: f32, y2: f32, w2: f32, h2: f32) -> bool {
        x1 < x2 + w2 &&
        x1 + w1 > x2 &&
        y1 < y2 + h2 &&
        y1 + h1 > y2
    }

    pub fn get_render_data(&self) -> String {
        serde_json::to_string(&self.entities).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn add_entity(&mut self, x: f32, y: f32, color: String, vx: f32, vy: f32) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y,
            width: 25.0,
            height: 25.0,
            color,
            vx,
            vy,
            is_static: false,
        });
    }
    
    pub fn add_static_entity(&mut self, x: f32, y: f32, w: f32, h: f32, color: String) {
        let new_id = self.entities.len() as u32 + 1;
        self.entities.push(EntityRenderData {
            id: new_id,
            x,
            y,
            width: w,
            height: h,
            color,
            vx: 0.0,
            vy: 0.0,
            is_static: true,
        });
    }
}
