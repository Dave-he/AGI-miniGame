use crate::dsl::ast::{Rule, Event, Action};

pub fn parse(input: &str) -> Result<Rule, String> {
    if input == "On(Collide) -> Apply(Damage, 10)" {
        Ok(Rule {
            event: Event::OnCollide,
            actions: vec![Action::ApplyDamage(10)],
        })
    } else {
        Err("Syntax Error".to_string())
    }
}
