import { normalizePhone } from "./phone";

export type ImportedClient = { name: string; phone: string; email: string | null; birthday: string | null; comment: string };

type Cell = string | number | boolean | Date | null | undefined;

const COLUMNS: Record<keyof ImportedClient | "surname", RegExp> = {
  name: /^(имя|фио|клиент|name|full name)$/i,
  surname: /^(фамилия|surname|last name)$/i,
  phone: /^(телефон|тел\.?|мобильный|номер телефона|phone|mobile)$/i,
  email: /^(e-?mail|почта|эл\.? почта|электронная почта)$/i,
  birthday: /^(дата рождения|день рождения|др|birthday|birth date)$/i,
  comment: /^(комментарий|комментарии|заметка|примечание|comment|notes?)$/i,
};

function toBirthday(v: Cell): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Превращает строки таблицы (выгрузка YCLIENTS, Excel, CSV) в клиентов.
 * Колонки ищутся по заголовку в первых 10 строках; строки без телефона пропускаются.
 */
export function rowsToClients(rows: Cell[][], countryCode: string): { clients: ImportedClient[]; skipped: number; error?: string } {
  const headerIdx = rows.slice(0, 10).findIndex((r) => r.some((c) => COLUMNS.phone.test(String(c ?? "").trim())));
  if (headerIdx < 0) return { clients: [], skipped: 0, error: "Не нашли колонку «Телефон» в первых строках файла" };
  const header = rows[headerIdx].map((c) => String(c ?? "").trim());
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, re]) => [key, header.findIndex((h) => re.test(h))]),
  ) as Record<keyof typeof COLUMNS, number>;
  const get = (r: Cell[], key: keyof typeof COLUMNS) => (col[key] >= 0 ? r[col[key]] : undefined);

  const byPhone = new Map<string, ImportedClient>();
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const phone = normalizePhone(String(get(r, "phone") ?? ""), countryCode);
    if (!phone) {
      skipped++;
      continue;
    }
    const name = [get(r, "name"), get(r, "surname")].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
    const email = String(get(r, "email") ?? "").trim();
    byPhone.set(phone, {
      phone,
      name: name || "Без имени",
      email: /@/.test(email) ? email : null,
      birthday: toBirthday(get(r, "birthday")),
      comment: String(get(r, "comment") ?? "").trim(),
    });
  }
  return { clients: [...byPhone.values()], skipped };
}
