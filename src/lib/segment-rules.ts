import { z } from "zod";
import { levelFor, type Level } from "./loyalty-rules";

/** Фильтр аудитории рассылки. Пустой фильтр — все клиенты. */
export const segmentSchema = z.object({
  levelIds: z.array(z.number().int()).default([]),
  /** не были дольше N дней (с последнего визита) */
  notVisitedDays: z.number().int().min(1).max(3650).nullable().default(null),
  /** были за последние N дней */
  visitedWithinDays: z.number().int().min(1).max(3650).nullable().default(null),
  minVisits: z.number({ invalid_type_error: "Визитов не меньше: введите число" }).int().min(0, "Визитов — от 0").max(10000).nullable().default(null),
  /** были хотя бы раз у одного из этих мастеров */
  staffIds: z.array(z.number().int()).default([]),
  /** делали услугу из одной из этих категорий */
  categoryIds: z.array(z.number().int()).default([]),
  birthdayThisMonth: z.boolean().default(false),
  channel: z.enum(["any", "telegram", "viber"]).default("any"),
});

export type Segment = z.infer<typeof segmentSchema>;

export type ClientFacts = {
  id: number;
  birthday: string | null;
  marketingConsent: boolean;
  telegramChatId: string | null;
  viberUserId: string | null;
  visits: number;
  lastVisit: Date | null;
  staffIds: Set<number>;
  categoryIds: Set<number>;
};

const DAY = 864e5;

export function matchesSegment(c: ClientFacts, s: Segment, levels: Level[], now: Date, todayMonth: string): boolean {
  if (s.levelIds.length) {
    const level = levelFor(c.visits, levels);
    if (!level || !s.levelIds.includes(level.id)) return false;
  }
  if (s.minVisits != null && c.visits < s.minVisits) return false;
  if (s.notVisitedDays != null && (!c.lastVisit || now.getTime() - c.lastVisit.getTime() < s.notVisitedDays * DAY)) return false;
  if (s.visitedWithinDays != null && (!c.lastVisit || now.getTime() - c.lastVisit.getTime() > s.visitedWithinDays * DAY)) return false;
  if (s.staffIds.length && !s.staffIds.some((id) => c.staffIds.has(id))) return false;
  if (s.categoryIds.length && !s.categoryIds.some((id) => c.categoryIds.has(id))) return false;
  if (s.birthdayThisMonth && c.birthday?.slice(5, 7) !== todayMonth) return false;
  return true;
}

/** Канал для рекламного сообщения: только с согласием; при двух мессенджерах — Telegram (он бесплатный). */
export function pickChannel(c: ClientFacts, channel: Segment["channel"]): "telegram" | "viber" | null {
  if (!c.marketingConsent) return null;
  if (channel !== "viber" && c.telegramChatId) return "telegram";
  if (channel !== "telegram" && c.viberUserId) return "viber";
  return null;
}

export { renderTemplate } from "./template";
