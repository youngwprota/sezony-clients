import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("adds the salon country code", () => {
    expect(normalizePhone("29 123-45-67", "+375")).toBe("+375291234567");
  });
  it("understands the 8 0XX local format", () => {
    expect(normalizePhone("8 (029) 123-45-67", "+375")).toBe("+375291234567");
  });
  it("keeps numbers with an explicit country code", () => {
    expect(normalizePhone("+7 916 123 45 67", "+375")).toBe("+79161234567");
    expect(normalizePhone("375291234567", "+375")).toBe("+375291234567");
  });
  it("rejects too short numbers", () => {
    expect(normalizePhone("12345", "+375")).toBeNull();
  });
});
