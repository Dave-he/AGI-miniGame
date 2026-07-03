use agi_minigame_wasm::wasm_api::GameEngine;
use serde_json::Value;

#[test]
fn test_engine_telemetry_tracks_entities_and_frames() {
    let mut engine = GameEngine::new(200.0);

    let initial: Value = serde_json::from_str(&engine.get_telemetry_json()).unwrap();
    assert_eq!(initial["entity_count"].as_u64().unwrap(), 1);
    assert_eq!(initial["static_entity_count"].as_u64().unwrap(), 1);
    assert_eq!(initial["frame_count"].as_u64().unwrap(), 0);

    engine.add_entity(0.0, 50.0, 0.0, "#ff3366".to_string(), 10.0, 0.0, 0.0, 1);
    engine.update(0.016);

    let telemetry: Value = serde_json::from_str(&engine.get_telemetry_json()).unwrap();
    assert_eq!(telemetry["frame_count"].as_u64().unwrap(), 1);
    assert_eq!(telemetry["total_spawned_count"].as_u64().unwrap(), 2);
    assert_eq!(telemetry["entity_count"].as_u64().unwrap(), 2);
    assert_eq!(telemetry["dynamic_entity_count"].as_u64().unwrap(), 1);
    assert!(telemetry["average_speed"].as_f64().unwrap() > 0.0);
}

#[test]
fn test_engine_telemetry_reports_boundary_collisions() {
    let mut engine = GameEngine::new(120.0);
    engine.add_entity(55.0, 0.0, 0.0, "#00ffff".to_string(), 200.0, 0.0, 0.0, 1);
    engine.update(1.0);

    let telemetry: Value = serde_json::from_str(&engine.get_telemetry_json()).unwrap();
    assert!(telemetry["last_collision_count"].as_u64().unwrap() > 0);
    assert!(telemetry["total_collision_count"].as_u64().unwrap() > 0);
}

#[test]
fn test_engine_can_clear_dynamic_entities_between_generated_scenes() {
    let mut engine = GameEngine::new(200.0);
    engine.add_entity(0.0, 50.0, 0.0, "#ff3366".to_string(), 10.0, 0.0, 0.0, 1);
    engine.add_entity(25.0, -60.0, 0.0, "#00ff00".to_string(), 0.0, 0.0, 0.0, 2);

    let removed = engine.clear_dynamic_entities();
    let telemetry: Value = serde_json::from_str(&engine.get_telemetry_json()).unwrap();
    let render_data: Value = serde_json::from_str(&engine.get_render_data()).unwrap();

    assert_eq!(removed, 1);
    assert_eq!(telemetry["entity_count"].as_u64().unwrap(), 2);
    assert_eq!(telemetry["dynamic_entity_count"].as_u64().unwrap(), 0);
    assert_eq!(telemetry["static_entity_count"].as_u64().unwrap(), 2);
    assert_eq!(telemetry["last_removed_count"].as_u64().unwrap(), 1);
    assert_eq!(telemetry["total_removed_count"].as_u64().unwrap(), 1);
    assert_eq!(render_data.as_array().unwrap().len(), 2);
}

#[test]
fn test_engine_can_reset_scene_entities_to_base_terrain() {
    let mut engine = GameEngine::new(200.0);
    engine.add_entity(0.0, 50.0, 0.0, "#ff3366".to_string(), 10.0, 0.0, 0.0, 1);
    engine.add_entity(25.0, -60.0, 0.0, "#00ff00".to_string(), 0.0, 0.0, 0.0, 2);

    let removed = engine.reset_scene_entities();
    let telemetry: Value = serde_json::from_str(&engine.get_telemetry_json()).unwrap();
    let render_data: Value = serde_json::from_str(&engine.get_render_data()).unwrap();

    assert_eq!(removed, 2);
    assert_eq!(telemetry["entity_count"].as_u64().unwrap(), 1);
    assert_eq!(telemetry["dynamic_entity_count"].as_u64().unwrap(), 0);
    assert_eq!(telemetry["static_entity_count"].as_u64().unwrap(), 1);
    assert_eq!(telemetry["last_removed_count"].as_u64().unwrap(), 2);
    assert_eq!(telemetry["total_removed_count"].as_u64().unwrap(), 2);
    assert_eq!(render_data.as_array().unwrap().len(), 1);
    assert_eq!(render_data[0]["entity_type"].as_u64().unwrap(), 0);
}
