const H = 3_600_000;

export type ReminderState = {
  startsAt: Date;
  createdAt: Date;
  remindDaySentAt: Date | null;
  remindHoursSentAt: Date | null;
};

export type ReminderSettings = { remindDayBefore: boolean; remindHoursBefore: number };

/**
 * Какое напоминание пора отправить. Не напоминаем о том, о чём клиент только что узнал:
 * за сутки — только если запись сделана заранее (больше чем за 26 ч),
 * за N часов — если запись сделана больше чем за N ч 30 мин.
 */
export function dueReminder(a: ReminderState, now: Date, s: ReminderSettings): "remindDay" | "remindHours" | null {
  const left = a.startsAt.getTime() - now.getTime();
  const lead = a.startsAt.getTime() - a.createdAt.getTime();
  if (left <= 0) return null;
  const hours = s.remindHoursBefore * H;
  if (hours > 0 && !a.remindHoursSentAt && left <= hours && lead > hours + 0.5 * H) return "remindHours";
  if (s.remindDayBefore && !a.remindDaySentAt && left <= 24 * H && left > hours && lead > 26 * H) return "remindDay";
  return null;
}
