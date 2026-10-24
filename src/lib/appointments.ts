import "server-only";
import { db } from "./db";
import { addDays, zonedDateTime } from "./time";

export const STATUS_LABELS = {
  BOOKED: "Ожидает",
  CONFIRMED: "Подтвердил",
  ARRIVED: "Пришёл",
  NO_SHOW: "Не пришёл",
  CANCELLED: "Отменена",
} as const;

export type Status = keyof typeof STATUS_LABELS;

/** Записи за местный день `date`. */
export async function appointmentsForDay(date: string, tz: string, staffId?: number) {
  return db.appointment.findMany({
    where: {
      ...(staffId ? { staffId } : {}),
      startsAt: { gte: zonedDateTime(date, "00:00", tz), lt: zonedDateTime(addDays(date, 1), "00:00", tz) },
    },
    orderBy: { startsAt: "asc" },
    include: { client: true, items: { orderBy: { sortOrder: "asc" } }, staff: { select: { id: true, name: true } } },
  });
}

export type DayAppointment = Awaited<ReturnType<typeof appointmentsForDay>>[number];
