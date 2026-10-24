import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function login(loginName: string, password: string): Promise<Session | null> {
  const user = await db.user.findUnique({ where: { login: loginName.trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const session: Session = { userId: user.id, role: user.role, staffId: user.staffId };
  (await cookies()).set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return session;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Владелец или администратор — иначе на страницу входа. */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s || (s.role !== "OWNER" && s.role !== "ADMIN")) redirect("/login?next=/admin");
  return s;
}

/** Мастер с привязанным профилем сотрудника. */
export async function requireMaster(): Promise<Session & { staffId: number }> {
  const s = await getSession();
  if (!s || s.staffId == null) redirect("/login?next=/master");
  return s as Session & { staffId: number };
}
