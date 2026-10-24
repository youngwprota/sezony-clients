import { beforeAll, describe, expect, it } from "vitest";
import { parseLinkPayload, signLinkPayload } from "./link-payload";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});

describe("link payload", () => {
  it("round-trips staff and client targets", () => {
    expect(parseLinkPayload(signLinkPayload({ kind: "s", id: 7 }))).toEqual({ kind: "s", id: 7 });
    expect(parseLinkPayload(signLinkPayload({ kind: "c", id: 1234 }))).toEqual({ kind: "c", id: 1234 });
  });

  it("fits Telegram's 64-character start parameter", () => {
    expect(signLinkPayload({ kind: "c", id: 999999999 }).length).toBeLessThanOrEqual(64);
  });

  it("rejects a forged id", () => {
    const [, sig] = signLinkPayload({ kind: "c", id: 5 }).split("_");
    expect(parseLinkPayload(`c6_${sig}`)).toBeNull();
    expect(parseLinkPayload("garbage")).toBeNull();
  });
});
