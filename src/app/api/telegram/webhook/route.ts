import { NextResponse, type NextRequest } from "next/server";
import { sendTelegram, telegramApi } from "@/lib/messengers";
import { handleClientAction, linkChat } from "@/lib/notify";

/** Вебхук Telegram-бота: привязка чатов по ссылке и кнопки «Приду» / «Отменить». */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();

  const cb = update?.callback_query;
  if (cb?.data && cb.message?.chat?.id) {
    const chatId = String(cb.message.chat.id);
    const reply = await handleClientAction(cb.data, { telegramChatId: chatId });
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: reply ?? "" });
    if (reply) {
      // убираем кнопки у исходного сообщения, чтобы не нажимали повторно
      await telegramApi("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      await sendTelegram(chatId, reply);
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text: string = msg?.text ?? "";
  if (!chatId) return NextResponse.json({ ok: true });
  if (text.startsWith("/start ")) {
    await sendTelegram(chatId, await linkChat(text.slice(7), { telegramChatId: chatId }));
  } else if (text.startsWith("/start")) {
    await sendTelegram(chatId, "Здравствуйте! Чтобы получать уведомления, откройте ссылку со страницы записи салона.");
  }
  return NextResponse.json({ ok: true });
}
