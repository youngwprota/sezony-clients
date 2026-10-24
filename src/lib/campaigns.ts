import "server-only";
import { db } from "./db";
import { getLevels, visitCounts } from "./loyalty";
import { loyaltyStatus } from "./loyalty-rules";
import { escapeHtml, sendTelegram, sendViber, type Button } from "./messengers";
import { matchesSegment, pickChannel, renderTemplate, segmentSchema, type ClientFacts, type Segment } from "./segment-rules";
import { localDate, localTime } from "./time";

/** Всё, что нужно знать о клиентах для фильтра аудитории. */
async function loadClientFacts(): Promise<(ClientFacts & { name: string; personalDiscount: number | null })[]> {
  const clients = await db.client.findMany({
    select: {
      id: true,
      name: true,
      birthday: true,
      marketingConsent: true,
      telegramChatId: true,
      viberUserId: true,
      personalDiscount: true,
      appointments: {
        where: { status: "ARRIVED" },
        select: { startsAt: true, staffId: true, items: { select: { service: { select: { categoryId: true } } } } },
      },
    },
  });
  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    birthday: c.birthday,
    marketingConsent: c.marketingConsent,
    telegramChatId: c.telegramChatId,
    viberUserId: c.viberUserId,
    personalDiscount: c.personalDiscount,
    visits: c.appointments.length,
    lastVisit: c.appointments.reduce<Date | null>((m, a) => (!m || a.startsAt > m ? a.startsAt : m), null),
    staffIds: new Set(c.appointments.map((a) => a.staffId)),
    categoryIds: new Set(c.appointments.flatMap((a) => a.items.map((i) => i.service.categoryId))),
  }));
}

async function resolve(segment: Segment) {
  const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
  const now = new Date();
  const month = localDate(now, salon.timezone).slice(5, 7);
  const [facts, levels] = await Promise.all([loadClientFacts(), getLevels()]);
  const matched = facts.filter((c) => matchesSegment(c, segment, levels, now, month));
  return { matched, levels, picks: matched.map((c) => ({ client: c, channel: pickChannel(c, segment.channel) })) };
}

export type SegmentPreview = {
  matched: number;
  reachable: number;
  telegram: number;
  viber: number;
  noConsent: number;
  noMessenger: number;
};

/** Сколько клиентов подходит под фильтр и скольким сообщение реально дойдёт. */
export async function previewSegment(raw: unknown): Promise<SegmentPreview> {
  const { matched, picks } = await resolve(segmentSchema.parse(raw));
  return {
    matched: matched.length,
    reachable: picks.filter((p) => p.channel).length,
    telegram: picks.filter((p) => p.channel === "telegram").length,
    viber: picks.filter((p) => p.channel === "viber").length,
    noConsent: matched.filter((c) => !c.marketingConsent).length,
    noMessenger: matched.filter((c) => c.marketingConsent && !c.telegramChatId && !c.viberUserId).length,
  };
}

/** Фиксирует список получателей и ставит рассылку в очередь. */
export async function startCampaign(id: number) {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Рассылка не найдена");
  if (campaign.status !== "DRAFT") throw new Error("Рассылка уже отправлена");
  const { picks } = await resolve(segmentSchema.parse(campaign.segment));
  const rows = picks.filter((p) => p.channel).map((p) => ({ campaignId: id, clientId: p.client.id, channel: p.channel! }));
  await db.$transaction([
    db.campaignRecipient.createMany({ data: rows, skipDuplicates: true }),
    db.campaign.update({ where: { id }, data: { status: rows.length ? "SENDING" : "SENT", startedAt: new Date(), finishedAt: rows.length ? null : new Date() } }),
  ]);
  return rows.length;
}

function promoFooter(channel: "telegram" | "viber") {
  return channel === "telegram" ? "\n\n<i>Отписаться от акций: /stop</i>" : "\n\nОтписаться от акций: напишите «стоп».";
}

function bookButton(): Button[] {
  return process.env.APP_URL?.startsWith("https://") ? [{ text: "Записаться", url: process.env.APP_URL }] : [];
}

/** Отправляет одно рекламное сообщение клиенту в выбранный канал. */
async function sendPromo(channel: "telegram" | "viber", to: string, text: string, withButton: boolean) {
  const buttons = withButton ? bookButton() : [];
  return channel === "telegram"
    ? sendTelegram(to, escapeHtml(text) + promoFooter("telegram"), buttons)
    : sendViber(to, text + promoFooter("viber"), buttons);
}

const BATCH = 25;

/** Отправляет очередную порцию рассылок. Возвращает число обработанных сообщений. */
export async function runCampaignQueue(): Promise<number> {
  const pending = await db.campaignRecipient.findMany({
    where: { status: "PENDING", campaign: { status: "SENDING" } },
    take: BATCH,
    orderBy: { id: "asc" },
    include: { campaign: true, client: true },
  });
  if (!pending.length) {
    // закрываем рассылки, у которых всё отправлено
    const open = await db.campaign.findMany({ where: { status: "SENDING", recipients: { none: { status: "PENDING" } } }, select: { id: true } });
    if (open.length) await db.campaign.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: "SENT", finishedAt: new Date() } });
    return 0;
  }
  const levels = await getLevels();
  const visits = new Map(
    (await db.appointment.groupBy({ by: ["clientId"], where: { status: "ARRIVED", clientId: { in: pending.map((p) => p.clientId) } }, _count: true })).map((r) => [
      r.clientId,
      r._count,
    ]),
  );
  for (const r of pending) {
    const c = r.client;
    const to = r.channel === "telegram" ? c.telegramChatId : c.viberUserId;
    // клиент мог отписаться или отключить мессенджер после постановки в очередь
    if (!c.marketingConsent || !to) {
      await db.campaignRecipient.update({ where: { id: r.id }, data: { status: "FAILED", error: !to ? "мессенджер отключён" : "отписался" } });
      continue;
    }
    const discount = loyaltyStatus(visits.get(c.id) ?? 0, c.personalDiscount, levels).discount;
    const ok = await sendPromo(r.channel as "telegram" | "viber", to, renderTemplate(r.campaign.text, { name: c.name, discount }), r.campaign.bookButton);
    await db.campaignRecipient.update({
      where: { id: r.id },
      data: ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: "не доставлено" },
    });
    await new Promise((res) => setTimeout(res, 60)); // не больше ~15 сообщений в секунду
  }
  return pending.length;
}

/** «-MM-DD» дней рождения, которые празднуем сегодня; родившихся 29 февраля в невисокосный год поздравляем 28-го. */
export function birthdayKeys(today: string): string[] {
  const keys = [today.slice(4)];
  const year = Number(today.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (today.slice(5) === "02-28" && !leap) keys.push("-02-29");
  return keys;
}

/** Поздравления с днём рождения — раз в год каждому, после 11:00 по времени салона. */
export async function runBirthdayGreetings(now = new Date()) {
  const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
  if (!salon.birthdayGreetingEnabled || localTime(now, salon.timezone) < "11:00") return 0;
  const today = localDate(now, salon.timezone);
  const key = `birthday:${today.slice(0, 4)}`;
  const clients = await db.client.findMany({
    where: {
      OR: birthdayKeys(today).map((k) => ({ birthday: { endsWith: k } })),
      marketingConsent: true,
      AND: [{ OR: [{ telegramChatId: { not: null } }, { viberUserId: { not: null } }] }],
      autoMessages: { none: { key } },
    },
  });
  const [levels, visits] = await Promise.all([getLevels(), visitCounts(clients.map((c) => c.id))]);
  let sent = 0;
  for (const c of clients) {
    // запись в журнал раньше отправки — защита от повторов
    const logged = await db.autoMessageLog.create({ data: { clientId: c.id, key } }).catch(() => null);
    if (!logged) continue;
    const discount = loyaltyStatus(visits.get(c.id) ?? 0, c.personalDiscount, levels).discount;
    const channel = c.telegramChatId ? "telegram" : "viber";
    const text = renderTemplate(salon.birthdayGreetingText, { name: c.name, discount });
    if (await sendPromo(channel, (c.telegramChatId ?? c.viberUserId)!, text, true)) sent++;
  }
  return sent;
}
