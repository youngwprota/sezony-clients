import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { forgetChat, htmlToPlain, sendViber, viberMessage } from "@/lib/messengers";
import { linkChat, sendNextAppointment } from "@/lib/notify";
import { handleBotInput } from "@/lib/bot";

function validSignature(body: string, signature: string | null) {
  const token = process.env.VIBER_AUTH_TOKEN;
  if (!token || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", token).update(body).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/**
 * Вебхук Viber-бота. Клиент или мастер открывает ссылку viber://pa?…&context=<payload>,
 * Viber присылает conversation_started с этим context — привязываем чат и отвечаем приветствием.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-viber-content-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (event.event === "unsubscribed" && event.user_id) {
    await forgetChat({ viberUserId: String(event.user_id) });
    return NextResponse.json({ ok: true });
  }

  if (event.event === "conversation_started") {
    const userId: string | undefined = event.user?.id;
    const text = userId && event.context
      ? await linkChat(String(event.context), { viberUserId: userId })
      : "Здравствуйте! Чтобы получать уведомления, откройте ссылку со страницы записи салона.";
    // приветствие уходит ответом на вебхук; кнопка подписывает пользователя на бота
    return NextResponse.json(viberMessage(`${text}\n\nНажмите «Получать уведомления», чтобы бот мог вам писать.`, [{ text: "Получать уведомления", data: "subscribe" }]));
  }

  if (event.event === "message" && event.sender?.id) {
    const userId: string = event.sender.id;
    const data: string = typeof event.message?.text === "string" ? event.message.text.trim().slice(0, 500) : "";
    const menu = [{ text: "Мой статус", data: "status" }];
    if (data === "subscribe") {
      await sendViber(userId, "Готово! Уведомления о записях будут приходить сюда.", menu);
      await sendNextAppointment({ viberUserId: userId });
    } else {
      const reply = await handleBotInput(data, { viberUserId: userId });
      if (reply) await sendViber(userId, htmlToPlain(reply.html), reply.buttons);
      else await sendViber(userId, "Напишите «статус» — покажем ваши визиты и записи, «акции» — подписка на акции, «стоп» — отписка.", menu);
    }
  }
  return NextResponse.json({ ok: true });
}
