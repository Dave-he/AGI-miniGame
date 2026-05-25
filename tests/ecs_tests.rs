use agi_minigame_wasm::ecs::world::World;
use agi_minigame_wasm::ecs::components::{Position, Velocity};
use agi_minigame_wasm::systems::physics::check_collisions;
use agi_minigame_wasm::ecs::components::Collider;

#[test]
fn test_spawn_entity() {
    let mut world = World::new();
    let entity_id = world.spawn();
    world.add_component(entity_id, Position { x: 0.0, y: 0.0 });
    assert!(world.has_component::<Position>(entity_id));
}

#[test]
fn test_collision_drops_meme() {
    let mut world = World::new();
    let e1 = world.spawn();
    world.add_component(e1, Position { x: 0.0, y: 0.0 });
    world.add_component(e1, Collider { radius: 1.0 });
    
    let e2 = world.spawn();
    world.add_component(e2, Position { x: 0.5, y: 0.0 });
    world.add_component(e2, Collider { radius: 1.0 });

    let memes_dropped = check_collisions(&mut world);
    assert_eq!(memes_dropped.len(), 1);
}
