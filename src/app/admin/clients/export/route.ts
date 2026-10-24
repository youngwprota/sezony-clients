import { NextResponse } from "next/server";
import writeExcelFile from "write-excel-file/node";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSalon } from "@/lib/booking";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Вся база клиентов в файле Excel. Все ячейки — текст: имя «=…», введённое на сайте,
 * не станет формулой, а телефон не превратится в число.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role === "MASTER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const salon = await getSalon();
  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: { appointments: { select: { startsAt: true, status: true }, orderBy: { startsAt: "desc" } } },
  });
  const text = (v: string | number | null | undefined) => ({ value: v == null ? "" : String(v), type: String });
  const header = ["Имя", "Телефон", "Email", "Дата рождения", "Комментарий", "Согласие на рассылки", "Viber", "Telegram", "Клиент с", "Визитов", "Последняя запись"];
  const rows = clients.map((c) => [
    text(c.name),
    text(c.phone),
    text(c.email),
    text(c.birthday),
    text(c.comment),
    text(c.marketingConsent ? "да" : "нет"),
    text(c.viberUserId ? "да" : ""),
    text(c.telegramChatId ? "да" : ""),
    text(localDate(c.createdAt, salon.timezone)),
    { value: c.appointments.filter((a) => a.status === "ARRIVED").length, type: Number },
    text(c.appointments[0] ? localDate(c.appointments[0].startsAt, salon.timezone) : ""),
  ]);
  const buffer = await writeExcelFile([header.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })), ...rows], {
    columns: [{ width: 28 }, { width: 16 }, { width: 24 }, { width: 14 }, { width: 40 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 9 }, { width: 16 }],
    stickyRowsCount: 1,
  }).toBuffer();
  const date = localDate(new Date(), salon.timezone);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="clients-${date}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
