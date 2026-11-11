import { describe, expect, it } from "vitest";
import { heureParis } from "./notifications";

describe("notifications", () => {
  it("lit l'heure de Paris, été comme hiver", () => {
    expect(heureParis(Date.UTC(2026, 10, 11, 9, 5))).toBe(10); // hiver : UTC+1
    expect(heureParis(Date.UTC(2026, 6, 1, 8, 0))).toBe(10); // été : UTC+2
    expect(heureParis(Date.UTC(2026, 10, 11, 23, 30))).toBe(0);
  });
});
