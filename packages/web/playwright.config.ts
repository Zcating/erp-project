import { defineConfig } from "@playwright/test";

const webPort = 5173;
const apiPort = 3000;
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
  },
  webServer: [
    {
      command: `pnpm --filter @erp-inventory-sales/app start`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `vp dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
