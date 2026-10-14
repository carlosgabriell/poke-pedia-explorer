import { describe, expect, it } from "vitest";
import { getTypeEffectiveness } from "./typeEffectiveness";

describe("getTypeEffectiveness", () => {
  it("combines the multipliers for dual types", () => {
    expect(getTypeEffectiveness("rock", ["fire", "flying"])).toBe(4);
    expect(getTypeEffectiveness("grass", ["fire", "dragon"])).toBe(0.25);
  });

  it("returns zero when either defending type is immune", () => {
    expect(getTypeEffectiveness("electric", ["water", "ground"])).toBe(0);
    expect(getTypeEffectiveness("ground", ["fire", "flying"])).toBe(0);
  });

  it("rejects unknown types instead of returning a misleading multiplier", () => {
    expect(() => getTypeEffectiveness("cosmic", ["normal"])).toThrow(
      "Unknown attacking type: cosmic",
    );
    expect(() => getTypeEffectiveness("fire", ["cosmic"])).toThrow(
      "Unknown defending type.",
    );
  });
});
