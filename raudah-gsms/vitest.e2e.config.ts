import { defineConfig } from "vitest/config";
import path from "node:path";

/** End-to-end run against a RUNNING app (E2E_BASE_URL, default http://localhost:3000) and its seeded dev database. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node", include: ["e2e/**/*.e2e.ts"], fileParallelism: false, testTimeout: 600_000, hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://raudah:raudah@localhost:5432/raudah_gsms?schema=public",
      APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? "",
    },
  },
});
