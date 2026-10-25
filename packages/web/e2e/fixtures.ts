import { appendFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";

const browserConsoleLogPath = process.env.E2E_BROWSER_CONSOLE_LOG;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    page.on("console", (message) => {
      if (message.type() === "error") {
        reportBrowserConsoleError(`[${testInfo.title}] console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      reportBrowserConsoleError(`[${testInfo.title}] pageerror: ${error.message}`);
    });
    await use(page);
  },
});

export { expect };

function reportBrowserConsoleError(message: string): void {
  process.stderr.write(`[浏览器控制台错误] ${message}\n`);
  if (browserConsoleLogPath !== undefined) {
    appendFileSync(browserConsoleLogPath, `${message}\n`, "utf8");
  }
}
