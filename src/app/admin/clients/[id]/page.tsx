import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { formatDayShort, localDate, localTime } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { card } from "@/components/form";
import { STATUS_LABELS } from "@/lib/appointments";
import { ClientForm } from "./client-form";

export const dynamic = "force-dynamic";

export default async function ClientCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const salon = await getSalon();
  const client = await db.client.findUnique({
    where: { id: Number(id) || 0 },
    include: { appointments: { orderBy: { startsAt: "desc" }, include: { items: true, staff: { select: { name: true } } } } },
  });
  if (!client) notFound();

  const visits = client.appointments.filter((a) => a.status === "ARRIVED");
  const spent = visits.reduce((s, a) => s + a.items.reduce((x, i) => x + Number(i.priceMin), 0), 0);
  const noShows = client.appointments.filter((a) => a.status === "NO_SHOW").length;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/clients" className="text-muted">← Клиенты</Link>
      <div className="mt-2 grid gap-4 md:grid-cols-[1fr_1fr]">
        <section className={card}>
          <ClientForm id={client.id} initial={{ name: client.name, email: client.email ?? "", comment: client.comment }} />
          <p className="mt-3 text-sm">
            <a href={`tel:${client.phone}`} className="text-blue-700">{client.phone}</a>
          </p>
          <p className="mt-1 text-xs text-muted">
            Клиент с {formatDayShort(localDate(client.createdAt, salon.timezone))} · рассылки: {client.marketingConsent ? "согласен" : "нет согласия"}
          </p>
        </section>
        <section className={`${card} grid grid-cols-3 gap-2 text-center`}>
          <Stat label="Визитов" value={String(visits.length)} />
          <Stat label="Потратил" value={formatPrice(spent, spent, salon.currency)} />
          <Stat label="Не пришёл" value={String(noShows)} />
        </section>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">История записей</h2>
      <ul className={`${card} divide-y divide-line p-0`}>
        {client.appointments.map((a) => {
          const date = localDate(a.startsAt, salon.timezone);
          return (
            <li key={a.id}>
              <Link href={`/admin?date=${date}`} className="flex flex-wrap items-center gap-x-3 px-4 py-3 text-sm hover:bg-chip/50">
                <span className="w-36 font-medium">{formatDayShort(date)}, {localTime(a.startsAt, salon.timezone)}</span>
                <span className="flex-1">{a.items.map((i) => i.title).join(", ")}</span>
                <span className="text-muted">{a.staff.name}</span>
                <span className="w-24 text-right text-muted">{STATUS_LABELS[a.status]}</span>
              </Link>
            </li>
          );
        })}
        {client.appointments.length === 0 && <li className="p-4 text-muted">Записей нет</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
