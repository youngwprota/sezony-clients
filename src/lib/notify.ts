import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { formatDayShort, localDate, localTime } from "./time";

type AppointmentForNotice = {
  id: number;
  staffId: number;
  startsAt: Date;
  client: { name: string; phone: string };
  items: { title: string }[];
  comment: string;
};

export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("telegram", res.status, await res.text());
}

function vapidReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return true;
}

async function sendPushToStaff(staffId: number, payload: { title: string; body: string; url: string }) {
  if (!vapidReady()) return;
  const subs = await db.pushSubscription.findMany({ where: { user: { staffId } } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // подписка больше не действует
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("push", e);
      }
    }),
  );
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type NoticeKind = "created" | "cancelled" | "changed";

const HEADINGS: Record<NoticeKind, string> = {
  created: "Новая запись",
  cancelled: "Запись отменена",
  changed: "Запись изменена",
};

/** Сообщает мастеру о записи. Ошибки каналов не мешают основной операции. */
export async function notifyStaff(kind: NoticeKind, a: AppointmentForNotice) {
  try {
    const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
    const staff = await db.staff.findUniqueOrThrow({ where: { id: a.staffId } });
    const when = `${formatDayShort(localDate(a.startsAt, salon.timezone))}, ${localTime(a.startsAt, salon.timezone)}`;
    const services = a.items.map((i) => i.title).join(", ");
    const url = `${process.env.APP_URL ?? ""}/master?date=${localDate(a.startsAt, salon.timezone)}`;

    const jobs: Promise<unknown>[] = [
      sendPushToStaff(a.staffId, { title: `${HEADINGS[kind]}: ${when}`, body: `${a.client.name} — ${services}`, url }),
    ];
    if (staff.telegramChatId) {
      const lines = [
        `<b>${HEADINGS[kind]}</b>`,
        `🗓 ${when}`,
        `👤 ${escape(a.client.name)}, ${escape(a.client.phone)}`,
        `✂️ ${escape(services)}`,
        a.comment ? `💬 ${escape(a.comment)}` : "",
        process.env.APP_URL ? `<a href="${url}">Открыть расписание</a>` : "",
      ].filter(Boolean);
      jobs.push(sendTelegram(staff.telegramChatId, lines.join("\n")));
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error("notifyStaff", e);
  }
}
