use agi_minigame_wasm::dsl::parser::parse;
use agi_minigame_wasm::dsl::ast::{Action, Event};

#[test]
fn test_parse_simple_dsl() {
    let script = "On(Collide) -> Apply(Damage, 10)";
    let ast = parse(script).unwrap();
    assert_eq!(ast.event, Event::OnCollide);
    assert_eq!(ast.actions[0], Action::ApplyDamage(10));
}
