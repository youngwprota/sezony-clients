import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { appointmentsForDay } from "@/lib/appointments";
import { hhmmToMinutes, localDate, localTime } from "@/lib/time";
import { loyaltyFor } from "@/lib/loyalty";
import { isoDate } from "@/lib/validation";
import { loyaltyBadge } from "@/lib/loyalty-rules";
import { Journal, type JournalAppointment, type JournalStaff } from "./journal";

export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ date?: string; all?: string }> }) {
  const salon = await getSalon();
  const { date: dateParam, all } = await searchParams;
  const today = localDate(new Date(), salon.timezone);
  const date = dateParam && isoDate.safeParse(dateParam).success ? dateParam : today;

  const [staff, shifts, appointments] = await Promise.all([
    db.staff.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.staffShift.findMany({ where: { date } }),
    appointmentsForDay(date, salon.timezone),
  ]);

  const busyStaff = new Set([...shifts.map((s) => s.staffId), ...appointments.map((a) => a.staffId)]);
  const columns: JournalStaff[] = staff
    .filter((s) => all === "1" || busyStaff.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      specialization: s.specialization,
      shifts: shifts.filter((x) => x.staffId === s.id).map((x) => ({ start: hhmmToMinutes(x.start), end: hhmmToMinutes(x.end) })),
    }));

  const loyalty = await loyaltyFor([...new Map(appointments.map((a) => [a.client.id, a.client])).values()]);
  const items: JournalAppointment[] = appointments.map((a) => {
    const start = localTime(a.startsAt, salon.timezone);
    const endDate = localDate(a.endsAt, salon.timezone);
    return {
      id: a.id,
      staffId: a.staffId,
      startMin: hhmmToMinutes(start),
      endMin: endDate === date ? hhmmToMinutes(localTime(a.endsAt, salon.timezone)) : 24 * 60,
      time: start,
      durationMin: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
      clientId: a.clientId,
      clientName: a.client.name,
      loyalty: loyaltyBadge(loyalty.get(a.clientId)!),
      phone: a.client.phone,
      services: a.items.map((i) => i.title),
      priceMin: a.items.reduce((s, i) => s + Number(i.priceMin), 0),
      priceMax: a.items.reduce((s, i) => s + Number(i.priceMax), 0),
      status: a.status,
      comment: a.comment,
      source: a.source,
    };
  });

  // рамки сетки: по сменам и записям, по умолчанию 09:00–21:00
  const mins = [...columns.flatMap((c) => c.shifts.map((s) => s.start)), ...items.map((i) => i.startMin)];
  const maxs = [...columns.flatMap((c) => c.shifts.map((s) => s.end)), ...items.map((i) => i.endMin)];
  const dayStart = Math.floor(Math.min(9 * 60, ...mins) / 60) * 60;
  const dayEnd = Math.ceil(Math.max(21 * 60, ...maxs) / 60) * 60;

  return (
    <Journal
      date={date}
      today={today}
      showAll={all === "1"}
      columns={columns}
      allStaff={staff.map((s) => ({ id: s.id, name: s.name }))}
      items={items}
      dayStart={dayStart}
      dayEnd={dayEnd}
      currency={salon.currency}
      nowMin={date === today ? hhmmToMinutes(localTime(new Date(), salon.timezone)) : null}
    />
  );
}
