use agi_minigame_wasm::ecs::components::{Transform2D, GridPosition, Health, Team};

#[test]
fn test_component_creation() {
    let transform = Transform2D { x: 10.0, y: 20.0, scale: 1.0 };
    assert_eq!(transform.x, 10.0);

    let grid_pos = GridPosition { x: 2, y: 3 };
    assert_eq!(grid_pos.x, 2);

    let health = Health { current: 50, max: 100 };
    assert_eq!(health.current, 50);

    let team = Team { id: "Player".to_string() };
    assert_eq!(team.id, "Player");
}
