import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sezony_session";

export type Session = { userId: number; role: "OWNER" | "ADMIN" | "MASTER"; staffId: number | null };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET должен быть не короче 32 символов");
  return new TextEncoder().encode(s);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: payload.userId as number, role: payload.role as Session["role"], staffId: (payload.staffId as number | null) ?? null };
  } catch {
    return null;
  }
}
