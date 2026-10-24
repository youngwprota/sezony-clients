import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
  // в тестах нет React Server Components — заглушка вместо пакета-предохранителя
  "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // интеграционные тесты делят одну базу — файлы выполняются по очереди
    fileParallelism: false,
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          testTimeout: 30_000,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://sezony:sezony@localhost:5432/sezony_test?schema=public",
            SESSION_SECRET: "integration-test-secret-integration-test-secret",
            APP_URL: "https://salon.test",
            BACKGROUND_JOBS: "off",
          },
        },
      },
    ],
  },
});
