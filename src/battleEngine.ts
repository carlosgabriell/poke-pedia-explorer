import { getTypeEffectiveness } from "./typeEffectiveness";

export type BattleMove = {
  id: number;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
  damageClass: "physical" | "special";
};

export const STRUGGLE_MOVE: BattleMove = {
  id: -1,
  name: "struggle",
  type: "normal",
  power: 50,
  accuracy: 100,
  pp: Number.MAX_SAFE_INTEGER,
  damageClass: "physical",
};

export type BattlePokemon = {
  id: number;
  name: string;
  types: string[];
  stats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  moves: BattleMove[];
};

export type BattleFormat = "singles" | "doubles";
export type BattleStatus = "active" | "finished";

export type BattleAction = {
  actor: number;
  moveIndex: number;
  target: number;
};

export type BattlePokemonState = {
  pokemon: BattlePokemon;
  hp: number;
  maxHp: number;
  pp: number[];
  damageDealt: number;
  damageTaken: number;
  movesUsed: number;
  misses: number;
  knockouts: number;
};

export type BattleSide = {
  name: string;
  roster: BattlePokemonState[];
  active: number[];
  controllers: number[];
};

export type BattleEvent =
  | { kind: "used"; side: number; actor: number; move: string; target: number }
  | { kind: "miss"; side: number; actor: number; move: string; target: number }
  | {
      kind: "damage";
      side: number;
      actor: number;
      move: string;
      target: number;
      amount: number;
      effectiveness: number;
    }
  | { kind: "knockout"; side: number; pokemon: number }
  | { kind: "switch-in"; side: number; pokemon: number }
  | { kind: "turn"; number: number };

export type BattleState = {
  format: BattleFormat;
  status: BattleStatus;
  turn: number;
  sides: [BattleSide, BattleSide];
  events: BattleEvent[];
  winner: number | null;
};

export type BattleReport = {
  winner: string;
  turns: number;
  sides: {
    name: string;
    damageDealt: number;
    damageTaken: number;
    knockouts: number;
    pokemon: {
      name: string;
      damageDealt: number;
      damageTaken: number;
      movesUsed: number;
      misses: number;
      knockouts: number;
    }[];
  }[];
  events: BattleEvent[];
};

export function calculateBattleStats(
  baseStats: BattlePokemon["stats"],
  level = 50,
): BattlePokemon["stats"] {
  const stat = (base: number) => Math.floor(((2 * base + 31) * level) / 100) + 5;
  return {
    hp: Math.floor(((2 * baseStats.hp + 31) * level) / 100) + level + 10,
    attack: stat(baseStats.attack),
    defense: stat(baseStats.defense),
    specialAttack: stat(baseStats.specialAttack),
    specialDefense: stat(baseStats.specialDefense),
    speed: stat(baseStats.speed),
  };
}

export function createBattle(
  format: BattleFormat,
  sideNames: [string, string],
  rosters: [BattlePokemon[], BattlePokemon[]],
  controllers?: [number[], number[]],
): BattleState {
  const teamSize = format === "singles" ? 6 : 3;
  const activeCount = format === "singles" ? 1 : 2;

  rosters.forEach((roster, index) => {
    const validSize = roster.length === teamSize ||
      (format === "doubles" && roster.length === teamSize * 2 && controllers?.[index]?.length === roster.length);
    if (!validSize) {
      throw new Error(`Each ${format} team must contain exactly ${teamSize} Pokémon.`);
    }
    roster.forEach((pokemon) => {
      if (pokemon.moves.length === 0) {
        throw new Error(`${pokemon.name} needs at least one damaging move.`);
      }
      if (pokemon.moves.some((move) => move.power <= 0 || move.pp <= 0)) {
        throw new Error(`${pokemon.name} has an invalid move.`);
      }
    });
    if (!sideNames[index].trim()) {
      throw new Error("Each player needs a display name.");
    }
    if (controllers?.[index]?.some((controller) => !Number.isInteger(controller) || controller < 0)) {
      throw new Error("Controller IDs must be non-negative integers.");
    }
    if (controllers?.[index] && controllers[index].length !== roster.length) {
      throw new Error("Each Pokémon must have exactly one controller.");
    }
  });

  return {
    format,
    status: "active",
    turn: 1,
    sides: [0, 1].map((side) => ({
      name: sideNames[side],
      roster: rosters[side].map((pokemon) => {
        const battlePokemon = {
          ...pokemon,
          stats: calculateBattleStats(pokemon.stats),
        };
        return {
        pokemon: battlePokemon,
        hp: battlePokemon.stats.hp,
        maxHp: battlePokemon.stats.hp,
        pp: pokemon.moves.map((move) => move.pp),
        damageDealt: 0,
        damageTaken: 0,
        movesUsed: 0,
        misses: 0,
        knockouts: 0,
      };
      }),
      active: format === "doubles" && rosters[side].length === teamSize * 2
        ? [0, teamSize]
        : Array.from({ length: activeCount }, (_, slot) => slot),
      controllers: controllers?.[side] ?? rosters[side].map(() => 0),
    })) as [BattleSide, BattleSide],
    events: [],
    winner: null,
  };
}

function replaceFainted(
  state: BattleState,
  sideIndex: number,
  slot: number,
): void {
  const side = state.sides[sideIndex];
  const faintedIndex = side.active[slot];
  if (side.roster[faintedIndex].hp > 0) return;

  const activeSet = new Set(side.active);
  const owner = side.controllers[faintedIndex];
  const replacement = side.roster.findIndex(
    (pokemon, index) =>
      pokemon.hp > 0 &&
      !activeSet.has(index) &&
      side.controllers[index] === owner,
  );
  if (replacement === -1) return;

  side.active[slot] = replacement;
  state.events.push({ kind: "switch-in", side: sideIndex, pokemon: replacement });
}

function sideHasPokemon(side: BattleSide): boolean {
  return side.roster.some((pokemon) => pokemon.hp > 0);
}

export function resolveTurn(
  state: BattleState,
  actions: [BattleAction[], BattleAction[]],
  random: () => number = Math.random,
): BattleState {
  if (state.status !== "active") throw new Error("This battle has already ended.");

  actions.forEach((sideActions, sideIndex) => {
    const expectedActions = state.sides[sideIndex].active.filter(
      (rosterIndex) => state.sides[sideIndex].roster[rosterIndex].hp > 0,
    ).length;
    if (sideActions.length !== expectedActions) {
      throw new Error(`Side ${sideIndex + 1} must submit ${expectedActions} action(s).`);
    }
    sideActions.forEach((action) => {
      if (
        !Number.isInteger(action.actor) ||
        !Number.isInteger(action.moveIndex) ||
        !Number.isInteger(action.target)
      ) {
        throw new Error("An action selected an unavailable Pokémon or move.");
      }
      const side = state.sides[sideIndex];
      const actorIndex = side.active[action.actor];
      const actor = side.roster[actorIndex];
      const allMovesDepleted = actor?.pp.every((pp) => pp <= 0) ?? false;
      const move = action.moveIndex === -1 && allMovesDepleted
        ? STRUGGLE_MOVE
        : actor?.pokemon.moves[action.moveIndex];
      if (
        !actor ||
        actor.hp <= 0 ||
        !move ||
        (action.moveIndex === -1 && !allMovesDepleted) ||
        (action.moveIndex >= 0 && (actor.pp[action.moveIndex] === undefined || actor.pp[action.moveIndex] <= 0))
      ) {
        throw new Error("An action selected an unavailable Pokémon or move.");
      }
      const targetIndex = state.sides[1 - sideIndex].active[action.target];
      const target = state.sides[1 - sideIndex].roster[targetIndex];
      if (!target || target.hp <= 0) throw new Error("An action selected an invalid target.");
    });
  });

  state.events.push({ kind: "turn", number: state.turn });
  const ordered = actions.flatMap((sideActions, side) =>
    sideActions.map((action) => ({ side, action })),
  ).sort((left, right) => {
    const leftPokemon = state.sides[left.side].roster[
      state.sides[left.side].active[left.action.actor]
    ];
    const rightPokemon = state.sides[right.side].roster[
      state.sides[right.side].active[right.action.actor]
    ];
    return rightPokemon.pokemon.stats.speed - leftPokemon.pokemon.stats.speed;
  });

  ordered.forEach(({ side: sideIndex, action }) => {
    if (state.status !== "active") return;
    const side = state.sides[sideIndex];
    const targetSideIndex = 1 - sideIndex;
    const actorIndex = side.active[action.actor];
    const actor = side.roster[actorIndex];
    if (!actor || actor.hp <= 0) return;

    const move = action.moveIndex === -1 ? STRUGGLE_MOVE : actor.pokemon.moves[action.moveIndex];
    const targetIndex = state.sides[targetSideIndex].active[action.target];
    const target = state.sides[targetSideIndex].roster[targetIndex];
    if (!target || target.hp <= 0) return;

    if (action.moveIndex >= 0) actor.pp[action.moveIndex] -= 1;
    actor.movesUsed += 1;
    state.events.push({
      kind: "used",
      side: sideIndex,
      actor: actorIndex,
      move: move.name,
      target: targetIndex,
    });
    if (random() * 100 >= move.accuracy) {
      actor.misses += 1;
      state.events.push({
        kind: "miss",
        side: sideIndex,
        actor: actorIndex,
        move: move.name,
        target: targetIndex,
      });
      return;
    }

    const attack = move.damageClass === "physical"
      ? actor.pokemon.stats.attack
      : actor.pokemon.stats.specialAttack;
    const defense = move.damageClass === "physical"
      ? target.pokemon.stats.defense
      : target.pokemon.stats.specialDefense;
    const effectiveness = getTypeEffectiveness(move.type, target.pokemon.types);
    const stab = actor.pokemon.types.includes(move.type) ? 1.5 : 1;
    const randomFactor = 0.85 + random() * 0.15;
    const baseDamage =
      (((2 * 50 / 5 + 2) * move.power * attack / Math.max(1, defense)) / 50) + 2;
    const damage = effectiveness === 0
      ? 0
      : Math.max(1, Math.floor(baseDamage * stab * effectiveness * randomFactor));

    target.hp = Math.max(0, target.hp - damage);
    actor.damageDealt += damage;
    target.damageTaken += damage;
    state.events.push({
      kind: "damage",
      side: sideIndex,
      actor: actorIndex,
      move: move.name,
      target: targetIndex,
      amount: damage,
      effectiveness,
    });

    if (target.hp === 0) {
      actor.knockouts += 1;
      state.events.push({ kind: "knockout", side: targetSideIndex, pokemon: targetIndex });
      replaceFainted(state, targetSideIndex, action.target);
    }

    if (!sideHasPokemon(state.sides[targetSideIndex])) {
      state.status = "finished";
      state.winner = sideIndex;
    }
  });

  if (state.status === "active") state.turn += 1;
  return state;
}

export function createBattleReport(state: BattleState): BattleReport {
  if (state.status !== "finished" || state.winner === null) {
    throw new Error("A battle report is only available after the battle ends.");
  }
  return {
    winner: state.sides[state.winner].name,
    turns: state.turn,
    sides: state.sides.map((side) => ({
      name: side.name,
      damageDealt: side.roster.reduce((sum, pokemon) => sum + pokemon.damageDealt, 0),
      damageTaken: side.roster.reduce((sum, pokemon) => sum + pokemon.damageTaken, 0),
      knockouts: side.roster.reduce((sum, pokemon) => sum + pokemon.knockouts, 0),
      pokemon: side.roster.map((pokemon) => ({
        name: pokemon.pokemon.name,
        damageDealt: pokemon.damageDealt,
        damageTaken: pokemon.damageTaken,
        movesUsed: pokemon.movesUsed,
        misses: pokemon.misses,
        knockouts: pokemon.knockouts,
      })),
    })) as BattleReport["sides"],
    events: [...state.events],
  };
}

export function createBlindDraft(
  candidates: number[],
  random: () => number = Math.random,
): { pool: number[]; chosen: number[] } {
  if (candidates.length < 12) throw new Error("Blind draft needs at least 12 Pokémon.");
  const unique = [...new Set(candidates)];
  if (unique.length < 12) throw new Error("Blind draft candidates must be unique.");
  const shuffled = [...unique];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return { pool: shuffled.slice(0, 12), chosen: [] };
}

export function chooseBlindDraftPokemon(
  draft: { pool: number[]; chosen: number[] },
  id: number,
  limit = 6,
): { pool: number[]; chosen: number[] } {
  if (!draft.pool.includes(id)) throw new Error("Choose a Pokémon from your draft pool.");
  if (draft.chosen.includes(id)) throw new Error("That Pokémon is already on your team.");
  if (draft.chosen.length >= limit) throw new Error("Your blind draft team is already full.");
  return { ...draft, chosen: [...draft.chosen, id] };
}
