import type {
  PokemonDetail,
  PokemonSummary,
  SpeciesDetail,
  EvolutionNode,
  PokemonMoveDetail,
} from "./types";
import type { BattleMove } from "./battleEngine";

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

export async function getBattleMoves(pokemon: PokemonDetail): Promise<BattleMove[]> {
  const levelUpMoves = pokemon.moves
    .flatMap(({ move, version_group_details }) => {
      const modernDetails = version_group_details.filter(
        (detail) => detail.version_group.name === "scarlet-violet",
      );
      const details = modernDetails.length > 0 ? modernDetails : version_group_details;
      const levelUp = details
        .filter((detail) =>
          detail.move_learn_method.name === "level-up" &&
          detail.level_learned_at <= 50,
        )
        .sort((left, right) => right.level_learned_at - left.level_learned_at)[0];
      const other = details.some((detail) =>
        ["machine", "tutor", "egg"].includes(detail.move_learn_method.name),
      );
      return levelUp
        ? [{ move, rank: 0, level: levelUp.level_learned_at }]
        : other
          ? [{ move, rank: 1, level: 0 }]
          : [];
    })
    .sort((left, right) => left.rank - right.rank || right.level - left.level);

  const selected: BattleMove[] = [];
  for (let offset = 0; offset < levelUpMoves.length && selected.length < 4; offset += 8) {
    const batch = levelUpMoves.slice(offset, offset + 8);
    const results = await Promise.allSettled(
      batch.map(({ move }) =>
        getJson<PokemonMoveDetail>(move.url, "Não foi possível carregar os movimentos."),
      ),
    );
    results.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const move = result.value;
      if (
        move.power === null ||
        move.power <= 0 ||
        move.damage_class.name === "status" ||
        selected.some((existing) => existing.id === move.id)
      ) return;
      selected.push({
        id: move.id,
        name: move.name,
        type: move.type.name,
        power: move.power,
        accuracy: move.accuracy ?? 100,
        pp: move.pp ?? 10,
        damageClass: move.damage_class.name === "physical" ? "physical" : "special",
      });
    });
  }

  if (selected.length === 0) {
    throw new Error(`Não há movimentos de dano disponíveis para ${pokemon.name}.`);
  }
  return selected.slice(0, 4);
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
