import { z } from "zod";

/** Имя человека: буквы обязательны, без управляющих символов и ссылок. */
export const personName = z
  .string({ required_error: "Введите имя" })
  .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Введите имя")
      .max(100, "Имя слишком длинное — до 100 символов")
      .refine((v) => /\p{L}/u.test(v), "Имя должно содержать буквы")
      .refine((v) => !/(https?:\/\/|www\.|<[a-z/])/i.test(v), "Имя не должно содержать ссылок"),
  );

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Необязательный e-mail: пустая строка или корректный адрес. */
export const optionalEmail = z
  .string()
  .trim()
  .max(254, "E-mail слишком длинный")
  .refine((v) => v === "" || EMAIL.test(v), "Проверьте e-mail: например, anna@mail.by");

/** Текст комментария/заметки без управляющих символов (кроме переноса строки). */
export const freeText = (max: number) =>
  z
    .string()
    .max(max, `Не больше ${max} символов`)
    .transform((v) => v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim());

/** Дата ГГГГ-ММ-ДД, которая действительно существует. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Такой даты не существует");

/** Время ЧЧ:ММ в пределах суток. */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");

/** Первое сообщение об ошибке zod, на русском. */
export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Проверьте введённые данные";
}
