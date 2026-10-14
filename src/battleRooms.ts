import type { RealtimeChannel } from "@supabase/supabase-js";

export type BattleRoomMessage = {
  type: string;
  sender: string;
  payload: Record<string, unknown>;
};

export type BattleRoomPlayer = {
  playerId: string;
  name: string;
  seat: number | null;
  host: boolean;
  joinedAt: string;
};

export function onlineSideForSeat(format: "singles" | "doubles", seat: number): number {
  return format === "singles" ? seat : Math.floor(seat / 2);
}

export function onlineControllerForSeat(format: "singles" | "doubles", seat: number): number {
  return format === "singles" ? 0 : seat % 2;
}

export function onlineSeatForController(
  format: "singles" | "doubles",
  side: number,
  controller: number,
): number {
  return format === "singles" ? side : side * 2 + controller;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const battleRoomsConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function createBattleRoomCode(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const result: string[] = [];
  while (result.length < 9) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= 252) continue;
      result.push(alphabet[byte % alphabet.length]);
      if (result.length === 9) break;
    }
  }
  return result.join("");
}

function isBattleRoomMessage(value: unknown): value is BattleRoomMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return typeof message.type === "string" &&
    typeof message.sender === "string" &&
    typeof message.payload === "object" &&
    message.payload !== null &&
    !Array.isArray(message.payload);
}

export async function connectBattleRoom(
  roomCode: string,
  player: BattleRoomPlayer,
  onMessage: (message: BattleRoomMessage) => void,
  onPlayersChanged: (players: BattleRoomPlayer[]) => void,
): Promise<{
  send: (type: string, payload: Record<string, unknown>) => Promise<void>;
  updatePresence: (seat: number | null) => Promise<void>;
  close: () => Promise<void>;
}> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para criar salas online.");
  }
  if (!/^[a-z0-9]{9}$/.test(roomCode)) {
    throw new Error("O código da sala é inválido.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const channel: RealtimeChannel = supabase.channel(`battle:${roomCode}`, {
    config: {
      broadcast: { self: false, ack: true },
      presence: { key: player.playerId },
    },
  });
  channel
    .on("broadcast", { event: "message" }, ({ payload }) => {
      if (isBattleRoomMessage(payload)) onMessage(payload);
    })
    .on("presence", { event: "sync" }, () => {
      const players = Object.values(channel.presenceState())
        .flat()
        .flatMap((presence) => {
          if (typeof presence !== "object" || presence === null) return [];
          const candidate = presence as Partial<BattleRoomPlayer>;
          if (
            typeof candidate.playerId !== "string" ||
            typeof candidate.name !== "string" ||
            typeof candidate.host !== "boolean" ||
            typeof candidate.joinedAt !== "string" ||
            (candidate.seat !== null && typeof candidate.seat !== "number")
          ) return [];
          return [{
            playerId: candidate.playerId,
            name: candidate.name,
            seat: candidate.seat,
            host: candidate.host,
            joinedAt: candidate.joinedAt,
          }];
        });
      onPlayersChanged(players);
    });

  try {
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          reject(error ?? new Error("Não foi possível conectar à sala de batalha."));
        }
      });
    });
    await channel.track(player);
  } catch (error) {
    await supabase.removeChannel(channel);
    throw error;
  }

  return {
    send: async (type, payload) => {
      const result = await channel.send({
        type: "broadcast",
        event: "message",
        payload: { type, sender: player.playerId, payload },
      });
      if (result !== "ok") throw new Error("Não foi possível enviar a atualização da sala.");
    },
    updatePresence: async (seat) => {
      const result = await channel.track({ ...player, seat });
      if (result !== "ok") throw new Error("Não foi possível atualizar sua posição na sala.");
    },
    close: async () => {
      await supabase.removeChannel(channel);
    },
  };
}
