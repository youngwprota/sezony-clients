import { describe, expect, it } from "vitest";
import { addDays, formatDayLong, formatDayShort, formatDuration, hhmmToMinutes, localDate, localTime, minutesToHHmm, weekdayIndex, zonedDateTime } from "./time";

describe("время салона", () => {
  it("переводит местное время Минска (UTC+3) в UTC и обратно", () => {
    const d = zonedDateTime("2026-10-24", "18:00", "Europe/Minsk");
    expect(d.toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(localDate(d, "Europe/Minsk")).toBe("2026-10-24");
    expect(localTime(d, "Europe/Minsk")).toBe("18:00");
  });

  it("правильно считает полночь и переход через сутки", () => {
    const d = new Date("2026-10-24T22:30:00Z"); // 01:30 следующего дня в Минске
    expect(localDate(d, "Europe/Minsk")).toBe("2026-10-25");
    expect(zonedDateTime("2026-10-25", "00:00", "Europe/Minsk").toISOString()).toBe("2026-10-24T21:00:00.000Z");
  });

  it("учитывает переход на летнее время, если салон в другой стране", () => {
    // Варшава: 29.03.2026 переход на UTC+2
    expect(zonedDateTime("2026-03-28", "10:00", "Europe/Warsaw").toISOString()).toBe("2026-03-28T09:00:00.000Z");
    expect(zonedDateTime("2026-03-30", "10:00", "Europe/Warsaw").toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  it("добавляет дни через границы месяцев и годов", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("день недели с понедельника", () => {
    expect(weekdayIndex("2026-10-26")).toBe(0); // понедельник
    expect(weekdayIndex("2026-10-25")).toBe(6); // воскресенье
  });

  it("форматирует даты и длительности по-русски", () => {
    expect(formatDayLong("2026-10-24")).toBe("Суббота, 24 октября");
    expect(formatDayShort("2026-01-05")).toBe("пн, 5 янв");
    expect(formatDuration(20)).toBe("20 мин");
    expect(formatDuration(60)).toBe("1 ч");
    expect(formatDuration(80)).toBe("1 ч 20 мин");
    expect(minutesToHHmm(545)).toBe("09:05");
    expect(hhmmToMinutes("21:30")).toBe(1290);
  });
});
