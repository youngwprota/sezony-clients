import { createHmac, timingSafeEqual } from "node:crypto";

/** Параметр для t.me/<bot>?start=…, привязывающий чат к мастеру. */
export function telegramStartPayload(staffId: number): string {
  return `s${staffId}_${sign(staffId)}`;
}

export function parseTelegramStartPayload(payload: string): number | null {
  const m = /^s(\d+)_([A-Za-z0-9_-]+)$/.exec(payload);
  if (!m) return null;
  const staffId = Number(m[1]);
  const expected = Buffer.from(sign(staffId));
  const got = Buffer.from(m[2]);
  return expected.length === got.length && timingSafeEqual(expected, got) ? staffId : null;
}

function sign(staffId: number) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`tg:${staffId}`).digest("base64url").slice(0, 22);
}
