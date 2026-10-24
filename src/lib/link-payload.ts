import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Подписанный параметр для ссылок t.me/<bot>?start=… и viber://pa?…&context=…,
 * которые привязывают чат мессенджера к мастеру (s) или клиенту (c).
 */
export type LinkTarget = { kind: "s" | "c"; id: number };

export function signLinkPayload({ kind, id }: LinkTarget): string {
  return `${kind}${id}_${sign(kind, id)}`;
}

export function parseLinkPayload(payload: string): LinkTarget | null {
  const m = /^([sc])(\d+)_([A-Za-z0-9_-]+)$/.exec(payload.trim());
  if (!m) return null;
  const kind = m[1] as "s" | "c";
  const id = Number(m[2]);
  const expected = Buffer.from(sign(kind, id));
  const got = Buffer.from(m[3]);
  return expected.length === got.length && timingSafeEqual(expected, got) ? { kind, id } : null;
}

function sign(kind: string, id: number) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`link:${kind}:${id}`).digest("base64url").slice(0, 20);
}
