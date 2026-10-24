import { describe, expect, it } from "vitest";
import { freeIntervals, slotStarts } from "./availability";

const M = 60_000;
const at = (h: number, m = 0) => (h * 60 + m) * M;

describe("freeIntervals", () => {
  it("returns the whole shift when nothing is booked", () => {
    expect(freeIntervals([{ start: at(9), end: at(18) }], [])).toEqual([{ start: at(9), end: at(18) }]);
  });

  it("cuts out bookings, including ones that stick out of the shift", () => {
    const free = freeIntervals(
      [{ start: at(9), end: at(18) }],
      [
        { start: at(12), end: at(13) },
        { start: at(8), end: at(9, 30) },
        { start: at(17, 30), end: at(19) },
      ],
    );
    expect(free).toEqual([
      { start: at(9, 30), end: at(12) },
      { start: at(13), end: at(17, 30) },
    ]);
  });

  it("merges overlapping bookings", () => {
    const free = freeIntervals(
      [{ start: at(9), end: at(12) }],
      [
        { start: at(10), end: at(11) },
        { start: at(10, 30), end: at(11, 30) },
      ],
    );
    expect(free).toEqual([
      { start: at(9), end: at(10) },
      { start: at(11, 30), end: at(12) },
    ]);
  });

  it("handles split shifts", () => {
    const free = freeIntervals(
      [
        { start: at(14), end: at(18) },
        { start: at(9), end: at(12) },
      ],
      [{ start: at(11), end: at(15) }],
    );
    expect(free).toEqual([
      { start: at(9), end: at(11) },
      { start: at(15), end: at(18) },
    ]);
  });
});

describe("slotStarts", () => {
  it("places slots on the grid so the service fits before the end", () => {
    const slots = slotStarts([{ start: at(9), end: at(11) }], 60 * M, 30 * M, 0, 0);
    expect(slots).toEqual([at(9), at(9, 30), at(10)]);
  });

  it("offers the moment right after a short booking ends", () => {
    const free = freeIntervals([{ start: at(9), end: at(11) }], [{ start: at(9), end: at(9, 20) }]);
    expect(slotStarts(free, 20 * M, 30 * M, 0, 0)).toEqual([at(9, 20), at(9, 30), at(10), at(10, 30)]);
  });

  it("drops slots earlier than notBefore", () => {
    const slots = slotStarts([{ start: at(9), end: at(12) }], 30 * M, 30 * M, 0, at(10, 10));
    expect(slots).toEqual([at(10, 30), at(11), at(11, 30)]);
  });

  it("returns nothing when the service is longer than the gap", () => {
    expect(slotStarts([{ start: at(9), end: at(9, 45) }], 60 * M, 30 * M, 0, 0)).toEqual([]);
  });
});
