import "server-only";
import { db } from "./db";
import { signLinkPayload, type LinkTarget } from "./link-payload";

/** Снимает привязку чата у клиентов и мастеров (бот заблокирован или отписка). */
export async function forgetChat(ch: { telegramChatId: string } | { viberUserId: string }) {
  const data = "telegramChatId" in ch ? { telegramChatId: null } : { viberUserId: null };
  await Promise.all([db.client.updateMany({ where: ch, data }), db.staff.updateMany({ where: ch, data })]).catch((e) => console.error("forgetChat", e));
}

/** Кнопка под сообщением: `data` возвращается в вебхук при нажатии, `url` открывает ссылку. */
export type Button = { text: string; data: string } | { text: string; url: string };

export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_BOT_USERNAME;
export const viberEnabled = () => !!process.env.VIBER_AUTH_TOKEN && !!process.env.VIBER_BOT_URI;

/** Ссылки «подключить уведомления» для мастера или клиента. */
export function messengerLinks(target: LinkTarget) {
  const payload = signLinkPayload(target);
  return {
    telegram: telegramEnabled() ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${payload}` : null,
    viber: viberEnabled() ? `viber://pa?chatURI=${encodeURIComponent(process.env.VIBER_BOT_URI!)}&context=${payload}` : null,
  };
}

/** Telegram: текст в HTML-разметке. Возвращает false, если сообщение не доставлено. */
export async function sendTelegram(chatId: string, html: string, buttons?: Button[]): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(buttons?.length
          ? {
              reply_markup: {
                // до двух кнопок — в ряд, больше — столбиком, чтобы текст не обрезался
                inline_keyboard: (buttons.length > 2 ? buttons.map((b) => [b]) : [buttons]).map((row) =>
                  row.map((b) => ("url" in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })),
                ),
              },
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("telegram", res.status, body);
      // пользователь заблокировал бота или удалил чат — больше не пишем ему
      if (res.status === 403) await forgetChat({ telegramChatId: chatId });
    }
    return res.ok;
  } catch (e) {
    console.error("telegram", e);
    return false;
  }
}

export async function telegramApi(method: string, body: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => console.error("telegram", method, e));
}

/** Тело сообщения Viber; используется и для ответа на conversation_started. */
export function viberMessage(text: string, buttons?: Button[]) {
  return {
    min_api_version: 3,
    sender: { name: process.env.VIBER_SENDER_NAME || "Sезоны" },
    type: "text",
    text,
    ...(buttons?.length
      ? {
          keyboard: {
            Type: "keyboard",
            DefaultHeight: false,
            Buttons: buttons.map((b) => ({
              ActionType: "url" in b ? "open-url" : "reply",
              ActionBody: "url" in b ? b.url : b.data,
              Text: b.text,
              Columns: Math.floor(6 / buttons.length),
              Rows: 1,
              Silent: false,
            })),
          },
        }
      : {}),
  };
}

/** Viber: только обычный текст. Пользователь должен быть подписан на бота. */
export async function sendViber(userId: string, text: string, buttons?: Button[]): Promise<boolean> {
  const token = process.env.VIBER_AUTH_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch("https://chatapi.viber.com/pa/send_message", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Viber-Auth-Token": token },
      body: JSON.stringify({ receiver: userId, ...viberMessage(text, buttons) }),
    });
    const data = (await res.json().catch(() => ({}))) as { status?: number; status_message?: string };
    if (data.status !== 0) console.error("viber", data.status, data.status_message);
    return data.status === 0;
  } catch (e) {
    console.error("viber", e);
    return false;
  }
}

/** HTML Telegram → обычный текст для Viber. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
