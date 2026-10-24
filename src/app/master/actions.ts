"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logout, requireMaster } from "@/lib/auth";

export async function setStatusAction(id: number, status: "ARRIVED" | "NO_SHOW" | "CONFIRMED" | "BOOKED") {
  const s = await requireMaster();
  await db.appointment.updateMany({ where: { id, staffId: s.staffId }, data: { status } });
  revalidatePath("/master");
}

export async function markSeenAction(ids: number[]) {
  const s = await requireMaster();
  await db.appointment.updateMany({ where: { id: { in: ids }, staffId: s.staffId }, data: { seenByStaff: true } });
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
