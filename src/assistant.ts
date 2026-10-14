export type AssistantLocale = "pt-BR" | "en";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantPokemon = {
  name: string;
  number: number;
  types: string[];
  abilities: string[];
  stats: { name: string; value: number }[];
  heightMeters: number;
  weightKg: number;
};

export type AssistantPayload = {
  question: string;
  locale: AssistantLocale;
  history: AssistantMessage[];
  pokemon: AssistantPokemon[];
};

const POKEMON_TYPES = new Set([
  "normal", "fire", "water", "electric", "grass", "ice", "fighting",
  "poison", "ground", "flying", "psychic", "bug", "rock", "ghost",
  "dragon", "dark", "steel", "fairy",
]);

const POKEMON_STATS = new Set([
  "hp", "attack", "defense", "special-attack", "special-defense", "speed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePokemon(value: unknown): AssistantPokemon | null {
  if (!isRecord(value)) return null;
  const { name, number, types, abilities, stats, heightMeters, weightKg } = value;
  if (
    typeof name !== "string" ||
    !/^[a-z0-9-]{1,40}$/.test(name) ||
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 20_000 ||
    !Array.isArray(types) ||
    types.length < 1 ||
    types.length > 2 ||
    !types.every((type) => typeof type === "string" && POKEMON_TYPES.has(type)) ||
    !Array.isArray(abilities) ||
    abilities.length > 4 ||
    !abilities.every((ability) => typeof ability === "string" && /^[a-z0-9-]{1,40}$/.test(ability)) ||
    !Array.isArray(stats) ||
    stats.length > 6 ||
    typeof heightMeters !== "number" ||
    !Number.isFinite(heightMeters) ||
    heightMeters < 0 ||
    heightMeters > 200 ||
    typeof weightKg !== "number" ||
    !Number.isFinite(weightKg) ||
    weightKg < 0 ||
    weightKg > 2000
  ) {
    return null;
  }

  const parsedStats: AssistantPokemon["stats"] = [];
  for (const stat of stats) {
    if (
      !isRecord(stat) ||
      typeof stat.name !== "string" ||
      !POKEMON_STATS.has(stat.name) ||
      typeof stat.value !== "number" ||
      !Number.isFinite(stat.value) ||
      stat.value < 0 ||
      stat.value > 1000
    ) {
      return null;
    }
    parsedStats.push({ name: stat.name, value: stat.value });
  }

  return {
    name,
    number,
    types: [...types],
    abilities: [...abilities],
    stats: parsedStats,
    heightMeters,
    weightKg,
  };
}

export function parseAssistantPayload(value: unknown): AssistantPayload | null {
  if (!isRecord(value)) return null;
  const { question, locale, history, pokemon } = value;
  if (
    typeof question !== "string" ||
    question.trim().length === 0 ||
    question.length > 500 ||
    (locale !== "pt-BR" && locale !== "en") ||
    !Array.isArray(history) ||
    history.length > 8 ||
    !Array.isArray(pokemon) ||
    pokemon.length > 6
  ) {
    return null;
  }

  const parsedHistory: AssistantMessage[] = [];
  for (const message of history) {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > 600
    ) {
      return null;
    }
    parsedHistory.push({ role: message.role, content: message.content });
  }

  const parsedPokemon: AssistantPokemon[] = [];
  for (const item of pokemon) {
    const parsed = parsePokemon(item);
    if (!parsed) return null;
    parsedPokemon.push(parsed);
  }

  return {
    question: question.trim(),
    locale,
    history: parsedHistory,
    pokemon: parsedPokemon,
  };
}
