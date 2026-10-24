import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/notify";
import { parseTelegramStartPayload } from "@/lib/telegram-link";

/** Вебхук Telegram-бота: привязка чата мастера по ссылке из приложения. */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();
  const msg = update?.message;
  const text: string = msg?.text ?? "";
  const chatId = msg?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  const payload = text.startsWith("/start ") ? text.slice(7).trim() : "";
  const staffId = payload ? parseTelegramStartPayload(payload) : null;
  if (staffId) {
    const staff = await db.staff.update({ where: { id: staffId }, data: { telegramChatId: String(chatId) } }).catch(() => null);
    await sendTelegram(String(chatId), staff ? `Готово, ${staff.name}! Сюда будут приходить уведомления о ваших записях.` : "Мастер не найден.");
  } else if (text.startsWith("/start")) {
    await sendTelegram(String(chatId), "Откройте приложение мастера и нажмите «Подключить Telegram».");
  }
  return NextResponse.json({ ok: true });
}
