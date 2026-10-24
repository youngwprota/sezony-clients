import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminders";

/** Ручной или внешний запуск напоминаний: GET /api/cron/reminders с заголовком Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, sent: await runReminders() });
}
