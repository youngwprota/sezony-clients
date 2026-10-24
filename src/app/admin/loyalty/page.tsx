import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { getLevels, visitCounts } from "@/lib/loyalty";
import { levelFor } from "@/lib/loyalty-rules";
import { LoyaltyForm } from "./loyalty-form";

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  const [salon, levels, visits, totalClients] = await Promise.all([getSalon(), getLevels(), visitCounts(), db.client.count()]);
  // сколько клиентов сейчас на каждом уровне
  const perLevel = new Map<number, number>();
  for (const v of visits.values()) {
    const l = levelFor(v, levels);
    if (l) perLevel.set(l.id, (perLevel.get(l.id) ?? 0) + 1);
  }
  const zero = levels.find((l) => l.minVisits === 0);
  if (zero) perLevel.set(zero.id, (perLevel.get(zero.id) ?? 0) + totalClients - visits.size);

  return (
    <LoyaltyForm
      levels={levels.map((l) => ({ name: l.name, minVisits: l.minVisits, discountPercent: l.discountPercent, perks: l.perks, clients: perLevel.get(l.id) ?? 0 }))}
      birthday={{ enabled: salon.birthdayGreetingEnabled, text: salon.birthdayGreetingText }}
    />
  );
}
