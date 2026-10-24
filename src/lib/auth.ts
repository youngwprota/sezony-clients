import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";
import { loginBlockedFor, registerLoginFailure, registerLoginSuccess } from "./login-throttle";

/**
 * Текущий сеанс, сверенный с базой: пользователь существует, пароль не менялся,
 * роль и привязка к мастеру актуальны. Один запрос к базе на HTTP-запрос.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const user = await db.user.findUnique({ where: { id: token.userId } });
  if (!user || user.tokenVersion !== token.v) return null;
  return { userId: user.id, role: user.role, staffId: user.staffId, v: user.tokenVersion };
});

export type LoginResult = { ok: true; session: Session } | { ok: false; error: string };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function login(loginName: string, password: string): Promise<LoginResult> {
  const name = loginName.trim().toLowerCase().slice(0, 40);
  const keys = [`login:${name}`, `ip:${await clientIp()}`];
  const wait = loginBlockedFor(keys);
  if (wait > 0) return { ok: false, error: `Слишком много попыток. Попробуйте через ${Math.ceil(wait / 60)} мин.` };

  const user = name ? await db.user.findUnique({ where: { login: name } }) : null;
  // сравниваем хеш даже для несуществующего логина, чтобы время ответа не выдавало, есть ли такой пользователь
  const valid = await bcrypt.compare(password.slice(0, 72), user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !valid) {
    registerLoginFailure(keys);
    return { ok: false, error: "Неверный логин или пароль" };
  }
  registerLoginSuccess(keys);
  const session: Session = { userId: user.id, role: user.role, staffId: user.staffId, v: user.tokenVersion };
  (await cookies()).set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true, session };
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
