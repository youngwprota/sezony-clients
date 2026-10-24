import "server-only";
import { db } from "./db";
import { loyaltyFor } from "./loyalty";
import { escapeHtml, type Button } from "./messengers";
import { handleClientAction, type Channel } from "./notify";
import { formatDayShort, localDate, localTime } from "./time";
import { plural } from "./text";

/**
 * Бот вместо личного кабинета: клиент узнаётся по привязанному чату.
 * Команды одинаковы для Telegram (/status) и Viber (кнопки и слова «статус», «стоп», «акции»).
 */
export type BotReply = { html: string; buttons?: Button[] };

const COMMANDS: Record<string, "status" | "stop" | "promo"> = {
  "/status": "status",
  "статус": "status",
  "мой статус": "status",
  "мои записи": "status",
  status: "status",
  "/stop": "stop",
  "стоп": "stop",
  "отписаться": "stop",
  "promo:off": "stop",
  "/promo": "promo",
  "акции": "promo",
  "promo:on": "promo",
};

const channelWhere = (ch: Channel) => ("telegramChatId" in ch ? { telegramChatId: ch.telegramChatId } : { viberUserId: ch.viberUserId });

export async function handleBotInput(input: string, ch: Channel): Promise<BotReply | null> {
  const text = input.trim();
  const action = await handleClientAction(text, ch);
  if (action) return { html: escapeHtml(action), buttons: [{ text: "Мой статус", data: "status" }] };

  const cmd = COMMANDS[text.toLowerCase()];
  if (!cmd) return null;
  const client = await db.client.findFirst({ where: channelWhere(ch) });
  if (!client) return { html: "Мы пока не знаем ваш номер. Запишитесь на сайте салона и нажмите «Напомнить» на последнем шаге." };

  if (cmd === "stop") {
    await db.client.update({ where: { id: client.id }, data: { marketingConsent: false } });
    return {
      html: "Вы отписались от акций и новостей. Напоминания о ваших записях будут приходить как раньше.",
      buttons: [{ text: "Снова получать акции", data: "promo:on" }],
    };
  }
  if (cmd === "promo") {
    await db.client.update({ where: { id: client.id }, data: { marketingConsent: true } });
    return { html: "Готово! Будем присылать акции и новости салона — не чаще пары раз в месяц.", buttons: [{ text: "Мой статус", data: "status" }] };
  }
  return statusReply(client.id);
}

async function statusReply(clientId: number): Promise<BotReply> {
  const [client, salon] = await Promise.all([
    db.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        appointments: {
          where: { status: { in: ["BOOKED", "CONFIRMED"] }, startsAt: { gt: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 3,
          include: { staff: true, items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    db.salon.findUniqueOrThrow({ where: { id: 1 } }),
  ]);
  const s = (await loyaltyFor([client])).get(client.id)!;
  const lines = [
    `<b>${escapeHtml(client.name)}, ваша карта клиента «${escapeHtml(salon.name)}»</b>`,
    `Визитов: ${s.visits}`,
    s.level ? `Уровень: ${escapeHtml(s.level.name)}${s.discount ? ` — скидка ${s.discount}%` : ""}` : s.discount ? `Ваша скидка: ${s.discount}%` : "",
    s.level?.perks ? `Бонусы уровня: ${escapeHtml(s.level.perks)}` : "",
    s.next ? `До уровня «${escapeHtml(s.next.level.name)}»: ${s.next.visitsLeft} ${plural(s.next.visitsLeft, "визит", "визита", "визитов")}` : "",
    "",
    client.appointments.length ? "<b>Ваши записи:</b>" : "Предстоящих записей нет.",
    ...client.appointments.map(
      (a) =>
        `• ${formatDayShort(localDate(a.startsAt, salon.timezone))}, ${localTime(a.startsAt, salon.timezone)} — ${escapeHtml(a.items.map((i) => i.title).join(", "))} (${escapeHtml(a.staff.name)})`,
    ),
    "",
    client.marketingConsent ? "Вы получаете акции и новости." : "Акции и новости: не подписаны.",
  ];
  const next = client.appointments[0];
  const buttons: Button[] = [];
  if (next) buttons.push({ text: `Отменить ${localTime(next.startsAt, salon.timezone)} ${formatDayShort(localDate(next.startsAt, salon.timezone)).split(", ")[1]}`, data: `cancel:${next.id}` });
  buttons.push(client.marketingConsent ? { text: "Отписаться от акций", data: "promo:off" } : { text: "Получать акции", data: "promo:on" });
  if (process.env.APP_URL?.startsWith("https://")) buttons.push({ text: "Записаться", url: process.env.APP_URL });
  return { html: lines.filter((l, i, arr) => l !== "" || (arr[i - 1] !== "" && i > 0)).join("\n"), buttons };
}
