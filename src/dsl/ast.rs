#[derive(Debug, PartialEq)]
pub enum Event { OnCollide, OnTimer(u32) }

#[derive(Debug, PartialEq)]
pub enum Action { ApplyDamage(u32), SpawnEntity(String) }

#[derive(Debug)]
pub struct Rule {
    pub event: Event,
    pub actions: Vec<Action>,
}
