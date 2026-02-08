import { describe, expect, it } from "vitest";
import {
  canStartGame,
  computeWinners,
  generateCrashMultiplier,
  isValidBetAmount,
  isValidMultiplier,
  MIN_BET_AMOUNT,
  MAX_BET_AMOUNT,
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
} from "../game-store";

describe("game-store logic", () => {
  it("canStartGame is false when players are below minimum", () => {
    const players = [
      { wallet: "0x0000000000000000000000000000000000000001", multiplier: 2.5, betAmount: 5 },
    ] as const;

    expect(canStartGame([...players])).toBe(false);
  });

  it("canStartGame is false when any multiplier is invalid", () => {
    const players = [
      { wallet: "0x0000000000000000000000000000000000000001", multiplier: 2.5, betAmount: 5 },
      { wallet: "0x0000000000000000000000000000000000000002", multiplier: 3.1, betAmount: 5 },
      { wallet: "0x0000000000000000000000000000000000000003", multiplier: 1.9, betAmount: 5 },
      { wallet: "0x0000000000000000000000000000000000000004", multiplier: 10.01, betAmount: 5 },
    ];

    expect(canStartGame(players)).toBe(false);
  });

  it("canStartGame is true with at least 2 valid players and bets", () => {
    const players = [
      { wallet: "0x0000000000000000000000000000000000000001", multiplier: 2.5, betAmount: 2 },
      { wallet: "0x0000000000000000000000000000000000000002", multiplier: 3.1, betAmount: 4 },
    ];

    expect(canStartGame(players)).toBe(true);
  });

  it("canStartGame is false when any bet amount is invalid", () => {
    const players = [
      { wallet: "0x0000000000000000000000000000000000000001", multiplier: 2.5, betAmount: 2 },
      { wallet: "0x0000000000000000000000000000000000000002", multiplier: 3.1, betAmount: 0 },
    ];

    expect(canStartGame(players)).toBe(false);
  });

  it("winner logic keeps only multipliers below crash value", () => {
    const players = [
      { wallet: "0x0000000000000000000000000000000000000001", multiplier: 1.5, betAmount: 1 },
      { wallet: "0x0000000000000000000000000000000000000002", multiplier: 2.4, betAmount: 1 },
      { wallet: "0x0000000000000000000000000000000000000003", multiplier: 2.5, betAmount: 1 },
      { wallet: "0x0000000000000000000000000000000000000004", multiplier: 4.2, betAmount: 1 },
    ] as const;

    expect(computeWinners([...players], 2.5)).toEqual([
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    ]);
  });

  it("validates multiplier and bet bounds and random range", () => {
    expect(isValidMultiplier(MIN_MULTIPLIER)).toBe(true);
    expect(isValidMultiplier(MAX_MULTIPLIER)).toBe(true);
    expect(isValidMultiplier(MIN_MULTIPLIER - 0.01)).toBe(false);
    expect(isValidMultiplier(MAX_MULTIPLIER + 0.01)).toBe(false);
    expect(isValidBetAmount(MIN_BET_AMOUNT)).toBe(true);
    expect(isValidBetAmount(MAX_BET_AMOUNT)).toBe(true);
    expect(isValidBetAmount(MIN_BET_AMOUNT - 0.01)).toBe(false);
    expect(isValidBetAmount(MAX_BET_AMOUNT + 1)).toBe(false);

    expect(generateCrashMultiplier(0)).toBe(1.01);
    expect(generateCrashMultiplier(1)).toBe(10);
  });
});
