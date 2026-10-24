import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Момент начала местного времени `HH:mm` в день `YYYY-MM-DD` в часовом поясе `tz`. */
export function zonedDateTime(date: string, time: string, tz: string): Date {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function localDate(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

export function localTime(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "HH:mm");
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 — понедельник … 6 — воскресенье */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function minutesToHHmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** «Суббота, 24 октября» */
export function formatDayLong(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayIndex(date)]}, ${d} ${MONTHS_GEN[m - 1]}`;
}

/** «сб, 24 окт» */
export function formatDayShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS_SHORT[weekdayIndex(date)]}, ${d} ${MONTHS_SHORT[m - 1]}`;
}

export { WEEKDAYS_SHORT };

/** «1 ч 20 мин» */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}
