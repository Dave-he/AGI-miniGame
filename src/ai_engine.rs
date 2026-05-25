use std::collections::HashMap;

use rand::Rng;

use cocos4_rust::base::value::{Value, ValueMap};

use crate::atom::{AtomId, AtomRegistry};
use crate::gameplay::GameplayType;

#[derive(Debug, Clone)]
pub struct GenerationConfig {
    pub min_atoms: usize,
    pub max_atoms: usize,
    pub difficulty_range: (f32, f32),
    pub allow_composite: bool,
    pub seed: Option<u64>,
    pub player_level: u32,
    pub preferred_types: Vec<GameplayType>,
    pub excluded_types: Vec<GameplayType>,
    pub reward_multiplier: f32,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            min_atoms: 2,
            max_atoms: 4,
            difficulty_range: (0.5, 1.0),
            allow_composite: true,
            seed: None,
            player_level: 1,
            preferred_types: Vec::new(),
            excluded_types: Vec::new(),
            reward_multiplier: 1.0,
        }
    }
}

impl GenerationConfig {
    pub fn for_player_level(level: u32) -> Self {
        let max_atoms = (2 + level / 5).min(6) as usize;
        let difficulty = 0.3 + (level as f32 * 0.1).min(0.7);
        Self {
            min_atoms: 2,
            max_atoms,
            difficulty_range: (difficulty, difficulty + 0.3),
            player_level: level,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone)]
pub struct DimensionBlueprint {
    pub id: String,
    pub name: String,
    pub description: String,
    pub atom_ids: Vec<AtomId>,
    pub atom_weights: HashMap<AtomId, f32>,
    pub difficulty: f32,
    pub rules: Vec<GeneratedRule>,
    pub rewards: Vec<GeneratedReward>,
    pub theme: DimensionTheme,
    pub time_limit_secs: Option<u32>,
    pub objectives: Vec<Objective>,
}

#[derive(Debug, Clone)]
pub struct GeneratedRule {
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub rule_type: RuleType,
    pub params: ValueMap,
}

#[derive(Debug, Clone)]
pub enum RuleType {
    Modifier,
    Constraint,
    Trigger,
    Transformation,
}

#[derive(Debug, Clone)]
pub struct GeneratedReward {
    pub item_id: String,
    pub base_quantity: u32,
    pub scaling_factor: f32,
}

#[derive(Debug, Clone)]
pub struct DimensionTheme {
    pub name: String,
    pub visual_style: String,
    pub music_mood: String,
    pub color_palette: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Objective {
    pub id: String,
    pub description: String,
    pub objective_type: ObjectiveType,
    pub target_value: u64,
    pub is_optional: bool,
}

#[derive(Debug, Clone)]
pub enum ObjectiveType {
    Score,
    Time,
    Collect,
    Defeat,
    Survive,
    Custom(String),
}

pub struct DimensionGenerator {
    rng: rand::rngs::StdRng,
    name_parts: NameParts,
}

struct NameParts {
    adjectives: Vec<&'static str>,
    nouns: Vec<&'static str>,
    themes: Vec<&'static str>,
}

impl DimensionGenerator {
    pub fn new(seed: u64) -> Self {
        Self {
            rng: rand::SeedableRng::seed_from_u64(seed),
            name_parts: NameParts {
                adjectives: vec![
                    "混沌", "永恒", "幻影", "量子", "虚空", "烈焰", "冰霜",
                    "雷霆", "暗影", "光辉", "深渊", "星辰", "时空", "命运",
                ],
                nouns: vec![
                    "迷宫", "战场", "神殿", "深渊", "花园", "塔楼", "竞技场",
                    "秘境", "次元", "试炼", "回廊", "领域", "裂隙", "梦境",
                ],
                themes: vec![
                    "赛博朋克", "奇幻森林", "海底世界", "太空站", "古墓",
                    "浮空城", "熔岩地带", "冰原", "沙漠绿洲", "暗黑地牢",
                ],
            },
        }
    }

    pub fn generate(&mut self, config: &GenerationConfig, registry: &AtomRegistry) -> DimensionBlueprint {
        let available_atoms = self.filter_atoms(config, registry);
        let num_atoms = self.rng.gen_range(config.min_atoms..=config.max_atoms.min(available_atoms.len()));

        let selected_atoms = self.select_atoms(&available_atoms, num_atoms);
        let difficulty = self.rng.gen_range(config.difficulty_range.0..=config.difficulty_range.1);
        let atom_weights = self.generate_weights(&selected_atoms);
        let rules = self.generate_rules(&selected_atoms, difficulty);
        let rewards = self.generate_rewards(&selected_atoms, difficulty, config.reward_multiplier);
        let theme = self.generate_theme();
        let name = self.generate_name();
        let objectives = self.generate_objectives(&selected_atoms, difficulty);

        DimensionBlueprint {
            id: format!("dim_{}", self.rng.gen::<u32>()),
            name,
            description: format!("在{}中挑战{}种玩法的组合", theme.name, selected_atoms.len()),
            atom_ids: selected_atoms,
            atom_weights,
            difficulty,
            rules,
            rewards,
            theme,
            time_limit_secs: if difficulty > 0.7 { Some(180) } else { None },
            objectives,
        }
    }

    fn filter_atoms(&self, config: &GenerationConfig, registry: &AtomRegistry) -> Vec<AtomId> {
        registry
            .list_all()
            .iter()
            .filter(|m| {
                let gt = GameplayType::from_name(&m.gameplay_type);
                !config.excluded_types.contains(&gt)
            })
            .map(|m| m.id.clone())
            .collect()
    }

    fn select_atoms(&mut self, available: &[AtomId], count: usize) -> Vec<AtomId> {
        let mut indices: Vec<usize> = (0..available.len()).collect();
        let mut selected = Vec::new();

        for _ in 0..count.min(available.len()) {
            if indices.is_empty() {
                break;
            }
            let idx = self.rng.gen_range(0..indices.len());
            let atom_idx = indices.remove(idx);
            selected.push(available[atom_idx].clone());
        }

        selected
    }

    fn generate_weights(&mut self, atoms: &[AtomId]) -> HashMap<AtomId, f32> {
        let mut weights = HashMap::new();
        let total = atoms.len() as f32;
        for atom in atoms {
            let w = 0.5 + self.rng.gen::<f32>() * 0.5;
            weights.insert(atom.clone(), w / total);
        }
        weights
    }

    fn generate_rules(&mut self, _atoms: &[AtomId], difficulty: f32) -> Vec<GeneratedRule> {
        let mut rules = Vec::new();
        let rule_templates = [
            ("speed_boost", "加速", "行动速度提升", RuleType::Modifier),
            ("double_score", "双倍得分", "得分翻倍", RuleType::Modifier),
            ("resource_drain", "资源消耗", "资源持续消耗", RuleType::Constraint),
            ("chain_bonus", "连锁奖励", "连续操作获得额外奖励", RuleType::Trigger),
            ("time_pressure", "时间压力", "倒计时加速", RuleType::Constraint),
        ];

        let num_rules = (1 + (difficulty * 3.0) as usize).min(rule_templates.len());
        let mut template_indices: Vec<usize> = (0..rule_templates.len()).collect();

        for _ in 0..num_rules {
            if template_indices.is_empty() {
                break;
            }
            let idx = self.rng.gen_range(0..template_indices.len());
            let ti = template_indices.remove(idx);
            let template = &rule_templates[ti];
            let mut params = ValueMap::new();
            params.insert("intensity".to_string(), Value::Float(difficulty as f64));

            rules.push(GeneratedRule {
                rule_id: template.0.to_string(),
                name: template.1.to_string(),
                description: template.2.to_string(),
                rule_type: template.3.clone(),
                params,
            });
        }

        rules
    }

    fn generate_rewards(&mut self, _atoms: &[AtomId], difficulty: f32, multiplier: f32) -> Vec<GeneratedReward> {
        let mut rewards = Vec::new();
        let base_gold = (50.0 * difficulty * multiplier) as u32;
        let base_gem = (5.0 * difficulty * multiplier) as u32;

        rewards.push(GeneratedReward {
            item_id: "gold".to_string(),
            base_quantity: base_gold,
            scaling_factor: 1.0 + difficulty,
        });
        rewards.push(GeneratedReward {
            item_id: "gem".to_string(),
            base_quantity: base_gem.max(1),
            scaling_factor: 0.5 + difficulty,
        });

        if difficulty > 0.6 {
            rewards.push(GeneratedReward {
                item_id: "rare_chest".to_string(),
                base_quantity: 1,
                scaling_factor: difficulty,
            });
        }

        rewards
    }

    fn generate_theme(&mut self) -> DimensionTheme {
        let adj_idx = self.rng.gen_range(0..self.name_parts.adjectives.len());
        let theme_idx = self.rng.gen_range(0..self.name_parts.themes.len());

        DimensionTheme {
            name: format!("{}·{}", self.name_parts.adjectives[adj_idx], self.name_parts.themes[theme_idx]),
            visual_style: self.name_parts.themes[theme_idx].to_string(),
            music_mood: if self.rng.gen::<f32>() > 0.5 { "epic" } else { "mysterious" }.to_string(),
            color_palette: vec!["#FF6B6B".to_string(), "#4ECDC4".to_string(), "#45B7D1".to_string()],
        }
    }

    fn generate_name(&mut self) -> String {
        let adj_idx = self.rng.gen_range(0..self.name_parts.adjectives.len());
        let noun_idx = self.rng.gen_range(0..self.name_parts.nouns.len());
        format!("{}{}", self.name_parts.adjectives[adj_idx], self.name_parts.nouns[noun_idx])
    }

    fn generate_objectives(&mut self, atoms: &[AtomId], difficulty: f32) -> Vec<Objective> {
        let mut objectives = Vec::new();

        objectives.push(Objective {
            id: "main_score".to_string(),
            description: format!("达到{}分", (1000.0 * difficulty) as u64),
            objective_type: ObjectiveType::Score,
            target_value: (1000.0 * difficulty) as u64,
            is_optional: false,
        });

        if atoms.len() > 1 {
            objectives.push(Objective {
                id: "combo_master".to_string(),
                description: "完成3次组合连击".to_string(),
                objective_type: ObjectiveType::Custom("combo".to_string()),
                target_value: 3,
                is_optional: true,
            });
        }

        objectives
    }
}

pub struct BalanceTuner {
    target_win_rate: f32,
    history: Vec<BalanceDataPoint>,
}

#[derive(Debug, Clone)]
struct BalanceDataPoint {
    dimension_id: String,
    difficulty: f32,
    player_level: u32,
    score: u64,
    duration_secs: f32,
    completed: bool,
}

impl BalanceTuner {
    pub fn new() -> Self {
        Self {
            target_win_rate: 0.6,
            history: Vec::new(),
        }
    }

    pub fn record_result(&mut self, dimension_id: &str, difficulty: f32, player_level: u32, score: u64, duration_secs: f32, completed: bool) {
        self.history.push(BalanceDataPoint {
            dimension_id: dimension_id.to_string(),
            difficulty,
            player_level,
            score,
            duration_secs,
            completed,
        });
    }

    pub fn suggest_difficulty(&self, player_level: u32) -> f32 {
        let recent: Vec<_> = self.history
            .iter()
            .rev()
            .take(20)
            .filter(|d| (d.player_level as i32 - player_level as i32).abs() <= 2)
            .collect();

        if recent.is_empty() {
            return 0.3 + player_level as f32 * 0.05;
        }

        let win_rate = recent.iter().filter(|d| d.completed).count() as f32 / recent.len() as f32;

        let mut adjustment = 0.0f32;
        if win_rate > self.target_win_rate + 0.1 {
            adjustment += 0.1;
        } else if win_rate < self.target_win_rate - 0.1 {
            adjustment -= 0.1;
        }

        let base = 0.3 + player_level as f32 * 0.05;
        (base + adjustment).clamp(0.1, 1.0)
    }
}

impl Default for BalanceTuner {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AiEngine {
    pub generator: DimensionGenerator,
    pub tuner: BalanceTuner,
}

impl AiEngine {
    pub fn new(seed: u64) -> Self {
        Self {
            generator: DimensionGenerator::new(seed),
            tuner: BalanceTuner::new(),
        }
    }

    pub fn generate_dimension(&mut self, config: &GenerationConfig, registry: &AtomRegistry) -> DimensionBlueprint {
        let mut config = config.clone();
        let suggested = self.tuner.suggest_difficulty(config.player_level);
        config.difficulty_range = (
            (suggested - 0.1).max(0.1),
            (suggested + 0.1).min(1.0),
        );

        self.generator.generate(&config, registry)
    }

    pub fn record_session(&mut self, dimension_id: &str, difficulty: f32, player_level: u32, score: u64, duration_secs: f32, completed: bool) {
        self.tuner.record_result(dimension_id, difficulty, player_level, score, duration_secs, completed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atom::AtomMetadata;

    fn make_test_registry() -> AtomRegistry {
        let mut registry = AtomRegistry::new();
        let atoms = vec![
            ("match3", "Match3", "match3"),
            ("tower_defense", "TowerDefense", "tower_defense"),
            ("card", "Card", "card"),
        ];

        for (id, name, gt) in atoms {
            let metadata = AtomMetadata {
                id: id.to_string(),
                name: name.to_string(),
                version: 1,
                gameplay_type: gt.to_string(),
                description: format!("{} atom", name),
                tags: vec![gt.to_string()],
            };
            registry.register(id.to_string(), metadata, || panic!("factory not used in test"));
        }
        registry
    }

    #[test]
    fn test_dimension_generator() {
        let mut gen = DimensionGenerator::new(42);
        let config = GenerationConfig::default();
        let registry = make_test_registry();

        let blueprint = gen.generate(&config, &registry);
        assert!(!blueprint.atom_ids.is_empty());
        assert!(!blueprint.name.is_empty());
    }

    #[test]
    fn test_ai_engine_generate() {
        let mut engine = AiEngine::new(123);
        let config = GenerationConfig::default();
        let registry = make_test_registry();

        let blueprint = engine.generate_dimension(&config, &registry);
        assert!(!blueprint.atom_ids.is_empty());
        assert!(!blueprint.objectives.is_empty());
    }
}
