import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getLevels } from "@/lib/loyalty";
import { segmentSchema } from "@/lib/segment-rules";
import { card } from "@/components/form";
import { CAMPAIGN_STATUS } from "@/lib/campaign-status";
import { CampaignEditor, CampaignProgress } from "./campaign-client";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const campaign = isNew
    ? null
    : await db.campaign.findUnique({
        where: { id: Number(id) || 0 },
        include: { recipients: { include: { client: { select: { id: true, name: true, phone: true } } }, orderBy: { id: "asc" } } },
      });
  if (!isNew && !campaign) notFound();

  if (campaign && campaign.status !== "DRAFT") {
    const count = (s: string) => campaign.recipients.filter((r) => r.status === s).length;
    const failed = campaign.recipients.filter((r) => r.status === "FAILED");
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <Link href="/admin/marketing" className="text-muted">← Рассылки</Link>
        <h1 className="text-2xl font-bold">{campaign.title}</h1>
        <CampaignProgress
          id={campaign.id}
          status={campaign.status}
          statusLabel={CAMPAIGN_STATUS[campaign.status]}
          total={campaign.recipients.length}
          sent={count("SENT")}
          failed={count("FAILED")}
          pending={count("PENDING")}
        />
        <section className={card}>
          <h2 className="mb-2 font-semibold">Текст</h2>
          <p className="whitespace-pre-line">{campaign.text}</p>
        </section>
        {failed.length > 0 && (
          <section className={card}>
            <h2 className="mb-2 font-semibold">Не доставлено · {failed.length}</h2>
            <ul className="divide-y divide-line text-sm">
              {failed.slice(0, 100).map((r) => (
                <li key={r.id} className="flex gap-3 py-1.5">
                  <Link href={`/admin/clients/${r.client.id}`} className="flex-1 hover:underline">{r.client.name}</Link>
                  <span className="text-muted">{r.channel === "telegram" ? "Telegram" : "Viber"}</span>
                  <span className="w-40 text-right text-muted">{r.error}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const [levels, staff, categories] = await Promise.all([
    getLevels(),
    db.staff.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    db.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, title: true } }),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/admin/marketing" className="text-muted">← Рассылки</Link>
      <h1 className="text-2xl font-bold">{campaign ? "Черновик рассылки" : "Новая рассылка"}</h1>
      <CampaignEditor
        initial={{
          id: campaign?.id,
          title: campaign?.title ?? "",
          text: campaign?.text ?? "",
          bookButton: campaign?.bookButton ?? true,
          segment: segmentSchema.parse(campaign?.segment ?? {}),
        }}
        levels={levels.map((l) => ({ id: l.id, name: l.name }))}
        staff={staff}
        categories={categories}
      />
    </div>
  );
}
