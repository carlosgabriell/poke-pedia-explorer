import { getTypeEffectiveness, POKEMON_TYPES } from "./typeEffectiveness";
import type { PokemonDetail } from "./types";

export const MAX_TEAM_SIZE = 6;

export type TeamMatchup = {
  type: string;
  memberCount: number;
  multiplier: number;
};

export type TeamAnalysis = {
  weaknesses: TeamMatchup[];
  resistances: TeamMatchup[];
  immunities: TeamMatchup[];
  offensiveCoverage: string[];
};

export function normalizeTeamNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value.filter(
      (name): name is string =>
        typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name),
    ),
  )].slice(0, MAX_TEAM_SIZE);
}

export function analyzeTeam(
  members: Pick<PokemonDetail, "types">[],
): TeamAnalysis {
  const matchups = POKEMON_TYPES.map((attackingType) => {
    const multipliers = members.map((member) =>
      getTypeEffectiveness(
        attackingType,
        member.types.map((type) => type.type.name),
      ),
    );

    return {
      type: attackingType,
      weaknessCount: multipliers.filter((multiplier) => multiplier > 1).length,
      weaknessMultiplier: Math.max(
        1,
        ...multipliers.filter((multiplier) => multiplier > 1),
      ),
      resistanceCount: multipliers.filter(
        (multiplier) => multiplier > 0 && multiplier < 1,
      ).length,
      resistanceMultiplier: Math.min(
        1,
        ...multipliers.filter(
          (multiplier) => multiplier > 0 && multiplier < 1,
        ),
      ),
      immunityCount: multipliers.filter((multiplier) => multiplier === 0)
        .length,
    };
  });

  const offensiveCoverage = POKEMON_TYPES.filter((defendingType) =>
    members.some((member) =>
      member.types.some(
        (type) =>
          getTypeEffectiveness(type.type.name, [defendingType]) > 1,
      ),
    ),
  );

  return {
    weaknesses: matchups
      .filter((matchup) => matchup.weaknessCount > 0)
      .map(({ type, weaknessCount, weaknessMultiplier }) => ({
        type,
        memberCount: weaknessCount,
        multiplier: weaknessMultiplier,
      })),
    resistances: matchups
      .filter((matchup) => matchup.resistanceCount > 0)
      .map(({ type, resistanceCount, resistanceMultiplier }) => ({
        type,
        memberCount: resistanceCount,
        multiplier: resistanceMultiplier,
      })),
    immunities: matchups
      .filter((matchup) => matchup.immunityCount > 0)
      .map(({ type, immunityCount }) => ({
        type,
        memberCount: immunityCount,
        multiplier: 0,
      })),
    offensiveCoverage,
  };
}
