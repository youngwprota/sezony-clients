import { db } from "@/lib/db";
import { addDays, localDate, zonedDateTime } from "@/lib/time";

export const TZ = "Europe/Minsk";

export const today = () => localDate(new Date(), TZ);
/** Дата через n дней по времени салона. */
export const day = (n: number) => addDays(today(), n);
/** Момент «дата + время» по Минску в ISO. */
export const at = (date: string, time: string) => zonedDateTime(date, time, TZ).toISOString();

/** Полностью очищает тестовую базу. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export type Fixture = Awaited<ReturnType<typeof seedSalon>>;

/**
 * Салон: две категории, услуги (обычные, скрытая от онлайн-записи, выключенная),
 * мастера Ирина и Ольга (работают 09:00–21:00 ближайшие 14 дней), мастер без онлайн-записи
 * и уволенный мастер. Уровни лояльности по умолчанию.
 */
export async function seedSalon(overrides: Partial<{ minLeadMinutes: number; bookingDaysAhead: number; slotStepMinutes: number }> = {}) {
  await db.salon.create({
    data: { id: 1, name: "Sезоны", timezone: TZ, currency: "BYN", phoneCountryCode: "+375", minLeadMinutes: 60, bookingDaysAhead: 30, slotStepMinutes: 30, ...overrides },
  });
  const hair = await db.serviceCategory.create({ data: { title: "Стрижки", sortOrder: 0 } });
  const nails = await db.serviceCategory.create({ data: { title: "Маникюр", sortOrder: 1 } });
  const svc = async (categoryId: number, title: string, durationMin: number, price: number, extra: object = {}) =>
    db.service.create({ data: { categoryId, title, durationMin, priceMin: price, priceMax: price, ...extra } });
  const cut = await svc(hair.id, "Стрижка", 60, 75);
  const bang = await svc(hair.id, "Стрижка чёлки", 20, 20);
  const hidden = await svc(hair.id, "Только по звонку", 30, 50, { online: false });
  const off = await svc(hair.id, "Снятая услуга", 30, 50, { active: false });
  const mani = await svc(nails.id, "Маникюр", 90, 60);

  const staff = async (name: string, serviceIds: number[], extra: object = {}) =>
    db.staff.create({ data: { name, specialization: "мастер", services: { create: serviceIds.map((serviceId) => ({ serviceId })) }, ...extra } });
  const irina = await staff("Ирина", [cut.id, bang.id, hidden.id, off.id]);
  const olga = await staff("Ольга", [cut.id, mani.id]);
  const phoneOnly = await staff("Полина", [cut.id], { bookable: false });
  const fired = await staff("Уволенная", [cut.id], { active: false });

  const shifts = [];
  for (let i = 0; i < 14; i++) for (const s of [irina, olga, phoneOnly, fired]) shifts.push({ staffId: s.id, date: day(i), start: "09:00", end: "21:00" });
  await db.staffShift.createMany({ data: shifts });

  await db.loyaltyLevel.createMany({
    data: [
      { name: "Новый клиент", minVisits: 0, discountPercent: 0 },
      { name: "Постоянный", minVisits: 5, discountPercent: 5 },
      { name: "VIP", minVisits: 15, discountPercent: 10, perks: "кофе" },
    ],
  });
  // после RESTART IDENTITY владелец получает id 1 — как в auth.session тестов
  await db.user.create({ data: { login: "admin", passwordHash: "$2b$10$abcdefghijklmnopqrstuuIu7/8pV3JvVt7wB8C6bS0nYbVwI5x2", role: "OWNER" } });

  return { hair, nails, cut, bang, hidden, off, mani, irina, olga, phoneOnly, fired };
}

/** Клиент с прошлыми визитами («Пришёл»), чтобы получить нужный уровень лояльности. */
let historySlot = 0;
export async function clientWithVisits(phone: string, name: string, visits: number, staffId: number, serviceId: number, extra: object = {}) {
  const client = await db.client.create({ data: { phone, name, ...extra } });
  for (let i = 0; i < visits; i++) {
    // визиты в прошлом раздвинуты по 45 минут, чтобы у мастера не было пересечений
    const start = new Date(Date.now() - 2 * 864e5 - historySlot++ * 45 * 60_000);
    await db.appointment.create({
      data: {
        staffId,
        clientId: client.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + 30 * 60_000),
        status: "ARRIVED",
        source: "ADMIN",
        items: { create: [{ serviceId, title: "Стрижка", priceMin: 75, priceMax: 75, durationMin: 30 }] },
      },
    });
  }
  return client;
}

/** Перехват запросов к Telegram и Viber: запоминает отправленное и отвечает успехом. */
export function captureMessengers(fetchSpy: { mockImplementation: (fn: typeof fetch) => unknown }) {
  const sent: { channel: "telegram" | "viber"; to: string; text: string; body: Record<string, unknown> }[] = [];
  fetchSpy.mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("api.telegram.org") && url.endsWith("/sendMessage")) {
      sent.push({ channel: "telegram", to: String(body.chat_id), text: body.text, body });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("chatapi.viber.com")) {
      sent.push({ channel: "viber", to: String(body.receiver), text: body.text, body });
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch);
  return sent;
}
