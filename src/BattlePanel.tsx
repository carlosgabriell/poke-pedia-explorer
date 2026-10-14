import { useEffect, useMemo, useRef, useState } from "react";
import { formatPokemonName, getArtwork, getBattleMoves, getPokemon } from "./api";
import {
  chooseBlindDraftPokemon,
  createBattle,
  createBattleReport,
  createBlindDraft,
  resolveTurn,
} from "./battleEngine";
import { getTypeEffectiveness } from "./typeEffectiveness";
import type {
  BattleAction,
  BattleFormat,
  BattlePokemon,
  BattlePokemonState,
  BattleState,
} from "./battleEngine";
import {
  battleRoomsConfigured,
  connectBattleRoom,
  onlineControllerForSeat,
  onlineSeatForController,
  onlineSideForSeat,
  createBattleRoomCode,
} from "./battleRooms";
import type { BattleRoomMessage, BattleRoomPlayer } from "./battleRooms";
import type { Locale } from "./i18n";
import type { PokemonDetail } from "./types";

type Props = {
  locale: Locale;
  savedTeamNames: string[];
};

type Screen = "lobby" | "room" | "draft" | "loading" | "battle" | "report";
type Draft = { pool: number[]; chosen: number[] };
type OnlineRoom = {
  code: string;
  playerId: string;
  hostId: string;
  seat: number | null;
  format: BattleFormat;
  players: BattleRoomPlayer[];
  readySeats: number[];
};

function isBattleState(value: unknown): value is BattleState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<BattleState>;
  return (
    (candidate.format === "singles" || candidate.format === "doubles") &&
    (candidate.status === "active" || candidate.status === "finished") &&
    Number.isInteger(candidate.turn) &&
    Array.isArray(candidate.sides) &&
    candidate.sides.length === 2 &&
    candidate.sides.every((side) =>
      typeof side.name === "string" &&
      Array.isArray(side.roster) &&
      Array.isArray(side.active) &&
      Array.isArray(side.controllers) &&
      side.controllers.length === side.roster.length &&
      side.active.every((index) => Number.isInteger(index) && index >= 0 && index < side.roster.length) &&
      side.controllers.every((controller) => Number.isInteger(controller) && controller >= 0) &&
      side.roster.every((entry) =>
        Number.isFinite(entry.hp) &&
        Number.isFinite(entry.maxHp) &&
        entry.hp >= 0 &&
        entry.hp <= entry.maxHp &&
        typeof entry.pokemon?.name === "string" &&
        entry.pokemon.stats !== null &&
        typeof entry.pokemon.stats === "object" &&
        Array.isArray(entry.pokemon.moves) &&
        Array.isArray(entry.pp) &&
        entry.pp.length === entry.pokemon.moves.length &&
        entry.pp.every((pp) => Number.isFinite(pp) && pp >= 0)
      )
    ) &&
    Array.isArray(candidate.events) &&
    (candidate.winner === null || candidate.winner === 0 || candidate.winner === 1)
  );
}

function onlineRosterIsValid(value: unknown, format: BattleFormat): value is BattlePokemon[] {
  const expected = format === "singles" ? 6 : 3;
  if (!Array.isArray(value) || value.length !== expected) return false;
  return value.every((pokemon) =>
    typeof pokemon.id === "number" &&
    typeof pokemon.name === "string" &&
    Array.isArray(pokemon.types) &&
    pokemon.stats !== null &&
    typeof pokemon.stats === "object" &&
    ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"].every((stat) =>
      Number.isFinite(pokemon.stats[stat as keyof BattlePokemon["stats"]]) &&
      pokemon.stats[stat as keyof BattlePokemon["stats"]] > 0
    ) &&
    Array.isArray(pokemon.moves) &&
    pokemon.moves.length > 0 &&
    pokemon.moves.every((move: BattlePokemon["moves"][number]) =>
      typeof move.id === "number" &&
      typeof move.name === "string" &&
      typeof move.type === "string" &&
      typeof move.power === "number" &&
      Number.isFinite(move.power) &&
      typeof move.accuracy === "number" &&
      Number.isFinite(move.accuracy) &&
      move.accuracy >= 0 &&
      move.accuracy <= 100 &&
      typeof move.pp === "number" &&
      Number.isFinite(move.pp) &&
      move.pp > 0 &&
      (move.damageClass === "physical" || move.damageClass === "special")
    ),
  );
}

function copy(locale: Locale, pt: string, en: string): string {
  return locale === "pt-BR" ? pt : en;
}

function toBattlePokemon(detail: PokemonDetail, moves: Awaited<ReturnType<typeof getBattleMoves>>): BattlePokemon {
  const stats = Object.fromEntries(detail.stats.map(({ stat, base_stat }) => [stat.name, base_stat]));
  return {
    id: detail.id,
    name: detail.name,
    types: detail.types.map(({ type }) => type.name),
    stats: {
      hp: Number(stats.hp),
      attack: Number(stats.attack),
      defense: Number(stats.defense),
      specialAttack: Number(stats["special-attack"]),
      specialDefense: Number(stats["special-defense"]),
      speed: Number(stats.speed),
    },
    moves,
  };
}

function aiActions(state: BattleState): BattleAction[] {
  const side = state.sides[1];
  return side.active.flatMap((rosterIndex, actor) => {
    const pokemon = side.roster[rosterIndex];
    if (pokemon.hp <= 0) return [];
    const available = pokemon.pp.flatMap((pp, index) => pp > 0 ? [index] : []);
    if (available.length === 0) return [{ actor, moveIndex: -1, target: 0 }];

    const targetSide = state.sides[0];
    const livingTargets = targetSide.active.flatMap((index, slot) =>
      targetSide.roster[index].hp > 0 ? [{ pokemon: targetSide.roster[index], slot }] : [],
    );
    if (livingTargets.length === 0) return [];
    const target = livingTargets.reduce((best, current) => {
      const bestPokemon = best.pokemon;
      return current.pokemon.hp / current.pokemon.maxHp < bestPokemon.hp / bestPokemon.maxHp ? current : best;
    });
    const moveIndex = available.reduce((bestIndex, currentIndex) => {
      const bestMove = pokemon.pokemon.moves[bestIndex];
      const currentMove = pokemon.pokemon.moves[currentIndex];
      const targetPokemon = target.pokemon.pokemon;
      const score = currentMove.power *
        (pokemon.pokemon.types.includes(currentMove.type) ? 1.5 : 1) *
        getTypeEffectiveness(currentMove.type, targetPokemon.types);
      const bestScore = bestMove.power *
        (pokemon.pokemon.types.includes(bestMove.type) ? 1.5 : 1) *
        getTypeEffectiveness(bestMove.type, targetPokemon.types);
      return score > bestScore ? currentIndex : bestIndex;
    }, available[0]);
    return [{ actor, moveIndex, target: target.slot }];
  });
}

async function loadBattleTeam(details: PokemonDetail[]): Promise<BattlePokemon[]> {
  return Promise.all(details.map(async (detail) =>
    toBattlePokemon(detail, await getBattleMoves(detail)),
  ));
}

function hpPercent(pokemon: BattlePokemonState): number {
  return Math.max(0, Math.min(100, (pokemon.hp / pokemon.maxHp) * 100));
}

function eventText(event: BattleState["events"][number], state: BattleState, locale: Locale): string {
  const names = state.sides;
  if (event.kind === "turn") return `${copy(locale, "Turno", "Turn")} ${event.number}`;
  if (event.kind === "switch-in") {
    const pokemon = names[event.side].roster[event.pokemon].pokemon.name;
    return `${formatPokemonName(pokemon)} ${copy(locale, "entrou em campo!", "entered the field!")}`;
  }
  if (event.kind === "knockout") {
    return `${formatPokemonName(names[event.side].roster[event.pokemon].pokemon.name)} ${copy(locale, "foi nocauteado!", "was knocked out!")}`;
  }
  const actor = formatPokemonName(names[event.side].roster[event.actor].pokemon.name);
  const target = formatPokemonName(names[1 - event.side].roster[event.target].pokemon.name);
  if (event.kind === "used") return `${actor} ${copy(locale, "usou", "used")} ${formatPokemonName(event.move)}!`;
  if (event.kind === "miss") return `${actor} ${copy(locale, "errou", "missed")} ${formatPokemonName(event.move)}!`;
  return `${actor} ${copy(locale, "causou", "dealt")} ${event.amount} ${copy(locale, "de dano em", "damage to")} ${target}.`;
}

async function createShareBlob(state: BattleState): Promise<Blob> {
  const report = createBattleReport(state);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar a imagem da batalha.");
  const gradient = context.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#173e34");
  gradient.addColorStop(1, "#375b38");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 630);
  context.fillStyle = "#d9e8bf";
  context.font = "700 26px sans-serif";
  context.fillText("POKÉPEDIA EXPLORER · BATTLE REPORT", 64, 72);
  context.fillStyle = "#ffffff";
  context.font = "700 48px sans-serif";
  context.fillText(`${report.winner} WINS!`, 64, 166);
  context.font = "600 28px sans-serif";
  context.fillStyle = "#e9f0e4";
  context.fillText(`${report.sides[0].name}  ${report.sides[0].damageDealt} DMG`, 64, 264);
  context.fillText(`${report.sides[1].name}  ${report.sides[1].damageDealt} DMG`, 64, 326);
  context.fillStyle = "#d9e8bf";
  context.font = "500 23px sans-serif";
  context.fillText(`${report.turns} turns  ·  ${report.sides[0].knockouts + report.sides[1].knockouts} knockouts`, 64, 414);
  context.fillStyle = "#ffffff";
  context.font = "500 17px sans-serif";
  context.fillText("poke-pedia-explorer.vercel.app", 64, 570);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível exportar o relatório da batalha."));
    }, "image/png");
  });
}

export function BattlePanel({ locale, savedTeamNames }: Props) {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [format, setFormat] = useState<BattleFormat>("singles");
  const [mode, setMode] = useState<"standard" | "blind">("standard");
  const [playerName, setPlayerName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftDetails, setDraftDetails] = useState<Record<number, PokemonDetail>>({});
  const [loadingBall, setLoadingBall] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [playerActions, setPlayerActions] = useState<BattleAction[]>([]);
  const [moveSelections, setMoveSelections] = useState<Record<number, number>>({});
  const [targetSelections, setTargetSelections] = useState<Record<number, number>>({});
  const [sharing, setSharing] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [roomCodeEntry, setRoomCodeEntry] = useState("");
  const [roomStarting, setRoomStarting] = useState(false);
  const roomConnection = useRef<Awaited<ReturnType<typeof connectBattleRoom>> | null>(null);
  const onlineRoomRef = useRef<OnlineRoom | null>(null);
  const roomTeams = useRef(new Map<number, BattlePokemon[]>());
  const seatOwners = useRef(new Map<string, number>());
  const submittedActions = useRef(new Map<number, { turn: number; actions: BattleAction[] }>());
  const battleRef = useRef<BattleState | null>(null);
  const autoJoinAttempted = useRef(false);

  const teamLimit = format === "singles" ? 6 : 3;
  const selectedDetails = useMemo(
    () => selectedTeam.flatMap((name) => draftDetails[Number(name)] ? [draftDetails[Number(name)]] : []),
    [selectedTeam, draftDetails],
  );

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("battle");
    if (code && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      void joinOnlineRoom(code);
    }
  }, []);

  useEffect(() => () => {
    if (roomConnection.current) {
      void roomConnection.current.close().catch((error: unknown) => {
        console.error("Failed to close the battle room channel.", error);
      });
    }
  }, []);

  useEffect(() => {
    battleRef.current = battle;
  }, [battle]);

  useEffect(() => {
    onlineRoomRef.current = onlineRoom;
  }, [onlineRoom]);

  function updateOnlineRoom(
    update: (current: OnlineRoom | null) => OnlineRoom | null,
  ) {
    const next = update(onlineRoomRef.current);
    onlineRoomRef.current = next;
    setOnlineRoom(next);
  }

  function updateRoomUrl(code: string | null) {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("battle", code);
    else url.searchParams.delete("battle");
    window.history.replaceState(null, "", url);
  }

  async function copyRoomLink() {
    if (!onlineRoom) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?battle=${onlineRoom.code}`);
      setMessage(copy(locale, "Link da sala copiado!", "Room link copied!"));
    } catch {
      setMessage(copy(locale, "Não foi possível copiar o link. Copie o endereço da sala manualmente.", "Could not copy the link. Copy the room URL manually."));
    }
  }

  async function createOnlineRoom() {
    setMode("standard");
    await connectOnlineRoom(createBattleRoomCode(), true);
  }

  async function joinOnlineRoom(roomCode: string) {
    await connectOnlineRoom(roomCode.trim().toLowerCase(), false);
  }

  async function connectOnlineRoom(roomCode: string, isHost: boolean) {
    if (!battleRoomsConfigured) {
      setMessage(copy(locale, "Salas online precisam da configuração Supabase. Crie o projeto e configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.", "Online rooms need Supabase configuration. Create the project and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."));
      return;
    }
    if (roomConnection.current) {
      setMessage(copy(locale, "Saia da sala atual antes de entrar em outra.", "Leave the current room before joining another."));
      return;
    }
    if (!/^[a-z0-9]{9}$/.test(roomCode)) {
      setMessage(copy(locale, "O código da sala deve ter nove letras ou números.", "Room codes must contain nine letters or numbers."));
      return;
    }
    const playerId = crypto.randomUUID();
    setMode("standard");
    const playerNameValue = playerName.trim() || copy(locale, "Treinador", "Trainer");
    const hostId = isHost ? playerId : "";
    const player: BattleRoomPlayer = {
      playerId,
      name: playerNameValue,
      seat: isHost ? 0 : null,
      host: isHost,
      joinedAt: new Date().toISOString(),
    };
    if (isHost) seatOwners.current.set(playerId, 0);
    setMessage("");
    try {
      const connection = await connectBattleRoom(
        roomCode,
        player,
        (message) => void handleRoomMessage(message),
        (players) => {
          if (isHost) {
            const connectedIds = new Set(players.map((entry) => entry.playerId));
            const disconnectedSeats: number[] = [];
            seatOwners.current.forEach((seat, ownerId) => {
              if (ownerId !== playerId && !connectedIds.has(ownerId)) {
                seatOwners.current.delete(ownerId);
                roomTeams.current.delete(seat);
                submittedActions.current.delete(seat);
                disconnectedSeats.push(seat);
              }
            });
            updateOnlineRoom((current) => current ? {
              ...current,
              players,
              readySeats: current.readySeats.filter((seat) => !disconnectedSeats.includes(seat)),
            } : current);
            players.forEach((entry) => {
              if (entry.seat !== null) seatOwners.current.set(entry.playerId, entry.seat);
            });
            const activeBattle = battleRef.current;
            if (activeBattle?.status === "active" && disconnectedSeats.length > 0) {
              const losingSide = onlineSideForSeat(format, disconnectedSeats[0]);
              const finished: BattleState = {
                ...activeBattle,
                status: "finished",
                winner: 1 - losingSide,
              };
              battleRef.current = finished;
              setBattle(finished);
              setScreen("report");
              setMessage(copy(locale, "Um treinador desconectou. A partida foi encerrada por desistência.", "A trainer disconnected. The match ended by forfeit."));
              broadcastBattleState(finished);
            }
          } else {
            updateOnlineRoom((current) => current ? { ...current, players } : current);
          }
          const activeRoom = onlineRoomRef.current;
          if (
            activeRoom &&
            activeRoom.hostId &&
            activeRoom.hostId !== activeRoom.playerId &&
            !players.some((entry) => entry.playerId === activeRoom.hostId)
          ) {
            setMessage(copy(locale, "O anfitrião desconectou. Esta sala não pode continuar.", "The host disconnected. This room cannot continue."));
          }
        },
      );
      roomConnection.current = connection;
      const nextRoom: OnlineRoom = {
        code: roomCode,
        playerId,
        hostId,
        seat: player.seat,
        format,
        players: [player],
        readySeats: [],
      };
      onlineRoomRef.current = nextRoom;
      setOnlineRoom(nextRoom);
      roomTeams.current.clear();
      submittedActions.current.clear();
      setSelectedTeam(isHost ? selectedTeam : []);
      setScreen("room");
      updateRoomUrl(roomCode);
      if (isHost) {
        await connection.send("room-info", { format, hostName: playerNameValue });
      } else {
        await connection.send("join-request", { name: playerNameValue });
        window.setTimeout(() => {
          const current = onlineRoomRef.current;
          if (current?.code !== roomCode || current.seat !== null) return;
          setMessage(current.hostId
            ? copy(locale, "A sala está cheia ou o anfitrião não respondeu.", "The room is full or the host did not respond.")
            : copy(locale, "Não encontrei um anfitrião com esse código. Confira o link e tente novamente.", "No host was found for this code. Check the link and try again."));
        }, 8000);
      }
    } catch (error) {
      seatOwners.current.clear();
      roomConnection.current = null;
      updateOnlineRoom(() => null);
      updateRoomUrl(null);
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível conectar à sala.", "Could not connect to the room."));
    }
  }

  async function handleRoomMessage(message: BattleRoomMessage) {
    const room = onlineRoomRef.current;
    const connection = roomConnection.current;
    if (!room || !connection) return;
    const payload = message.payload;
    try {
      if (
        message.type === "room-info" &&
        (payload.target === undefined || payload.target === room.playerId) &&
        (!room.hostId || room.hostId === message.sender)
      ) {
        const announcedFormat = payload.format;
        if (announcedFormat !== "singles" && announcedFormat !== "doubles") return;
        setFormat(announcedFormat);
        updateOnlineRoom((current) => current ? {
          ...current,
          format: announcedFormat,
          hostId: message.sender,
        } : current);
        setMessage("");
        await connection.send("join-request", { name: playerName.trim() || copy(locale, "Treinador", "Trainer") });
        return;
      }

      if (message.type === "join-request" && room.hostId === room.playerId) {
        await connection.send("room-info", {
          format: room.format,
          target: message.sender,
        });
        const mappedSeat = seatOwners.current.get(message.sender);
        if (mappedSeat !== undefined) {
          await connection.send("seat-assignment", {
            target: message.sender,
            seat: mappedSeat,
            hostId: room.playerId,
          });
          return;
        }
        const seatCount = room.format === "singles" ? 2 : 4;
        const occupied = new Set([
          ...seatOwners.current.values(),
          ...room.players.flatMap((entry) => entry.seat === null ? [] : [entry.seat]),
        ]);
        const seat = Array.from({ length: seatCount }, (_, index) => index).find((index) => !occupied.has(index));
        if (seat === undefined) {
          await connection.send("room-error", { target: message.sender, reason: "full" });
          return;
        }
        seatOwners.current.set(message.sender, seat);
        await connection.send("seat-assignment", {
          target: message.sender,
          seat,
          hostId: room.playerId,
        });
        return;
      }

      if (
        message.type === "seat-assignment" &&
        message.sender === room.hostId &&
        payload.target === room.playerId
      ) {
        const seat = payload.seat;
        const hostId = payload.hostId;
        if (!Number.isInteger(seat) || typeof hostId !== "string") return;
        updateOnlineRoom((current) => current ? { ...current, seat: Number(seat), hostId } : current);
        await connection.updatePresence(Number(seat));
        setMessage("");
        return;
      }

      if (message.type === "room-error" && message.sender === room.hostId && payload.target === room.playerId) {
        setMessage(copy(locale, "A sala já está cheia. Peça ao anfitrião para criar outra.", "This room is full. Ask the host to create another."));
        return;
      }

      if (message.type === "team-ready") {
        const seat = seatOwners.current.get(message.sender);
        if (room.hostId !== room.playerId || seat === undefined) return;
        const roster = payload.roster;
        if (!onlineRosterIsValid(roster, room.format)) return;
        roomTeams.current.set(seat, roster);
        const readySeats = [...roomTeams.current.keys()].sort((left, right) => left - right);
        updateOnlineRoom((current) => current ? { ...current, readySeats } : current);
        await connection.send("team-readiness", { seat });
        return;
      }

      if (message.type === "team-readiness") {
        if (message.sender !== room.hostId) return;
        const seat = payload.seat;
        if (!Number.isInteger(seat)) return;
        updateOnlineRoom((current) => current
          ? { ...current, readySeats: [...new Set([...current.readySeats, Number(seat)])] }
          : current);
        return;
      }

      if (message.type === "battle-start" && message.sender === room.hostId) {
        const state = payload.state;
        if (!isBattleState(state) || state.format !== room.format) return;
        battleRef.current = state;
        setBattle(state);
        setPlayerActions([]);
        setMessage("");
        setScreen("battle");
        return;
      }

      if (message.type === "player-actions") {
        if (room.hostId !== room.playerId) return;
        acceptPlayerActions(message.sender, payload);
        return;
      }

      if (message.type === "battle-state" && message.sender === room.hostId) {
        const state = payload.state;
        if (!isBattleState(state) || state.format !== room.format) return;
        battleRef.current = state;
        setBattle(state);
        setPlayerActions([]);
        setMoveSelections({});
        setTargetSelections({});
        setMessage("");
        setScreen(state.status === "finished" ? "report" : "battle");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "Falha na comunicação da sala.", "Room communication failed."));
    }
  }

  function actorsForSeat(state: BattleState, seat: number): number[] {
    const room = onlineRoomRef.current;
    if (!room) return [];
    const sideIndex = onlineSideForSeat(room.format, seat);
    const controller = onlineControllerForSeat(room.format, seat);
    const side = state.sides[sideIndex];
    return side.active.flatMap((rosterIndex, actor) =>
      side.roster[rosterIndex]?.hp > 0 && side.controllers[rosterIndex] === controller
        ? [actor]
        : [],
    );
  }

  function broadcastBattleState(state: BattleState) {
    const connection = roomConnection.current;
    if (!connection) return;
    void connection.send("battle-state", { state }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível sincronizar a batalha.", "Could not sync the battle."));
    });
  }

  function acceptPlayerActions(sender: string, payload: Record<string, unknown>) {
    const room = onlineRoomRef.current;
    const current = battleRef.current;
    if (!room || !current || current.status !== "active") return;
    const seat = seatOwners.current.get(sender);
    if (seat === undefined || payload.turn !== current.turn || !Array.isArray(payload.actions)) return;
    const expectedActors = actorsForSeat(current, seat);
    const actions = payload.actions as BattleAction[];
    if (
      actions.length !== expectedActors.length ||
      actions.some((action) =>
        !action ||
        !Number.isInteger(action.actor) ||
        !Number.isInteger(action.moveIndex) ||
        !Number.isInteger(action.target) ||
        !expectedActors.includes(action.actor)
      )
    ) return;

    submittedActions.current.set(seat, { turn: current.turn, actions });
    const requiredSeats = current.sides.flatMap((side, sideIndex) => {
      const controllers = new Set(side.active.flatMap((rosterIndex) =>
        side.roster[rosterIndex]?.hp > 0 ? [side.controllers[rosterIndex]] : [],
      ));
      return [...controllers].map((controller) =>
        onlineSeatForController(room.format, sideIndex, controller),
      );
    });
    if (!requiredSeats.every((requiredSeat) =>
      submittedActions.current.get(requiredSeat)?.turn === current.turn,
    )) {
      setMessage(copy(locale, "Jogada enviada. Aguardando os outros treinadores...", "Move submitted. Waiting for the other trainers..."));
      return;
    }

    const actionsBySide: [BattleAction[], BattleAction[]] = [[], []];
    requiredSeats.forEach((requiredSeat) => {
      const sideIndex = onlineSideForSeat(room.format, requiredSeat);
      actionsBySide[sideIndex].push(...(submittedActions.current.get(requiredSeat)?.actions ?? []));
    });
    try {
      const next = resolveTurn(current, actionsBySide);
      battleRef.current = next;
      setBattle({ ...next, events: [...next.events] });
      setPlayerActions([]);
      setMoveSelections({});
      setTargetSelections({});
      submittedActions.current.clear();
      if (next.status === "finished") setScreen("report");
      setMessage("");
      broadcastBattleState(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "A jogada enviada não é válida.", "The submitted action is invalid."));
      submittedActions.current.clear();
    }
  }

  async function confirmOnlineTeam() {
    const room = onlineRoomRef.current;
    if (!room || room.seat === null || !roomConnection.current) {
      setMessage(copy(locale, "Aguardando sua vaga na sala.", "Waiting for your room seat."));
      return;
    }
    setRoomStarting(true);
    setMessage("");
    try {
      const teamDetails = mode === "blind"
        ? selectedDetails
        : await Promise.all(selectedTeam.map((name) => getPokemon(name)));
      if (teamDetails.length !== (room.format === "singles" ? 6 : 3)) {
        throw new Error(copy(locale, "Escolha a quantidade correta de Pokémon para este formato.", "Choose the correct number of Pokémon for this format."));
      }
      const roster = await loadBattleTeam(teamDetails);
      if (room.hostId === room.playerId) {
        roomTeams.current.set(room.seat, roster);
        const readySeats = [...roomTeams.current.keys()].sort((left, right) => left - right);
        updateOnlineRoom((current) => current ? { ...current, readySeats } : current);
        await roomConnection.current.send("team-readiness", { seat: room.seat });
      } else {
        await roomConnection.current.send("team-ready", { roster });
        updateOnlineRoom((current) => current
          ? { ...current, readySeats: [...new Set([...current.readySeats, room.seat as number])] }
          : current);
      }
      setScreen("room");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível enviar a equipe.", "Could not submit the team."));
    } finally {
      setRoomStarting(false);
    }
  }

  async function startOnlineBattle() {
    const room = onlineRoomRef.current;
    if (!room || room.hostId !== room.playerId) return;
    const seatCount = room.format === "singles" ? 2 : 4;
    const connectedSeats = new Set(room.players.flatMap((player) =>
      player.seat === null ? [] : [player.seat],
    ));
    if (
      room.readySeats.length !== seatCount ||
      connectedSeats.size !== seatCount ||
      !Array.from({ length: seatCount }, (_, seat) => connectedSeats.has(seat)).every(Boolean)
    ) {
      setMessage(copy(locale, "Aguardem todos os jogadores e equipes antes de começar.", "Wait for all players and teams before starting."));
      return;
    }
    const teams = Array.from({ length: seatCount }, (_, seat) => roomTeams.current.get(seat));
    if (teams.some((team) => !team)) {
      setMessage(copy(locale, "Ainda falta uma equipe confirmada.", "A team is still missing."));
      return;
    }
    setRoomStarting(true);
    setMessage("");
    try {
      const teamValues = teams as BattlePokemon[][];
      const rosters: [BattlePokemon[], BattlePokemon[]] = room.format === "singles"
        ? [teamValues[0], teamValues[1]]
        : [
            [...teamValues[0], ...teamValues[1]],
            [...teamValues[2], ...teamValues[3]],
          ];
      const trainerName = (seat: number) =>
        room.players.find((player) => player.seat === seat)?.name ??
        copy(locale, `Treinador ${seat + 1}`, `Trainer ${seat + 1}`);
      const names: [string, string] = room.format === "singles"
        ? [trainerName(0), trainerName(1)]
        : [`${trainerName(0)} & ${trainerName(1)}`, `${trainerName(2)} & ${trainerName(3)}`];
      const controllers: [number[], number[]] | undefined = room.format === "doubles"
        ? [
            [0, 0, 0, 1, 1, 1],
            [0, 0, 0, 1, 1, 1],
          ]
        : undefined;
      const state = createBattle(room.format, names, rosters, controllers);
      battleRef.current = state;
      setBattle(state);
      submittedActions.current.clear();
      setPlayerActions([]);
      setScreen("battle");
      await roomConnection.current?.send("battle-start", { state });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível iniciar a batalha online.", "Could not start the online battle."));
    } finally {
      setRoomStarting(false);
    }
  }

  async function leaveOnlineRoom() {
    try {
      if (roomConnection.current) await roomConnection.current.close();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível sair da sala.", "Could not leave the room."));
      return;
    }
    roomConnection.current = null;
    onlineRoomRef.current = null;
    seatOwners.current.clear();
    roomTeams.current.clear();
    submittedActions.current.clear();
    setOnlineRoom(null);
    setBattle(null);
    setPlayerActions([]);
    setMessage("");
    setScreen("lobby");
    updateRoomUrl(null);
  }

  function startBlindDraft() {
    const playerDraft = createBlindDraft(Array.from({ length: 1025 }, (_, index) => index + 1));
    setDraft(playerDraft);
    setDraftDetails({});
    setSelectedTeam([]);
    setMessage("");
    setMode("blind");
    setScreen("draft");
  }

  async function openBall(id: number) {
    if (!draft || selectedTeam.length >= teamLimit || loadingBall !== null) return;
    setLoadingBall(id);
    setMessage("");
    try {
      const detail = await getPokemon(id);
      setDraftDetails((current) => ({ ...current, [id]: detail }));
      setDraft((current) => current ? chooseBlindDraftPokemon(current, id, teamLimit) : current);
      setSelectedTeam((current) => [...current, String(id)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível abrir essa Pokébola.", "Could not open that Poké Ball."));
    } finally {
      setLoadingBall(null);
    }
  }

  function toggleStandardTeam(name: string) {
    setSelectedTeam((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      if (current.length >= teamLimit) return current;
      return [...current, name];
    });
  }

  async function beginBattle(
    detailsOverride?: PokemonDetail[],
    selectedMode: "standard" | "blind" = mode,
  ) {
    const playerDetails = detailsOverride ?? selectedDetails;
    if (playerDetails.length !== teamLimit) {
      if (!detailsOverride && selectedMode === "standard") {
        setScreen("loading");
        try {
          const loaded = await Promise.all(selectedTeam.map((name) => getPokemon(name)));
          await beginBattle(loaded, selectedMode);
        } catch (error) {
          setScreen("lobby");
          setMessage(error instanceof Error ? error.message : copy(locale, "Falha ao carregar sua equipe.", "Could not load your team."));
        }
        return;
      }
      setMessage(copy(locale, `Escolha exatamente ${teamLimit} Pokémon para sua equipe.`, `Choose exactly ${teamLimit} Pokémon for your team.`));
      return;
    }

    setScreen("loading");
    setMessage("");
    try {
      const ownedIds = new Set(playerDetails.map((pokemon) => pokemon.id));
      const opponentIds: number[] = [];
      while (opponentIds.length < teamLimit) {
        const id = Math.floor(Math.random() * 1025) + 1;
        if (!ownedIds.has(id) && !opponentIds.includes(id)) opponentIds.push(id);
      }
      const [playerRoster, opponentDetails] = await Promise.all([
        loadBattleTeam(playerDetails),
        Promise.all(opponentIds.map(getPokemon)),
      ]);
      const opponentRoster = await loadBattleTeam(opponentDetails);
      const nextBattle = createBattle(
        format,
        [playerName.trim() || copy(locale, "Treinador", "Trainer"), copy(locale, "Rival CPU", "CPU Rival")],
        [playerRoster, opponentRoster],
      );
      setBattle(nextBattle);
      setPlayerActions([]);
      setMoveSelections({});
      setTargetSelections({});
      setScreen("battle");
    } catch (error) {
      setScreen(selectedMode === "blind" ? "draft" : "lobby");
      setMessage(error instanceof Error ? error.message : copy(locale, "Falha ao preparar a batalha.", "Could not prepare the battle."));
    }
  }

  async function submitTurn() {
    const current = battleRef.current;
    if (!current) return;
    const room = onlineRoomRef.current;
    if (room) {
      if (room.seat === null) return;
      const requiredActions = actorsForSeat(current, room.seat).length;
      if (playerActions.length !== requiredActions) return;
      try {
        if (room.hostId === room.playerId) {
          acceptPlayerActions(room.playerId, { turn: current.turn, actions: playerActions });
        } else {
          await roomConnection.current?.send("player-actions", {
            turn: current.turn,
            actions: playerActions,
          });
          setMessage(copy(locale, "Jogada enviada. Aguardando os outros treinadores...", "Move submitted. Waiting for the other trainers..."));
          setPlayerActions([]);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível enviar sua jogada.", "Could not submit your move."));
      }
      return;
    }

    const requiredActions = current.sides[0].active.filter(
      (rosterIndex) => current.sides[0].roster[rosterIndex].hp > 0,
    ).length;
    if (playerActions.length !== requiredActions) return;
    const next = resolveTurn(current, [playerActions, aiActions(current)]);
    battleRef.current = next;
    setBattle({ ...next, events: [...next.events] });
    setPlayerActions([]);
    setMoveSelections({});
    setTargetSelections({});
    if (next.status === "finished") setScreen("report");
  }

  function selectMove(actor: number, moveIndex: number, target: number) {
    if (!battle) return;
    const existing = playerActions.filter((action) => action.actor !== actor);
    setPlayerActions([...existing, { actor, moveIndex, target }]);
    setMoveSelections((current) => ({ ...current, [actor]: moveIndex }));
    setTargetSelections((current) => ({ ...current, [actor]: target }));
  }

  async function shareReport() {
    if (!battle) return;
    setSharing(true);
    try {
      const blob = await createShareBlob(battle);
      const file = new File([blob], "poke-pedia-battle.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: copy(locale, "Resultado da batalha", "Battle result") });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "poke-pedia-battle.png";
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : copy(locale, "Não foi possível compartilhar a batalha.", "Could not share the battle."));
    } finally {
      setSharing(false);
    }
  }

  if (screen === "lobby") {
    return (
      <section className="battle-panel" aria-labelledby="battle-title">
        <div className="journey-header">
          <div>
            <span className="eyebrow">{copy(locale, "ARENA POKÉPEDIA", "POKÉPEDIA ARENA")}</span>
            <h3 id="battle-title">{copy(locale, "Modo batalha", "Battle mode")}</h3>
          </div>
          <span className="calculator-generation">{copy(locale, "Nível 50 · sem itens", "Level 50 · no items")}</span>
        </div>
        <p className="battle-description">
          {copy(locale, "Monte sua equipe e enfrente um rival em batalhas por turnos. Em duplas, cada lado terá dois Pokémon ativos e uma equipe de três.", "Build your team and face a rival in turn-based battles. In doubles, each side has two active Pokémon and a team of three.")}
        </p>
        <div className="battle-settings">
          <label className="select-wrap">
            <span>{copy(locale, "Formato", "Format")}</span>
            <select value={format} onChange={(event) => {
              const nextFormat = event.target.value as BattleFormat;
              setFormat(nextFormat);
              setSelectedTeam(nextFormat === "singles" ? savedTeamNames.slice(0, 6) : []);
            }}>
              <option value="singles">{copy(locale, "1v1 · seis Pokémon, um ativo", "1v1 · six Pokémon, one active")}</option>
              <option value="doubles">{copy(locale, "2v2 · três Pokémon por lado, dois ativos", "2v2 · three Pokémon per side, two active")}</option>
            </select>
          </label>
          <label className="select-wrap">
            <span>{copy(locale, "Seu nome de treinador (opcional)", "Trainer name (optional)")}</span>
            <input maxLength={24} value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder={copy(locale, "Treinador", "Trainer")} />
          </label>
        </div>
        <div className="battle-mode-cards">
          <article>
            <span className="battle-card-icon">⚔</span>
            <h4>{copy(locale, "Equipe escolhida", "Custom team")}</h4>
            <p>{copy(locale, "Use Pokémon da sua equipe salva e escolha quem levar para a arena.", "Use Pokémon from your saved team and choose who to bring to the arena.")}</p>
            <div className="battle-team-select" role="group" aria-label={copy(locale, "Escolha sua equipe", "Choose your team")}>
              {savedTeamNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  aria-pressed={selectedTeam.includes(name)}
                  className={selectedTeam.includes(name) ? "selected" : ""}
                  onClick={() => toggleStandardTeam(name)}
                  disabled={!selectedTeam.includes(name) && selectedTeam.length >= teamLimit}
                >
                  {formatPokemonName(name)} {selectedTeam.includes(name) ? "✓" : "+"}
                </button>
              ))}
              {savedTeamNames.length === 0 && <span>{copy(locale, "Adicione Pokémon no Montador de equipes primeiro.", "Add Pokémon in Team builder first.")}</span>}
            </div>
            <small>{selectedTeam.length}/{teamLimit} {copy(locale, "selecionados", "selected")}</small>
            <button className="primary-button" onClick={() => { setMode("standard"); void beginBattle(undefined, "standard"); }} disabled={selectedTeam.length !== teamLimit}>
              {copy(locale, "Começar batalha", "Start battle")} ↗
            </button>
          </article>
          <article>
            <span className="battle-card-icon">◉</span>
            <h4>{copy(locale, "Modo às cegas", "Blind draft")}</h4>
            <p>{copy(locale, `Abra Pokébolas misteriosas e escolha ${teamLimit} Pokémon entre 12. Cada escolha revela quem vai para sua equipe.`, `Open mystery Poké Balls and pick ${teamLimit} Pokémon from 12. Each choice reveals a new team member.`)}</p>
            <button className="secondary-button" onClick={startBlindDraft}>
              {copy(locale, "Receber 12 Pokébolas", "Get 12 Poké Balls")} ◉
            </button>
          </article>
        </div>
        <section className="battle-online-panel" aria-labelledby="battle-online-title">
          <div>
            <span className="eyebrow">{copy(locale, "DESAFIE SEUS AMIGOS", "CHALLENGE YOUR FRIENDS")}</span>
            <h4 id="battle-online-title">{copy(locale, "Sala online", "Online room")}</h4>
            <p>{format === "singles"
              ? copy(locale, "Crie um link para uma partida 1v1. Cada treinador seleciona seis Pokémon.", "Create a link for a 1v1 match. Each trainer picks six Pokémon.")
              : copy(locale, "Crie um link para uma partida 2v2. Quatro treinadores escolhem três Pokémon cada.", "Create a link for a 2v2 match. Four trainers pick three Pokémon each.")}</p>
          </div>
          <button className="primary-button" type="button" onClick={() => void createOnlineRoom()}>
            {copy(locale, "Criar sala e link", "Create room and link")}
          </button>
          <label className="battle-room-join">
            <span>{copy(locale, "Ou entre com um código", "Or join with a code")}</span>
            <input
              value={roomCodeEntry}
              maxLength={9}
              autoCapitalize="none"
              onChange={(event) => setRoomCodeEntry(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
              placeholder="abc123xyz"
            />
            <button className="secondary-button" type="button" onClick={() => void joinOnlineRoom(roomCodeEntry)}>
              {copy(locale, "Entrar", "Join")}
            </button>
          </label>
          {!battleRoomsConfigured && (
            <small>{copy(locale, "Configure as credenciais públicas do Supabase para ativar as salas online.", "Configure the public Supabase credentials to enable online rooms.")}</small>
          )}
        </section>
        <p className="battle-online-note">
          {copy(locale, "Salas usam comunicação em tempo real; o anfitrião mantém o estado da partida. A sala termina se o anfitrião desconectar.", "Rooms use realtime communication; the host maintains match state. The room ends if the host disconnects.")}
        </p>
        {message && <p className="battle-message" role="alert">{message}</p>}
      </section>
    );
  }

  if (screen === "room" && onlineRoom) {
    const seatCount = onlineRoom.format === "singles" ? 2 : 4;
    const occupiedSeats = new Set(onlineRoom.players.flatMap((player) =>
      player.seat === null ? [] : [player.seat],
    ));
    const allSeatsOccupied = Array.from(
      { length: seatCount },
      (_, seat) => occupiedSeats.has(seat),
    ).every(Boolean);
    const isHost = onlineRoom.hostId === onlineRoom.playerId;
    const isReady = onlineRoom.seat !== null && onlineRoom.readySeats.includes(onlineRoom.seat);
    return (
      <section className="battle-panel" aria-labelledby="room-title">
        <div className="journey-header">
          <div>
            <span className="eyebrow">{copy(locale, "SALA DE BATALHA", "BATTLE ROOM")}</span>
            <h3 id="room-title">{copy(locale, "Convide seus amigos", "Invite your friends")}</h3>
          </div>
          <span className="calculator-generation">{onlineRoom.code}</span>
        </div>
        <p className="battle-description">
          {copy(locale, "Compartilhe o link. Cada treinador precisa selecionar e confirmar sua equipe antes do início.", "Share the link. Every trainer must select and confirm a team before the battle starts.")}
        </p>
        <div className="battle-room-link">
          <code>{`${window.location.origin}${window.location.pathname}?battle=${onlineRoom.code}`}</code>
          <button className="secondary-button" type="button" onClick={() => void copyRoomLink()}>
            {copy(locale, "Copiar link", "Copy link")}
          </button>
        </div>
        <div className="battle-room-seats" aria-label={copy(locale, "Participantes da sala", "Room participants")}>
          {Array.from({ length: seatCount }, (_, seat) => {
            const player = onlineRoom.players.find((entry) => entry.seat === seat);
            const ready = onlineRoom.readySeats.includes(seat);
            return (
              <div key={seat} className={player ? "occupied" : ""}>
                <strong>{onlineRoom.format === "singles"
                  ? copy(locale, `Treinador ${seat + 1}`, `Trainer ${seat + 1}`)
                  : copy(locale, `Dupla ${Math.floor(seat / 2) + 1} · jogador ${seat % 2 + 1}`, `Team ${Math.floor(seat / 2) + 1} · player ${seat % 2 + 1}`)}</strong>
                <span>{player ? player.name : copy(locale, "Aguardando...", "Waiting...")}</span>
                <small>{ready ? copy(locale, "Equipe confirmada", "Team ready") : player ? copy(locale, "Escolhendo equipe", "Choosing a team") : copy(locale, "Vaga livre", "Open seat")}</small>
              </div>
            );
          })}
        </div>
        {onlineRoom.seat !== null && !isReady && (
          <div className="battle-room-team">
            <strong>{copy(locale, "Sua equipe", "Your team")} · {selectedTeam.length}/{onlineRoom.format === "singles" ? 6 : 3}</strong>
            {mode === "standard" ? (
              <div className="battle-team-select" role="group" aria-label={copy(locale, "Escolha sua equipe", "Choose your team")}>
                {savedTeamNames.map((name) => (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={selectedTeam.includes(name)}
                    className={selectedTeam.includes(name) ? "selected" : ""}
                    onClick={() => toggleStandardTeam(name)}
                    disabled={!selectedTeam.includes(name) && selectedTeam.length >= (onlineRoom.format === "singles" ? 6 : 3)}
                  >
                    {formatPokemonName(name)} {selectedTeam.includes(name) ? "✓" : "+"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="battle-draft-team">
                {selectedDetails.map((pokemon) => <span key={pokemon.id}>{formatPokemonName(pokemon.name)}</span>)}
              </div>
            )}
            <div className="battle-actions">
              <button className="secondary-button" type="button" onClick={() => {
                if (mode === "standard") startBlindDraft();
                else {
                  setMode("standard");
                  setSelectedTeam([]);
                }
              }}>
                {mode === "standard"
                  ? copy(locale, "Escolher no modo às cegas", "Choose with blind draft")
                  : copy(locale, "Escolher equipe salva", "Choose a saved team")}
              </button>
              <button className="primary-button" type="button" disabled={roomStarting || selectedTeam.length !== (onlineRoom.format === "singles" ? 6 : 3)} onClick={() => void confirmOnlineTeam()}>
                {roomStarting ? copy(locale, "Carregando equipe...", "Loading team...") : copy(locale, "Confirmar equipe", "Confirm team")}
              </button>
            </div>
          </div>
        )}
        {isReady && <p className="battle-message">{copy(locale, "Equipe confirmada. Aguardando o anfitrião iniciar...", "Team confirmed. Waiting for the host to start...")}</p>}
        {isHost && (
          <button className="primary-button battle-start-online" type="button" disabled={roomStarting || onlineRoom.readySeats.length !== seatCount || !allSeatsOccupied} onClick={() => void startOnlineBattle()}>
            {roomStarting ? copy(locale, "Preparando batalha...", "Preparing battle...") : copy(locale, "Começar batalha", "Start battle")} ⚔
          </button>
        )}
        {message && <p className="battle-message" role="alert">{message}</p>}
        <div className="battle-actions">
          <button className="secondary-button" type="button" onClick={() => void leaveOnlineRoom()}>
            {copy(locale, "Sair da sala", "Leave room")}
          </button>
        </div>
      </section>
    );
  }

  if (screen === "draft") {
    return (
      <section className="battle-panel" aria-labelledby="draft-title">
        <div className="journey-header">
          <div>
            <span className="eyebrow">{copy(locale, "SELEÇÃO ÀS CEGAS", "BLIND DRAFT")}</span>
            <h3 id="draft-title">{copy(locale, "Abra seis Pokébolas", "Open six Poké Balls")}</h3>
          </div>
          <span className="calculator-generation">{selectedTeam.length}/{teamLimit}</span>
        </div>
        <p className="battle-description">{copy(locale, "Escolha uma Pokébola para revelar o Pokémon e adicioná-lo imediatamente à equipe. O rival escolhe sua equipe em segredo.", "Choose a Poké Ball to reveal a Pokémon and add it straight to your team. Your rival's team stays hidden.")}</p>
        <div className="battle-draft-grid">
          {draft?.pool.map((id) => {
            const revealed = draftDetails[id];
            const chosen = draft?.chosen.includes(id) ?? false;
            return (
              <button
                type="button"
                className={`battle-ball ${revealed ? "revealed" : ""} ${chosen ? "chosen" : ""}`}
                key={id}
                onClick={() => void openBall(id)}
                disabled={selectedTeam.length >= teamLimit || loadingBall !== null || chosen}
                aria-label={revealed ? formatPokemonName(revealed.name) : copy(locale, "Pokébola misteriosa", "Mystery Poké Ball")}
              >
                {loadingBall === id ? <span className="spinner" /> : revealed ? (
                  <>
                    <img src={getArtwork(revealed)} alt="" />
                    <strong>{formatPokemonName(revealed.name)}</strong>
                    <small>#{String(id).padStart(4, "0")}</small>
                  </>
                ) : <span aria-hidden="true">◉</span>}
              </button>
            );
          })}
        </div>
        {selectedDetails.length > 0 && (
          <div className="battle-draft-team">
            <strong>{copy(locale, "Sua equipe", "Your team")}</strong>
            {selectedDetails.map((pokemon) => <span key={pokemon.id}>{formatPokemonName(pokemon.name)}</span>)}
          </div>
        )}
        {message && <p className="battle-message" role="alert">{message}</p>}
        <div className="battle-actions">
          <button className="secondary-button" onClick={() => { setDraft(null); setScreen(onlineRoomRef.current ? "room" : "lobby"); }}>
            {copy(locale, "Voltar", "Back")}
          </button>
          <button
            className="primary-button"
            disabled={selectedTeam.length !== teamLimit || roomStarting}
            onClick={() => onlineRoomRef.current
              ? void confirmOnlineTeam()
              : void beginBattle(selectedDetails, "blind")}
          >
            {onlineRoomRef.current
              ? copy(locale, "Confirmar equipe da sala", "Confirm room team")
              : copy(locale, "Revelar rival e batalhar", "Reveal rival and battle")} ⚔
          </button>
        </div>
      </section>
    );
  }

  if (screen === "loading") {
    return (
      <section className="battle-panel battle-loading" aria-live="polite">
        <div className="spinner" />
        <h3>{copy(locale, "Preparando a arena...", "Preparing the arena...")}</h3>
        <p>{copy(locale, "Carregando equipes e movimentos de batalha.", "Loading teams and battle moves.")}</p>
        {message && <p className="battle-message" role="alert">{message}</p>}
      </section>
    );
  }

  if (!battle) return null;
  const battleReport = battle.status === "finished" ? createBattleReport(battle) : null;
  const playerSeat = onlineRoom?.seat ?? 0;
  const playerSideIndex = onlineRoom ? onlineSideForSeat(onlineRoom.format, playerSeat) : 0;
  const opponentSideIndex = 1 - playerSideIndex;
  const playerController = onlineRoom ? onlineControllerForSeat(onlineRoom.format, playerSeat) : 0;
  const playerSide = battle.sides[playerSideIndex];
  const opponentSide = battle.sides[opponentSideIndex];
  const activePlayer = playerSide.active.map((rosterIndex) => playerSide.roster[rosterIndex]);
  const activeOpponent = opponentSide.active.map((rosterIndex) => opponentSide.roster[rosterIndex]);
  const controlledActors = playerSide.active.flatMap((rosterIndex, actor) =>
    playerSide.roster[rosterIndex]?.hp > 0 &&
    (!onlineRoom || playerSide.controllers[rosterIndex] === playerController)
      ? [actor]
      : [],
  );
  const livingActivePlayerCount = controlledActors.length;
  const defaultTargetSlot = opponentSide.active.findIndex(
    (rosterIndex) => opponentSide.roster[rosterIndex].hp > 0,
  );
  const lastTurnStart = battle.events.reduce(
    (latest, event, index) => event.kind === "turn" ? index : latest,
    0,
  );
  const lastDamage = [...battle.events.slice(lastTurnStart)]
    .reverse()
    .find((event) => event.kind === "damage");

  return (
    <section className="battle-panel" aria-labelledby="battle-arena-title">
      <div className="journey-header">
        <div>
          <span className="eyebrow">{copy(locale, "ARENA POKÉPEDIA", "POKÉPEDIA ARENA")}</span>
          <h3 id="battle-arena-title">{screen === "report" ? copy(locale, "Batalha encerrada", "Battle complete") : copy(locale, "A batalha começou!", "Battle started!")}</h3>
        </div>
        <span className="calculator-generation">{copy(locale, "Turno", "Turn")} {battle.turn}</span>
      </div>
      <div className={`battle-field ${format}`}>
        <div className="battle-side battle-opponent">
          <strong>{opponentSide.name}</strong>
          <div className="battle-active-line">
            {activeOpponent.map((member, index) => {
              const rosterIndex = opponentSide.active[index];
              const hit = lastDamage?.side === playerSideIndex && lastDamage.target === rosterIndex;
              return (
                <Battlefighter
                  key={`${battle.turn}-${member.pokemon.id}-${index}`}
                  member={member}
                  locale={locale}
                  hit={hit}
                />
              );
            })}
          </div>
        </div>
        <div className="battle-center-mark" aria-hidden="true">⚔</div>
        <div className="battle-side battle-player">
          <strong>{playerSide.name}</strong>
          <div className="battle-active-line">
            {activePlayer.map((member, index) => {
              const rosterIndex = playerSide.active[index];
              const hit = lastDamage?.side === opponentSideIndex && lastDamage.target === rosterIndex;
              return (
                <Battlefighter
                  key={`${battle.turn}-${member.pokemon.id}-${index}`}
                  member={member}
                  locale={locale}
                  reversed
                  hit={hit}
                />
              );
            })}
          </div>
        </div>
      </div>

      {screen === "battle" && (
        <div className="battle-controls">
          {playerSide.active.flatMap((rosterIndex, actor) => {
            const member = playerSide.roster[rosterIndex];
            if (member.hp <= 0 || (onlineRoom && playerSide.controllers[rosterIndex] !== playerController)) return [];
            const available = member.pp.flatMap((pp, index) => pp > 0 ? [index] : []);
            return [(
              <fieldset className="battle-move-picker" key={`${member.pokemon.id}-${actor}`}>
                <legend>{formatPokemonName(member.pokemon.name)} · {copy(locale, "escolha um golpe", "choose a move")}</legend>
                <div className="battle-move-grid">
                  {available.length > 0 ? available.map((moveIndex) => {
                    const move = member.pokemon.moves[moveIndex];
                    return (
                      <button
                        type="button"
                        key={`${move.id}-${moveIndex}`}
                        aria-pressed={moveSelections[actor] === moveIndex}
                        className={`move-${move.type} ${moveSelections[actor] === moveIndex ? "selected" : ""}`}
                        onClick={() => selectMove(actor, moveIndex, targetSelections[actor] ?? defaultTargetSlot)}
                      >
                        <strong>{formatPokemonName(move.name)}</strong>
                        <small>{formatPokemonName(move.type)} · {move.power} {copy(locale, "potência", "power")} · {member.pp[moveIndex]} PP</small>
                      </button>
                    );
                  }) : (
                    <button type="button" className="selected" aria-pressed="true" onClick={() => selectMove(actor, -1, targetSelections[actor] ?? defaultTargetSlot)}>
                      <strong>Struggle</strong><small>{copy(locale, "Golpe desesperado · 50 potência", "Last resort · 50 power")}</small>
                    </button>
                  )}
                </div>
                {format === "doubles" && (
                  <label className="battle-target-select">
                    {copy(locale, "Alvo", "Target")}
                    <select
                      value={targetSelections[actor] ?? defaultTargetSlot}
                      onChange={(event) => {
                        const target = Number(event.target.value);
                        const moveIndex = moveSelections[actor] ?? available[0] ?? -1;
                        selectMove(actor, moveIndex, target);
                      }}
                    >
                      {opponentSide.active.flatMap((targetIndex, slot) => {
                        const target = opponentSide.roster[targetIndex];
                        return target.hp > 0
                          ? [<option key={slot} value={slot}>{formatPokemonName(target.pokemon.name)}</option>]
                          : [];
                      })}
                    </select>
                  </label>
                )}
              </fieldset>
            )];
          })}
          <button className="primary-button battle-turn-button" onClick={() => void submitTurn()} disabled={playerActions.length !== livingActivePlayerCount}>
            {onlineRoom
              ? copy(locale, "Enviar jogada", "Submit moves")
              : copy(locale, "Executar turno", "Resolve turn")} ⚡
          </button>
          {onlineRoom && (
            <button className="secondary-button battle-turn-button" type="button" onClick={() => void leaveOnlineRoom()}>
              {copy(locale, "Sair da partida", "Leave match")}
            </button>
          )}
        </div>
      )}

      <div className="battle-log" aria-live="polite" aria-label={copy(locale, "Registro de batalha", "Battle log")}>
        <strong>{copy(locale, "Registro da batalha", "Battle log")}</strong>
        {battle.events.slice(-8).reverse().map((event, index) => (
          <p key={`${battle.events.length - index}-${event.kind}`}>{eventText(event, battle, locale)}</p>
        ))}
      </div>

      {screen === "report" && battleReport && (
        <div className="battle-report">
          <span className="eyebrow">{copy(locale, "RELATÓRIO FINAL", "FINAL REPORT")}</span>
          <h4>{battleReport.winner} {copy(locale, "venceu!", "won!")}</h4>
          <p>{battleReport.turns} {copy(locale, "turnos ·", "turns ·")} {battleReport.sides[0].damageDealt + battleReport.sides[1].damageDealt} {copy(locale, "de dano total", "total damage")}</p>
          <div className="battle-report-sides">
            {battleReport.sides.map((side) => (
              <article key={side.name}>
                <strong>{side.name}</strong>
                <span>{side.damageDealt} {copy(locale, "dano causado", "damage dealt")}</span>
                <span>{side.damageTaken} {copy(locale, "dano sofrido", "damage taken")}</span>
                <span>{side.knockouts} {copy(locale, "nocaute(s)", "knockout(s)")}</span>
              </article>
            ))}
          </div>
          <div className="battle-actions">
            <button className="secondary-button" onClick={() => void shareReport()} disabled={sharing}>
              {sharing ? copy(locale, "Criando imagem...", "Creating image...") : copy(locale, "Compartilhar resultado", "Share result")}
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (onlineRoom) void leaveOnlineRoom();
                else {
                  battleRef.current = null;
                  setBattle(null);
                  setScreen("lobby");
                  setSelectedTeam([]);
                }
              }}
            >
              {onlineRoom ? copy(locale, "Sair da sala", "Leave room") : copy(locale, "Nova batalha", "New battle")}
            </button>
          </div>
          {message && <p className="battle-message" role="alert">{message}</p>}
        </div>
      )}
      {screen === "battle" && (
        <div className="battle-rosters">
          {battle.sides.map((side) => (
            <div key={side.name}>
              <strong>{side.name}</strong>
              {side.roster.map((member, index) => (
                <span className={member.hp <= 0 ? "fainted" : ""} key={member.pokemon.id}>
                  {formatPokemonName(member.pokemon.name)} · {Math.max(0, Math.round(hpPercent(member)))}%
                  {side.active.includes(index) ? " · ●" : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {message && screen !== "report" && <p className="battle-message" role="alert">{message}</p>}
    </section>
  );
}

function Battlefighter({ member, locale, reversed = false, hit = false }: { member: BattlePokemonState; locale: Locale; reversed?: boolean; hit?: boolean }) {
  const percent = hpPercent(member);
  const artwork = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${member.pokemon.id}.png`;
  const sprite = reversed
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${member.pokemon.id}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${member.pokemon.id}.png`;
  return (
    <div className={`battlefighter ${reversed ? "battlefighter-player" : "battlefighter-opponent"} ${member.hp <= 0 ? "fainted" : ""} ${hit ? "hit" : ""}`}>
      <div className="battlefighter-info">
        <div className="battlefighter-name">
          <strong>{formatPokemonName(member.pokemon.name)}</strong>
          <span>Lv. 50</span>
        </div>
        <div className="battlefighter-vitals">
          <strong>{copy(locale, "PS", "HP")}</strong>
          <span>{member.hp} / {member.maxHp}</span>
        </div>
        <div className="battle-hp-track" role="progressbar" aria-label={`${formatPokemonName(member.pokemon.name)} HP`} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
      <img
        src={sprite}
        alt={formatPokemonName(member.pokemon.name)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = artwork;
        }}
      />
    </div>
  );
}
