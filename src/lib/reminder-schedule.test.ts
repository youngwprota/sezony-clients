import { describe, expect, it } from "vitest";
import { dueReminder } from "./reminder-schedule";

const H = 3_600_000;
const start = new Date("2026-11-10T12:00:00Z");
const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * H);
const settings = { remindDayBefore: true, remindHoursBefore: 2 };
const base = { startsAt: start, createdAt: at(72), remindDaySentAt: null, remindHoursSentAt: null };

describe("dueReminder", () => {
  it("sends the day-before reminder inside the last 24 hours", () => {
    expect(dueReminder(base, at(25), settings)).toBeNull();
    expect(dueReminder(base, at(23.9), settings)).toBe("remindDay");
  });

  it("sends the hours reminder once the day reminder is done", () => {
    const sent = { ...base, remindDaySentAt: at(23) };
    expect(dueReminder(sent, at(5), settings)).toBeNull();
    expect(dueReminder(sent, at(1.9), settings)).toBe("remindHours");
    expect(dueReminder({ ...sent, remindHoursSentAt: at(1.9) }, at(1), settings)).toBeNull();
  });

  it("prefers the hours reminder when the day one was missed", () => {
    expect(dueReminder(base, at(1.5), settings)).toBe("remindHours");
  });

  it("skips reminders for bookings made shortly before the visit", () => {
    expect(dueReminder({ ...base, createdAt: at(20) }, at(19), settings)).toBeNull();
    expect(dueReminder({ ...base, createdAt: at(2.2) }, at(2), settings)).toBeNull();
  });

  it("respects disabled reminders and past visits", () => {
    expect(dueReminder(base, at(10), { remindDayBefore: false, remindHoursBefore: 0 })).toBeNull();
    expect(dueReminder(base, at(-1), settings)).toBeNull();
  });
});
