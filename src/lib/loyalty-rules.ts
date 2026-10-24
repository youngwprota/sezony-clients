export type Level = { id: number; name: string; minVisits: number; discountPercent: number; perks: string };

/** Уровень по числу визитов: самый высокий, до которого клиент дорос. */
export function levelFor(visits: number, levels: Level[]): Level | null {
  return [...levels].sort((a, b) => b.minVisits - a.minVisits).find((l) => visits >= l.minVisits) ?? null;
}

/** Следующий уровень и сколько визитов до него. */
export function nextLevel(visits: number, levels: Level[]): { level: Level; visitsLeft: number } | null {
  const next = [...levels].sort((a, b) => a.minVisits - b.minVisits).find((l) => l.minVisits > visits);
  return next ? { level: next, visitsLeft: next.minVisits - visits } : null;
}

export type LoyaltyStatus = {
  visits: number;
  level: Level | null;
  next: { level: Level; visitsLeft: number } | null;
  /** личная скидка важнее скидки уровня */
  discount: number;
  personal: boolean;
};

export function loyaltyStatus(visits: number, personalDiscount: number | null, levels: Level[]): LoyaltyStatus {
  const level = levelFor(visits, levels);
  return {
    visits,
    level,
    next: nextLevel(visits, levels),
    discount: personalDiscount ?? level?.discountPercent ?? 0,
    personal: personalDiscount != null,
  };
}

/** Короткая подпись для журнала и приложения мастера: «Постоянный · −5%». */
export function loyaltyBadge(s: LoyaltyStatus): string | null {
  const parts = [s.level && s.level.minVisits > 0 ? s.level.name : null, s.discount ? `−${s.discount}%` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
