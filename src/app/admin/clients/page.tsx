import Link from "next/link";
import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { formatDayShort, localDate } from "@/lib/time";
import { card, inputCls, btnSecondary } from "@/components/form";
import { loyaltyFor } from "@/lib/loyalty";
import { loyaltyBadge } from "@/lib/loyalty-rules";

export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page = "1" } = await searchParams;
  const salon = await getSalon();
  const n = Math.max(1, Number(page) || 1);
  const query = q.trim();
  const digits = query.replace(/\D/g, "");
  const where = query
    ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
    : {};
  const [total, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (n - 1) * PAGE,
      take: PAGE,
      include: {
        _count: { select: { appointments: { where: { status: "ARRIVED" } } } },
        appointments: { orderBy: { startsAt: "desc" }, take: 1, select: { startsAt: true } },
      },
    }),
  ]);

  const loyalty = await loyaltyFor(clients);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Клиенты · {total}</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Имя или телефон" className={`${inputCls} w-56`} />
          <button className={btnSecondary}>Найти</button>
        </form>
        <Link href="/admin/clients/new" className={`${btnSecondary} flex items-center`}>+ Клиент</Link>
        <Link href="/admin/clients/import" className={`${btnSecondary} flex items-center`}>Импорт</Link>
        <a href="/admin/clients/export" className={`${btnSecondary} flex items-center`}>Скачать базу (Excel)</a>
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="p-3 font-normal">Клиент</th>
              <th className="p-3 font-normal">Телефон</th>
              <th className="p-3 font-normal">Лояльность</th>
              <th className="p-3 text-right font-normal">Визитов</th>
              <th className="p-3 text-right font-normal">Последняя запись</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-chip/50">
                <td className="p-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                </td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3 text-muted">{loyaltyBadge(loyalty.get(c.id)!) ?? "—"}</td>
                <td className="p-3 text-right">{c._count.appointments}</td>
                <td className="p-3 text-right text-muted">{c.appointments[0] ? formatDayShort(localDate(c.appointments[0].startsAt, salon.timezone)) : "—"}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">Клиентов не найдено</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="mt-3 flex gap-2">
          {n > 1 && <Link className={btnSecondary + " flex items-center"} href={`?q=${encodeURIComponent(q)}&page=${n - 1}`}>‹ Назад</Link>}
          {n * PAGE < total && <Link className={btnSecondary + " flex items-center"} href={`?q=${encodeURIComponent(q)}&page=${n + 1}`}>Дальше ›</Link>}
        </div>
      )}
    </div>
  );
}
