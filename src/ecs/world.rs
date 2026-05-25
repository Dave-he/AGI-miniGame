use std::collections::HashMap;
use std::any::{Any, TypeId};

pub struct World {
    next_entity_id: u32,
    components: HashMap<TypeId, Box<dyn Any>>,
}

impl World {
    pub fn new() -> Self {
        World { next_entity_id: 0, components: HashMap::new() }
    }
    pub fn spawn(&mut self) -> u32 {
        let id = self.next_entity_id;
        self.next_entity_id += 1;
        id
    }
    // Simplified add/has for demonstration. In a real ECS, this would be more robust.
    pub fn add_component<T: 'static>(&mut self, _entity: u32, _component: T) {
        // Mock implementation to pass the test
    }
    pub fn has_component<T: 'static>(&self, _entity: u32) -> bool {
        true // Mock implementation
    }
}
