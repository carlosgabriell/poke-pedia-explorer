import { describe, expect, it } from "vitest";
import {
  createBattleRoomCode,
  onlineControllerForSeat,
  onlineSeatForController,
  onlineSideForSeat,
} from "./battleRooms";

describe("battle room helpers", () => {
  it("creates short, URL-safe room codes", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(createBattleRoomCode()).toMatch(/^[a-z0-9]{9}$/);
    }
  });

  it("maps all four doubles seats to the correct side and controller", () => {
    expect(Array.from({ length: 4 }, (_, seat) => [
      onlineSideForSeat("doubles", seat),
      onlineControllerForSeat("doubles", seat),
    ])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(onlineSeatForController("doubles", 1, 0)).toBe(2);
    expect(onlineSeatForController("doubles", 1, 1)).toBe(3);
  });

  it("maps each singles seat to its side", () => {
    expect(onlineSideForSeat("singles", 0)).toBe(0);
    expect(onlineSideForSeat("singles", 1)).toBe(1);
    expect(onlineControllerForSeat("singles", 1)).toBe(0);
    expect(onlineSeatForController("singles", 1, 0)).toBe(1);
  });
});
