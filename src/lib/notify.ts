import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { escapeHtml, htmlToPlain, sendTelegram, sendViber, type Button } from "./messengers";
import { parseLinkPayload } from "./link-payload";
import { formatDayLong, formatDayShort, localDate, localTime } from "./time";

type AppointmentForNotice = {
  id: number;
  staffId: number;
  clientId: number;
  startsAt: Date;
  client: { name: string; phone: string };
  items: { title: string }[];
  comment: string;
};

export type NoticeKind = "created" | "cancelled" | "changed";

// ---------- мастер ----------

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

const STAFF_HEADINGS: Record<NoticeKind, string> = {
  created: "Новая запись",
  cancelled: "Запись отменена",
  changed: "Запись перенесена",
};

/** Сообщает мастеру о записи: push, Telegram, Viber. Ошибки каналов не мешают основной операции. */
export async function notifyStaff(kind: NoticeKind, a: AppointmentForNotice) {
  try {
    const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
    const staff = await db.staff.findUniqueOrThrow({ where: { id: a.staffId } });
    const when = `${formatDayShort(localDate(a.startsAt, salon.timezone))}, ${localTime(a.startsAt, salon.timezone)}`;
    const services = a.items.map((i) => i.title).join(", ");
    const url = `${process.env.APP_URL ?? ""}/master?date=${localDate(a.startsAt, salon.timezone)}`;
    const html = [
      `<b>${STAFF_HEADINGS[kind]}</b>`,
      `🗓 ${when}`,
      `👤 ${escapeHtml(a.client.name)}, ${escapeHtml(a.client.phone)}`,
      `✂️ ${escapeHtml(services)}`,
      a.comment ? `💬 ${escapeHtml(a.comment)}` : "",
      process.env.APP_URL ? `<a href="${url}">Открыть расписание</a>` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await Promise.all([
      sendPushToStaff(a.staffId, { title: `${STAFF_HEADINGS[kind]}: ${when}`, body: `${a.client.name} — ${services}`, url }),
      staff.telegramChatId ? sendTelegram(staff.telegramChatId, html) : null,
      staff.viberUserId ? sendViber(staff.viberUserId, htmlToPlain(html)) : null,
    ]);
  } catch (e) {
    console.error("notifyStaff", e);
  }
}

// ---------- клиент ----------

export type ClientNoticeKind = "created" | "changed" | "cancelled" | "remindDay" | "remindHours";

const CLIENT_HEADINGS: Record<ClientNoticeKind, string> = {
  created: "Вы записаны",
  changed: "Ваша запись перенесена",
  cancelled: "Ваша запись отменена",
  remindDay: "Напоминаем: завтра у вас запись",
  remindHours: "Скоро ваша запись",
};

const clientButtons = (id: number): Button[] => [
  { text: "✅ Приду", data: `confirm:${id}` },
  { text: "❌ Отменить", data: `cancel:${id}` },
];

/** Сообщение клиенту в Telegram и/или Viber. Возвращает true, если дошло хотя бы по одному каналу. */
export async function notifyClient(kind: ClientNoticeKind, appointmentId: number): Promise<boolean> {
  try {
    const a = await db.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { client: true, staff: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    const { telegramChatId, viberUserId } = a.client;
    if (!telegramChatId && !viberUserId) return false;
    const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
    const date = localDate(a.startsAt, salon.timezone);
    const heading = kind === "remindDay" && date !== localDate(new Date(Date.now() + 864e5), salon.timezone) ? "Напоминаем о записи" : CLIENT_HEADINGS[kind];
    const html = [
      `<b>${heading}</b>`,
      `🗓 ${formatDayLong(date)}, ${localTime(a.startsAt, salon.timezone)}`,
      `✂️ ${escapeHtml(a.items.map((i) => i.title).join(", "))}`,
      `👩 Мастер: ${escapeHtml(a.staff.name)}`,
      salon.address ? `📍 ${escapeHtml(salon.address)}` : "",
      salon.phone ? `☎️ ${escapeHtml(salon.phone)}` : "",
      kind === "cancelled" ? "\nБудем рады видеть вас снова!" : "",
      kind !== "cancelled" && a.status !== "CONFIRMED" ? "\nПодтвердите, пожалуйста, визит или отмените запись, если планы изменились." : "",
    ]
      .filter(Boolean)
      .join("\n");
    const buttons = kind === "cancelled" || a.status === "CONFIRMED" ? undefined : clientButtons(a.id);
    const results = await Promise.all([
      telegramChatId ? sendTelegram(telegramChatId, html, buttons) : false,
      viberUserId ? sendViber(viberUserId, htmlToPlain(html), buttons) : false,
    ]);
    return results.some(Boolean);
  } catch (e) {
    console.error("notifyClient", e);
    return false;
  }
}

// ---------- входящие от мессенджеров ----------

export type Channel = { telegramChatId: string } | { viberUserId: string };

const channelWhere = (ch: Channel) => ("telegramChatId" in ch ? { telegramChatId: ch.telegramChatId } : { viberUserId: ch.viberUserId });

/** Привязывает чат по ссылке из приложения мастера или со страницы записи. Возвращает ответ пользователю. */
export async function linkChat(payload: string, ch: Channel): Promise<string> {
  const target = parseLinkPayload(payload);
  if (!target) return "Ссылка не подошла. Откройте её ещё раз со страницы салона.";
  if (target.kind === "s") {
    const staff = await db.staff.update({ where: { id: target.id }, data: channelWhere(ch) }).catch(() => null);
    return staff ? `Готово, ${staff.name}! Сюда будут приходить уведомления о ваших записях.` : "Мастер не найден.";
  }
  const client = await db.client.update({ where: { id: target.id }, data: channelWhere(ch) }).catch(() => null);
  if (!client) return "Клиент не найден.";
  // в Telegram можно писать сразу; в Viber — только после подписки (см. sendNextAppointment)
  if ("telegramChatId" in ch) setTimeout(() => void sendNextAppointment(ch), 500);
  return `Здравствуйте, ${client.name}! Сюда придут подтверждение и напоминания о ваших записях в салон.`;
}

/** Отправляет клиенту подтверждение его ближайшей записи. */
export async function sendNextAppointment(ch: Channel) {
  const next = await db.appointment.findFirst({
    where: { client: channelWhere(ch), status: { in: ["BOOKED", "CONFIRMED"] }, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  if (next) await notifyClient("created", next.id);
}

/** Нажатие «Приду» / «Отменить» в сообщении клиенту. */
export async function handleClientAction(data: string, ch: Channel): Promise<string | null> {
  const m = /^(confirm|cancel):(\d+)$/.exec(data);
  if (!m) return null;
  const a = await db.appointment.findUnique({ where: { id: Number(m[2]) }, include: { client: true, items: true } });
  const owns = a && ("telegramChatId" in ch ? a.client.telegramChatId === ch.telegramChatId : a.client.viberUserId === ch.viberUserId);
  if (!a || !owns) return "Запись не найдена.";
  if (a.status === "CANCELLED") return "Эта запись уже отменена.";
  if (a.startsAt <= new Date()) return "Время этой записи уже прошло.";
  if (m[1] === "confirm") {
    if (a.status === "BOOKED") await db.appointment.update({ where: { id: a.id }, data: { status: "CONFIRMED" } });
    return "Спасибо, ждём вас! 💛";
  }
  await db.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
  await notifyStaff("cancelled", a);
  return "Запись отменена. Записаться снова можно на сайте салона.";
}
