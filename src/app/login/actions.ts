"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

/** Куда вести после входа: только внутренние разделы, доступные роли. */
export async function loginTarget(role: string, next?: string | null) {
  const safe = next && /^\/(admin|master)(\/[\w\-/?=&%.]*)?$/.test(next) ? next : null;
  if (safe?.startsWith("/admin") && role !== "MASTER") return safe;
  if (safe?.startsWith("/master")) return safe;
  return role === "MASTER" ? "/master" : "/admin";
}

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  const res = await login(String(form.get("login") ?? ""), String(form.get("password") ?? ""));
  if (!res.ok) return res.error;
  redirect(await loginTarget(res.session.role, String(form.get("next") ?? "")));
}
