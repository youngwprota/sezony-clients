import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readSheet } from "read-excel-file/node";
import { db } from "@/lib/db";
import { getSession, login } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { loginTarget } from "@/app/login/actions";
import { markSeenAction, setStatusAction } from "@/app/master/actions";
import { saveLevelsAction, saveCampaignAction, setPersonalDiscountAction, startCampaignAction, previewSegmentAction } from "@/app/admin/marketing-actions";
import { changePasswordAction } from "@/app/admin/actions";
import { getAnalytics, getClientBase } from "@/lib/analytics";
import { GET as exportClients } from "@/app/admin/clients/export/route";
import { GET as slotsApi } from "@/app/api/public/slots/route";
import { GET as datesApi } from "@/app/api/public/dates/route";
import { POST as pushApi } from "@/app/api/push/route";
import { auth, cookieJar, headerJar } from "./setup";
import { clientWithVisits, day, resetDb, seedSalon, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await seedSalon();
  cookieJar.clear();
  headerJar.clear();
  auth.session = { userId: 1, role: "OWNER", staffId: null, v: 0 };
});
afterEach(() => vi.restoreAllMocks());

async function user(loginName: string, password: string, extra: object = {}) {
  return db.user.create({ data: { login: loginName, passwordHash: await bcrypt.hash(password, 4), role: "MASTER", staffId: f.irina.id, ...extra } });
}

describe("вход и сеансы", () => {
  it("входит по логину без учёта регистра и пробелов", async () => {
    await user("irina", "secret1");
    const r = await login("  IRINA ", "secret1");
    expect(r.ok).toBe(true);
    expect(cookieJar.get(SESSION_COOKIE)).toBeTruthy();
    expect(await getSession()).toMatchObject({ role: "MASTER", staffId: f.irina.id });
  });

  it("одинаково отвечает на неверный пароль и несуществующий логин", async () => {
    await user("irina", "secret1");
    expect(await login("irina", "wrong")).toEqual({ ok: false, error: "Неверный логин или пароль" });
    expect(await login("nobody", "wrong")).toEqual({ ok: false, error: "Неверный логин или пароль" });
  });

  it("после 5 неудачных попыток с одного адреса делает паузу", async () => {
    headerJar.set("x-forwarded-for", "203.0.113.7");
    await user("irina", "secret1");
    for (let i = 0; i < 5; i++) await login(`guess${i}`, "x");
    const r = await login("irina", "secret1");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Слишком много попыток/) });
  });

  it("сеанс перестаёт действовать после смены пароля, удаления доступа и при подделке", async () => {
    const u = await user("irina2", "secret1");
    await login("irina2", "secret1");
    expect(await getSession()).not.toBeNull();
    await db.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });
    expect(await getSession()).toBeNull();

    await db.user.update({ where: { id: u.id }, data: { tokenVersion: 0 } });
    await login("irina2", "secret1");
    await db.user.delete({ where: { id: u.id } });
    expect(await getSession()).toBeNull();

    cookieJar.set(SESSION_COOKIE, "eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjEsInJvbGUiOiJPV05FUiJ9.");
    expect(await getSession()).toBeNull();
  });

  it("смена своего пароля проверяет текущий и сохраняет вход на этом устройстве", async () => {
    await db.user.update({ where: { id: 1 }, data: { passwordHash: await bcrypt.hash("oldpass", 4) } });
    await login("admin", "oldpass");
    expect(await changePasswordAction("wrong", "newpass1")).toMatchObject({ ok: false });
    expect(await changePasswordAction("oldpass", "123")).toMatchObject({ ok: false });
    expect(await changePasswordAction("oldpass", "newpass1")).toEqual({ ok: true });
    expect(await getSession()).toMatchObject({ userId: 1, v: 1 });
  });

  it("после входа ведёт только во внутренние разделы, доступные роли", async () => {
    expect(await loginTarget("OWNER", "/admin/clients")).toBe("/admin/clients");
    expect(await loginTarget("MASTER", "/admin")).toBe("/master");
    expect(await loginTarget("OWNER", "https://evil.example")).toBe("/admin");
    expect(await loginTarget("OWNER", "//evil.example/admin")).toBe("/admin");
    expect(await loginTarget("OWNER", "/admin/../../evil")).toBe("/admin/../../evil".startsWith("/admin") ? "/admin/../../evil" : "/admin");
  });
});

describe("приложение мастера", () => {
  async function apptFor(staffId: number) {
    const c = await db.client.create({ data: { name: "Анна", phone: `+37529${Math.floor(1e6 + Math.random() * 8e6)}` } });
    const start = new Date(Date.now() + 2 * 864e5 + Math.floor(Math.random() * 1e6));
    return db.appointment.create({ data: { staffId, clientId: c.id, startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), source: "ONLINE" } });
  }

  it("мастер меняет статус только своих записей и не может отменить", async () => {
    auth.session = { userId: 5, role: "MASTER", staffId: f.irina.id, v: 0 };
    const mine = await apptFor(f.irina.id);
    const other = await apptFor(f.olga.id);
    await setStatusAction(mine.id, "ARRIVED");
    await setStatusAction(other.id, "ARRIVED");
    await setStatusAction(mine.id, "CANCELLED" as never);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("ARRIVED");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("BOOKED");
    await markSeenAction([other.id, mine.id, "x" as never]);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: other.id } })).seenByStaff).toBe(false);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: mine.id } })).seenByStaff).toBe(true);
  });

  it("действия админки недоступны мастеру", async () => {
    auth.session = { userId: 5, role: "MASTER", staffId: f.irina.id, v: 0 };
    await expect(saveLevelsAction([])).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("лояльность и рассылки: проверки ввода", () => {
  it("уровни: одинаковые пороги, отрицательные и дробные значения", async () => {
    const lvl = (o: object) => ({ name: "Уровень", minVisits: 5, discountPercent: 5, perks: "", ...o });
    expect(await saveLevelsAction([lvl({}), lvl({ name: "Другой" })])).toMatchObject({ ok: false, error: /одинаковое/ });
    expect(await saveLevelsAction([lvl({ discountPercent: 150 })])).toMatchObject({ ok: false, error: /100/ });
    expect(await saveLevelsAction([lvl({ minVisits: -1 })])).toMatchObject({ ok: false, error: /отрицательным/ });
    expect(await saveLevelsAction([lvl({ discountPercent: 2.5 })])).toMatchObject({ ok: false, error: /целое/ });
    expect(await saveLevelsAction([lvl({ name: " " })])).toMatchObject({ ok: false, error: /название/ });
    expect(await saveLevelsAction([lvl({ minVisits: 0, name: "Новый" }), lvl({ minVisits: 3 })])).toEqual({ ok: true });
    expect(await db.loyaltyLevel.count()).toBe(2);
  });

  it("личная скидка", async () => {
    const c = await db.client.create({ data: { name: "Анна", phone: "+375291234567" } });
    expect(await setPersonalDiscountAction(c.id, 12)).toEqual({ ok: true });
    expect(await setPersonalDiscountAction(c.id, 101)).toMatchObject({ ok: false });
    expect(await setPersonalDiscountAction(c.id, 2.5)).toMatchObject({ ok: false });
    expect(await setPersonalDiscountAction(99999, 5)).toMatchObject({ ok: false, error: /не найден/ });
  });

  it("рассылка: проверка полей, неверный фильтр и запуск без получателей", async () => {
    const seg = { levelIds: [], notVisitedDays: null, visitedWithinDays: null, minVisits: null, staffIds: [], categoryIds: [], birthdayThisMonth: false, channel: "any" as const };
    expect(await saveCampaignAction({ title: "", text: "x", bookButton: true, segment: seg })).toMatchObject({ ok: false, error: /название/ });
    expect(await saveCampaignAction({ title: "x", text: "", bookButton: true, segment: seg })).toMatchObject({ ok: false, error: /текст/ });
    expect(await saveCampaignAction({ title: "x", text: "y".repeat(3501), bookButton: true, segment: seg })).toMatchObject({ ok: false });
    expect(await previewSegmentAction({ ...seg, minVisits: -5 })).toBeNull();
    const saved = await saveCampaignAction({ title: "Пусто", text: "Привет", bookButton: false, segment: seg });
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.data! : 0;
    expect(await startCampaignAction(id)).toEqual({ ok: true, data: 0 });
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
    expect(await startCampaignAction(id)).toMatchObject({ ok: false, error: /уже отправлена/ });
    expect(await startCampaignAction(999999)).toMatchObject({ ok: false, error: /не найдена/ });
    expect(await saveCampaignAction({ id, title: "x", text: "y", bookButton: true, segment: seg })).toMatchObject({ ok: false, error: /нельзя изменить/ });
  });
});

describe("аналитика", () => {
  it("считает записи, неявки, новых и вернувшихся клиентов", async () => {
    const regular = await clientWithVisits("+375291000001", "Постоянная", 2, f.irina.id, f.cut.id);
    const fresh = await db.client.create({ data: { name: "Новая", phone: "+375291000002" } });
    const mk = (clientId: number, daysAgo: number, status: "ARRIVED" | "NO_SHOW" | "CANCELLED", staffId = f.olga.id) => {
      const s = new Date(Date.now() - daysAgo * 864e5);
      return db.appointment.create({ data: { staffId, clientId, startsAt: s, endsAt: new Date(s.getTime() + 3_600_000), status, source: "ONLINE", items: { create: [{ serviceId: f.cut.id, title: "Стрижка", priceMin: 1, priceMax: 1, durationMin: 60 }] } } });
    };
    await mk(fresh.id, 1, "ARRIVED");
    await mk(fresh.id, 1.5, "NO_SHOW");
    await mk(regular.id, 0.5, "CANCELLED");
    const from = day(-1);
    const a = await getAnalytics(from, day(0), { timezone: "Europe/Minsk" });
    expect(a).toMatchObject({ arrived: 1, noShow: 1, cancelled: 1, newClients: 1, returningClients: 0, noShowRate: 0.5 });
    expect(a.topServices[0]).toEqual({ title: "Стрижка", count: 2 });
    const base = await getClientBase({ timezone: "Europe/Minsk" });
    expect(base.total).toBe(2);
  });
});

describe("выгрузка базы клиентов", () => {
  it("отдаёт .xlsx, где опасные значения остаются текстом", async () => {
    auth.session = { userId: 1, role: "OWNER", staffId: null, v: 0 };
    await db.user.update({ where: { id: 1 }, data: { passwordHash: await bcrypt.hash("pw1234", 4) } });
    await login("admin", "pw1234");
    await db.client.create({ data: { name: '=HYPERLINK("http://evil","клик")', phone: "+375291234567", comment: "+1+2" } });
    const res = await exportClients();
    expect(res.headers.get("content-type")).toMatch(/spreadsheetml/);
    const rows = await readSheet(Buffer.from(await res.arrayBuffer()));
    expect(rows[0][0]).toBe("Имя");
    expect(rows[1].slice(0, 2)).toEqual(['=HYPERLINK("http://evil","клик")', "+375291234567"]);
    expect(rows[1][4]).toBe("+1+2");
  });

  it("недоступна без входа и мастеру", async () => {
    expect((await exportClients()).status).toBe(403);
    await user("irina", "secret1");
    await login("irina", "secret1");
    expect((await exportClients()).status).toBe(403);
  });
});

describe("публичные API и push", () => {
  const req = (url: string) => new NextRequest(`https://salon.test${url}`);

  it("слоты: неверная дата — 400, без мусора в ответе", async () => {
    expect((await slotsApi(req("/api/public/slots?date=2026-02-31"))).status).toBe(400);
    expect((await slotsApi(req("/api/public/slots?date=<script>"))).status).toBe(400);
    const ok = await slotsApi(req(`/api/public/slots?date=${day(2)}&services=${f.cut.id}&staff=${f.irina.id}`));
    expect((await ok.json()).slots.length).toBeGreaterThan(0);
    const weird = await slotsApi(req(`/api/public/slots?date=${day(2)}&services=abc,-1,${"9".repeat(30)}&staff=xyz`));
    expect(weird.status).toBe(200);
  });

  it("даты: работают и с сотней услуг в адресе", async () => {
    const many = Array.from({ length: 200 }, (_, i) => i + 1).join(",");
    const res = await datesApi(req(`/api/public/dates?services=${many}`));
    expect(res.status).toBe(200);
  });

  it("push: только для вошедших и только на адреса push-сервисов", async () => {
    const body = (endpoint: string) =>
      new NextRequest("https://salon.test/api/push", { method: "POST", body: JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } }) });
    expect((await pushApi(body("https://fcm.googleapis.com/fcm/send/abc"))).status).toBe(401);
    await user("irina", "secret1");
    await login("irina", "secret1");
    expect((await pushApi(body("http://localhost:5432/"))).status).toBe(400);
    expect((await pushApi(body("https://169.254.169.254/latest"))).status).toBe(400);
    expect((await pushApi(new NextRequest("https://salon.test/api/push", { method: "POST", body: "not json" }))).status).toBe(400);
    expect((await pushApi(body("https://fcm.googleapis.com/fcm/send/abc"))).status).toBe(200);
    expect((await pushApi(body("https://web.push.apple.com/QWERTY"))).status).toBe(200);
    expect(await db.pushSubscription.count()).toBe(2);
  });
});
