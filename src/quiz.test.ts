import { describe, expect, it } from "vitest";
import { createQuizQuestion, isCorrectAnswer } from "./quiz";
import type { PokemonDetail } from "./types";

function pokemonDetail(): PokemonDetail {
  return {
    id: 6,
    name: "charizard",
    height: 17,
    weight: 905,
    base_experience: 267,
    sprites: { front_default: null },
    types: [
      { slot: 1, type: { name: "fire", url: "" } },
      { slot: 2, type: { name: "flying", url: "" } },
    ],
    abilities: [],
    stats: [
      { base_stat: 78, stat: { name: "hp" } },
      { base_stat: 84, stat: { name: "attack" } },
      { base_stat: 78, stat: { name: "defense" } },
      { base_stat: 109, stat: { name: "special-attack" } },
      { base_stat: 85, stat: { name: "special-defense" } },
      { base_stat: 100, stat: { name: "speed" } },
    ],
    species: { name: "charizard", url: "" },
  };
}

describe("createQuizQuestion", () => {
  it("makes a four-choice primary-type question with one verifiable answer", () => {
    const question = createQuizQuestion(pokemonDetail(), "type", () => 0);

    expect(question.options).toHaveLength(4);
    expect(new Set(question.options).size).toBe(4);
    expect(question.options).toContain("fire");
    expect(question.correctAnswers).toEqual(["fire"]);
    expect(isCorrectAnswer(question, "fire")).toBe(true);
    expect(isCorrectAnswer(question, "flying")).toBe(false);
  });

  it("makes a stat question and identifies the highest base stat", () => {
    const question = createQuizQuestion(pokemonDetail(), "stat", () => 0);

    expect(question.options).toHaveLength(4);
    expect(question.options).toContain("special-attack");
    expect(question.correctAnswers).toEqual(["special-attack"]);
  });

  it("accepts tied highest stats without making the answer ambiguous", () => {
    const pokemon = pokemonDetail();
    pokemon.stats[0].base_stat = 109;
    const question = createQuizQuestion(pokemon, "stat", () => 0);

    expect(question.correctAnswers).toContain("hp");
    expect(question.correctAnswers).toContain("special-attack");
    expect(question.correctAnswers.every((answer) => question.options.includes(answer))).toBe(true);
  });
});
