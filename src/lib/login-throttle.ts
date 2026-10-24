/**
 * Ограничение подбора пароля: после 5 неудачных попыток по логину или адресу —
 * пауза, которая растёт до 15 минут. Хранится в памяти процесса.
 */
const WINDOW_MS = 15 * 60_000;
const FREE_ATTEMPTS = 5;

type Entry = { fails: number; until: number; first: number };
const entries = new Map<string, Entry>();

function entry(key: string, now: number): Entry {
  const e = entries.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    const fresh = { fails: 0, until: 0, first: now };
    entries.set(key, fresh);
    return fresh;
  }
  return e;
}

/** Сколько секунд ещё ждать (0 — можно пробовать). */
export function loginBlockedFor(keys: string[], now = Date.now()): number {
  return Math.max(0, ...keys.map((k) => Math.ceil((entry(k, now).until - now) / 1000)));
}

export function registerLoginFailure(keys: string[], now = Date.now()) {
  for (const k of keys) {
    const e = entry(k, now);
    e.fails++;
    if (e.fails >= FREE_ATTEMPTS) e.until = now + Math.min(WINDOW_MS, 2 ** (e.fails - FREE_ATTEMPTS) * 30_000);
  }
  if (entries.size > 10_000) for (const [k, e] of entries) if (now - e.first > WINDOW_MS) entries.delete(k);
}

export function registerLoginSuccess(keys: string[]) {
  for (const k of keys) entries.delete(k);
}
