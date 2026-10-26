import { appendFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

const browserConsoleLogPath = process.env.E2E_BROWSER_CONSOLE_LOG;

export const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-dev-password";

export type DebugQueryEntry = {
  queryKey: readonly unknown[];
  status: string;
  data: unknown;
};

export type UiStateSnapshot = {
  routeFilter: string;
  selectedRoute: string | null;
  detailPanelOpen: boolean;
  stockWarehouseFilter: string;
  stockItemFilter: string;
  movementDocumentNoFilter: string;
  movementWarehouseFilter: string;
  movementItemFilter: string;
  movementLineNoFilter: string;
  movementFromFilter: string;
  movementToFilter: string;
  movementOrder: string;
};

export type DebugHandles = {
  readUiState: () => UiStateSnapshot;
  readQueryCache: () => Array<DebugQueryEntry>;
};

declare global {
  interface Window {
    __erpDebug?: DebugHandles;
  }
}

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

export async function waitForDebugHandles(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__erpDebug !== undefined);
}

export async function readQueryCache(page: Page): Promise<Array<DebugQueryEntry>> {
  await waitForDebugHandles(page);
  return page.evaluate(() => window.__erpDebug!.readQueryCache());
}

export async function loginAsAdmin(page: Page, next = "/"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await waitForDebugHandles(page);
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.getByTestId("login-submit").click(),
  ]);
}

function reportBrowserConsoleError(message: string): void {
  process.stderr.write(`[浏览器控制台错误] ${message}\n`);
  if (browserConsoleLogPath !== undefined) {
    appendFileSync(browserConsoleLogPath, `${message}\n`, "utf8");
  }
}

const PICK_OPTION_TIMEOUT_MS = 5_000;

export async function pickOption(target: Locator, value: string): Promise<void> {
  const tagName = await target.evaluate((element) => element.tagName.toLowerCase());

  if (tagName === "select") {
    await target.selectOption(value);
    return;
  }

  if (tagName !== "button") {
    throw new Error(`目标不是可选控件：${tagName}`);
  }

  if (await target.isDisabled()) {
    throw new Error(`目标已禁用：无法选中 ${value}`);
  }

  await target.click();

  const option = target
    .page()
    .locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
    .first();
  try {
    await option.waitFor({ state: "visible", timeout: PICK_OPTION_TIMEOUT_MS });
  } catch {
    throw new Error(`选项不存在：${value}`);
  }

  if ((await option.getAttribute("aria-disabled")) !== null) {
    throw new Error(`目标已禁用：无法选中 ${value}`);
  }

  await option.click();
}
