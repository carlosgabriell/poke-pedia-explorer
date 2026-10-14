import type { PokemonSummary } from "./types";

export function filterTeamCandidates(
  catalog: PokemonSummary[],
  team: string[],
  search: string,
  limit = 8,
): PokemonSummary[] {
  const query = search.trim().toLowerCase();
  const numericQuery = query.replace(/^#/, "");
  const isNumericQuery = /^\d+$/.test(numericQuery);

  return catalog
    .filter((pokemon) => !team.includes(pokemon.name))
    .filter((pokemon) => {
      if (!query) return true;
      const id = Number(pokemon.url.match(/\/pokemon\/(\d+)\//)?.[1] ?? 0);
      return (
        pokemon.name.includes(query) ||
        (isNumericQuery && id === Number(numericQuery))
      );
    })
    .slice(0, limit);
}
