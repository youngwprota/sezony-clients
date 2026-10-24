"use server";

import { z } from "zod";
import { BookingError, createOnlineBooking, getSalon } from "@/lib/booking";
import { notifyClient, notifyStaff } from "@/lib/notify";
import { messengerLinks } from "@/lib/messengers";
import { normalizePhone } from "@/lib/phone";
import { formatDayLong, localDate, localTime } from "@/lib/time";

const schema = z.object({
  staffId: z.number().int().positive().nullable(),
  serviceIds: z.array(z.number().int().positive()).min(1).max(10),
  startsAt: z.string(),
  name: z.string().trim().min(1, "Введите имя").max(100),
  phone: z.string().trim().min(5, "Введите номер телефона").max(30),
  email: z.union([z.literal(""), z.string().trim().email("Некорректный e-mail")]).optional(),
  comment: z.string().max(1000).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }) }),
  marketingConsent: z.boolean().optional(),
});

export type BookResult =
  | { ok: true; staffName: string; when: string; notified: boolean; telegram: string | null; viber: string | null }
  | { ok: false; error: string };

export async function bookAction(input: z.input<typeof schema>): Promise<BookResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const salon = await getSalon();
  const phone = normalizePhone(parsed.data.phone, salon.phoneCountryCode);
  if (!phone) return { ok: false, error: "Проверьте номер телефона" };
  try {
    const appointment = await createOnlineBooking({ ...parsed.data, phone });
    await notifyStaff("created", appointment);
    // постоянный клиент уже подключён к мессенджеру — подтверждение уходит сразу
    const notified = await notifyClient("created", appointment.id);
    const links = messengerLinks({ kind: "c", id: appointment.clientId });
    const when = `${formatDayLong(localDate(appointment.startsAt, salon.timezone))}, ${localTime(appointment.startsAt, salon.timezone)}`;
    return { ok: true, staffName: appointment.staff.name, when, notified, ...links };
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось создать запись. Попробуйте ещё раз." };
  }
}
