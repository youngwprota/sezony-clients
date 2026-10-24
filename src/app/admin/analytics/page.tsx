import Link from "next/link";
import { getSalon } from "@/lib/booking";
import { getAnalytics, getClientBase } from "@/lib/analytics";
import { WEEKDAYS_SHORT, addDays, formatDayShort, localDate } from "@/lib/time";
import { plural } from "@/lib/text";
import { card } from "@/components/form";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "7", label: "7 дней" },
  { key: "30", label: "30 дней" },
  { key: "90", label: "90 дней" },
  { key: "next7", label: "Следующие 7 дней" },
];

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const salon = await getSalon();
  const { period: rawPeriod } = await searchParams;
  const period = PERIODS.some((p) => p.key === rawPeriod) ? rawPeriod! : "30";
  const today = localDate(new Date(), salon.timezone);
  const [from, to] = period === "next7" ? [today, addDays(today, 6)] : [addDays(today, -(Number(period) || 30) + 1), today];
  const [a, base] = await Promise.all([getAnalytics(from, to, salon), getClientBase(salon)]);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Аналитика</h1>
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/analytics?period=${p.key}`}
            className={`rounded-xl px-3 py-2 text-sm ${period === p.key ? "bg-ink text-white" : "bg-white hover:bg-chip"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <p className="-mt-2 text-sm text-muted">
        {formatDayShort(from)} — {formatDayShort(to)}
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Записей" value={a.total} hint={a.upcoming ? `из них впереди: ${a.upcoming}` : undefined} />
        <Stat label="Пришли" value={a.arrived} />
        <Stat label="Не пришли" value={a.noShow} hint={a.noShowRate !== null ? `${pct(a.noShowRate)} от прошедших` : undefined} />
        <Stat label="Отменено" value={a.cancelled} />
        <Stat label="Клиентов" value={a.clients} />
        <Stat label="Новых клиентов" value={a.newClients} hint="впервые в салоне" />
        <Stat label="Вернулись" value={a.returningClients} hint="уже были раньше" />
        <Stat label="Онлайн-записи" value={pct(a.onlineShare)} hint="доля записей через сайт" />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Записи по дням</h2>
        <DayBars days={a.days} today={today} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Загрузка мастеров</h2>
          <p className="mb-3 text-xs text-muted">Занятое время от рабочих часов по графику</p>
          <BarList
            rows={a.staffLoad.map((s) => ({
              key: s.id,
              label: s.name,
              value: s.load ?? 0,
              text: `${pct(s.load)} · ${s.count} ${plural(s.count, "запись", "записи", "записей")}`,
            }))}
            max={1}
            empty="Нет смен в этом периоде"
          />
        </section>
        <section className={card}>
          <h2 className="mb-3 font-semibold">Популярные услуги</h2>
          <BarList rows={a.topServices.map((s) => ({ key: s.title, label: s.title, value: s.count, text: String(s.count) }))} empty="Нет записей" />
        </section>
      </div>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Дни недели</h2>
        <BarList rows={a.weekdays.map((n, i) => ({ key: i, label: WEEKDAYS_SHORT[i], value: n, text: String(n) }))} empty="Нет записей" />
      </section>

      <h2 className="mt-4 text-xl font-bold">База клиентов</h2>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Всего клиентов" value={base.total} />
        <Stat label="Подключили Viber или Telegram" value={base.withMessenger} hint={base.total ? `${pct(base.withMessenger / base.total)} получают напоминания` : undefined} />
        <Stat label="Давно не были" value={base.lostCount} hint="больше 60 дней и нет новой записи" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Давно не были</h2>
          <p className="mb-2 text-xs text-muted">Сначала постоянные клиенты — им стоит написать первыми</p>
          {base.lost.length === 0 && <p className="text-sm text-muted">Таких клиентов нет</p>}
          <ul className="divide-y divide-line text-sm">
            {base.lost.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Link href={`/admin/clients/${c.id}`} className="flex-1 font-medium hover:underline">{c.name}</Link>
                <span className="text-muted">{c.visits} виз.</span>
                <span className="w-28 text-right text-muted">{formatDayShort(localDate(c.lastVisit!, salon.timezone))}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-2 font-semibold">Дни рождения в ближайшие 2 недели</h2>
          {base.birthdays.length === 0 && <p className="text-sm text-muted">Нет именинников</p>}
          <ul className="divide-y divide-line text-sm">
            {base.birthdays.slice(0, 20).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Link href={`/admin/clients/${c.id}`} className="flex-1 font-medium hover:underline">{c.name}</Link>
                <span className="hidden text-muted sm:inline">{c.phone}</span>
                <span className="w-16 text-right">{c.day.split("-").reverse().join(".")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Вертикальные столбики по дням: один цвет, подсказка при наведении, подписи дат выборочно. */
function DayBars({ days, today }: { days: { date: string; count: number }[]; today: string }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const every = days.length <= 14 ? 1 : days.length <= 31 ? 7 : 14;
  const peak = days.reduce((p, d) => (d.count > p.count ? d : p), days[0]);
  return (
    <div className="mt-3">
      <div className="relative flex h-40 items-end gap-[2px] border-b border-line">
        <span className="absolute -top-1 left-0 text-xs text-muted tabular-nums">{max}</span>
        <div className="absolute inset-x-0 top-1 border-t border-line" aria-hidden />
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end" aria-label={`${formatDayShort(d.date)}: ${d.count}`}>
            <div
              className={`w-full rounded-t-[4px] bg-chart ${d.date > today ? "opacity-40" : ""} group-hover:brightness-90`}
              style={{ height: `${(d.count / max) * 92}%`, minHeight: d.count ? 2 : 0 }}
            />
            {d === peak && d.count > 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 text-xs font-medium tabular-nums" style={{ bottom: `calc(${(d.count / max) * 92}% + 2px)` }}>
                {d.count}
              </span>
            )}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
              {formatDayShort(d.date)}: {d.count} {plural(d.count, "запись", "записи", "записей")}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[11px] text-muted">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 overflow-visible text-center whitespace-nowrap">
            {i % every === 0 ? (days.length <= 14 ? formatDayShort(d.date).split(",")[0] : `${+d.date.slice(8)}.${d.date.slice(5, 7)}`) : ""}
          </span>
        ))}
      </div>
      {days.some((d) => d.date > today) && <p className="mt-2 text-xs text-muted">Светлые столбики — уже записанные будущие дни</p>}
    </div>
  );
}

/** Ранжированный список: подпись и значение строкой выше, полоска на всю ширину под ними. */
function BarList({
  rows,
  max,
  empty,
}: {
  rows: { key: string | number; label: string; value: number; text: string }[];
  max?: number;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.text}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 text-muted tabular-nums">{r.text}</span>
          </div>
          <div className="mt-1 h-2 rounded-r-[4px] bg-chip">
            <div className="h-full rounded-r-[4px] bg-chart" style={{ width: `${(r.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
