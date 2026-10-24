import { describe, expect, it } from "vitest";
import { levelFor, loyaltyBadge, loyaltyStatus, nextLevel } from "./loyalty-rules";

const levels = [
  { id: 1, name: "Новый", minVisits: 0, discountPercent: 0, perks: "" },
  { id: 3, name: "VIP", minVisits: 15, discountPercent: 10, perks: "кофе" },
  { id: 2, name: "Постоянный", minVisits: 5, discountPercent: 5, perks: "" },
];

describe("loyalty", () => {
  it("picks the highest level reached", () => {
    expect(levelFor(0, levels)?.name).toBe("Новый");
    expect(levelFor(5, levels)?.name).toBe("Постоянный");
    expect(levelFor(40, levels)?.name).toBe("VIP");
  });

  it("tells how many visits are left to the next level", () => {
    expect(nextLevel(3, levels)).toEqual({ level: levels[2], visitsLeft: 2 });
    expect(nextLevel(15, levels)).toBeNull();
  });

  it("lets a personal discount override the level discount", () => {
    expect(loyaltyStatus(6, null, levels).discount).toBe(5);
    expect(loyaltyStatus(6, 12, levels)).toMatchObject({ discount: 12, personal: true });
    expect(loyaltyStatus(6, 0, levels).discount).toBe(0);
  });

  it("builds a badge only when there is something to show", () => {
    expect(loyaltyBadge(loyaltyStatus(1, null, levels))).toBeNull();
    expect(loyaltyBadge(loyaltyStatus(7, null, levels))).toBe("Постоянный · −5%");
    expect(loyaltyBadge(loyaltyStatus(1, 3, levels))).toBe("−3%");
  });

  it("works without any levels configured", () => {
    expect(loyaltyStatus(10, null, [])).toMatchObject({ level: null, next: null, discount: 0 });
  });
});
