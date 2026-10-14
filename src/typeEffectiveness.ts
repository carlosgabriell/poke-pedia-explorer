export const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

type PokemonTypeName = (typeof POKEMON_TYPES)[number];
type TypeMatchups = { superEffective: string[]; resistedBy: string[]; immuneAgainst: string[] };

const MATCHUPS: Record<PokemonTypeName, TypeMatchups> = {
  normal: { superEffective: [], resistedBy: ["rock", "steel"], immuneAgainst: ["ghost"] },
  fire: { superEffective: ["grass", "ice", "bug", "steel"], resistedBy: ["fire", "water", "rock", "dragon"], immuneAgainst: [] },
  water: { superEffective: ["fire", "ground", "rock"], resistedBy: ["water", "grass", "dragon"], immuneAgainst: [] },
  electric: { superEffective: ["water", "flying"], resistedBy: ["electric", "grass", "dragon"], immuneAgainst: ["ground"] },
  grass: { superEffective: ["water", "ground", "rock"], resistedBy: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"], immuneAgainst: [] },
  ice: { superEffective: ["grass", "ground", "flying", "dragon"], resistedBy: ["fire", "water", "ice", "steel"], immuneAgainst: [] },
  fighting: { superEffective: ["normal", "ice", "rock", "dark", "steel"], resistedBy: ["poison", "flying", "psychic", "bug", "fairy"], immuneAgainst: ["ghost"] },
  poison: { superEffective: ["grass", "fairy"], resistedBy: ["poison", "ground", "rock", "ghost"], immuneAgainst: ["steel"] },
  ground: { superEffective: ["fire", "electric", "poison", "rock", "steel"], resistedBy: ["grass", "bug"], immuneAgainst: ["flying"] },
  flying: { superEffective: ["grass", "fighting", "bug"], resistedBy: ["electric", "rock", "steel"], immuneAgainst: [] },
  psychic: { superEffective: ["fighting", "poison"], resistedBy: ["psychic", "steel"], immuneAgainst: ["dark"] },
  bug: { superEffective: ["grass", "psychic", "dark"], resistedBy: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"], immuneAgainst: [] },
  rock: { superEffective: ["fire", "ice", "flying", "bug"], resistedBy: ["fighting", "ground", "steel"], immuneAgainst: [] },
  ghost: { superEffective: ["psychic", "ghost"], resistedBy: ["dark"], immuneAgainst: ["normal"] },
  dragon: { superEffective: ["dragon"], resistedBy: ["steel"], immuneAgainst: ["fairy"] },
  dark: { superEffective: ["psychic", "ghost"], resistedBy: ["fighting", "dark", "fairy"], immuneAgainst: [] },
  steel: { superEffective: ["ice", "rock", "fairy"], resistedBy: ["fire", "water", "electric", "steel"], immuneAgainst: [] },
  fairy: { superEffective: ["fighting", "dragon", "dark"], resistedBy: ["fire", "poison", "steel"], immuneAgainst: [] },
};

export function getTypeEffectiveness(
  attackingType: string,
  defendingTypes: string[],
): number {
  const matchup = MATCHUPS[attackingType as PokemonTypeName];
  if (!matchup) throw new Error(`Unknown attacking type: ${attackingType}`);
  if (defendingTypes.some((type) => !POKEMON_TYPES.includes(type as PokemonTypeName))) {
    throw new Error("Unknown defending type.");
  }

  return defendingTypes.reduce((multiplier, type) => {
    if (matchup.immuneAgainst.includes(type)) return 0;
    if (matchup.superEffective.includes(type)) return multiplier * 2;
    if (matchup.resistedBy.includes(type)) return multiplier * 0.5;
    return multiplier;
  }, 1);
}
