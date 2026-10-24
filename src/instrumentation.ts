export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKGROUND_JOBS !== "off") {
    const { startBackgroundJobs } = await import("./lib/jobs");
    startBackgroundJobs();
  }
}
