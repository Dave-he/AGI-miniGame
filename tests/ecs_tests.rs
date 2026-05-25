use agi_minigame::ecs::world::World;
use agi_minigame::ecs::components::{Position, Velocity};

#[test]
fn test_spawn_entity() {
    let mut world = World::new();
    let entity_id = world.spawn();
    world.add_component(entity_id, Position { x: 0.0, y: 0.0 });
    assert!(world.has_component::<Position>(entity_id));
}
