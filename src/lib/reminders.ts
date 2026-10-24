import "server-only";
import { db } from "./db";
import { notifyClient } from "./notify";
import { dueReminder } from "./reminder-schedule";

const FIELD = { remindDay: "remindDaySentAt", remindHours: "remindHoursSentAt" } as const;

/** Отправляет клиентам напоминания, которым подошло время. Можно вызывать сколько угодно часто. */
export async function runReminders(now = new Date()) {
  const salon = await db.salon.findUniqueOrThrow({ where: { id: 1 } });
  if (!salon.remindDayBefore && salon.remindHoursBefore <= 0) return 0;
  const candidates = await db.appointment.findMany({
    where: {
      status: { in: ["BOOKED", "CONFIRMED"] },
      startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) },
      OR: [{ remindDaySentAt: null }, { remindHoursSentAt: null }],
      client: { OR: [{ telegramChatId: { not: null } }, { viberUserId: { not: null } }] },
    },
    select: { id: true, startsAt: true, createdAt: true, remindDaySentAt: true, remindHoursSentAt: true },
  });
  let sent = 0;
  for (const a of candidates) {
    const kind = dueReminder(a, now, salon);
    if (!kind) continue;
    // помечаем до отправки, чтобы параллельный запуск не отправил второй раз
    const claimed = await db.appointment.updateMany({ where: { id: a.id, [FIELD[kind]]: null }, data: { [FIELD[kind]]: now } });
    if (claimed.count === 1 && (await notifyClient(kind, a.id))) sent++;
  }
  return sent;
}

let started = false;

/** Фоновая проверка раз в 5 минут внутри процесса сервера. */
export function startReminderLoop() {
  if (started) return;
  started = true;
  const tick = () => runReminders().catch((e) => console.error("reminders", e));
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
}
