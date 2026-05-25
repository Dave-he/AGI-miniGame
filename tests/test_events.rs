use AGI_miniGame::events::{EventBus, GameEvent};

#[test]
fn test_event_bus_dispatch() {
    let mut bus = EventBus::new();
    bus.dispatch(GameEvent::EntityDied { entity_id: 42 });
    
    let events = bus.drain_events();
    assert_eq!(events.len(), 1);
    match events[0] {
        GameEvent::EntityDied { entity_id } => assert_eq!(entity_id, 42),
        _ => panic!("Wrong event type"),
    }
}
