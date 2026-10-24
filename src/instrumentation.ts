export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.REMINDERS !== "off") {
    const { startReminderLoop } = await import("./lib/reminders");
    startReminderLoop();
  }
}
