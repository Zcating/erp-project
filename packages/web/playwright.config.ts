import { defineConfig } from "@playwright/test";

const webPort = 5173;
const apiPort = 3000;
const baseURL = `http://127.0.0.1:${webPort}`;
const reuseExistingServer = process.env.E2E_REUSE_SERVERS === "1" || !process.env.CI;

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
      command: `node ../../scripts/e2e/start-api.ts`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: `vp dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: baseURL,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
