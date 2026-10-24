import { describe, expect, it } from "vitest";
import { freeText, isoDate, hhmm, optionalEmail, personName } from "./validation";

describe("personName", () => {
  it("принимает обычные имена и чистит пробелы", () => {
    expect(personName.parse("  Анна   Петрова ")).toBe("Анна Петрова");
    expect(personName.parse("Jean-Luc")).toBe("Jean-Luc");
    expect(personName.parse("Ёлка\tИванова")).toBe("Ёлка Иванова");
  });
  it("отклоняет пустое, цифры, ссылки и слишком длинное", () => {
    for (const bad of ["", "   ", "12345", "+375291234567", "Анна http://spam.ru", "<script>", "a".repeat(101)]) {
      expect(personName.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("optionalEmail", () => {
  it("пусто — можно, корректный — можно", () => {
    expect(optionalEmail.parse("")).toBe("");
    expect(optionalEmail.parse(" anna@mail.by ")).toBe("anna@mail.by");
  });
  it("некорректный — понятная ошибка", () => {
    for (const bad of ["anna", "anna@", "anna@mail", "an na@mail.by", "@mail.by"]) {
      const r = optionalEmail.safeParse(bad);
      expect(r.success, bad).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toMatch(/e-mail/);
    }
  });
});

describe("freeText", () => {
  it("убирает управляющие символы, оставляет переносы", () => {
    expect(freeText(50).parse("строка 1\nстрока\u0007 2")).toBe("строка 1\nстрока 2");
    expect(freeText(3).safeParse("1234").success).toBe(false);
  });
});

describe("isoDate / hhmm", () => {
  it("проверяет существование даты", () => {
    expect(isoDate.safeParse("2026-02-28").success).toBe(true);
    expect(isoDate.safeParse("2028-02-29").success).toBe(true);
    expect(isoDate.safeParse("2026-02-29").success).toBe(false);
    expect(isoDate.safeParse("2026-13-01").success).toBe(false);
    expect(isoDate.safeParse("26-1-1").success).toBe(false);
  });
  it("проверяет время", () => {
    expect(hhmm.safeParse("00:00").success).toBe(true);
    expect(hhmm.safeParse("23:59").success).toBe(true);
    for (const bad of ["24:00", "9:00", "12:60", "", "--:--"]) expect(hhmm.safeParse(bad).success, bad).toBe(false);
  });
});
