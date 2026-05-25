export const GameplayType = {
    Match3: 'match3',
    TowerDefense: 'tower_defense',
    Card: 'card',
    TurnCombat: 'turn_combat',
    Parkour: 'parkour',
    Puzzle: 'puzzle',
    Shooting: 'shooting',
    Synthesis: 'synthesis',
    Simulation: 'simulation',
    Custom: 'custom',
} as const;
export type GameplayType = typeof GameplayType[keyof typeof GameplayType];

const gameplayTypeNameMap: Record<string, GameplayType> = {
    match3: GameplayType.Match3,
    tower_defense: GameplayType.TowerDefense,
    card: GameplayType.Card,
    turn_combat: GameplayType.TurnCombat,
    parkour: GameplayType.Parkour,
    puzzle: GameplayType.Puzzle,
    shooting: GameplayType.Shooting,
    synthesis: GameplayType.Synthesis,
    simulation: GameplayType.Simulation,
    custom: GameplayType.Custom,
};

export function gameplayTypeFromName(name: string): GameplayType | null {
    return gameplayTypeNameMap[name] ?? null;
}

export function allGameplayTypes(): GameplayType[] {
    return Object.values(GameplayType);
}
