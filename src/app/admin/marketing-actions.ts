"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { previewSegment, startCampaign, type SegmentPreview } from "@/lib/campaigns";
import { segmentSchema } from "@/lib/segment-rules";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

// ---------- Лояльность ----------

const levelsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "У каждого уровня должно быть название"),
      minVisits: z.number().int().min(0),
      discountPercent: z.number().int().min(0).max(100),
      perks: z.string().trim().default(""),
    }),
  )
  .refine((l) => new Set(l.map((x) => x.minVisits)).size === l.length, "У двух уровней одинаковое число визитов");

export async function saveLevelsAction(input: z.input<typeof levelsSchema>): Promise<Result> {
  await requireAdmin();
  const p = levelsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await db.$transaction([db.loyaltyLevel.deleteMany(), db.loyaltyLevel.createMany({ data: p.data })]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function saveBirthdayGreetingAction(enabled: boolean, text: string): Promise<Result> {
  await requireAdmin();
  if (enabled && !text.trim()) return { ok: false, error: "Введите текст поздравления" };
  await db.salon.update({ where: { id: 1 }, data: { birthdayGreetingEnabled: enabled, birthdayGreetingText: text.trim() } });
  revalidatePath("/admin/loyalty");
  return { ok: true };
}

export async function setPersonalDiscountAction(clientId: number, value: number | null): Promise<Result> {
  await requireAdmin();
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) return { ok: false, error: "Скидка — от 0 до 100%" };
  await db.client.update({ where: { id: clientId }, data: { personalDiscount: value } });
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true };
}

// ---------- Рассылки ----------

export async function previewSegmentAction(segment: unknown): Promise<SegmentPreview> {
  await requireAdmin();
  return previewSegment(segment);
}

const campaignSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(1, "Введите название рассылки"),
  text: z.string().trim().min(1, "Введите текст сообщения").max(3500, "Текст длиннее 3500 символов"),
  bookButton: z.boolean(),
  segment: segmentSchema,
});

export async function saveCampaignAction(input: z.input<typeof campaignSchema>): Promise<Result<number>> {
  await requireAdmin();
  const p = campaignSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, ...data } = p.data;
  if (id) {
    const c = await db.campaign.findUniqueOrThrow({ where: { id } });
    if (c.status !== "DRAFT") return { ok: false, error: "Отправленную рассылку нельзя изменить" };
    await db.campaign.update({ where: { id }, data });
    revalidatePath("/admin/marketing");
    return { ok: true, data: id };
  }
  const c = await db.campaign.create({ data });
  revalidatePath("/admin/marketing");
  return { ok: true, data: c.id };
}

export async function startCampaignAction(id: number): Promise<Result<number>> {
  await requireAdmin();
  try {
    const n = await startCampaign(id);
    revalidatePath("/admin/marketing");
    return { ok: true, data: n };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function cancelCampaignAction(id: number): Promise<Result> {
  await requireAdmin();
  await db.campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "CANCELLED", finishedAt: new Date() } });
  revalidatePath("/admin/marketing");
  return { ok: true };
}

export async function deleteDraftAction(id: number): Promise<Result> {
  await requireAdmin();
  await db.campaign.deleteMany({ where: { id, status: "DRAFT" } });
  revalidatePath("/admin/marketing");
  return { ok: true };
}
