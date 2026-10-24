import "server-only";
import { db } from "./db";
import { freeIntervals, slotStarts, type Interval } from "./availability";
import { addDays, localDate, localTime, zonedDateTime } from "./time";

const MIN = 60_000;
const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED"] as const;

export type Salon = Awaited<ReturnType<typeof getSalon>>;

export async function getSalon() {
  return db.salon.findUniqueOrThrow({ where: { id: 1 } });
}

export type CatalogService = {
  id: number;
  categoryId: number;
  title: string;
  description: string;
  priceMin: number;
  priceMax: number;
  durationMin: number;
};

export type CatalogCategory = { id: number; title: string; services: CatalogService[] };

/** Услуги для онлайн-записи. С `staffId` — только услуги мастера и его цены. */
export async function getCatalog(staffId?: number | null): Promise<CatalogCategory[]> {
  const categories = await db.serviceCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      services: {
        where: {
          active: true,
          online: true,
          ...(staffId ? { staff: { some: { staffId } } } : { staff: { some: { staff: { active: true, bookable: true } } } }),
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        // цены и длительность мастера, если он выбран
        include: { staff: { where: { staffId: staffId ?? -1 } } },
      },
    },
  });
  return categories
    .map((c) => ({
      id: c.id,
      title: c.title,
      services: c.services.map((s) => {
        const o = s.staff[0];
        return {
          id: s.id,
          categoryId: s.categoryId,
          title: s.title,
          description: s.description,
          priceMin: Number(o?.priceMin ?? s.priceMin),
          priceMax: Number(o?.priceMax ?? s.priceMax),
          durationMin: o?.durationMin ?? s.durationMin,
        };
      }),
    }))
    .filter((c) => c.services.length > 0);
}

type StaffOffer = {
  id: number;
  name: string;
  specialization: string;
  bio: string;
  avatarUrl: string | null;
  durationMin: number;
  priceMin: number;
  priceMax: number;
};

/**
 * Мастера, которые могут выполнить все выбранные услуги, с итоговыми
 * длительностью и ценой для каждого.
 */
export async function getStaffOffers(serviceIds: number[], salon: Salon): Promise<StaffOffer[]> {
  const staff = await db.staff.findMany({
    where: {
      active: true,
      bookable: true,
      AND: serviceIds.map((serviceId) => ({ services: { some: { serviceId } } })),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { services: { where: { serviceId: { in: serviceIds } }, include: { service: true } } },
  });
  return staff.map((s) => {
    let durationMin = 0;
    let priceMin = 0;
    let priceMax = 0;
    for (const ss of s.services) {
      durationMin += ss.durationMin ?? ss.service.durationMin;
      priceMin += Number(ss.priceMin ?? ss.service.priceMin);
      priceMax += Number(ss.priceMax ?? ss.service.priceMax);
    }
    return {
      id: s.id,
      name: s.name,
      specialization: s.specialization,
      bio: s.bio,
      avatarUrl: s.avatarUrl,
      durationMin: serviceIds.length ? durationMin : salon.slotStepMinutes,
      priceMin,
      priceMax,
    };
  });
}

/** Все мастера для экрана выбора, включая тех, кто сейчас недоступен онлайн. */
export async function getAllStaff() {
  return db.staff.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, specialization: true, bio: true, avatarUrl: true, bookable: true },
  });
}

/** date → время начала (ms) → id мастеров, свободных в это время */
type SlotMap = Map<string, Map<number, number[]>>;

async function computeSlots(offers: StaffOffer[], salon: Salon, fromDate: string, toDate: string): Promise<SlotMap> {
  const result: SlotMap = new Map();
  if (offers.length === 0) return result;
  const staffIds = offers.map((o) => o.id);
  const rangeStart = zonedDateTime(fromDate, "00:00", salon.timezone);
  const rangeEnd = zonedDateTime(addDays(toDate, 1), "00:00", salon.timezone);

  const [shifts, appointments] = await Promise.all([
    db.staffShift.findMany({ where: { staffId: { in: staffIds }, date: { gte: fromDate, lte: toDate } } }),
    db.appointment.findMany({
      where: {
        staffId: { in: staffIds },
        status: { in: [...ACTIVE_STATUSES] },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const notBefore = Date.now() + salon.minLeadMinutes * MIN;
  const busyByStaff = new Map<number, Interval[]>();
  for (const a of appointments) {
    const list = busyByStaff.get(a.staffId) ?? [];
    list.push({ start: a.startsAt.getTime(), end: a.endsAt.getTime() });
    busyByStaff.set(a.staffId, list);
  }

  const shiftsByKey = new Map<string, Interval[]>();
  for (const s of shifts) {
    const key = `${s.staffId}|${s.date}`;
    const list = shiftsByKey.get(key) ?? [];
    list.push({
      start: zonedDateTime(s.date, s.start, salon.timezone).getTime(),
      end: zonedDateTime(s.date, s.end, salon.timezone).getTime(),
    });
    shiftsByKey.set(key, list);
  }

  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const gridOrigin = zonedDateTime(date, "00:00", salon.timezone).getTime();
    for (const offer of offers) {
      const dayShifts = shiftsByKey.get(`${offer.id}|${date}`);
      if (!dayShifts) continue;
      const free = freeIntervals(dayShifts, busyByStaff.get(offer.id) ?? []);
      const starts = slotStarts(free, offer.durationMin * MIN, salon.slotStepMinutes * MIN, gridOrigin, notBefore);
      if (starts.length === 0) continue;
      const day = result.get(date) ?? new Map<number, number[]>();
      for (const t of starts) day.set(t, [...(day.get(t) ?? []), offer.id]);
      result.set(date, day);
    }
  }
  return result;
}

function todayAndLastDay(salon: Salon) {
  const today = localDate(new Date(), salon.timezone);
  return { today, lastDay: addDays(today, salon.bookingDaysAhead) };
}

async function offersFor(staffId: number | null, serviceIds: number[], salon: Salon) {
  const offers = await getStaffOffers(serviceIds, salon);
  return staffId ? offers.filter((o) => o.id === staffId) : offers;
}

/** Даты, на которые есть хотя бы одно свободное окно. */
export async function getAvailableDates(staffId: number | null, serviceIds: number[]): Promise<string[]> {
  const salon = await getSalon();
  const { today, lastDay } = todayAndLastDay(salon);
  const slots = await computeSlots(await offersFor(staffId, serviceIds, salon), salon, today, lastDay);
  return [...slots.keys()].sort();
}

export type Slot = { time: string; startsAt: string };

export async function getDaySlots(date: string, staffId: number | null, serviceIds: number[]): Promise<Slot[]> {
  const salon = await getSalon();
  const slots = await computeSlots(await offersFor(staffId, serviceIds, salon), salon, date, date);
  return [...(slots.get(date)?.keys() ?? [])]
    .sort((a, b) => a - b)
    .map((t) => ({ time: localTime(new Date(t), salon.timezone), startsAt: new Date(t).toISOString() }));
}

/** Ближайший день с окнами для каждого мастера (для списка мастеров). */
export async function getNearestSlots(serviceIds: number[], days = 14) {
  const salon = await getSalon();
  const { today } = todayAndLastDay(salon);
  const offers = await offersFor(null, serviceIds, salon);
  const slots = await computeSlots(offers, salon, today, addDays(today, days));
  const nearest = new Map<number, { date: string; slots: Slot[] }>();
  for (const date of [...slots.keys()].sort()) {
    const day = slots.get(date)!;
    for (const [t, staffIds] of [...day.entries()].sort((a, b) => a[0] - b[0])) {
      for (const id of staffIds) {
        const entry = nearest.get(id) ?? { date, slots: [] };
        if (entry.date !== date) continue;
        entry.slots.push({ time: localTime(new Date(t), salon.timezone), startsAt: new Date(t).toISOString() });
        nearest.set(id, entry);
      }
    }
  }
  return { today, nearest };
}

export class BookingError extends Error {}

export type BookingInput = {
  staffId: number | null;
  serviceIds: number[];
  startsAt: string;
  name: string;
  phone: string;
  email?: string;
  comment?: string;
  marketingConsent?: boolean;
};

/** Создаёт онлайн-запись. Мастер «любой» подбирается среди свободных в это время. */
export async function createOnlineBooking(input: BookingInput) {
  const salon = await getSalon();
  if (input.serviceIds.length === 0) throw new BookingError("Выберите хотя бы одну услугу");
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new BookingError("Некорректное время");
  const date = localDate(startsAt, salon.timezone);

  const offers = await offersFor(input.staffId, input.serviceIds, salon);
  const slots = await computeSlots(offers, salon, date, date);
  const freeStaff = slots.get(date)?.get(startsAt.getTime()) ?? [];
  const offer = offers.find((o) => freeStaff.includes(o.id));
  if (!offer) throw new BookingError("Это время уже занято. Пожалуйста, выберите другое.");

  const services = await db.staffService.findMany({
    where: { staffId: offer.id, serviceId: { in: input.serviceIds } },
    include: { service: true },
  });
  const ordered = input.serviceIds.map((id) => services.find((s) => s.serviceId === id)!);

  try {
    return await db.$transaction(async (tx) => {
      const client = await tx.client.upsert({
        where: { phone: input.phone },
        create: {
          phone: input.phone,
          name: input.name,
          email: input.email || null,
          marketingConsent: !!input.marketingConsent,
        },
        update: {
          ...(input.email ? { email: input.email } : {}),
          ...(input.marketingConsent ? { marketingConsent: true } : {}),
        },
      });
      return tx.appointment.create({
        data: {
          staffId: offer.id,
          clientId: client.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + offer.durationMin * MIN),
          source: "ONLINE",
          comment: input.comment ?? "",
          items: {
            create: ordered.map((s, i) => ({
              serviceId: s.serviceId,
              title: s.service.title,
              priceMin: s.priceMin ?? s.service.priceMin,
              priceMax: s.priceMax ?? s.service.priceMax,
              durationMin: s.durationMin ?? s.service.durationMin,
              sortOrder: i,
            })),
          },
        },
        include: { staff: true, client: true, items: true },
      });
    });
  } catch (e) {
    if (isOverlapError(e)) throw new BookingError("Это время только что заняли. Пожалуйста, выберите другое.");
    throw e;
  }
}

/** Нарушение ограничения Appointment_no_overlap в PostgreSQL. */
export function isOverlapError(e: unknown): boolean {
  return String((e as { message?: string })?.message ?? "").includes("Appointment_no_overlap");
}
