import { MAX_TEAM_SIZE, normalizeTeamNames } from "./teamAnalysis";

const BACKUP_FORMAT = "poke-pedia-team";
const BACKUP_VERSION = 1;

export function createTeamBackup(team: string[], exportedAt = new Date()): string {
  const names = normalizeTeamNames(team);
  if (names.length !== team.length || names.length === 0) {
    throw new Error("A equipe precisa ter entre um e seis Pokémon válidos.");
  }

  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: exportedAt.toISOString(),
      team: names,
    },
    null,
    2,
  );
}

export function parseTeamBackup(contents: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new Error("O arquivo não contém um JSON válido.");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Este arquivo não é um backup de equipe compatível.");
  }

  const record = data as Record<string, unknown>;
  const team = record.team;
  if (
    record.format !== BACKUP_FORMAT ||
    record.version !== BACKUP_VERSION ||
    !Array.isArray(team) ||
    team.length < 1 ||
    team.length > MAX_TEAM_SIZE
  ) {
    throw new Error("Este arquivo não é um backup de equipe compatível.");
  }

  const names = normalizeTeamNames(team);
  if (
    names.length !== team.length ||
    names.some((name, index) => name !== team[index])
  ) {
    throw new Error("O backup contém nomes inválidos ou Pokémon duplicados.");
  }

  return names;
}
