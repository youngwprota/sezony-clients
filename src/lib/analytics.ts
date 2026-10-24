import "server-only";
import { db } from "./db";
import { addDays, hhmmToMinutes, localDate, weekdayIndex, zonedDateTime } from "./time";

type Salon = { timezone: string };

/** Показатели за период [from, to] (местные даты включительно). Без денег — только записи и клиенты. */
export async function getAnalytics(from: string, to: string, salon: Salon) {
  const start = zonedDateTime(from, "00:00", salon.timezone);
  const end = zonedDateTime(addDays(to, 1), "00:00", salon.timezone);
  const [appts, staff, shifts] = await Promise.all([
    db.appointment.findMany({
      where: { startsAt: { gte: start, lt: end } },
      select: {
        id: true,
        staffId: true,
        clientId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        items: { select: { title: true } },
      },
    }),
    db.staff.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    db.staffShift.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);

  const live = appts.filter((a) => a.status !== "CANCELLED");
  const count = (s: string) => appts.filter((a) => a.status === s).length;
  const now = new Date();

  // по дням
  const days: { date: string; count: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, count: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  const weekdays = Array(7).fill(0) as number[];
  for (const a of live) {
    const d = localDate(a.startsAt, salon.timezone);
    const i = dayIdx.get(d);
    if (i !== undefined) days[i].count++;
    weekdays[weekdayIndex(d)]++;
  }

  // новые и вернувшиеся: была ли у клиента запись раньше начала периода
  const clientIds = [...new Set(live.map((a) => a.clientId))];
  const earlier = await db.appointment.groupBy({
    by: ["clientId"],
    where: { clientId: { in: clientIds }, startsAt: { lt: start }, status: { not: "CANCELLED" } },
  });
  const returningSet = new Set(earlier.map((e) => e.clientId));

  // загрузка мастеров: занятые минуты / минуты смен
  const shiftMin = new Map<number, number>();
  for (const s of shifts) shiftMin.set(s.staffId, (shiftMin.get(s.staffId) ?? 0) + hhmmToMinutes(s.end) - hhmmToMinutes(s.start));
  const staffLoad = staff
    .map((s) => {
      const mine = live.filter((a) => a.staffId === s.id);
      const busy = mine.reduce((m, a) => m + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);
      const total = shiftMin.get(s.id) ?? 0;
      return { id: s.id, name: s.name, count: mine.length, load: total ? Math.min(1, busy / total) : null };
    })
    .filter((s) => s.count > 0 || s.load !== null)
    .sort((a, b) => (b.load ?? -1) - (a.load ?? -1));

  const svc = new Map<string, number>();
  for (const a of live) for (const i of a.items) svc.set(i.title, (svc.get(i.title) ?? 0) + 1);
  const topServices = [...svc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count }));

  const finished = count("ARRIVED") + count("NO_SHOW");
  return {
    total: live.length,
    arrived: count("ARRIVED"),
    noShow: count("NO_SHOW"),
    noShowRate: finished ? count("NO_SHOW") / finished : null,
    cancelled: count("CANCELLED"),
    upcoming: live.filter((a) => (a.status === "BOOKED" || a.status === "CONFIRMED") && a.startsAt > now).length,
    onlineShare: live.length ? live.filter((a) => a.source === "ONLINE").length / live.length : null,
    clients: clientIds.length,
    newClients: clientIds.filter((id) => !returningSet.has(id)).length,
    returningClients: clientIds.filter((id) => returningSet.has(id)).length,
    days,
    weekdays,
    staffLoad,
    topServices,
  };
}

/** Состояние базы клиентов: размер, мессенджеры, кто давно не был, ближайшие дни рождения. */
export async function getClientBase(salon: Salon, lostAfterDays = 60) {
  const now = new Date();
  const today = localDate(now, salon.timezone);
  const [total, withMessenger, clients] = await Promise.all([
    db.client.count(),
    db.client.count({ where: { OR: [{ telegramChatId: { not: null } }, { viberUserId: { not: null } }] } }),
    db.client.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        birthday: true,
        appointments: { where: { status: { in: ["ARRIVED", "BOOKED", "CONFIRMED"] } }, select: { startsAt: true, status: true }, orderBy: { startsAt: "desc" } },
      },
    }),
  ]);

  const cutoff = new Date(now.getTime() - lostAfterDays * 864e5);
  const lost = clients
    .map((c) => {
      const lastVisit = c.appointments.find((a) => a.status === "ARRIVED")?.startsAt;
      const hasUpcoming = c.appointments.some((a) => a.status !== "ARRIVED" && a.startsAt > now);
      const visits = c.appointments.filter((a) => a.status === "ARRIVED").length;
      return { id: c.id, name: c.name, phone: c.phone, lastVisit, hasUpcoming, visits };
    })
    .filter((c) => c.lastVisit && c.lastVisit < cutoff && !c.hasUpcoming)
    .sort((a, b) => b.visits - a.visits || b.lastVisit!.getTime() - a.lastVisit!.getTime());

  const soon = new Set(Array.from({ length: 14 }, (_, i) => addDays(today, i).slice(5)));
  const birthdays = clients
    .filter((c) => c.birthday && soon.has(c.birthday.slice(5)))
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, day: c.birthday!.slice(5) }))
    .sort((a, b) => ((a.day >= today.slice(5) ? "0" : "1") + a.day).localeCompare((b.day >= today.slice(5) ? "0" : "1") + b.day));

  return { total, withMessenger, lostCount: lost.length, lost: lost.slice(0, 20), birthdays };
}
