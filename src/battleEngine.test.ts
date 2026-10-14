import { describe, expect, it } from "vitest";
import {
  calculateBattleStats,
  chooseBlindDraftPokemon,
  createBattle,
  createBattleReport,
  createBlindDraft,
  resolveTurn,
} from "./battleEngine";
import type { BattlePokemon } from "./battleEngine";

function pokemon(id: number, name: string, power = 100): BattlePokemon {
  return {
    id,
    name,
    types: ["fire"],
    stats: {
      hp: 100,
      attack: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    moves: [{
      id: 1,
      name: "flame-test",
      type: "fire",
      power,
      accuracy: 100,
      pp: 3,
      damageClass: "special",
    }],
  };
}

describe("battle engine", () => {
  it("calculates standard level-50 stats from base stats", () => {
    expect(calculateBattleStats({
      hp: 100,
      attack: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    })).toEqual({
      hp: 175,
      attack: 120,
      defense: 120,
      specialAttack: 120,
      specialDefense: 120,
      speed: 120,
    });
  });

  it("resolves turns by speed, spends PP, replaces a knockout, and reports damage", () => {
    const battle = createBattle(
      "singles",
      ["Ash", "Misty"],
      [
        Array.from({ length: 6 }, (_, index) => pokemon(index + 1, `ember-${index}`, 1000)),
        Array.from({ length: 6 }, (_, index) => pokemon(index + 11, `splash-${index}`, 10)),
      ],
    );
    battle.sides[0].roster[0].pokemon.stats.speed = 120;
    battle.sides[0].roster[0].pokemon.types = ["water"];

    resolveTurn(battle, [[{ actor: 0, moveIndex: 0, target: 0 }], [{ actor: 0, moveIndex: 0, target: 0 }]], () => 0.5);

    expect(battle.sides[1].roster[0].hp).toBe(0);
    expect(battle.sides[1].active[0]).toBe(1);
    expect(battle.sides[0].roster[0].pp[0]).toBe(2);

    const report = createBattleReport({
      ...battle,
      status: "finished",
      winner: 0,
    });
    expect(report.sides[0].pokemon[0].movesUsed).toBe(1);
    expect(report.sides[0].pokemon[0].knockouts).toBe(1);
    expect(report.sides[1].pokemon[0].damageTaken).toBeGreaterThan(0);
  });

  it("supports two active Pokémon per side in doubles and rejects missing actions", () => {
    const teams = [
      Array.from({ length: 3 }, (_, index) => pokemon(index + 1, `red-${index}`)),
      Array.from({ length: 3 }, (_, index) => pokemon(index + 11, `blue-${index}`)),
    ] as [BattlePokemon[], BattlePokemon[]];
    const battle = createBattle("doubles", ["Red", "Blue"], teams);
    expect(battle.sides[0].active).toEqual([0, 1]);
    expect(() => resolveTurn(battle, [[{ actor: 0, moveIndex: 0, target: 0 }], []])).toThrow(
      "Side 1 must submit 2 action(s).",
    );
    resolveTurn(
      battle,
      [
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 1 }],
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 1 }],
      ],
      () => 0.5,
    );
    expect(battle.turn).toBe(2);
    expect(battle.sides[0].roster[0].pp[0]).toBe(2);
  });

  it("uses Struggle when every move is out of PP and records an immunity as zero damage", () => {
    const teams = [
      Array.from({ length: 6 }, (_, index) => pokemon(index + 1, `attacker-${index}`)),
      Array.from({ length: 6 }, (_, index) => ({
        ...pokemon(index + 11, `immune-${index}`),
        types: ["ghost"],
      })),
    ] as [BattlePokemon[], BattlePokemon[]];
    const battle = createBattle("singles", ["Red", "Blue"], teams);
    battle.sides[0].roster[0].pp[0] = 0;

    resolveTurn(
      battle,
      [[{ actor: 0, moveIndex: -1, target: 0 }], [{ actor: 0, moveIndex: 0, target: 0 }]],
      () => 0.5,
    );

    expect(battle.sides[0].roster[0].movesUsed).toBe(1);
    expect(battle.sides[0].roster[0].pp[0]).toBe(0);
    expect(battle.sides[1].roster[0].hp).toBe(battle.sides[1].roster[0].maxHp);
    expect(battle.events.find((event) => event.kind === "damage" && event.side === 0)).toMatchObject({
      amount: 0,
      effectiveness: 0,
    });
  });

  it("replaces a fainted doubles Pokémon with a living teammate under the same controller", () => {
    const teams = [
      Array.from({ length: 6 }, (_, index) => pokemon(index + 1, `red-${index}`, 1000)),
      Array.from({ length: 6 }, (_, index) => pokemon(index + 11, `blue-${index}`, 1)),
    ] as [BattlePokemon[], BattlePokemon[]];
    const controllers = [[0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1]] as [number[], number[]];
    const battle = createBattle("doubles", ["Red", "Blue"], teams, controllers);
    battle.sides[1].roster[0].hp = 1;

    resolveTurn(
      battle,
      [
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 1 }],
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 1 }],
      ],
      () => 0.5,
    );

    expect(battle.sides[1].active[0]).toBe(1);
    expect(battle.sides[1].active[1]).toBe(4);
    expect(battle.events).toContainEqual({ kind: "switch-in", side: 1, pokemon: 1 });
    expect(battle.events).toContainEqual({ kind: "switch-in", side: 1, pokemon: 4 });
  });

  it("continues a doubles battle with one active Pokémon after its bench is exhausted", () => {
    const teams = [
      Array.from({ length: 3 }, (_, index) => pokemon(index + 1, `red-${index}`, 1000)),
      Array.from({ length: 3 }, (_, index) => pokemon(index + 11, `blue-${index}`, 10)),
    ] as [BattlePokemon[], BattlePokemon[]];
    const battle = createBattle("doubles", ["Red", "Blue"], teams);

    resolveTurn(
      battle,
      [
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 1 }],
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 0 }],
      ],
      () => 0.5,
    );

    expect(battle.sides[1].active.filter((index) => battle.sides[1].roster[index].hp > 0)).toHaveLength(1);
    expect(() => resolveTurn(
      battle,
      [
        [{ actor: 0, moveIndex: 0, target: 0 }, { actor: 1, moveIndex: 0, target: 0 }],
        [{ actor: 0, moveIndex: 0, target: 0 }],
      ],
      () => 0.5,
    )).not.toThrow();
  });

  it("rejects malformed actions rather than accessing an invalid move slot", () => {
    const battle = createBattle(
      "singles",
      ["Red", "Blue"],
      [
        Array.from({ length: 6 }, (_, index) => pokemon(index + 1, `red-${index}`)),
        Array.from({ length: 6 }, (_, index) => pokemon(index + 11, `blue-${index}`)),
      ],
    );

    expect(() => resolveTurn(
      battle,
      [[{ actor: 0, moveIndex: 99, target: 0 }], [{ actor: 0, moveIndex: 0, target: 0 }]],
    )).toThrow("An action selected an unavailable Pokémon or move.");
  });

  it("creates and validates twelve-ball drafts with six unique selections", () => {
    const draft = createBlindDraft(Array.from({ length: 30 }, (_, index) => index + 1), () => 0);
    expect(draft.pool).toHaveLength(12);
    expect(new Set(draft.pool).size).toBe(12);
    let current = draft;
    for (const id of draft.pool.slice(0, 6)) {
      current = chooseBlindDraftPokemon(current, id);
    }
    expect(current.chosen).toHaveLength(6);
    expect(() => chooseBlindDraftPokemon(current, draft.pool[6])).toThrow(
      "Your blind draft team is already full.",
    );
  });
});
