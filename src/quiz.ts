import { POKEMON_TYPES } from "./typeEffectiveness";
import type { PokemonDetail } from "./types";

export type QuizQuestionKind = "type" | "stat";

export type QuizQuestion = {
  kind: QuizQuestionKind;
  pokemon: PokemonDetail;
  options: string[];
  correctAnswers: string[];
};

const STATS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
];

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createQuizQuestion(
  pokemon: PokemonDetail,
  kind: QuizQuestionKind,
  random: () => number = Math.random,
): QuizQuestion {
  if (kind === "type") {
    const primaryType = pokemon.types.find((type) => type.slot === 1)?.type.name;
    if (!primaryType || !POKEMON_TYPES.includes(primaryType as (typeof POKEMON_TYPES)[number])) {
      throw new Error(`Pokémon ${pokemon.name} has no valid primary type.`);
    }

    const distractors = shuffle(
      POKEMON_TYPES.filter((type) => type !== primaryType),
      random,
    ).slice(0, 3);

    return {
      kind,
      pokemon,
      options: shuffle([primaryType, ...distractors], random),
      correctAnswers: [primaryType],
    };
  }

  const baseStats = new Map(
    pokemon.stats.map(({ stat, base_stat }) => [stat.name, base_stat]),
  );
  const availableStats = STATS.filter((stat) => baseStats.has(stat));
  if (availableStats.length < 4) {
    throw new Error(`Pokémon ${pokemon.name} has insufficient base-stat data.`);
  }
  const highestValue = Math.max(
    ...availableStats.map((stat) => baseStats.get(stat) ?? 0),
  );
  const highestStats = availableStats.filter(
    (stat) => baseStats.get(stat) === highestValue,
  );
  const correctAnswers = shuffle(highestStats, random).slice(0, 4);
  const distractors = shuffle(
    availableStats.filter((stat) => !highestStats.includes(stat)),
    random,
  ).slice(0, Math.max(0, 4 - correctAnswers.length));

  return {
    kind,
    pokemon,
    options: shuffle([...correctAnswers, ...distractors], random),
    correctAnswers,
  };
}

export function isCorrectAnswer(
  question: QuizQuestion,
  answer: string,
): boolean {
  return question.correctAnswers.includes(answer);
}
