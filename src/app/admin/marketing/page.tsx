import Link from "next/link";
import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { formatDayShort, localDate, localTime } from "@/lib/time";
import { btnPrimary, card } from "@/components/form";
import { CAMPAIGN_STATUS } from "@/lib/campaign-status";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const salon = await getSalon();
  const [campaigns, reachable] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { recipients: { select: { status: true } } } }),
    db.client.count({ where: { marketingConsent: true, OR: [{ telegramChatId: { not: null } }, { viberUserId: { not: null } }] } }),
  ]);
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Рассылки</h1>
        <Link href="/admin/marketing/new" className={`${btnPrimary} flex items-center`}>+ Рассылка</Link>
      </div>
      <p className="-mt-2 text-sm text-muted">
        Сообщения уходят в Telegram или Viber только клиентам с согласием на рассылки. Сейчас таких клиентов: {reachable}. В каждом сообщении
        есть способ отписаться.
      </p>
      <ul className={`${card} divide-y divide-line p-0`}>
        {campaigns.length === 0 && <li className="p-6 text-center text-muted">Рассылок пока нет</li>}
        {campaigns.map((c) => {
          const sent = c.recipients.filter((r) => r.status === "SENT").length;
          const when = c.startedAt ?? c.createdAt;
          return (
            <li key={c.id}>
              <Link href={`/admin/marketing/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-chip/50">
                <span className="min-w-0 flex-1 font-medium">{c.title}</span>
                <span className="text-sm text-muted">
                  {formatDayShort(localDate(when, salon.timezone))}, {localTime(when, salon.timezone)}
                </span>
                <span className="w-28 text-right text-sm">{c.status === "DRAFT" ? "—" : `${sent} из ${c.recipients.length}`}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "SENDING" ? "bg-amber-100" : c.status === "SENT" ? "bg-green-100" : "bg-chip"}`}>
                  {CAMPAIGN_STATUS[c.status]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
