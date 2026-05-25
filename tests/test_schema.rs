use agi_minigame_wasm::schema::rules::{Rule, Trigger, Action};

#[test]
fn test_rule_deserialization() {
    let json_data = r#"
    {
        "id": "rule_fire_attack",
        "trigger": {
            "event_type": "OnTimer",
            "params": { "interval_ms": 1000 }
        },
        "actions": [
            {
                "action_type": "SpawnEntity",
                "template": "Fireball"
            }
        ]
    }
    "#;

    let rule: Rule = serde_json::from_str(json_data).unwrap();
    assert_eq!(rule.id, "rule_fire_attack");
    assert_eq!(rule.trigger.event_type, "OnTimer");
    assert_eq!(rule.actions.len(), 1);
    assert_eq!(rule.actions[0].action_type, "SpawnEntity");
}
