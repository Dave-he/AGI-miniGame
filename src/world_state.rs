use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use cocos4_rust::base::value::{Value, ValueMap};

use crate::economy::{Currency, CurrencyType, Inventory, Wallet};
use crate::player::{PlayerProfile, PlayerProgression};
use crate::gameplay::{GameplayType, GameplayState};
use crate::dimension::DimensionBlueprint;

#[derive(Debug)]
pub struct UnifiedWorldState {
    pub player: PlayerProfile,
    pub progression: PlayerProgression,
    pub wallet: Wallet,
    pub inventory: Inventory,
    pub active_dimension: Option<ActiveDimensionInfo>,
    pub dimension_history: Vec<DimensionRecord>,
    pub shared_world: SharedWorld,
    pub global_data: ValueMap,
}

#[derive(Debug)]
pub struct ActiveDimensionInfo {
    pub dimension_id: String,
    pub gameplay_types: Vec<GameplayType>,
    pub session_start: u64,
    pub current_state: GameplayState,
}

#[derive(Debug, Clone)]
pub struct DimensionRecord {
    pub dimension_id: String,
    pub gameplay_types: Vec<GameplayType>,
    pub start_time: u64,
    pub end_time: u64,
    pub score: u64,
    pub rewards_earned: Vec<RewardInfo>,
}

#[derive(Debug, Clone)]
pub struct RewardInfo {
    pub item_id: String,
    pub quantity: u32,
}

#[derive(Debug)]
pub struct SharedWorld {
    pub world_events: Vec<WorldEvent>,
    pub global_announcements: Vec<Announcement>,
    pub season_info: Option<SeasonInfo>,
    pub world_variables: ValueMap,
}

#[derive(Debug, Clone)]
pub struct WorldEvent {
    pub event_id: String,
    pub name: String,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub is_active: bool,
    pub modifiers: ValueMap,
}

#[derive(Debug, Clone)]
pub struct Announcement {
    pub id: String,
    pub title: String,
    pub content: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone)]
pub struct SeasonInfo {
    pub season_id: String,
    pub name: String,
    pub start_date: u64,
    pub end_date: u64,
    pub theme: String,
    pub bonus_multiplier: f32,
}

impl UnifiedWorldState {
    pub fn new(player: PlayerProfile) -> Self {
        Self {
            player,
            progression: PlayerProgression::new(),
            wallet: Wallet::new(),
            inventory: Inventory::new(100),
            active_dimension: None,
            dimension_history: Vec::new(),
            shared_world: SharedWorld::new(),
            global_data: ValueMap::new(),
        }
    }

    pub fn set_active_dimension(&mut self, dimension_id: String, gameplay_types: Vec<GameplayType>, state: GameplayState) {
        self.active_dimension = Some(ActiveDimensionInfo {
            dimension_id,
            gameplay_types,
            session_start: 0,
            current_state: state,
        });
        self.progression.record_dimension_visit("current");
    }

    pub fn clear_active_dimension(&mut self) -> Option<GameplayState> {
        self.active_dimension.take().map(|info| info.current_state)
    }

    pub fn record_dimension(&mut self, record: DimensionRecord) {
        self.progression.record_dimension_complete(record.score);

        for reward in &record.rewards_earned {
            if reward.item_id == "gold" {
                self.wallet.currency.add(CurrencyType::Gold, reward.quantity as u64);
            } else if reward.item_id == "gem" {
                self.wallet.currency.add(CurrencyType::Gem, reward.quantity as u64);
            } else {
                use crate::economy::InventoryItem;
                let item = InventoryItem::new(&reward.item_id, &reward.item_id)
                    .with_quantity(reward.quantity);
                self.inventory.add_item(item);
            }
        }

        self.dimension_history.push(record);
    }

    pub fn get_player_stats(&self) -> PlayerStats {
        PlayerStats {
            level: self.player.level,
            experience: self.player.experience,
            total_playtime: self.calculate_total_playtime(),
            dimension_count: self.dimension_history.len(),
            gold: self.wallet.get_balance(CurrencyType::Gold),
            gem: self.wallet.get_balance(CurrencyType::Gem),
        }
    }

    fn calculate_total_playtime(&self) -> u64 {
        self.dimension_history
            .iter()
            .map(|r| r.end_time - r.start_time)
            .sum()
    }

    pub fn get_global(&self, key: &str) -> Option<&Value> {
        self.global_data.get(key)
    }

    pub fn set_global(&mut self, key: &str, value: Value) {
        self.global_data.insert(key.to_string(), value);
    }
}

impl SharedWorld {
    pub fn new() -> Self {
        Self {
            world_events: Vec::new(),
            global_announcements: Vec::new(),
            season_info: None,
            world_variables: ValueMap::new(),
        }
    }

    pub fn add_event(&mut self, event: WorldEvent) {
        self.world_events.push(event);
    }

    pub fn get_active_events(&self) -> Vec<&WorldEvent> {
        self.world_events
            .iter()
            .filter(|e| e.is_active)
            .collect()
    }

    pub fn remove_event(&mut self, event_id: &str) {
        self.world_events.retain(|e| e.event_id != event_id);
    }

    pub fn set_variable(&mut self, key: &str, value: Value) {
        self.world_variables.insert(key.to_string(), value);
    }

    pub fn get_variable(&self, key: &str) -> Option<&Value> {
        self.world_variables.get(key)
    }

    pub fn add_announcement(&mut self, announcement: Announcement) {
        self.global_announcements.push(announcement);
    }
}

impl Default for SharedWorld {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct PlayerStats {
    pub level: u32,
    pub experience: u64,
    pub total_playtime: u64,
    pub dimension_count: usize,
    pub gold: u64,
    pub gem: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_world_state_new() {
        let ws = UnifiedWorldState::new(PlayerProfile::new("p1"));
        assert_eq!(ws.player.account.account_id, "p1");
        assert!(ws.active_dimension.is_none());
        assert!(ws.dimension_history.is_empty());
    }

    #[test]
    fn test_record_dimension_with_rewards() {
        let mut ws = UnifiedWorldState::new(PlayerProfile::new("p1"));
        let record = DimensionRecord {
            dimension_id: "dim_1".to_string(),
            gameplay_types: vec![GameplayType::Match3],
            start_time: 1000,
            end_time: 2000,
            score: 500,
            rewards_earned: vec![
                RewardInfo { item_id: "gold".to_string(), quantity: 100 },
                RewardInfo { item_id: "gem".to_string(), quantity: 5 },
            ],
        };
        ws.record_dimension(record);
        assert_eq!(ws.progression.total_score, 500);
        assert_eq!(ws.wallet.get_balance(CurrencyType::Gold), 100);
        assert_eq!(ws.wallet.get_balance(CurrencyType::Gem), 5);
    }
}
