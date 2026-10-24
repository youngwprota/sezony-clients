"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { logout, requireAdmin } from "@/lib/auth";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { isOverlapError } from "@/lib/booking";
import { notifyClient, notifyStaff } from "@/lib/notify";
import { validatePhone } from "@/lib/phone";
import { parseCsv } from "@/lib/csv";
import { rowsToClients } from "@/lib/client-import";
import { addDays, weekdayIndex, zonedDateTime } from "@/lib/time";
import { firstError, freeText, hhmm, isoDate, optionalEmail, personName } from "@/lib/validation";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const OVERLAP = "У мастера уже есть запись на это время";
const NOT_FOUND = "Запись не найдена — возможно, её уже удалили. Обновите страницу.";

const idSchema = z.number({ invalid_type_error: "Некорректный идентификатор" }).int().positive();
const minutes = (label: string, max: number) =>
  z
    .number({ invalid_type_error: `${label}: введите число` })
    .int(`${label}: целое число минут`)
    .min(5, `${label}: не меньше 5 минут`)
    .max(max, `${label}: не больше ${max} минут`);
const price = z
  .number({ invalid_type_error: "Цена: введите число" })
  .min(0, "Цена не может быть отрицательной")
  .max(100000, "Цена слишком большая")
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, "Цена — не больше двух знаков после запятой");

/** Ошибка «запись не найдена» от Prisma. */
const isNotFound = (e: unknown) => (e as { code?: string })?.code === "P2025";

async function activeStaff(staffId: number) {
  return db.staff.findFirst({ where: { id: staffId, active: true } });
}

async function salon() {
  return db.salon.findUniqueOrThrow({ where: { id: 1 } });
}

const noticeInclude = { client: true, items: { orderBy: { sortOrder: "asc" as const } } };

// ---------- Журнал ----------

export async function searchClientsAction(q: string) {
  await requireAdmin();
  const query = q.trim();
  if (query.length < 2) return [];
  const digits = query.replace(/\D/g, "");
  return db.client.findMany({
    where: {
      OR: [{ name: { contains: query, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])],
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
}

export async function staffServicesAction(staffId: number) {
  await requireAdmin();
  const rows = await db.staffService.findMany({
    where: { staffId, service: { active: true } },
    include: { service: { include: { category: true } } },
    orderBy: [{ service: { category: { sortOrder: "asc" } } }, { service: { sortOrder: "asc" } }],
  });
  return rows.map((r) => ({
    id: r.serviceId,
    title: r.service.title,
    category: r.service.category.title,
    durationMin: r.durationMin ?? r.service.durationMin,
    priceMin: Number(r.priceMin ?? r.service.priceMin),
    priceMax: Number(r.priceMax ?? r.service.priceMax),
  }));
}

const createSchema = z.object({
  staffId: idSchema,
  date: isoDate,
  time: hhmm,
  serviceIds: z
    .array(idSchema)
    .min(1, "Выберите хотя бы одну услугу")
    .max(10, "Не больше 10 услуг в одной записи")
    .transform((v) => [...new Set(v)]),
  durationMin: minutes("Длительность", 12 * 60),
  clientName: personName,
  clientPhone: z.string().trim().min(1, "Введите телефон клиента").max(30, "Проверьте телефон клиента"),
  comment: freeText(1000).default(""),
});

export async function createAppointmentAction(input: z.input<typeof createSchema>): Promise<Result> {
  await requireAdmin();
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  if (!(await activeStaff(p.data.staffId))) return { ok: false, error: "Сотрудник не найден или уволен" };
  const s = await salon();
  const checked = validatePhone(p.data.clientPhone, s.phoneCountryCode, { allowFixed: true });
  if (!checked.ok) return { ok: false, error: checked.error };
  const phone = checked.phone;

  const services = await db.staffService.findMany({
    where: { staffId: p.data.staffId, serviceId: { in: p.data.serviceIds }, service: { active: true } },
    include: { service: true },
  });
  if (services.length !== p.data.serviceIds.length) return { ok: false, error: "Сотрудник не выполняет одну из выбранных услуг" };
  const startsAt = zonedDateTime(p.data.date, p.data.time, s.timezone);
  try {
    const a = await db.$transaction(async (tx) => {
      const client = await tx.client.upsert({
        where: { phone },
        create: { phone, name: p.data.clientName },
        update: {},
      });
      return tx.appointment.create({
        data: {
          staffId: p.data.staffId,
          clientId: client.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + p.data.durationMin * 60_000),
          source: "ADMIN",
          comment: p.data.comment,
          items: {
            create: p.data.serviceIds
              .map((id) => services.find((x) => x.serviceId === id))
              .filter((x) => !!x)
              .map((x, i) => ({
                serviceId: x.serviceId,
                title: x.service.title,
                priceMin: x.priceMin ?? x.service.priceMin,
                priceMax: x.priceMax ?? x.service.priceMax,
                durationMin: x.durationMin ?? x.service.durationMin,
                sortOrder: i,
              })),
          },
        },
        include: noticeInclude,
      });
    });
    await notifyStaff("created", a);
    await notifyClient("created", a.id);
  } catch (e) {
    if (isOverlapError(e)) return { ok: false, error: OVERLAP };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true };
}

const updateSchema = z.object({
  id: idSchema,
  staffId: idSchema,
  date: isoDate,
  time: hhmm,
  durationMin: minutes("Длительность", 12 * 60),
  comment: freeText(1000),
});

export async function updateAppointmentAction(input: z.input<typeof updateSchema>): Promise<Result> {
  await requireAdmin();
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const s = await salon();
  const before = await db.appointment.findUnique({ where: { id: p.data.id } });
  if (!before) return { ok: false, error: NOT_FOUND };
  if (before.staffId !== p.data.staffId && !(await activeStaff(p.data.staffId))) return { ok: false, error: "Сотрудник не найден или уволен" };
  const startsAt = zonedDateTime(p.data.date, p.data.time, s.timezone);
  try {
    const a = await db.appointment.update({
      where: { id: p.data.id },
      data: {
        staffId: p.data.staffId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + p.data.durationMin * 60_000),
        comment: p.data.comment,
        // при переносе мастер видит запись как новую, а напоминания отправятся заново
        ...(before.staffId !== p.data.staffId || before.startsAt.getTime() !== startsAt.getTime()
          ? { seenByStaff: false, remindDaySentAt: null, remindHoursSentAt: null }
          : {}),
      },
      include: noticeInclude,
    });
    if (before.staffId !== a.staffId) {
      await notifyStaff("cancelled", { ...a, staffId: before.staffId, startsAt: before.startsAt });
      await notifyStaff("created", a);
    } else if (before.startsAt.getTime() !== a.startsAt.getTime()) {
      await notifyStaff("changed", a);
    }
    if (before.startsAt.getTime() !== a.startsAt.getTime() || before.staffId !== a.staffId) await notifyClient("changed", a.id);
  } catch (e) {
    if (isOverlapError(e)) return { ok: false, error: OVERLAP };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true };
}

const STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED", "NO_SHOW", "CANCELLED"] as const;

export async function setAppointmentStatusAction(id: number, status: (typeof STATUSES)[number]): Promise<Result> {
  await requireAdmin();
  if (!STATUSES.includes(status)) return { ok: false, error: "Неизвестный статус" };
  try {
    const before = await db.appointment.findUnique({ where: { id } });
    if (!before) return { ok: false, error: NOT_FOUND };
    const a = await db.appointment.update({ where: { id }, data: { status }, include: noticeInclude });
    if (status === "CANCELLED" && before.status !== "CANCELLED") {
      await notifyStaff("cancelled", a);
      await notifyClient("cancelled", a.id);
    }
  } catch (e) {
    // возврат отменённой записи на занятое время
    if (isOverlapError(e)) return { ok: false, error: OVERLAP };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true };
}

// ---------- Услуги ----------

const serviceSchema = z.object({
  id: idSchema.optional(),
  categoryId: idSchema,
  title: z.string().trim().min(1, "Введите название").max(200, "Название слишком длинное — до 200 символов"),
  description: freeText(2000).default(""),
  priceMin: price,
  priceMax: price,
  durationMin: minutes("Длительность", 12 * 60),
  online: z.boolean(),
  active: z.boolean(),
  staffIds: z.array(idSchema).transform((v) => [...new Set(v)]),
});

export async function saveServiceAction(input: z.input<typeof serviceSchema>): Promise<Result> {
  await requireAdmin();
  const p = serviceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const { id: serviceId, staffIds, ...data } = p.data;
  if (data.priceMax < data.priceMin) return { ok: false, error: "«Цена до» не может быть меньше «цены от»" };
  if (!(await db.serviceCategory.findUnique({ where: { id: data.categoryId } }))) return { ok: false, error: "Категория не найдена" };
  if ((await db.staff.count({ where: { id: { in: staffIds } } })) !== staffIds.length) return { ok: false, error: "Один из сотрудников не найден" };
  if (serviceId && !(await db.service.findUnique({ where: { id: serviceId } }))) return { ok: false, error: NOT_FOUND };
  await db.$transaction(async (tx) => {
    const service = serviceId
      ? await tx.service.update({ where: { id: serviceId }, data })
      : await tx.service.create({ data: { ...data, sortOrder: await tx.service.count({ where: { categoryId: data.categoryId } }) } });
    await tx.staffService.deleteMany({ where: { serviceId: service.id, staffId: { notIn: staffIds } } });
    const existing = await tx.staffService.findMany({ where: { serviceId: service.id }, select: { staffId: true } });
    const have = new Set(existing.map((e) => e.staffId));
    await tx.staffService.createMany({ data: staffIds.filter((s) => !have.has(s)).map((staffId) => ({ staffId, serviceId: service.id })) });
  });
  revalidatePath("/admin/services");
  return { ok: true };
}

export async function saveCategoryAction(id: number | null, title: string): Promise<Result> {
  await requireAdmin();
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, error: "Введите название" };
  if (t.length > 100) return { ok: false, error: "Название слишком длинное — до 100 символов" };
  if (id) await db.serviceCategory.update({ where: { id }, data: { title: t } });
  else await db.serviceCategory.create({ data: { title: t, sortOrder: await db.serviceCategory.count() } });
  revalidatePath("/admin/services");
  return { ok: true };
}

export async function deleteCategoryAction(id: number): Promise<Result> {
  await requireAdmin();
  if (await db.service.count({ where: { categoryId: id } })) return { ok: false, error: "Сначала перенесите или удалите услуги категории" };
  await db.serviceCategory.delete({ where: { id } });
  revalidatePath("/admin/services");
  return { ok: true };
}

export async function moveCategoryAction(id: number, dir: -1 | 1): Promise<void> {
  await requireAdmin();
  const list = await db.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.$transaction(list.map((c, k) => db.serviceCategory.update({ where: { id: c.id }, data: { sortOrder: k } })));
  revalidatePath("/admin/services");
}

// ---------- Сотрудники ----------

const staffSchema = z.object({
  id: idSchema.optional(),
  name: personName,
  specialization: z.string().trim().max(100, "Специализация слишком длинная — до 100 символов").default(""),
  bio: freeText(3000).default(""),
  avatarUrl: z
    .string()
    .trim()
    .max(1000, "Ссылка слишком длинная")
    .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v), "Ссылка на фото должна начинаться с https://"),
  active: z.boolean(),
  bookable: z.boolean(),
  services: z
    .array(
      z
        .object({
          serviceId: idSchema,
          priceMin: price.nullable(),
          priceMax: price.nullable(),
          durationMin: minutes("Длительность у мастера", 12 * 60).nullable(),
        })
        .refine((s) => s.priceMin == null || s.priceMax == null || s.priceMax >= s.priceMin, "У одной из услуг «цена до» меньше «цены от»"),
    )
    .refine((v) => new Set(v.map((s) => s.serviceId)).size === v.length, "Услуга указана дважды"),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]*$/, "Логин: латинские буквы, цифры, точка, дефис")
    .refine((v) => v === "" || v.length >= 3, "Логин — минимум 3 символа")
    .refine((v) => v.length <= 40, "Логин — до 40 символов")
    .default(""),
  password: z.string().max(72, "Пароль слишком длинный — до 72 символов").default(""),
});

export async function saveStaffAction(input: z.input<typeof staffSchema>): Promise<Result<number>> {
  await requireAdmin();
  const p = staffSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const { id, services, login, password, avatarUrl, ...data } = p.data;
  if (password && password.length < 6) return { ok: false, error: "Пароль — минимум 6 символов" };
  if (id && !(await db.staff.findUnique({ where: { id } }))) return { ok: false, error: NOT_FOUND };
  if ((await db.service.count({ where: { id: { in: services.map((s) => s.serviceId) } } })) !== services.length) {
    return { ok: false, error: "Одна из услуг не найдена — обновите страницу" };
  }
  if (id && !data.active) {
    // иначе будущие записи пропадут из журнала
    const upcoming = await db.appointment.count({ where: { staffId: id, status: { in: ["BOOKED", "CONFIRMED"] }, startsAt: { gt: new Date() } } });
    if (upcoming) return { ok: false, error: `У сотрудника ${upcoming} предстоящих записей — перенесите или отмените их, прежде чем отмечать увольнение` };
  }

  const existingUser = id ? await db.user.findUnique({ where: { staffId: id } }) : null;
  if (login) {
    const taken = await db.user.findUnique({ where: { login } });
    if (taken && taken.id !== existingUser?.id) return { ok: false, error: "Такой логин уже занят" };
    if (!existingUser && !password) return { ok: false, error: "Задайте пароль для входа мастера" };
  }

  const staffId = await db.$transaction(async (tx) => {
    const staff = id
      ? await tx.staff.update({ where: { id }, data: { ...data, avatarUrl: avatarUrl || null } })
      : await tx.staff.create({ data: { ...data, avatarUrl: avatarUrl || null, sortOrder: await tx.staff.count() } });
    await tx.staffService.deleteMany({ where: { staffId: staff.id } });
    await tx.staffService.createMany({ data: services.map((s) => ({ ...s, staffId: staff.id })) });

    if (login) {
      const hash = password ? await bcrypt.hash(password, 10) : null;
      if (existingUser) {
        // новый пароль закрывает сеансы мастера на других устройствах
        await tx.user.update({ where: { id: existingUser.id }, data: { login, ...(hash ? { passwordHash: hash, tokenVersion: { increment: 1 } } : {}) } });
      } else {
        await tx.user.create({ data: { login, passwordHash: hash!, role: "MASTER", staffId: staff.id } });
      }
    } else if (existingUser && existingUser.role === "MASTER") {
      await tx.user.delete({ where: { id: existingUser.id } });
    }
    return staff.id;
  });
  revalidatePath("/admin/staff");
  return { ok: true, data: staffId };
}

export async function unlinkMessengerAction(staffId: number, messenger: "telegram" | "viber") {
  await requireAdmin();
  await db.staff.update({ where: { id: staffId }, data: messenger === "telegram" ? { telegramChatId: null } : { viberUserId: null } });
  revalidatePath(`/admin/staff/${staffId}`);
}

// ---------- График ----------

export async function setShiftAction(staffId: number, date: string, start: string | null, end: string | null): Promise<Result> {
  await requireAdmin();
  if (!isoDate.safeParse(date).success) return { ok: false, error: "Некорректная дата" };
  if (!(await activeStaff(staffId))) return { ok: false, error: "Сотрудник не найден или уволен" };
  if (start || end) {
    if (!hhmm.safeParse(start).success || !hhmm.safeParse(end).success) return { ok: false, error: "Время в формате ЧЧ:ММ" };
    if (end! <= start!) return { ok: false, error: "Конец смены должен быть позже начала" };
  }
  await db.$transaction([
    db.staffShift.deleteMany({ where: { staffId, date } }),
    ...(start && end ? [db.staffShift.create({ data: { staffId, date, start, end } })] : []),
  ]);
  revalidatePath("/admin/schedule");
  return { ok: true };
}

const templateSchema = z.object({
  staffIds: z.array(idSchema).min(1, "Выберите сотрудников").transform((v) => [...new Set(v)]),
  from: isoDate,
  to: isoDate,
  mode: z.enum(["week", "cycle"]),
  /** для week: 7 флагов пн…вс */
  weekdays: z.array(z.boolean()).length(7),
  /** для cycle: N рабочих / M выходных, начиная с from */
  workDays: z.number({ invalid_type_error: "Рабочих дней: введите число" }).int().min(1, "Рабочих дней — от 1").max(14, "Рабочих дней — до 14"),
  offDays: z.number({ invalid_type_error: "Выходных: введите число" }).int().min(0, "Выходных — от 0").max(14, "Выходных — до 14"),
  start: hhmm,
  end: hhmm,
});

/** Заполняет график по шаблону: дни недели или цикл «2/2», «5/2». */
export async function fillScheduleAction(input: z.input<typeof templateSchema>): Promise<Result> {
  await requireAdmin();
  const p = templateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const t = p.data;
  if (t.end <= t.start) return { ok: false, error: "Конец смены должен быть позже начала" };
  if (t.to < t.from) return { ok: false, error: "Дата «по» раньше даты «с»" };
  if (t.to > addDays(t.from, 366)) return { ok: false, error: "Заполнять график можно максимум на год вперёд за раз" };
  if (t.mode === "week" && !t.weekdays.some(Boolean)) return { ok: false, error: "Выберите хотя бы один рабочий день недели" };
  if ((await db.staff.count({ where: { id: { in: t.staffIds }, active: true } })) !== t.staffIds.length) return { ok: false, error: "Один из сотрудников не найден" };
  const rows: { staffId: number; date: string; start: string; end: string }[] = [];
  let i = 0;
  for (let d = t.from; d <= t.to; d = addDays(d, 1), i++) {
    const works = t.mode === "week" ? t.weekdays[weekdayIndex(d)] : i % (t.workDays + t.offDays) < t.workDays;
    if (works) for (const staffId of t.staffIds) rows.push({ staffId, date: d, start: t.start, end: t.end });
  }
  await db.$transaction([
    db.staffShift.deleteMany({ where: { staffId: { in: t.staffIds }, date: { gte: t.from, lte: t.to } } }),
    db.staffShift.createMany({ data: rows }),
  ]);
  revalidatePath("/admin/schedule");
  return { ok: true };
}

// ---------- Клиенты и настройки ----------

const birthdaySchema = z.union([
  z.literal(""),
  isoDate.refine((v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10), "Проверьте дату рождения"),
]);

const clientSchema = z.object({
  name: personName,
  email: optionalEmail,
  birthday: z.string().refine((v) => birthdaySchema.safeParse(v).success, "Проверьте дату рождения"),
  comment: freeText(2000),
});

export async function saveClientAction(
  id: number,
  data: { name: string; email: string; birthday: string; comment: string; marketingConsent: boolean },
): Promise<Result> {
  await requireAdmin();
  const p = clientSchema.safeParse(data);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  try {
    await db.client.update({
      where: { id },
      data: {
        name: p.data.name,
        email: p.data.email || null,
        birthday: p.data.birthday || null,
        comment: p.data.comment,
        marketingConsent: !!data.marketingConsent,
      },
    });
  } catch (e) {
    if (isNotFound(e)) return { ok: false, error: NOT_FOUND };
    throw e;
  }
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true };
}

export async function createClientAction(data: { name: string; phone: string; email: string; birthday: string; comment: string }): Promise<Result<number>> {
  await requireAdmin();
  const p = clientSchema.safeParse(data);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const s = await salon();
  const checked = validatePhone(data.phone, s.phoneCountryCode, { allowFixed: true });
  if (!checked.ok) return { ok: false, error: checked.error };
  const phone = checked.phone;
  const existing = await db.client.findUnique({ where: { phone } });
  if (existing) return { ok: false, error: `Клиент с этим номером уже есть: ${existing.name}` };
  let c;
  try {
    c = await db.client.create({
      data: { name: p.data.name, phone, email: p.data.email || null, birthday: p.data.birthday || null, comment: p.data.comment },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Клиент с этим номером уже есть" };
    throw e;
  }
  revalidatePath("/admin/clients");
  return { ok: true, data: c.id };
}

export type ImportResult =
  | { ok: true; created: number; updated: number; unchanged: number; skipped: number; invalid: string[] }
  | { ok: false; error: string };

/** Импорт базы клиентов из .xlsx/.csv. Существующих клиентов не перезаписывает — только дополняет пустые поля. */
export async function importClientsAction(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Выберите файл" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Файл больше 10 МБ" };
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xls")) return { ok: false, error: "Старый формат .xls не поддерживается — сохраните файл как .xlsx или .csv" };
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) return { ok: false, error: "Нужен файл .xlsx или .csv" };
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: (string | number | boolean | Date | null)[][];
  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const { readSheet } = await import("read-excel-file/node");
      rows = (await readSheet(buf)) as typeof rows;
    } else {
      rows = parseCsv(buf.toString("utf8"));
    }
  } catch {
    return { ok: false, error: "Не удалось прочитать файл. Сохраните его как .xlsx или .csv и попробуйте снова." };
  }
  const s = await salon();
  const parsed = rowsToClients(rows, s.phoneCountryCode);
  if (parsed.error) return { ok: false, error: parsed.error };

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const existing = new Map(
    (await db.client.findMany({ where: { phone: { in: parsed.clients.map((c) => c.phone) } } })).map((c) => [c.phone, c]),
  );
  for (const c of parsed.clients) {
    const old = existing.get(c.phone);
    if (!old) {
      try {
        await db.client.create({ data: { name: c.name, phone: c.phone, email: c.email, birthday: c.birthday, comment: c.comment } });
        created++;
      } catch (e) {
        // клиент мог появиться одновременно (онлайн-запись) — тогда просто не трогаем его
        if ((e as { code?: string }).code !== "P2002") throw e;
        unchanged++;
      }
      continue;
    }
    const patch = {
      ...(!old.email && c.email ? { email: c.email } : {}),
      ...(!old.birthday && c.birthday ? { birthday: c.birthday } : {}),
      ...(!old.comment && c.comment ? { comment: c.comment } : {}),
    };
    if (Object.keys(patch).length) {
      await db.client.update({ where: { id: old.id }, data: patch });
      updated++;
    } else unchanged++;
  }
  revalidatePath("/admin/clients");
  return { ok: true, created, updated, unchanged, skipped: parsed.skipped, invalid: parsed.invalid ?? [] };
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Введите название салона").max(100, "Название — до 100 символов"),
  description: z.string().trim().max(200, "Подзаголовок — до 200 символов"),
  address: z.string().trim().max(200, "Адрес — до 200 символов"),
  phone: z.string().trim().max(40, "Телефон салона — до 40 символов"),
  currency: z.string().trim().min(1, "Укажите валюту").max(10, "Валюта — до 10 символов"),
  phoneCountryCode: z.string().regex(/^\+\d{1,4}$/, "Код страны в формате +375"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("ru", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Неизвестный часовой пояс"),
  slotStepMinutes: z.number({ invalid_type_error: "Шаг записи: введите число" }).int().min(5, "Шаг записи — от 5 минут").max(120, "Шаг записи — до 120 минут"),
  minLeadMinutes: z.number({ invalid_type_error: "Запись не позже чем за: введите число" }).int().min(0, "Не может быть отрицательным").max(7 * 24 * 60, "Не больше недели"),
  bookingDaysAhead: z.number({ invalid_type_error: "Запись открыта на: введите число" }).int().min(1, "Запись открыта минимум на 1 день").max(365, "Не больше 365 дней"),
  remindDayBefore: z.boolean(),
  remindHoursBefore: z.number({ invalid_type_error: "Напоминание за: введите число" }).int().min(0, "Не может быть отрицательным").max(12, "Не больше 12 часов"),
});

export async function saveSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result> {
  const session = await requireAdmin();
  if (session.role !== "OWNER") return { ok: false, error: "Настройки может менять только владелец" };
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  await db.salon.update({ where: { id: 1 }, data: p.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(current: string, next: string): Promise<Result> {
  const session = await requireAdmin();
  if (next.length < 6) return { ok: false, error: "Пароль — минимум 6 символов" };
  if (next.length > 72) return { ok: false, error: "Пароль слишком длинный — до 72 символов" };
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, error: "Текущий пароль неверен" };
  // сеансы на других устройствах закрываются; текущий получает новый токен
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
  });
  (await cookies()).set(SESSION_COOKIE, await signSession({ ...session, v: updated.tokenVersion }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
