import { describe, expect, it } from "vitest";
import { createTeamBackup, parseTeamBackup } from "./teamBackup";

describe("team backup", () => {
  it("round trips a supported team backup", () => {
    const json = createTeamBackup(["charizard", "mr-mime"], new Date("2026-01-01T00:00:00Z"));

    expect(JSON.parse(json)).toMatchObject({
      format: "poke-pedia-team",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      team: ["charizard", "mr-mime"],
    });
    expect(parseTeamBackup(json)).toEqual(["charizard", "mr-mime"]);
  });

  it("rejects malformed, incompatible, empty, oversized, duplicate, and invalid backups", () => {
    expect(() => parseTeamBackup("not json")).toThrow("JSON válido");
    expect(() => parseTeamBackup(JSON.stringify({ team: ["pikachu"] }))).toThrow("compatível");
    expect(() => createTeamBackup([])).toThrow("entre um e seis");
    expect(() =>
      parseTeamBackup(JSON.stringify({
        format: "poke-pedia-team",
        version: 1,
        team: ["pikachu", "pikachu"],
      })),
    ).toThrow("duplicados");
    expect(() =>
      parseTeamBackup(JSON.stringify({
        format: "poke-pedia-team",
        version: 1,
        team: ["<script>"],
      })),
    ).toThrow("inválidos");
    expect(() =>
      createTeamBackup(["one", "two", "three", "four", "five", "six", "seven"]),
    ).toThrow("entre um e seis");
  });
});
