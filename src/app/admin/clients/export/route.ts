import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSalon } from "@/lib/booking";
import { toCsv } from "@/lib/csv";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Вся база клиентов одним файлом, открывается в Excel. */
export async function GET() {
  const session = await getSession();
  if (!session || session.role === "MASTER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const salon = await getSalon();
  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      appointments: { select: { startsAt: true, status: true }, orderBy: { startsAt: "desc" } },
    },
  });
  const rows = [
    ["Имя", "Телефон", "Email", "Дата рождения", "Комментарий", "Согласие на рассылки", "Viber", "Telegram", "Клиент с", "Визитов", "Последняя запись"],
    ...clients.map((c) => [
      c.name,
      c.phone,
      c.email ?? "",
      c.birthday ?? "",
      c.comment,
      c.marketingConsent ? "да" : "нет",
      c.viberUserId ? "да" : "",
      c.telegramChatId ? "да" : "",
      localDate(c.createdAt, salon.timezone),
      c.appointments.filter((a) => a.status === "ARRIVED").length,
      c.appointments[0] ? localDate(c.appointments[0].startsAt, salon.timezone) : "",
    ]),
  ];
  const date = localDate(new Date(), salon.timezone);
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clients-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
