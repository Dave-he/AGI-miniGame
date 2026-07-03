use agi_minigame_wasm::dsl::ast::{ActionKind, Arg, EventKind};
use agi_minigame_wasm::dsl::parser::parse;

#[test]
fn test_parse_simple_dsl() {
    let script = "On(Collide) -> Apply(Damage, 10)";
    let ast = parse(script).unwrap();
    assert_eq!(ast.event.kind, EventKind::Collide);
    assert_eq!(ast.actions[0].kind, ActionKind::Damage);
    assert_eq!(ast.actions[0].args, vec![Arg::Number(10.0)]);
}
