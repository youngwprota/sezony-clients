import "server-only";
import { db } from "./db";
import { loyaltyStatus, type Level, type LoyaltyStatus } from "./loyalty-rules";

export async function getLevels(): Promise<Level[]> {
  return db.loyaltyLevel.findMany({ orderBy: { minVisits: "asc" } });
}

/** Число визитов («Пришёл») по клиентам. */
export async function visitCounts(clientIds?: number[]): Promise<Map<number, number>> {
  const rows = await db.appointment.groupBy({
    by: ["clientId"],
    where: { status: "ARRIVED", ...(clientIds ? { clientId: { in: clientIds } } : {}) },
    _count: true,
  });
  return new Map(rows.map((r) => [r.clientId, r._count]));
}

/** Статус лояльности для набора клиентов одним запросом. */
export async function loyaltyFor(clients: { id: number; personalDiscount: number | null }[]): Promise<Map<number, LoyaltyStatus>> {
  if (!clients.length) return new Map();
  const [levels, visits] = await Promise.all([getLevels(), visitCounts(clients.map((c) => c.id))]);
  return new Map(clients.map((c) => [c.id, loyaltyStatus(visits.get(c.id) ?? 0, c.personalDiscount, levels)]));
}
