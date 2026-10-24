import Link from "next/link";
import { db } from "@/lib/db";
import { requireMaster } from "@/lib/auth";
import { getSalon } from "@/lib/booking";
import { appointmentsForDay } from "@/lib/appointments";
import { addDays, formatDayLong, localDate, localTime, weekdayIndex, WEEKDAYS_SHORT, zonedDateTime } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { telegramStartPayload } from "@/lib/telegram-link";
import { Avatar } from "@/components/ui";
import { AppointmentCard, AutoRefresh, MarkSeen, NotificationsPanel } from "./client";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MasterPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireMaster();
  const salon = await getSalon();
  const today = localDate(new Date(), salon.timezone);
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const staff = await db.staff.findUniqueOrThrow({ where: { id: session.staffId } });
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 1));
  const [appointments, counts, shift, unseen] = await Promise.all([
    appointmentsForDay(date, salon.timezone, staff.id),
    db.appointment.groupBy({
      by: ["startsAt"],
      where: {
        staffId: staff.id,
        status: { not: "CANCELLED" },
        startsAt: { gte: zonedDateTime(days[0], "00:00", salon.timezone), lt: zonedDateTime(addDays(days.at(-1)!, 1), "00:00", salon.timezone) },
      },
      _count: true,
    }),
    db.staffShift.findMany({ where: { staffId: staff.id, date }, orderBy: { start: "asc" } }),
    db.appointment.findMany({
      where: { staffId: staff.id, seenByStaff: false, status: { not: "CANCELLED" }, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    }),
  ]);
  const perDay = new Map<string, number>();
  for (const c of counts) {
    const d = localDate(c.startsAt, salon.timezone);
    perDay.set(d, (perDay.get(d) ?? 0) + c._count);
  }
  const unseenDays = new Set(unseen.map((u) => localDate(u.startsAt, salon.timezone)));
  const active = appointments.filter((a) => a.status !== "CANCELLED");
  const revenue = active.reduce((a, x) => a + x.items.reduce((s, i) => s + Number(i.priceMin), 0), 0);

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const telegramLink = botUsername ? `https://t.me/${botUsername}?start=${telegramStartPayload(staff.id)}` : null;

  return (
    <div className="mx-auto min-h-dvh max-w-[600px] bg-[#f6f6f7] pb-10">
      <AutoRefresh />
      <MarkSeen ids={appointments.filter((a) => !a.seenByStaff).map((a) => a.id)} />
      <header className="flex items-center gap-3 bg-white px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3">
        <Avatar name={staff.name} url={staff.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{staff.name}</div>
          <div className="truncate text-sm text-muted">{staff.specialization}</div>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-muted">Выйти</button>
        </form>
      </header>

      <nav className="no-scrollbar flex gap-2 overflow-x-auto bg-white px-4 pb-3">
        {days.map((d) => {
          const n = perDay.get(d) ?? 0;
          const sel = d === date;
          return (
            <Link
              key={d}
              href={`/master?date=${d}`}
              className={`relative flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 ${sel ? "bg-ink text-white" : "bg-chip"}`}
            >
              <span className={`text-xs ${sel ? "text-white/70" : "text-muted"}`}>{WEEKDAYS_SHORT[weekdayIndex(d)]}</span>
              <span className="text-lg font-semibold">{Number(d.slice(8))}</span>
              <span className={`text-[11px] ${sel ? "text-white/80" : n ? "text-ink" : "text-transparent"}`}>{n || "·"}</span>
              {unseenDays.has(d) && <span className="absolute top-1 right-1 size-2 rounded-full bg-danger" />}
            </Link>
          );
        })}
      </nav>

      <section className="px-4 pt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-xl font-bold">{date === today ? "Сегодня" : formatDayLong(date)}</h1>
          <span className="text-sm text-muted">
            {shift.length ? shift.map((s) => `${s.start}–${s.end}`).join(", ") : "Выходной"}
          </span>
        </div>
        {active.length > 0 && (
          <p className="mb-3 text-sm text-muted">
            {active.length} зап. · от {formatPrice(revenue, revenue, salon.currency)}
          </p>
        )}
        {appointments.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-muted">Записей нет</p>}
        <ul className="flex flex-col gap-3">
          {appointments.map((a) => (
            <AppointmentCard
              key={a.id}
              a={{
                id: a.id,
                time: `${localTime(a.startsAt, salon.timezone)} – ${localTime(a.endsAt, salon.timezone)}`,
                clientName: a.client.name,
                phone: a.client.phone,
                services: a.items.map((i) => ({ title: i.title, price: formatPrice(Number(i.priceMin), Number(i.priceMax), salon.currency) })),
                comment: a.comment,
                status: a.status,
                isNew: !a.seenByStaff,
                online: a.source === "ONLINE",
              }}
            />
          ))}
        </ul>
      </section>

      <NotificationsPanel vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} telegramLink={telegramLink} telegramLinked={!!staff.telegramChatId} />
    </div>
  );
}
