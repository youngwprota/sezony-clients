import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createAppointmentAction,
  createClientAction,
  deleteCategoryAction,
  fillScheduleAction,
  importClientsAction,
  moveCategoryAction,
  saveCategoryAction,
  saveClientAction,
  saveServiceAction,
  saveSettingsAction,
  saveStaffAction,
  setAppointmentStatusAction,
  setShiftAction,
  updateAppointmentAction,
} from "@/app/admin/actions";
import { auth } from "./setup";
import { day, resetDb, seedSalon, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await seedSalon();
  auth.session = { userId: 1, role: "OWNER", staffId: null, v: 0 };
});

const create = (o: Partial<Parameters<typeof createAppointmentAction>[0]> = {}) =>
  createAppointmentAction({
    staffId: f.irina.id,
    date: day(2),
    time: "10:00",
    serviceIds: [f.cut.id],
    durationMin: 60,
    clientName: "Анна",
    clientPhone: "29 123-45-67",
    comment: "",
    ...o,
  });

describe("журнал: создание записи", () => {
  it("создаёт запись и клиента", async () => {
    expect(await create()).toEqual({ ok: true });
    const a = await db.appointment.findFirstOrThrow({ include: { client: true, items: true } });
    expect(a).toMatchObject({ source: "ADMIN", status: "BOOKED" });
    expect(a.client.phone).toBe("+375291234567");
    expect(a.items[0].title).toBe("Стрижка");
  });

  it("разрешает администратору записать вне графика и городской номер", async () => {
    expect(await create({ time: "07:30", clientPhone: "8 017 123-45-67" })).toEqual({ ok: true });
  });

  it("не даёт поставить пересекающуюся запись", async () => {
    await create();
    expect(await create({ time: "10:30", clientPhone: "33 123-45-67" })).toEqual({ ok: false, error: "У мастера уже есть запись на это время" });
  });

  it("проверяет все поля с понятными сообщениями", async () => {
    const cases: [object, RegExp][] = [
      [{ date: "2026-02-30" }, /даты не существует/],
      [{ date: "завтра" }, /ГГГГ-ММ-ДД/],
      [{ time: "25:00" }, /ЧЧ:ММ/],
      [{ time: "" }, /ЧЧ:ММ/],
      [{ serviceIds: [] }, /услугу/],
      [{ serviceIds: [f.mani.id] }, /не выполняет/],
      [{ serviceIds: [f.off.id] }, /не выполняет/],
      [{ durationMin: 0 }, /не меньше 5/],
      [{ durationMin: Number.NaN }, /Длительность/],
      [{ durationMin: 2000 }, /не больше/],
      [{ clientName: "" }, /Введите имя/],
      [{ clientName: "777" }, /буквы/],
      [{ clientPhone: "24 123-45-67" }, /код оператора/],
      [{ clientPhone: "" }, /телефон/i],
      [{ staffId: f.fired.id }, /уволен/],
      [{ staffId: 99999 }, /не найден/],
      [{ comment: "x".repeat(1001) }, /1000/],
    ];
    for (const [patch, re] of cases) {
      const r = await create(patch as never);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.error, JSON.stringify(patch)).toMatch(re);
    }
    expect(await db.appointment.count()).toBe(0);
  });
});

describe("журнал: перенос и статусы", () => {
  it("переносит запись, сбрасывает напоминания и пометку «просмотрено»", async () => {
    await create();
    const a = await db.appointment.update({
      where: { id: (await db.appointment.findFirstOrThrow()).id },
      data: { seenByStaff: true, remindDaySentAt: new Date() },
    });
    const r = await updateAppointmentAction({ id: a.id, staffId: f.olga.id, date: day(3), time: "12:00", durationMin: 45, comment: "перенос" });
    expect(r).toEqual({ ok: true });
    const b = await db.appointment.findUniqueOrThrow({ where: { id: a.id } });
    expect(b).toMatchObject({ staffId: f.olga.id, seenByStaff: false, remindDaySentAt: null, comment: "перенос" });
    expect(b.endsAt.getTime() - b.startsAt.getTime()).toBe(45 * 60_000);
  });

  it("не переносит на занятое время, к уволенному мастеру и несуществующую запись", async () => {
    await create();
    await create({ time: "12:00", clientPhone: "33 123-45-67" });
    const first = await db.appointment.findFirstOrThrow({ orderBy: { id: "asc" } });
    expect(await updateAppointmentAction({ id: first.id, staffId: f.irina.id, date: day(2), time: "11:30", durationMin: 60, comment: "" })).toMatchObject({ ok: false, error: /уже есть запись/ });
    expect(await updateAppointmentAction({ id: first.id, staffId: f.fired.id, date: day(2), time: "10:00", durationMin: 60, comment: "" })).toMatchObject({ ok: false, error: /уволен/ });
    expect(await updateAppointmentAction({ id: 999999, staffId: f.irina.id, date: day(2), time: "10:00", durationMin: 60, comment: "" })).toMatchObject({ ok: false, error: /не найдена/ });
  });

  it("отменяет и восстанавливает, но не поверх новой записи", async () => {
    await create();
    const a = await db.appointment.findFirstOrThrow();
    expect(await setAppointmentStatusAction(a.id, "CANCELLED")).toEqual({ ok: true });
    await create({ clientPhone: "33 123-45-67" });
    expect(await setAppointmentStatusAction(a.id, "BOOKED")).toMatchObject({ ok: false, error: /уже есть запись/ });
    expect(await setAppointmentStatusAction(a.id, "BOGUS" as never)).toMatchObject({ ok: false, error: /Неизвестный статус/ });
    expect(await setAppointmentStatusAction(999999, "ARRIVED")).toMatchObject({ ok: false, error: /не найдена/ });
  });
});

describe("услуги и категории", () => {
  const svc = (o: object = {}) =>
    saveServiceAction({ categoryId: f.hair.id, title: "Укладка", description: "", priceMin: 30, priceMax: 40, durationMin: 45, online: true, active: true, staffIds: [f.irina.id], ...o } as never);

  it("создаёт услугу и назначает мастеров", async () => {
    expect(await svc()).toEqual({ ok: true });
    const s = await db.service.findFirstOrThrow({ where: { title: "Укладка" }, include: { staff: true } });
    expect(s.staff.map((x) => x.staffId)).toEqual([f.irina.id]);
  });

  it("при изменении сохраняет индивидуальные цены оставшихся мастеров", async () => {
    await db.staffService.update({ where: { staffId_serviceId: { staffId: f.olga.id, serviceId: f.cut.id } }, data: { priceMin: 99 } });
    await svc({ id: f.cut.id, title: "Стрижка", staffIds: [f.olga.id] });
    const links = await db.staffService.findMany({ where: { serviceId: f.cut.id } });
    expect(links).toHaveLength(1);
    expect(Number(links[0].priceMin)).toBe(99);
  });

  it("проверяет цену, длительность, название, категорию и мастеров", async () => {
    const cases: [object, RegExp][] = [
      [{ title: "" }, /название/i],
      [{ title: "x".repeat(201) }, /200/],
      [{ priceMin: -1 }, /отрицательной/],
      [{ priceMin: 50, priceMax: 40 }, /меньше/],
      [{ priceMin: 1e9, priceMax: 1e9 }, /слишком большая/],
      [{ priceMin: 10.555 }, /двух знаков/],
      [{ priceMin: Number.NaN }, /число/],
      [{ durationMin: 3 }, /не меньше 5/],
      [{ categoryId: 99999 }, /Категория не найдена/],
      [{ staffIds: [99999] }, /не найден/],
      [{ id: 99999 }, /не найдена/],
    ];
    for (const [patch, re] of cases) {
      const r = await svc(patch);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.error, JSON.stringify(patch)).toMatch(re);
    }
  });

  it("категории: создание, лимит длины, удаление только пустой, порядок", async () => {
    expect(await saveCategoryAction(null, "  Брови   и ресницы ")).toEqual({ ok: true });
    expect((await db.serviceCategory.findFirstOrThrow({ where: { title: "Брови и ресницы" } })).title).toBe("Брови и ресницы");
    expect(await saveCategoryAction(null, "   ")).toMatchObject({ ok: false });
    expect(await saveCategoryAction(null, "x".repeat(101))).toMatchObject({ ok: false });
    expect(await deleteCategoryAction(f.hair.id)).toMatchObject({ ok: false, error: /услуги категории/ });
    await moveCategoryAction(f.nails.id, -1);
    const order = await db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" } });
    expect(order[0].id).toBe(f.nails.id);
  });
});

describe("сотрудники", () => {
  const staff = (o: object = {}) =>
    saveStaffAction({
      name: "Мария",
      specialization: "Бровист",
      bio: "",
      avatarUrl: "",
      active: true,
      bookable: true,
      services: [{ serviceId: f.cut.id, priceMin: null, priceMax: null, durationMin: null }],
      login: "",
      password: "",
      ...o,
    } as never);

  it("создаёт мастера с логином для приложения", async () => {
    const r = await staff({ login: "Maria", password: "secret1" });
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { login: "maria" } });
    expect(u.role).toBe("MASTER");
  });

  it("смена пароля закрывает старые сеансы мастера, удаление логина — закрывает доступ", async () => {
    const r = await staff({ login: "maria", password: "secret1" });
    const id = r.ok ? r.data! : 0;
    await staff({ id, login: "maria", password: "secret2" });
    expect((await db.user.findUniqueOrThrow({ where: { login: "maria" } })).tokenVersion).toBe(1);
    await staff({ id, login: "", password: "" });
    expect(await db.user.findUnique({ where: { login: "maria" } })).toBeNull();
  });

  it("проверяет данные сотрудника", async () => {
    await staff({ login: "taken", password: "secret1" });
    const cases: [object, RegExp][] = [
      [{ name: "" }, /Введите имя/],
      [{ avatarUrl: "javascript:alert(1)" }, /https/],
      [{ avatarUrl: "http://site/photo.jpg" }, /https/],
      [{ login: "мария", password: "secret1" }, /латинские/],
      [{ login: "ab", password: "secret1" }, /минимум 3/],
      [{ login: "taken", password: "secret1" }, /занят/],
      [{ login: "newone" }, /пароль/i],
      [{ login: "newone", password: "123" }, /минимум 6/],
      [{ services: [{ serviceId: f.cut.id, priceMin: 50, priceMax: 10, durationMin: null }] }, /меньше/],
      [{ services: [{ serviceId: f.cut.id, priceMin: null, priceMax: null, durationMin: null }, { serviceId: f.cut.id, priceMin: null, priceMax: null, durationMin: null }] }, /дважды/],
      [{ services: [{ serviceId: 99999, priceMin: null, priceMax: null, durationMin: null }] }, /не найдена/],
    ];
    for (const [patch, re] of cases) {
      const r = await staff(patch);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.error, JSON.stringify(patch)).toMatch(re);
    }
  });

  it("не даёт уволить мастера с предстоящими записями — иначе они пропадут из журнала", async () => {
    await create();
    const r = await saveStaffAction({
      id: f.irina.id,
      name: "Ирина",
      specialization: "",
      bio: "",
      avatarUrl: "",
      active: false,
      bookable: true,
      services: [],
      login: "",
      password: "",
    });
    expect(r).toMatchObject({ ok: false, error: /предстоящих записей/ });
  });
});

describe("график", () => {
  it("ставит и снимает смену", async () => {
    expect(await setShiftAction(f.irina.id, day(20), "10:00", "18:00")).toEqual({ ok: true });
    expect(await db.staffShift.findMany({ where: { staffId: f.irina.id, date: day(20) } })).toHaveLength(1);
    expect(await setShiftAction(f.irina.id, day(20), null, null)).toEqual({ ok: true });
    expect(await db.staffShift.count({ where: { staffId: f.irina.id, date: day(20) } })).toBe(0);
  });

  it("отклоняет неверное время и дату, не трогая существующую смену", async () => {
    expect(await setShiftAction(f.irina.id, day(1), "18:00", "10:00")).toMatchObject({ ok: false, error: /позже начала/ });
    expect(await setShiftAction(f.irina.id, day(1), "24:00", "25:00")).toMatchObject({ ok: false });
    expect(await setShiftAction(f.irina.id, "2026-02-31", "10:00", "18:00")).toMatchObject({ ok: false });
    expect(await setShiftAction(99999, day(1), "10:00", "18:00")).toMatchObject({ ok: false });
    expect(await db.staffShift.count({ where: { staffId: f.irina.id, date: day(1) } })).toBe(1);
  });

  it("заполняет 2/2 и по дням недели", async () => {
    const base = { staffIds: [f.irina.id], from: day(30), to: day(37), weekdays: [true, true, true, true, true, false, false], workDays: 2, offDays: 2, start: "10:00", end: "19:00" };
    expect(await fillScheduleAction({ ...base, mode: "cycle" })).toEqual({ ok: true });
    const dates = (await db.staffShift.findMany({ where: { staffId: f.irina.id, date: { gte: day(30) } }, orderBy: { date: "asc" } })).map((s) => s.date);
    expect(dates).toEqual([day(30), day(31), day(34), day(35)]);
    expect(await fillScheduleAction({ ...base, mode: "week" })).toEqual({ ok: true });
    expect(await db.staffShift.count({ where: { staffId: f.irina.id, date: { gte: day(30) } } })).toBe(6);
  });

  it("не даёт заполнить больше чем на год, без дней недели и с неверным периодом", async () => {
    const base = { staffIds: [f.irina.id], mode: "week" as const, weekdays: [true, true, true, true, true, false, false], workDays: 2, offDays: 2, start: "10:00", end: "19:00" };
    expect(await fillScheduleAction({ ...base, from: day(0), to: day(400) })).toMatchObject({ ok: false, error: /год/ });
    expect(await fillScheduleAction({ ...base, from: day(5), to: day(1) })).toMatchObject({ ok: false, error: /раньше/ });
    expect(await fillScheduleAction({ ...base, from: day(1), to: day(5), weekdays: Array(7).fill(false) })).toMatchObject({ ok: false, error: /рабочий день/ });
    expect(await fillScheduleAction({ ...base, staffIds: [], from: day(1), to: day(5) })).toMatchObject({ ok: false, error: /сотрудников/ });
  });
});

describe("клиенты", () => {
  it("создаёт клиента и не даёт создать дубль по номеру в другом формате", async () => {
    const r = await createClientAction({ name: "Ольга", phone: "+375 29 765-43-21", email: "", birthday: "1990-05-01", comment: "" });
    expect(r.ok).toBe(true);
    expect(await createClientAction({ name: "Оля", phone: "8 029 7654321", email: "", birthday: "", comment: "" })).toMatchObject({ ok: false, error: /уже есть/ });
  });

  it("проверяет поля клиента", async () => {
    const base = { name: "Ольга", phone: "29 765-43-21", email: "", birthday: "", comment: "" };
    const cases: [object, RegExp][] = [
      [{ phone: "24 765-43-21" }, /код оператора/],
      [{ name: "" }, /имя/],
      [{ email: "olga@" }, /e-mail/],
      [{ birthday: "2099-01-01" }, /дату рождения/],
      [{ birthday: "1990-02-30" }, /дату рождения/],
      [{ birthday: "1850-01-01" }, /дату рождения/],
    ];
    for (const [patch, re] of cases) {
      const r = await createClientAction({ ...base, ...patch });
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
  });

  it("сохраняет изменения карточки и сообщает о несуществующем клиенте", async () => {
    const c = await db.client.create({ data: { name: "Ольга", phone: "+375297654321" } });
    expect(await saveClientAction(c.id, { name: "Ольга К.", email: "o@mail.by", birthday: "1991-01-02", comment: "ок", marketingConsent: true })).toEqual({ ok: true });
    expect(await db.client.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ name: "Ольга К.", email: "o@mail.by", birthday: "1991-01-02", marketingConsent: true });
    expect(await saveClientAction(99999, { name: "X Y", email: "", birthday: "", comment: "", marketingConsent: false })).toMatchObject({ ok: false, error: /не найдена/ });
  });

  it("импорт: создаёт новых, дополняет пустые поля, не перезаписывает и сообщает о неверных номерах", async () => {
    await db.client.create({ data: { name: "Анна Старая", phone: "+375291234567", comment: "VIP" } });
    const csv = "﻿Имя;Телефон;Email;Дата рождения;Комментарий\nАнна Новая;8 029 123-45-67;anna@mail.by;05.03.1990;перезапись\nЗоя;+375 33 700-11-22;;;\nНеверный;24 123-45-67;;;\nГородской;8 017 222-33-44;;;\n";
    const form = new FormData();
    form.set("file", new File([csv], "clients.csv", { type: "text/csv" }));
    const r = await importClientsAction(null, form);
    expect(r).toMatchObject({ ok: true, created: 2, updated: 1, skipped: 1, invalid: ["24 123-45-67"] });
    const anna = await db.client.findUniqueOrThrow({ where: { phone: "+375291234567" } });
    expect(anna).toMatchObject({ name: "Анна Старая", comment: "VIP", email: "anna@mail.by", birthday: "1990-03-05" });
  });

  it("импорт: отклоняет неподходящие файлы", async () => {
    const make = (name: string, body: string) => {
      const fd = new FormData();
      fd.set("file", new File([body], name));
      return fd;
    };
    expect(await importClientsAction(null, make("old.xls", "x"))).toMatchObject({ ok: false, error: /\.xls/ });
    expect(await importClientsAction(null, make("photo.jpg", "x"))).toMatchObject({ ok: false, error: /xlsx или .csv/ });
    expect(await importClientsAction(null, make("empty.csv", ""))).toMatchObject({ ok: false, error: /Выберите файл/ });
    expect(await importClientsAction(null, make("nophone.csv", "Имя;Город\nАнна;Минск"))).toMatchObject({ ok: false, error: /Телефон/ });
    expect(await importClientsAction(null, make("broken.xlsx", "это не excel"))).toMatchObject({ ok: false, error: /Не удалось прочитать/ });
  });
});

describe("настройки", () => {
  const base = {
    name: "Sезоны",
    description: "",
    address: "",
    phone: "",
    currency: "BYN",
    phoneCountryCode: "+375",
    timezone: "Europe/Minsk",
    slotStepMinutes: 30,
    minLeadMinutes: 60,
    bookingDaysAhead: 60,
    remindDayBefore: true,
    remindHoursBefore: 2,
  };

  it("сохраняет корректные настройки", async () => {
    expect(await saveSettingsAction({ ...base, slotStepMinutes: 15 })).toEqual({ ok: true });
  });

  it("отклоняет неверные значения", async () => {
    for (const patch of [{ timezone: "Mars/Olympus" }, { phoneCountryCode: "375" }, { slotStepMinutes: 1 }, { bookingDaysAhead: 0 }, { remindHoursBefore: 48 }, { name: "" }, { slotStepMinutes: Number.NaN }]) {
      const r = await saveSettingsAction({ ...base, ...patch });
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/[а-яё]/i);
    }
  });

  it("только владелец меняет настройки", async () => {
    auth.session = { ...auth.session, role: "ADMIN" };
    expect(await saveSettingsAction(base)).toMatchObject({ ok: false, error: /владелец/ });
  });
});
