import "server-only";
import { runReminders } from "./reminders";
import { runBirthdayGreetings, runCampaignQueue } from "./campaigns";

let started = false;
let queueBusy = false;

/**
 * Фоновые задачи внутри процесса сервера:
 * напоминания и поздравления — раз в 5 минут, очередь рассылок — каждые 10 секунд.
 */
export function startBackgroundJobs() {
  if (started) return;
  started = true;
  const slow = async () => {
    await runReminders().catch((e) => console.error("reminders", e));
    await runBirthdayGreetings().catch((e) => console.error("birthdays", e));
  };
  const queue = async () => {
    if (queueBusy) return;
    queueBusy = true;
    try {
      while ((await runCampaignQueue()) > 0);
    } catch (e) {
      console.error("campaigns", e);
    } finally {
      queueBusy = false;
    }
  };
  setTimeout(slow, 30_000);
  setInterval(slow, 5 * 60_000);
  setInterval(queue, 10_000);
}
