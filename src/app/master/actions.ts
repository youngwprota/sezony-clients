"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logout, requireMaster } from "@/lib/auth";

const MASTER_STATUSES = ["ARRIVED", "NO_SHOW", "CONFIRMED", "BOOKED"] as const;

export async function setStatusAction(id: number, status: (typeof MASTER_STATUSES)[number]) {
  const s = await requireMaster();
  if (!Number.isInteger(id) || !MASTER_STATUSES.includes(status)) return;
  // отменённую запись мастер не возвращает — это делает администратор
  await db.appointment.updateMany({ where: { id, staffId: s.staffId, status: { not: "CANCELLED" } }, data: { status } });
  revalidatePath("/master");
}

export async function markSeenAction(ids: number[]) {
  const s = await requireMaster();
  const clean = Array.isArray(ids) ? ids.filter((x) => Number.isInteger(x)).slice(0, 500) : [];
  if (!clean.length) return;
  await db.appointment.updateMany({ where: { id: { in: clean }, staffId: s.staffId }, data: { seenByStaff: true } });
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
