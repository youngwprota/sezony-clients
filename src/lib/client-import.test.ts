import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { rowsToClients } from "./client-import";

describe("parseCsv / toCsv", () => {
  it("reads semicolon CSV from Russian Excel with quotes and BOM", () => {
    const rows = parseCsv('﻿Имя;Телефон;Комментарий\r\nАнна;+375 29 123-45-67;"любит ""кофе""; без сахара"\r\n');
    expect(rows).toEqual([
      ["Имя", "Телефон", "Комментарий"],
      ["Анна", "+375 29 123-45-67", 'любит "кофе"; без сахара'],
    ]);
  });

  it("round-trips through toCsv", () => {
    const data = [["Имя", "Заметка"], ["Ольга", 'строка 1\nстрока "2"']];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });

  it("falls back to comma separator", () => {
    expect(parseCsv("name,phone\nA,1")).toEqual([["name", "phone"], ["A", "1"]]);
  });
});

describe("rowsToClients", () => {
  it("maps YCLIENTS-like columns and skips rows without a phone", () => {
    const { clients, skipped } = rowsToClients(
      [
        ["Клиенты салона"],
        ["Имя", "Фамилия", "Телефон", "Email", "Дата рождения", "Комментарий"],
        ["Анна", "Петрова", "8 029 123 45 67", "anna@mail.by", "05.03.1990", "VIP"],
        ["Без телефона", "", "", "", "", ""],
        ["Ольга", "", "+375 33 765 43 21", "-", new Date("1985-12-01T00:00:00Z"), ""],
      ],
      "+375",
    );
    expect(skipped).toBe(1);
    expect(clients).toEqual([
      { phone: "+375291234567", name: "Анна Петрова", email: "anna@mail.by", birthday: "1990-03-05", comment: "VIP" },
      { phone: "+375337654321", name: "Ольга", email: null, birthday: "1985-12-01", comment: "" },
    ]);
  });

  it("reports a file without a phone column", () => {
    expect(rowsToClients([["a", "b"]], "+375").error).toMatch(/Телефон/);
  });
});
