import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export type PhoneCheck = { ok: true; phone: string } | { ok: false; error: string };

/** Мобильные коды операторов Беларуси (для подсказок в сообщениях об ошибке). */
const BY_MOBILE_CODES = "25, 29, 33, 44";

const COUNTRY_BY_CODE: Record<string, CountryCode> = { "375": "BY", "7": "RU", "48": "PL", "370": "LT", "371": "LV", "380": "UA" };

/**
 * Проверяет и нормализует номер (E.164: +375291234567) по официальной нумерации страны.
 * Номер без «+» считается номером страны салона: «29 123-45-67», «8 029 123 45 67», «375291234567».
 * Иностранный номер нужно писать с «+». По умолчанию принимаются только мобильные —
 * на них приходят напоминания; `allowFixed` разрешает и городские.
 */
export function validatePhone(raw: string, salonCountryCode: string, opts: { allowFixed?: boolean } = {}): PhoneCheck {
  const input = raw.trim().replace(/^00/, "+");
  if (/[^\d\s()+\-.]/.test(input)) return { ok: false, error: "Номер может содержать только цифры, пробелы, скобки и дефис" };
  const digits = input.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Введите номер телефона" };

  const code = salonCountryCode.replace(/\D/g, "");
  const country = COUNTRY_BY_CODE[code] ?? "BY";
  const explicitIntl = input.startsWith("+");
  const parsed = parsePhoneNumberFromString(explicitIntl ? `+${digits}` : digits, country);

  if (!parsed || !parsed.isValid()) {
    if (!explicitIntl || digits.startsWith(code)) {
      const national = digits.startsWith(code) ? digits.slice(code.length) : digits.replace(/^80?/, "");
      if (country === "BY") {
        if (national.length < 9) return { ok: false, error: "Номер слишком короткий: нужно 9 цифр после +375, например 29 123-45-67" };
        if (national.length > 9) return { ok: false, error: "Номер слишком длинный: нужно 9 цифр после +375, например 29 123-45-67. Номер другой страны укажите с «+»" };
        return { ok: false, error: `Такого номера в Беларуси нет. Проверьте код оператора (мобильные: ${BY_MOBILE_CODES}) и цифры` };
      }
    }
    return { ok: false, error: explicitIntl ? "Номер не существует — проверьте код страны и цифры" : "Проверьте номер. Номер другой страны укажите с «+» и кодом страны" };
  }

  const type = parsed.getType();
  const mobile = type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE";
  if (!mobile && !(opts.allowFixed && type === "FIXED_LINE")) {
    return {
      ok: false,
      error: parsed.country === "BY" ? `Укажите мобильный номер (коды ${BY_MOBILE_CODES}) — на него придут напоминания` : "Укажите мобильный номер",
    };
  }
  return { ok: true, phone: parsed.number };
}

/** Короткая форма для мест, где важен только результат. */
export function normalizePhone(raw: string, salonCountryCode: string, opts: { allowFixed?: boolean } = {}): string | null {
  const r = validatePhone(raw, salonCountryCode, opts);
  return r.ok ? r.phone : null;
}

/** +375291234567 → +375 29 123-45-67 */
export function formatPhone(e164: string): string {
  const p = parsePhoneNumberFromString(e164);
  if (!p) return e164;
  if (p.country === "BY") {
    const n = p.nationalNumber;
    return `+375 ${n.slice(0, 2)} ${n.slice(2, 5)}-${n.slice(5, 7)}-${n.slice(7)}`;
  }
  return p.formatInternational();
}
