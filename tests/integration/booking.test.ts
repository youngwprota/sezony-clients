import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BookingError, createOnlineBooking, getAvailableDates, getCatalog, getDaySlots, getNearestSlots, getStaffOffers, getSalon } from "@/lib/booking";
import { bookAction } from "@/app/book/confirm/actions";
import { at, day, resetDb, seedSalon, type Fixture } from "./helpers";

let f: Fixture;
const PHONE = "+375291234567";
const booking = (o: Partial<Parameters<typeof createOnlineBooking>[0]> = {}) =>
  createOnlineBooking({ staffId: f.irina.id, serviceIds: [f.cut.id], startsAt: at(day(2), "10:00"), name: "Анна", phone: PHONE, ...o });

beforeEach(async () => {
  await resetDb();
  f = await seedSalon();
});

describe("каталог и мастера", () => {
  it("показывает только активные услуги, открытые для онлайн-записи", async () => {
    const titles = (await getCatalog()).flatMap((c) => c.services.map((s) => s.title));
    expect(titles).toContain("Стрижка");
    expect(titles).not.toContain("Только по звонку");
    expect(titles).not.toContain("Снятая услуга");
  });

  it("для выбранного мастера показывает только его услуги и его цены", async () => {
    await db.staffService.update({ where: { staffId_serviceId: { staffId: f.olga.id, serviceId: f.cut.id } }, data: { priceMin: 90, priceMax: 90, durationMin: 75 } });
    const olga = (await getCatalog(f.olga.id)).flatMap((c) => c.services);
    expect(olga.map((s) => s.title).sort()).toEqual(["Маникюр", "Стрижка"]);
    expect(olga.find((s) => s.title === "Стрижка")).toMatchObject({ priceMin: 90, durationMin: 75 });
  });

  it("каталог мастера без онлайн-записи пуст", async () => {
    expect(await getCatalog(f.phoneOnly.id)).toEqual([]);
    expect(await getCatalog(f.fired.id)).toEqual([]);
  });

  it("предлагает только мастеров, которые делают все выбранные услуги", async () => {
    const salon = await getSalon();
    expect((await getStaffOffers([f.cut.id], salon)).map((o) => o.name)).toEqual(["Ирина", "Ольга"]);
    expect((await getStaffOffers([f.cut.id, f.mani.id], salon)).map((o) => o.name)).toEqual(["Ольга"]);
    expect(await getStaffOffers([f.hidden.id], salon)).toEqual([]);
    const both = (await getStaffOffers([f.cut.id, f.bang.id], salon))[0];
    expect(both).toMatchObject({ name: "Ирина", durationMin: 80, priceMin: 95 });
  });
});

describe("свободное время", () => {
  it("строит окна по графику с шагом 30 минут так, чтобы услуга помещалась", async () => {
    const slots = await getDaySlots(day(2), f.irina.id, [f.cut.id]);
    expect(slots[0].time).toBe("09:00");
    expect(slots.at(-1)!.time).toBe("20:00");
    expect(slots).toHaveLength(23);
  });

  it("не показывает занятое время и время после короткой записи", async () => {
    await booking({ serviceIds: [f.bang.id], startsAt: at(day(2), "10:00") });
    const times = (await getDaySlots(day(2), f.irina.id, [f.cut.id])).map((s) => s.time);
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("10:00");
    expect(times).toContain("10:20");
    expect(times).toContain("10:30");
  });

  it("не открывает дни за пределами горизонта записи и прошлое", async () => {
    await db.salon.update({ where: { id: 1 }, data: { bookingDaysAhead: 3 } });
    const dates = await getAvailableDates(null, [f.cut.id]);
    expect(dates.every((d) => d <= day(3))).toBe(true);
    expect(await getDaySlots(day(5), null, [f.cut.id])).toEqual([]);
    expect(await getDaySlots(day(-1), null, [f.cut.id])).toEqual([]);
  });

  it("не предлагает время раньше чем за minLead от текущего момента", async () => {
    const slots = await getDaySlots(day(0), f.irina.id, [f.cut.id]);
    const limit = Date.now() + 60 * 60_000;
    expect(slots.every((s) => new Date(s.startsAt).getTime() >= limit)).toBe(true);
  });

  it("ближайшие окна у каждого мастера — с одного дня", async () => {
    const { nearest } = await getNearestSlots([f.cut.id]);
    for (const n of nearest.values()) expect(new Set(n.slots.map((s) => s.startsAt.slice(0, 10))).size).toBeLessThanOrEqual(1);
    expect(nearest.has(f.phoneOnly.id)).toBe(false);
  });
});

describe("создание онлайн-записи", () => {
  it("создаёт запись, клиента и снимок услуг", async () => {
    const a = await booking({ comment: "Без укладки" });
    expect(a.staff.name).toBe("Ирина");
    expect(a.client).toMatchObject({ phone: PHONE, name: "Анна" });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ title: "Стрижка", durationMin: 60 });
    expect(a.endsAt.getTime() - a.startsAt.getTime()).toBe(60 * 60_000);
    expect(a.source).toBe("ONLINE");
  });

  it("не даёт записаться на занятое время", async () => {
    await booking();
    await expect(booking({ phone: "+375331234567", startsAt: at(day(2), "10:30") })).rejects.toThrow(BookingError);
  });

  it("отменённая запись освобождает время", async () => {
    const a = await booking();
    await db.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
    await expect(booking({ phone: "+375331234567" })).resolves.toBeTruthy();
  });

  it("при «любом мастере» подбирает свободного", async () => {
    await booking();
    const second = await booking({ staffId: null, phone: "+375331234567" });
    expect(second.staff.name).toBe("Ольга");
    await expect(booking({ staffId: null, phone: "+375441234567" })).rejects.toThrow(/занято/);
  });

  it("отклоняет скрытые и выключенные услуги, мастера без онлайн-записи и уволенного", async () => {
    await expect(booking({ serviceIds: [f.hidden.id] })).rejects.toThrow(/не принимает онлайн-запись/);
    await expect(booking({ serviceIds: [f.off.id] })).rejects.toThrow(BookingError);
    await expect(booking({ staffId: f.phoneOnly.id })).rejects.toThrow(BookingError);
    await expect(booking({ staffId: f.fired.id })).rejects.toThrow(BookingError);
    await expect(booking({ staffId: null, serviceIds: [f.hidden.id] })).rejects.toThrow(/недоступны/);
    expect(await db.appointment.count()).toBe(0);
  });

  it("отклоняет прошлое, время вне сетки и даты за горизонтом", async () => {
    await expect(booking({ startsAt: at(day(-1), "10:00") })).rejects.toThrow(/прошло/);
    await expect(booking({ startsAt: at(day(2), "10:07") })).rejects.toThrow(/занято/);
    await expect(booking({ startsAt: at(day(2), "07:00") })).rejects.toThrow(/занято/);
    await expect(booking({ startsAt: at(day(2), "20:30") })).rejects.toThrow(/занято/);
    await db.salon.update({ where: { id: 1 }, data: { bookingDaysAhead: 1 } });
    await expect(booking({ startsAt: at(day(2), "10:00") })).rejects.toThrow(/вперёд/);
    await expect(booking({ startsAt: "не дата" })).rejects.toThrow(/Некорректное время/);
  });

  it("не пускает больше трёх предстоящих онлайн-записей на один номер", async () => {
    await booking({ startsAt: at(day(2), "10:00") });
    await booking({ startsAt: at(day(2), "12:00") });
    await booking({ startsAt: at(day(3), "10:00") });
    await expect(booking({ startsAt: at(day(4), "10:00") })).rejects.toThrow(/позвоните в салон/);
  });

  it("не дублирует услугу, если она передана дважды", async () => {
    const a = await booking({ serviceIds: [f.cut.id, f.cut.id] });
    expect(a.items).toHaveLength(1);
  });

  it("при одновременных запросах на одно время к одному мастеру проходит только один", async () => {
    const phones = ["+375291111111", "+375292222222", "+375293333333", "+375294444444", "+375295555555", "+375296666666"];
    const results = await Promise.allSettled(phones.map((phone) => booking({ phone })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(BookingError);
    expect(await db.appointment.count()).toBe(1);
  });

  it("при одновременных запросах «любой мастер» распределяет клиентов по свободным мастерам", async () => {
    const results = await Promise.allSettled(
      ["+375291111111", "+375292222222", "+375293333333"].map((phone) => booking({ staffId: null, phone })),
    );
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof booking>>>[];
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((r) => r.value.staffId)).size).toBe(2);
  });

  it("одновременные первые записи с одного нового номера создают одного клиента", async () => {
    const results = await Promise.allSettled([
      booking({ startsAt: at(day(2), "10:00") }),
      booking({ startsAt: at(day(2), "14:00") }),
      booking({ staffId: f.olga.id, startsAt: at(day(3), "10:00") }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.client.count()).toBe(1);
  });

  it("постоянный клиент сохраняет имя, а согласие на рассылки только добавляется", async () => {
    await db.client.create({ data: { phone: PHONE, name: "Анна Петрова", marketingConsent: true } });
    const a = await booking({ name: "Аня", marketingConsent: false });
    expect(a.client).toMatchObject({ name: "Анна Петрова", marketingConsent: true });
  });
});

describe("форма записи (серверное действие)", () => {
  const form = (o: Partial<Parameters<typeof bookAction>[0]> = {}) =>
    bookAction({
      staffId: f.irina.id,
      serviceIds: [f.cut.id],
      startsAt: at(day(2), "10:00"),
      name: "Анна",
      phone: "29 123-45-67",
      email: "",
      comment: "",
      consent: true,
      ...o,
    } as Parameters<typeof bookAction>[0]);

  it("записывает с номером в любом привычном формате", async () => {
    const r = await form({ phone: "8 (029) 123-45-67" });
    expect(r.ok).toBe(true);
    expect((await db.client.findFirstOrThrow()).phone).toBe("+375291234567");
  });

  it("отклоняет номер с несуществующим кодом оператора и указывает на поле", async () => {
    for (const phone of ["24 123-45-67", "+375 30 123-45-67", "25 123-45-67"]) {
      const r = await form({ phone });
      expect(r).toMatchObject({ ok: false, field: "phone" });
      if (!r.ok) expect(r.error).toMatch(/код оператора/);
    }
    expect(await db.appointment.count()).toBe(0);
  });

  it("отклоняет короткий, длинный, городской номер и мусор", async () => {
    expect(await form({ phone: "29 123" })).toMatchObject({ ok: false, field: "phone", error: expect.stringMatching(/короткий/) });
    expect(await form({ phone: "29 123 45 678" })).toMatchObject({ ok: false, error: expect.stringMatching(/длинный/) });
    expect(await form({ phone: "8 017 123-45-67" })).toMatchObject({ ok: false, error: expect.stringMatching(/мобильный/) });
    expect(await form({ phone: "abc" })).toMatchObject({ ok: false, field: "phone" });
    expect(await form({ phone: "" })).toMatchObject({ ok: false, field: "phone" });
  });

  it("принимает иностранный мобильный с «+»", async () => {
    expect(await form({ phone: "+7 916 123-45-67" })).toMatchObject({ ok: true });
  });

  it("проверяет имя, e-mail, комментарий и согласие", async () => {
    expect(await form({ name: "" })).toMatchObject({ ok: false, field: "name" });
    expect(await form({ name: "12345" })).toMatchObject({ ok: false, field: "name", error: expect.stringMatching(/буквы/) });
    expect(await form({ name: "x".repeat(101) })).toMatchObject({ ok: false, field: "name" });
    expect(await form({ email: "anna@" })).toMatchObject({ ok: false, field: "email", error: expect.stringMatching(/e-mail/) });
    expect(await form({ comment: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(await form({ consent: false as unknown as true })).toMatchObject({ ok: false, error: expect.stringMatching(/согласие/) });
    expect(await form({ serviceIds: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/услугу/) });
    expect(await db.appointment.count()).toBe(0);
  });

  it("возвращает понятную ошибку, если время уже заняли", async () => {
    expect((await form()).ok).toBe(true);
    expect(await form({ phone: "33 123-45-67" })).toMatchObject({ ok: false, error: expect.stringMatching(/занято|заняли/) });
  });

  it("сохраняет e-mail, комментарий и согласие на рассылки", async () => {
    await form({ email: " anna@mail.by ", comment: "  первый раз  ", marketingConsent: true });
    const a = await db.appointment.findFirstOrThrow({ include: { client: true } });
    expect(a.comment).toBe("первый раз");
    expect(a.client).toMatchObject({ email: "anna@mail.by", marketingConsent: true });
  });
});
