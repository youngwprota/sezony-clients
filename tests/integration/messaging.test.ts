import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runReminders } from "@/lib/reminders";
import { handleBotInput } from "@/lib/bot";
import { linkChat, notifyClient } from "@/lib/notify";
import { signLinkPayload } from "@/lib/link-payload";
import { birthdayKeys, previewSegment, runBirthdayGreetings, runCampaignQueue, startCampaign } from "@/lib/campaigns";
import { segmentSchema } from "@/lib/segment-rules";
import { POST as telegramWebhook } from "@/app/api/telegram/webhook/route";
import { POST as viberWebhook } from "@/app/api/viber/webhook/route";
import { captureMessengers, clientWithVisits, day, at, resetDb, seedSalon, type Fixture } from "./helpers";

let f: Fixture;
let sent: ReturnType<typeof captureMessengers>;

beforeEach(async () => {
  await resetDb();
  f = await seedSalon();
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "1:test");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "sezony_bot");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "tg-secret");
  vi.stubEnv("VIBER_AUTH_TOKEN", "viber-token");
  vi.stubEnv("VIBER_BOT_URI", "sezony");
  sent = captureMessengers(vi.spyOn(globalThis, "fetch"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function appointment(clientId: number, startsAt: Date, createdAt = new Date(Date.now() - 3 * 864e5), status: "BOOKED" | "CONFIRMED" = "BOOKED") {
  return db.appointment.create({
    data: {
      staffId: f.irina.id,
      clientId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      status,
      source: "ONLINE",
      createdAt,
      items: { create: [{ serviceId: f.cut.id, title: "Стрижка", priceMin: 75, priceMax: 75, durationMin: 60 }] },
    },
  });
}

const tg = (body: unknown, secret = "tg-secret") =>
  telegramWebhook(new NextRequest("https://salon.test/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const viber = (body: unknown, token = "viber-token") => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return viberWebhook(
    new NextRequest("https://salon.test/api/viber/webhook", { method: "POST", headers: { "x-viber-content-signature": createHmac("sha256", token).update(raw).digest("hex") }, body: raw }),
  );
};

describe("привязка мессенджера по ссылке", () => {
  it("Telegram: подписанная ссылка привязывает клиента и сразу подтверждает ближайшую запись", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567" } });
    await appointment(c.id, new Date(Date.now() + 2 * 864e5));
    const res = await tg({ message: { chat: { id: 777 }, text: `/start ${signLinkPayload({ kind: "c", id: c.id })}` } });
    expect(res.status).toBe(200);
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).telegramChatId).toBe("777");
    await vi.waitFor(() => expect(sent.some((m) => m.text.includes("Вы записаны"))).toBe(true));
    const confirm = sent.find((m) => m.text.includes("Вы записаны"))!;
    expect(JSON.stringify(confirm.body.reply_markup)).toContain("confirm:");
  });

  it("поддельная ссылка не привязывает чужого клиента", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567" } });
    expect(await linkChat(`c${c.id}_AAAAAAAAAAAAAAAAAAAA`, { telegramChatId: "1" })).toMatch(/не подошла/);
    expect(await linkChat("s999_garbage", { telegramChatId: "1" })).toMatch(/не подошла/);
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).telegramChatId).toBeNull();
  });

  it("мастер привязывает Telegram и Viber", async () => {
    await linkChat(signLinkPayload({ kind: "s", id: f.irina.id }), { telegramChatId: "55" });
    await linkChat(signLinkPayload({ kind: "s", id: f.irina.id }), { viberUserId: "v55" });
    expect(await db.staff.findUniqueOrThrow({ where: { id: f.irina.id } })).toMatchObject({ telegramChatId: "55", viberUserId: "v55" });
  });
});

describe("вебхуки", () => {
  it("Telegram: без секрета — 401, битый JSON и посторонние события не ломают сервер", async () => {
    expect((await tg({}, "wrong")).status).toBe(401);
    expect((await tg("{not json")).status).toBe(200);
    expect((await tg({ edited_message: { text: "x" } })).status).toBe(200);
    expect((await tg({ message: { chat: { id: 1 }, sticker: {} } })).status).toBe(200);
    expect((await tg({ callback_query: { id: "1", data: "cancel:999999", message: { chat: { id: 1 }, message_id: 1 } } })).status).toBe(200);
  });

  it("Telegram: заблокировал бота — привязка снимается", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "42" } });
    await tg({ my_chat_member: { chat: { id: 42 }, new_chat_member: { status: "kicked" } } });
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).telegramChatId).toBeNull();
  });

  it("Telegram: ответ 403 при отправке тоже снимает привязку", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 }));
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "43" } });
    const a = await appointment(c.id, new Date(Date.now() + 2 * 864e5));
    expect(await notifyClient("created", a.id)).toBe(false);
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).telegramChatId).toBeNull();
  });

  it("Viber: неверная подпись — 401; conversation_started привязывает и предлагает подписку; отписка снимает привязку", async () => {
    expect((await viber({ event: "message" }, "bad")).status).toBe(401);
    expect((await viber("{oops")).status).toBe(200);
    const c = await db.client.create({ data: { name: "Ольга", phone: "+375331234567" } });
    const res = await viber({ event: "conversation_started", user: { id: "vU" }, context: signLinkPayload({ kind: "c", id: c.id }) });
    const welcome = await res.json();
    expect(welcome.text).toMatch(/Здравствуйте, Ольга/);
    expect(JSON.stringify(welcome.keyboard)).toContain("subscribe");
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).viberUserId).toBe("vU");
    await viber({ event: "unsubscribed", user_id: "vU" });
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).viberUserId).toBeNull();
  });
});

describe("напоминания клиентам", () => {
  it("за сутки и за 2 часа — по одному разу, только подключённым клиентам", async () => {
    const linked = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "1" } });
    const silent = await db.client.create({ data: { name: "Без мессенджера", phone: "+375331234567" } });
    const a = await appointment(linked.id, new Date(Date.now() + 23 * 3_600_000));
    await appointment(silent.id, new Date(Date.now() + 20 * 3_600_000));
    expect(await runReminders()).toBe(1);
    expect(await runReminders()).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/Напоминаем/);
    // через 21 час — напоминание «скоро»
    expect(await runReminders(new Date(Date.now() + 21.5 * 3_600_000))).toBe(1);
    expect(sent.at(-1)!.text).toMatch(/Скоро/);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: a.id } })).remindHoursSentAt).not.toBeNull();
  });

  it("не напоминает об отменённых, прошедших и записях, сделанных только что", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "1" } });
    const cancelled = await appointment(c.id, new Date(Date.now() + 20 * 3_600_000));
    await db.appointment.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    await appointment(c.id, new Date(Date.now() + 22 * 3_600_000), new Date());
    expect(await runReminders()).toBe(0);
  });

  it("уважает настройки салона", async () => {
    await db.salon.update({ where: { id: 1 }, data: { remindDayBefore: false, remindHoursBefore: 0 } });
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "1" } });
    await appointment(c.id, new Date(Date.now() + 1 * 3_600_000));
    expect(await runReminders()).toBe(0);
  });
});

describe("бот вместо личного кабинета", () => {
  it("«Мой статус» показывает визиты, уровень, скидку и записи", async () => {
    const c = await clientWithVisits("+375291234567", "Анна Петрова", 6, f.irina.id, f.cut.id, { telegramChatId: "9" });
    await appointment(c.id, new Date(Date.now() + 2 * 864e5));
    const r = await handleBotInput("/status", { telegramChatId: "9" });
    expect(r!.html).toMatch(/Визитов: 6/);
    expect(r!.html).toMatch(/Постоянный — скидка 5%/);
    expect(r!.html).toMatch(/До уровня «VIP»: 9 визитов/);
    expect(r!.html).toMatch(/Стрижка \(Ирина\)/);
    expect(JSON.stringify(r!.buttons)).toContain("cancel:");
  });

  it("неизвестный чат получает подсказку, мусорные команды игнорируются", async () => {
    expect((await handleBotInput("/status", { telegramChatId: "nobody" }))!.html).toMatch(/не знаем ваш номер/);
    expect(await handleBotInput("привет", { telegramChatId: "nobody" })).toBeNull();
  });

  it("подписка и отписка от акций", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "9", marketingConsent: true } });
    await handleBotInput("/stop", { telegramChatId: "9" });
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).marketingConsent).toBe(false);
    await handleBotInput("акции", { telegramChatId: "9" });
    expect((await db.client.findUniqueOrThrow({ where: { id: c.id } })).marketingConsent).toBe(true);
  });

  it("клиент подтверждает и отменяет свою запись, но не чужую и не прошедшую", async () => {
    const me = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "9" } });
    const other = await db.client.create({ data: { name: "Ольга", phone: "+375331234567", telegramChatId: "10" } });
    const mine = await appointment(me.id, new Date(Date.now() + 2 * 864e5));
    const theirs = await appointment(other.id, new Date(Date.now() + 3 * 864e5));
    const past = await appointment(me.id, new Date(Date.now() - 864e5));

    expect((await handleBotInput(`cancel:${theirs.id}`, { telegramChatId: "9" }))!.html).toMatch(/не найдена/);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("BOOKED");
    expect((await handleBotInput(`cancel:${past.id}`, { telegramChatId: "9" }))!.html).toMatch(/прошло/);
    expect((await handleBotInput(`confirm:${mine.id}`, { telegramChatId: "9" }))!.html).toMatch(/ждём/);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("CONFIRMED");
    expect((await handleBotInput(`cancel:${mine.id}`, { telegramChatId: "9" }))!.html).toMatch(/отменена/);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("CANCELLED");
    expect((await handleBotInput(`cancel:${mine.id}`, { telegramChatId: "9" }))!.html).toMatch(/уже отменена/);
  });

  it("отмена клиентом освобождает время для онлайн-записи", async () => {
    const me = await db.client.create({ data: { name: "Анна", phone: "+375291234567", telegramChatId: "9" } });
    const a = await db.appointment.create({
      data: { staffId: f.irina.id, clientId: me.id, startsAt: new Date(at(day(2), "10:00")), endsAt: new Date(at(day(2), "11:00")), source: "ONLINE" },
    });
    await handleBotInput(`cancel:${a.id}`, { telegramChatId: "9" });
    const { getDaySlots } = await import("@/lib/booking");
    expect((await getDaySlots(day(2), f.irina.id, [f.cut.id])).map((s) => s.time)).toContain("10:00");
  });
});

describe("рассылки", () => {
  async function audience() {
    await clientWithVisits("+375291000001", "VIP Telegram", 16, f.irina.id, f.cut.id, { telegramChatId: "t1", marketingConsent: true });
    await clientWithVisits("+375291000002", "VIP Viber", 16, f.olga.id, f.cut.id, { viberUserId: "v2", marketingConsent: true });
    await clientWithVisits("+375291000003", "VIP без согласия", 16, f.irina.id, f.cut.id, { telegramChatId: "t3", marketingConsent: false });
    await clientWithVisits("+375291000004", "VIP без мессенджера", 16, f.irina.id, f.cut.id, { marketingConsent: true });
    await clientWithVisits("+375291000005", "Новичок", 1, f.irina.id, f.cut.id, { telegramChatId: "t5", viberUserId: "v5", marketingConsent: true });
  }

  it("предпросмотр считает охват по фильтру, согласию и мессенджерам", async () => {
    await audience();
    const vipLevel = await db.loyaltyLevel.findFirstOrThrow({ where: { name: "VIP" } });
    expect(await previewSegment({ levelIds: [vipLevel.id] })).toEqual({ matched: 4, reachable: 2, telegram: 1, viber: 1, noConsent: 1, noMessenger: 1 });
    expect(await previewSegment({})).toMatchObject({ matched: 5, reachable: 3, telegram: 2, viber: 1 });
    expect(await previewSegment({ staffIds: [f.olga.id] })).toMatchObject({ matched: 1, reachable: 1, viber: 1 });
    expect(await previewSegment({ channel: "viber" })).toMatchObject({ reachable: 2, viber: 2 });
  });

  it("отправляет по очереди с подстановкой имени и скидки, отпиской и кнопкой записи", async () => {
    await audience();
    const c = await db.campaign.create({ data: { title: "Акция", text: "{имя}, ваша скидка {скидка}!", segment: segmentSchema.parse({}) } });
    expect(await startCampaign(c.id)).toBe(3);
    await expect(startCampaign(c.id)).rejects.toThrow(/уже отправлена/);
    while ((await runCampaignQueue()) > 0);
    await runCampaignQueue();
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SENT");
    expect(await db.campaignRecipient.count({ where: { campaignId: c.id, status: "SENT" } })).toBe(3);
    const vip = sent.find((m) => m.to === "t1")!;
    expect(vip.text).toMatch(/^VIP, ваша скидка 10%!/);
    expect(vip.text).toMatch(/\/stop/);
    expect(JSON.stringify(vip.body.reply_markup)).toContain("https://salon.test");
    expect(sent.find((m) => m.to === "v2")!.text).toMatch(/стоп/);
    // у клиента с двумя мессенджерами — только Telegram, без дублей
    expect(sent.filter((m) => m.to === "t5" || m.to === "v5")).toHaveLength(1);
  });

  it("не пишет тем, кто отписался после запуска, и останавливается по кнопке", async () => {
    await audience();
    const c = await db.campaign.create({ data: { title: "Акция", text: "Текст", segment: segmentSchema.parse({}) } });
    await startCampaign(c.id);
    await db.client.update({ where: { phone: "+375291000001" }, data: { marketingConsent: false } });
    await runCampaignQueue();
    const r = await db.campaignRecipient.findFirstOrThrow({ where: { client: { phone: "+375291000001" } } });
    expect(r).toMatchObject({ status: "FAILED", error: "отписался" });

    const c2 = await db.campaign.create({ data: { title: "Стоп", text: "Текст", segment: segmentSchema.parse({}) } });
    await startCampaign(c2.id);
    await db.campaign.update({ where: { id: c2.id }, data: { status: "CANCELLED" } });
    const before = sent.length;
    await runCampaignQueue();
    expect(sent.length).toBe(before);
  });

  it("поздравляет с днём рождения один раз, только с согласием; 29 февраля — 28-го в невисокосный год", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-28T10:00:00Z")); // 13:00 в Минске
    await db.salon.update({ where: { id: 1 }, data: { birthdayGreetingEnabled: true, birthdayGreetingText: "{имя}, с днём рождения!" } });
    await db.client.create({ data: { name: "Лида", phone: "+375291000010", birthday: "1990-02-29", marketingConsent: true, telegramChatId: "b1" } });
    await db.client.create({ data: { name: "Вера", phone: "+375291000011", birthday: "1985-02-28", marketingConsent: true, viberUserId: "b2" } });
    await db.client.create({ data: { name: "Без согласия", phone: "+375291000012", birthday: "1985-02-28", telegramChatId: "b3" } });
    expect(await runBirthdayGreetings()).toBe(2);
    expect(await runBirthdayGreetings()).toBe(0);
    expect(sent.map((m) => m.text.split(",")[0]).sort()).toEqual(["Вера", "Лида"]);
    vi.useRealTimers();
    expect(birthdayKeys("2028-02-28")).toEqual(["-02-28"]);
    expect(birthdayKeys("2027-02-28")).toEqual(["-02-28", "-02-29"]);
  });

  it("не поздравляет до 11:00 и при выключенной настройке", async () => {
    await db.client.create({ data: { name: "Лида", phone: "+375291000010", birthday: "1990-06-15", marketingConsent: true, telegramChatId: "b1" } });
    await db.salon.update({ where: { id: 1 }, data: { birthdayGreetingEnabled: true } });
    expect(await runBirthdayGreetings(new Date("2026-06-15T06:00:00Z"))).toBe(0); // 09:00 Минск
    await db.salon.update({ where: { id: 1 }, data: { birthdayGreetingEnabled: false } });
    expect(await runBirthdayGreetings(new Date("2026-06-15T10:00:00Z"))).toBe(0);
  });
});
