import { describe, expect, it } from "vitest";
import { matchesSegment, pickChannel, renderTemplate, segmentSchema, type ClientFacts } from "./segment-rules";

const levels = [
  { id: 1, name: "Новый", minVisits: 0, discountPercent: 0, perks: "" },
  { id: 2, name: "Постоянный", minVisits: 5, discountPercent: 5, perks: "" },
];
const now = new Date("2026-10-24T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
const client = (o: Partial<ClientFacts> = {}): ClientFacts => ({
  id: 1,
  birthday: null,
  marketingConsent: true,
  telegramChatId: "1",
  viberUserId: null,
  visits: 6,
  lastVisit: daysAgo(10),
  staffIds: new Set([3]),
  categoryIds: new Set([7]),
  ...o,
});
const seg = (o: object = {}) => segmentSchema.parse(o);

describe("matchesSegment", () => {
  it("matches everyone with an empty filter", () => {
    expect(matchesSegment(client({ visits: 0, lastVisit: null }), seg(), levels, now, "10")).toBe(true);
  });

  it("filters by level, visits and recency", () => {
    expect(matchesSegment(client(), seg({ levelIds: [2] }), levels, now, "10")).toBe(true);
    expect(matchesSegment(client({ visits: 2 }), seg({ levelIds: [2] }), levels, now, "10")).toBe(false);
    expect(matchesSegment(client(), seg({ notVisitedDays: 60 }), levels, now, "10")).toBe(false);
    expect(matchesSegment(client({ lastVisit: daysAgo(90) }), seg({ notVisitedDays: 60 }), levels, now, "10")).toBe(true);
    expect(matchesSegment(client({ lastVisit: null }), seg({ notVisitedDays: 60 }), levels, now, "10")).toBe(false);
    expect(matchesSegment(client(), seg({ visitedWithinDays: 30 }), levels, now, "10")).toBe(true);
  });

  it("filters by master, category and birthday month", () => {
    expect(matchesSegment(client(), seg({ staffIds: [3, 4] }), levels, now, "10")).toBe(true);
    expect(matchesSegment(client(), seg({ staffIds: [4] }), levels, now, "10")).toBe(false);
    expect(matchesSegment(client(), seg({ categoryIds: [8] }), levels, now, "10")).toBe(false);
    expect(matchesSegment(client({ birthday: "1990-10-02" }), seg({ birthdayThisMonth: true }), levels, now, "10")).toBe(true);
    expect(matchesSegment(client({ birthday: "1990-11-02" }), seg({ birthdayThisMonth: true }), levels, now, "10")).toBe(false);
  });
});

describe("pickChannel", () => {
  it("requires consent and prefers Telegram", () => {
    expect(pickChannel(client({ marketingConsent: false }), "any")).toBeNull();
    expect(pickChannel(client({ viberUserId: "v" }), "any")).toBe("telegram");
    expect(pickChannel(client({ viberUserId: "v" }), "viber")).toBe("viber");
    expect(pickChannel(client({ telegramChatId: null }), "telegram")).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("fills first name and discount", () => {
    expect(renderTemplate("{Имя}, ваша скидка {скидка}", { name: "Анна Петрова", discount: 5 })).toBe("Анна, ваша скидка 5%");
  });
});
