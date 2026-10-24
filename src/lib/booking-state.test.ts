import { describe, expect, it } from "vitest";
import { bookingQuery, nextStep, parseBookingState } from "./booking-state";

describe("parseBookingState", () => {
  it("читает мастера, услуги и время", () => {
    expect(parseBookingState({ staff: "3", services: "5,7,5", at: "2026-11-01T10:00:00.000Z" })).toEqual({
      staffId: 3,
      serviceIds: [5, 7],
      at: "2026-11-01T10:00:00.000Z",
    });
  });

  it("отбрасывает мусор, отрицательные и слишком большие числа", () => {
    expect(parseBookingState({ staff: "x", services: "a,-1,0,1.5," + "9".repeat(30) + ",2147483648,4", at: "вчера" })).toEqual({
      staffId: null,
      serviceIds: [4],
      at: null,
    });
    expect(parseBookingState({ staff: "99999999999" }).staffId).toBeNull();
  });

  it("ограничивает число услуг и понимает массивы параметров", () => {
    const many = Array.from({ length: 100 }, (_, i) => i + 1).join(",");
    expect(parseBookingState({ services: many }).serviceIds).toHaveLength(10);
    expect(parseBookingState({ staff: ["2", "3"] }).staffId).toBe(2);
  });
});

describe("bookingQuery / nextStep", () => {
  it("строит адрес и ведёт к следующему незаполненному шагу", () => {
    const s = { staffId: 2, serviceIds: [], at: null };
    expect(bookingQuery(s)).toBe("?staff=2");
    expect(nextStep(s)).toBe("/book/services?staff=2");
    expect(nextStep({ ...s, serviceIds: [1] })).toBe("/book/time?staff=2&services=1");
    expect(nextStep({ ...s, serviceIds: [1], at: "2026-11-01T10:00:00.000Z" })).toMatch(/^\/book\/confirm\?/);
    expect(bookingQuery({ staffId: null, serviceIds: [], at: null })).toBe("");
  });
});
