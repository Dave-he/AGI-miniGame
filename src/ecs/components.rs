use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transform2D {
    pub x: f32,
    pub y: f32,
    pub scale: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Health {
    pub current: i32,
    pub max: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
}

pub struct Position { pub x: f32, pub y: f32 }
pub struct Velocity { pub vx: f32, pub vy: f32 }

pub struct Collider { pub radius: f32 }

#[derive(Clone, Debug, PartialEq)]
pub enum MemeType { Fire, Speed, Life }

pub struct MemeDrop { pub meme_type: MemeType }
