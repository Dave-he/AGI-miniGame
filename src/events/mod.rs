#[derive(Debug, Clone)]
pub enum GameEvent {
    EntityDied { entity_id: u32 },
    OnMatch { match_type: String, count: u32 },
    OnTimer { interval_ms: u32 },
}

pub struct EventBus {
    events: Vec<GameEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn dispatch(&mut self, event: GameEvent) {
        self.events.push(event);
    }

    pub fn drain_events(&mut self) -> Vec<GameEvent> {
        std::mem::take(&mut self.events)
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
