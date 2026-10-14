import { describe, expect, it } from "vitest";
import { filterTeamCandidates } from "./teamSelection";
import type { PokemonSummary } from "./types";

const catalog: PokemonSummary[] = [
  { name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon/1/" },
  { name: "pikachu", url: "https://pokeapi.co/api/v2/pokemon/25/" },
  { name: "charizard", url: "https://pokeapi.co/api/v2/pokemon/6/" },
];

describe("filterTeamCandidates", () => {
  it("searches by case-insensitive name or National Pokédex number", () => {
    expect(filterTeamCandidates(catalog, [], "CHAR").map((item) => item.name)).toEqual(["charizard"]);
    expect(filterTeamCandidates(catalog, [], "#0025").map((item) => item.name)).toEqual(["pikachu"]);
  });

  it("hides existing team members and caps results", () => {
    expect(filterTeamCandidates(catalog, ["pikachu"], "", 1)).toEqual([
      catalog[0],
    ]);
  });
});
