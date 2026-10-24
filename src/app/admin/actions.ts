"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { logout, requireAdmin } from "@/lib/auth";
import { isOverlapError } from "@/lib/booking";
import { notifyStaff } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import { addDays, weekdayIndex, zonedDateTime } from "@/lib/time";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const OVERLAP = "У мастера уже есть запись на это время";

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
  staffId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  serviceIds: z.array(z.number().int()).min(1, "Выберите услуги"),
  durationMin: z.number().int().min(5).max(24 * 60),
  clientName: z.string().trim().min(1, "Введите имя клиента"),
  clientPhone: z.string().trim().min(5, "Введите телефон клиента"),
  comment: z.string().max(1000).default(""),
});

export async function createAppointmentAction(input: z.input<typeof createSchema>): Promise<Result> {
  await requireAdmin();
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const s = await salon();
  const phone = normalizePhone(p.data.clientPhone, s.phoneCountryCode);
  if (!phone) return { ok: false, error: "Проверьте номер телефона" };

  const services = await db.staffService.findMany({
    where: { staffId: p.data.staffId, serviceId: { in: p.data.serviceIds } },
    include: { service: true },
  });
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
  } catch (e) {
    if (isOverlapError(e)) return { ok: false, error: OVERLAP };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.number().int(),
  staffId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(5).max(24 * 60),
  comment: z.string().max(1000),
});

export async function updateAppointmentAction(input: z.input<typeof updateSchema>): Promise<Result> {
  await requireAdmin();
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const s = await salon();
  const before = await db.appointment.findUniqueOrThrow({ where: { id: p.data.id } });
  const startsAt = zonedDateTime(p.data.date, p.data.time, s.timezone);
  try {
    const a = await db.appointment.update({
      where: { id: p.data.id },
      data: {
        staffId: p.data.staffId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + p.data.durationMin * 60_000),
        comment: p.data.comment,
        ...(before.staffId !== p.data.staffId || before.startsAt.getTime() !== startsAt.getTime() ? { seenByStaff: false } : {}),
      },
      include: noticeInclude,
    });
    if (before.staffId !== a.staffId) {
      await notifyStaff("cancelled", { ...a, staffId: before.staffId, startsAt: before.startsAt });
      await notifyStaff("created", a);
    } else if (before.startsAt.getTime() !== a.startsAt.getTime()) {
      await notifyStaff("changed", a);
    }
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
    const before = await db.appointment.findUniqueOrThrow({ where: { id } });
    const a = await db.appointment.update({ where: { id }, data: { status }, include: noticeInclude });
    if (status === "CANCELLED" && before.status !== "CANCELLED") await notifyStaff("cancelled", a);
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
  id: z.number().int().optional(),
  categoryId: z.number().int(),
  title: z.string().trim().min(1, "Введите название"),
  description: z.string().default(""),
  priceMin: z.number().min(0),
  priceMax: z.number().min(0),
  durationMin: z.number().int().min(5, "Длительность от 5 минут"),
  online: z.boolean(),
  active: z.boolean(),
  staffIds: z.array(z.number().int()),
});

export async function saveServiceAction(input: z.input<typeof serviceSchema>): Promise<Result> {
  await requireAdmin();
  const p = serviceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, staffIds, ...data } = p.data;
  if (data.priceMax < data.priceMin) data.priceMax = data.priceMin;
  await db.$transaction(async (tx) => {
    const service = id
      ? await tx.service.update({ where: { id }, data })
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
  const t = title.trim();
  if (!t) return { ok: false, error: "Введите название" };
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
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Введите имя"),
  specialization: z.string().trim().default(""),
  bio: z.string().default(""),
  avatarUrl: z.string().trim().url("Ссылка на фото должна начинаться с https://").or(z.literal("")),
  active: z.boolean(),
  bookable: z.boolean(),
  services: z.array(z.object({ serviceId: z.number().int(), priceMin: z.number().nullable(), priceMax: z.number().nullable(), durationMin: z.number().int().nullable() })),
  login: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]*$/, "Логин: латинские буквы, цифры, точка, дефис").default(""),
  password: z.string().default(""),
});

export async function saveStaffAction(input: z.input<typeof staffSchema>): Promise<Result<number>> {
  await requireAdmin();
  const p = staffSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, services, login, password, avatarUrl, ...data } = p.data;
  if (password && password.length < 6) return { ok: false, error: "Пароль — минимум 6 символов" };

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
      const userData = { login, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) };
      if (existingUser) await tx.user.update({ where: { id: existingUser.id }, data: userData });
      else await tx.user.create({ data: { ...userData, passwordHash: await bcrypt.hash(password, 10), role: "MASTER", staffId: staff.id } });
    } else if (existingUser && existingUser.role === "MASTER") {
      await tx.user.delete({ where: { id: existingUser.id } });
    }
    return staff.id;
  });
  revalidatePath("/admin/staff");
  return { ok: true, data: staffId };
}

export async function unlinkTelegramAction(staffId: number) {
  await requireAdmin();
  await db.staff.update({ where: { id: staffId }, data: { telegramChatId: null } });
  revalidatePath(`/admin/staff/${staffId}`);
}

// ---------- График ----------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Время в формате ЧЧ:ММ");

export async function setShiftAction(staffId: number, date: string, start: string | null, end: string | null): Promise<Result> {
  await requireAdmin();
  await db.staffShift.deleteMany({ where: { staffId, date } });
  if (start && end) {
    if (!hhmm.safeParse(start).success || !hhmm.safeParse(end).success) return { ok: false, error: "Время в формате ЧЧ:ММ" };
    if (end <= start) return { ok: false, error: "Конец смены должен быть позже начала" };
    await db.staffShift.create({ data: { staffId, date, start, end } });
  }
  revalidatePath("/admin/schedule");
  return { ok: true };
}

const templateSchema = z.object({
  staffIds: z.array(z.number().int()).min(1, "Выберите сотрудников"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["week", "cycle"]),
  /** для week: 7 флагов пн…вс */
  weekdays: z.array(z.boolean()).length(7),
  /** для cycle: N рабочих / M выходных, начиная с from */
  workDays: z.number().int().min(1).max(14),
  offDays: z.number().int().min(0).max(14),
  start: hhmm,
  end: hhmm,
});

/** Заполняет график по шаблону: дни недели или цикл «2/2», «5/2». */
export async function fillScheduleAction(input: z.input<typeof templateSchema>): Promise<Result> {
  await requireAdmin();
  const p = templateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const t = p.data;
  if (t.end <= t.start) return { ok: false, error: "Конец смены должен быть позже начала" };
  if (t.to < t.from) return { ok: false, error: "Неверный период" };
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

export async function saveClientAction(id: number, data: { name: string; email: string; comment: string }): Promise<Result> {
  await requireAdmin();
  if (!data.name.trim()) return { ok: false, error: "Введите имя" };
  await db.client.update({ where: { id }, data: { name: data.name.trim(), email: data.email.trim() || null, comment: data.comment } });
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true };
}

const settingsSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  address: z.string(),
  phone: z.string(),
  currency: z.string().trim().min(1),
  phoneCountryCode: z.string().regex(/^\+\d{1,4}$/, "Код страны в формате +375"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("ru", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Неизвестный часовой пояс"),
  slotStepMinutes: z.number().int().min(5).max(120),
  minLeadMinutes: z.number().int().min(0).max(7 * 24 * 60),
  bookingDaysAhead: z.number().int().min(1).max(365),
});

export async function saveSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result> {
  const session = await requireAdmin();
  if (session.role !== "OWNER") return { ok: false, error: "Настройки может менять только владелец" };
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await db.salon.update({ where: { id: 1 }, data: p.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(current: string, next: string): Promise<Result> {
  const session = await requireAdmin();
  if (next.length < 6) return { ok: false, error: "Пароль — минимум 6 символов" };
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, error: "Текущий пароль неверен" };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  return { ok: true };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
