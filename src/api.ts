import type {
  PokemonDetail,
  PokemonSummary,
  SpeciesDetail,
  EvolutionNode,
} from "./types";

const API = "https://pokeapi.co/api/v2";

const responseCache = new Map<string, unknown>();
const pendingRequests = new Map<string, Promise<unknown>>();

async function getJson<T>(
  url: string,
  errorMessage = "Não foi possível carregar os dados.",
): Promise<T> {
  const cached = responseCache.get(url);
  if (cached) return cached as T;

  const pending = pendingRequests.get(url);
  if (pending) return pending as Promise<T>;

  const request = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(errorMessage);
    const data = (await response.json()) as T;
    responseCache.set(url, data);
    return data;
  });

  pendingRequests.set(url, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(url);
  }
}

export async function getPokemonList(
  limit = 151,
  offset = 0,
): Promise<PokemonSummary[]> {
  const data = await getJson<{ results: PokemonSummary[] }>(
    `${API}/pokemon?limit=${limit}&offset=${offset}`,
    "Não foi possível carregar a Pokédex.",
  );
  return data.results;
}

export async function getPokemon(
  nameOrId: string | number,
): Promise<PokemonDetail> {
  return getJson<PokemonDetail>(
    `${API}/pokemon/${encodeURIComponent(String(nameOrId).toLowerCase())}`,
    "Pokémon não encontrado.",
  );
}

export async function getSpecies(url: string): Promise<SpeciesDetail> {
  return getJson<SpeciesDetail>(
    url,
    "Não foi possível carregar os detalhes da espécie.",
  );
}

export async function getEvolutionChain(url: string): Promise<EvolutionNode> {
  const data = await getJson<{ chain: EvolutionNode }>(
    url,
    "Não foi possível carregar a linha evolutiva.",
  );
  return data.chain;
}

export function getArtwork(pokemon: PokemonDetail): string {
  return (
    pokemon.sprites.other?.["official-artwork"]?.front_default ||
    pokemon.sprites.other?.home?.front_default ||
    pokemon.sprites.front_default ||
    ""
  );
}

export function formatPokemonName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function generationNumber(generationName: string): number {
  const match = generationName.match(
    /generation-(i{1,3}|iv|v|vi|vii|viii|ix)$/,
  );
  if (!match) return 0;
  const roman = match[1].toUpperCase();
  const values: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
  };
  return values[roman] ?? 0;
}

export function getPortugueseType(type: string): string {
  const types: Record<string, string> = {
    normal: "Normal",
    fire: "Fogo",
    water: "Água",
    electric: "Elétrico",
    grass: "Planta",
    ice: "Gelo",
    fighting: "Lutador",
    poison: "Veneno",
    ground: "Terra",
    flying: "Voador",
    psychic: "Psíquico",
    bug: "Inseto",
    rock: "Pedra",
    ghost: "Fantasma",
    dragon: "Dragão",
    dark: "Sombrio",
    steel: "Aço",
    fairy: "Fada",
  };
  return types[type] ?? formatPokemonName(type);
}

export function getPortugueseStat(stat: string): string {
  const stats: Record<string, string> = {
    hp: "PS",
    attack: "Ataque",
    defense: "Defesa",
    "special-attack": "Ataque especial",
    "special-defense": "Defesa especial",
    speed: "Velocidade",
  };
  return stats[stat] ?? formatPokemonName(stat);
}

export async function getPokemonNamesByType(type: string): Promise<string[]> {
  const data = await getJson<{
    pokemon: { pokemon: { name: string } }[];
  }>(
    `${API}/type/${encodeURIComponent(type)}`,
    "Não foi possível carregar o filtro por tipo.",
  );
  return data.pokemon.map((item) => item.pokemon.name);
}

export async function getAbilityList(): Promise<{ name: string }[]> {
  const data = await getJson<{ results: { name: string }[] }>(
    `${API}/ability?limit=400`,
    "Não foi possível carregar as habilidades.",
  );
  return data.results;
}

export async function getPokemonNamesByAbility(
  ability: string,
): Promise<string[]> {
  const data = await getJson<{
    pokemon: { pokemon: { name: string } }[];
  }>(
    `${API}/ability/${encodeURIComponent(ability)}`,
    "Não foi possível carregar o filtro por habilidade.",
  );
  return data.pokemon.map((item) => item.pokemon.name);
}
