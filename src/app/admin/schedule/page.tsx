import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { addDays, localDate, weekdayIndex } from "@/lib/time";
import { ScheduleGrid } from "./schedule-grid";

export const dynamic = "force-dynamic";

const DAYS = 14;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const salon = await getSalon();
  const today = localDate(new Date(), salon.timezone);
  const { from: fromParam } = await searchParams;
  const base = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : today;
  const from = addDays(base, -weekdayIndex(base)); // с понедельника
  const to = addDays(from, DAYS - 1);
  const [staff, shifts] = await Promise.all([
    db.staff.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, specialization: true } }),
    db.staffShift.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { start: "asc" } }),
  ]);
  return (
    <ScheduleGrid
      from={from}
      today={today}
      days={Array.from({ length: DAYS }, (_, i) => addDays(from, i))}
      staff={staff}
      shifts={shifts.map((s) => ({ staffId: s.staffId, date: s.date, start: s.start, end: s.end }))}
    />
  );
}
