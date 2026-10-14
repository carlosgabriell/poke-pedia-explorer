import { describe, expect, it } from "vitest";
import { analyzeTeam, normalizeTeamNames } from "./teamAnalysis";
import type { PokemonDetail } from "./types";

function member(...types: string[]): Pick<PokemonDetail, "types"> {
  return {
    types: types.map((name, index) => ({
      slot: index + 1,
      type: { name, url: "" },
    })),
  };
}

describe("normalizeTeamNames", () => {
  it("keeps unique valid names and caps a saved team at six", () => {
    expect(
      normalizeTeamNames([
        "bulbasaur",
        "pikachu",
        "bulbasaur",
        "bad name",
        "--",
        "charizard",
        "eevee",
        "mewtwo",
        "gengar",
        "dragonite",
        "lucario",
      ]),
    ).toEqual([
      "bulbasaur",
      "pikachu",
      "charizard",
      "eevee",
      "mewtwo",
      "gengar",
    ]);
  });

  it("rejects malformed stored values", () => {
    expect(normalizeTeamNames({ pokemon: "pikachu" })).toEqual([]);
  });
});

describe("analyzeTeam", () => {
  it("counts team weaknesses, resistances, immunities, and STAB coverage", () => {
    const analysis = analyzeTeam([
      member("fire", "flying"),
      member("water"),
    ]);

    expect(analysis.weaknesses).toContainEqual({
      type: "electric",
      memberCount: 2,
      multiplier: 2,
    });
    expect(analysis.weaknesses).toContainEqual({
      type: "rock",
      memberCount: 1,
      multiplier: 4,
    });
    expect(analysis.resistances).toContainEqual({
      type: "fire",
      memberCount: 2,
      multiplier: 0.5,
    });
    expect(analysis.immunities).toContainEqual({
      type: "ground",
      memberCount: 1,
      multiplier: 0,
    });
    expect(analysis.offensiveCoverage).toContain("grass");
    expect(analysis.offensiveCoverage).toContain("ground");
  });

  it("returns no matchup claims for an empty team", () => {
    expect(analyzeTeam([])).toEqual({
      weaknesses: [],
      resistances: [],
      immunities: [],
      offensiveCoverage: [],
    });
  });
});
