"use server";

import { z } from "zod";
import { BookingError, createOnlineBooking, getSalon } from "@/lib/booking";
import { notifyClient, notifyStaff } from "@/lib/notify";
import { messengerLinks } from "@/lib/messengers";
import { validatePhone } from "@/lib/phone";
import { formatDayLong, localDate, localTime } from "@/lib/time";
import { freeText, optionalEmail, personName } from "@/lib/validation";

const schema = z.object({
  staffId: z.number().int().positive().nullable(),
  serviceIds: z
    .array(z.number().int().positive())
    .min(1, "Выберите хотя бы одну услугу")
    .max(10, "Не больше 10 услуг за одну запись")
    .transform((ids) => [...new Set(ids)]),
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Выберите время записи"),
  name: personName,
  phone: z.string().trim().min(1, "Введите номер телефона").max(30, "Проверьте номер телефона"),
  email: optionalEmail.optional(),
  comment: freeText(1000).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }) }),
  marketingConsent: z.boolean().optional(),
});

export type BookResult =
  | { ok: true; staffName: string; when: string; notified: boolean; telegram: string | null; viber: string | null }
  | { ok: false; error: string; field?: "phone" | "name" | "email" };

export async function bookAction(input: z.input<typeof schema>): Promise<BookResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return { ok: false, error: issue.message, ...(field === "name" || field === "email" || field === "phone" ? { field } : {}) };
  }
  const salon = await getSalon();
  const checked = validatePhone(parsed.data.phone, salon.phoneCountryCode);
  if (!checked.ok) return { ok: false, error: checked.error, field: "phone" };
  const phone = checked.phone;
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
