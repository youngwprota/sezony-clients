import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://sezony:sezony@localhost:5432/sezony_e2e?schema=public";

const serverEnv = {
  DATABASE_URL: E2E_DB,
  SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  APP_URL: `http://localhost:${PORT}`,
  BACKGROUND_JOBS: "off",
  NODE_ENV: "production",
};

/**
 * Сквозные тесты на production-сборке с отдельной базой (реальный каталог салона из seed).
 * Запуск: npm run test:e2e (сначала соберёт приложение).
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Europe/Minsk",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1366, height: 900 }, browserName: "chromium" } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv,
  },
});
