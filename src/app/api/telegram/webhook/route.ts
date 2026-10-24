import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendTelegram, telegramApi } from "@/lib/messengers";
import { linkChat } from "@/lib/notify";
import { handleBotInput } from "@/lib/bot";

/** Вебхук Telegram-бота: привязка по ссылке, кнопки под сообщениями и команды /status, /promo, /stop. */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();

  const cb = update?.callback_query;
  if (cb?.data && cb.message?.chat?.id) {
    const chatId = String(cb.message.chat.id);
    const reply = await handleBotInput(cb.data, { telegramChatId: chatId });
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id });
    if (reply) {
      // убираем кнопки у исходного сообщения, чтобы не нажимали повторно
      await telegramApi("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      await sendTelegram(chatId, reply.html, reply.buttons);
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  if (text.startsWith("/start ")) {
    await sendTelegram(chatId, await linkChat(text.slice(7), { telegramChatId: chatId }), [{ text: "Мой статус", data: "status" }]);
    return NextResponse.json({ ok: true });
  }
  const known = await db.client.findFirst({ where: { telegramChatId: chatId }, select: { id: true } });
  const reply = await handleBotInput(text === "/start" && known ? "/status" : text, { telegramChatId: chatId });
  if (reply) await sendTelegram(chatId, reply.html, reply.buttons);
  else if (!(await db.staff.findFirst({ where: { telegramChatId: chatId }, select: { id: true } }))) {
    await sendTelegram(
      chatId,
      known
        ? "Команды: /status — мои визиты и записи, /promo — получать акции, /stop — отписаться от акций."
        : "Здравствуйте! Чтобы получать напоминания, запишитесь на сайте салона и нажмите «Напомнить в Telegram» на последнем шаге.",
    );
  }
  return NextResponse.json({ ok: true });
}
