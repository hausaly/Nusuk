/**
 * Runs once at server start. Without a BullMQ worker, evaluate the reminder rules in-process every minute
 * (ReminderLog dedupes, so several app instances never double-send).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.USE_QUEUE === "1" || process.env.INPROCESS_SCHEDULER === "0") return;
  const { runReminders } = await import("@/services/reminders");
  const tick = () => runReminders(new Date()).catch((e) => console.error("reminder tick failed", e.message));
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000).unref();
}
