import {
  expect,
  test,
  readQueryCache,
  waitForDebugHandles,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  loginAsAdmin,
} from "./fixtures";

const SESSION_COOKIE_NAME = "erp_session";

test("未登录访问总览页被送到登录页", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("admin-nav")).toHaveCount(0);
});

test("未登录访问列表页被送到登录页且看不到业务数据", async ({ page }) => {
  await page.goto("/system/routes");

  await expect(page).toHaveURL(/\/login\?next=%2Fsystem%2Froutes/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("route-table")).toHaveCount(0);
  await expect(page.getByTestId("route-row")).toHaveCount(0);
});

test("登录成功后回到原本要访问的目标页", async ({ page }) => {
  await page.goto("/system/routes");
  await expect(page.getByTestId("login-form")).toBeVisible();
  await waitForDebugHandles(page);

  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();

  await page.waitForURL("**/system/routes");
  await expect(page.getByTestId("route-table")).toBeVisible();
  await expect(page.getByTestId("route-row").first()).toBeVisible();
});

test("登录失败时给出统一错误提示且留在登录页", async ({ page }) => {
  await page.goto("/login");
  await waitForDebugHandles(page);
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill("wrong-password");
  await page.getByTestId("login-submit").click();

  await expect(page.getByTestId("login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("登录下发的会话 cookie 是 HttpOnly 且不出现在响应体里", async ({ page, context }) => {
  const captured: Array<{ body: string; setCookie: string | null }> = [];
  await page.route("**/_serverFn/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    captured.push({ body, setCookie: response.headers()["set-cookie"] ?? null });
    await route.fulfill({ response, body });
  });

  await page.goto("/login?next=%2F");
  await waitForDebugHandles(page);
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  const loginCall = captured[0];
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);

  expect(loginCall?.setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  expect(loginCall?.setCookie).toContain("HttpOnly");
  expect(loginCall?.body).not.toContain(SESSION_COOKIE_NAME);
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(SESSION_COOKIE_NAME);
});

test("登录后页面显示当前管理员账号标识", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/");
  await expect(page.getByTestId("current-admin")).toHaveText(`当前管理员：${ADMIN_USERNAME}`);
});

test("会话失效后下一次取数跳回登录页且不显示业务数据", async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.goto("/system/routes");
  await waitForDebugHandles(page);
  await expect(page.getByTestId("route-row").first()).toBeVisible();

  await context.clearCookies();
  await page.getByTestId("route-filter").fill("system");

  await page.waitForURL(/\/login/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("route-row")).toHaveCount(0);
  await expect(page.getByTestId("route-table")).toHaveCount(0);

  const cacheEntries = await readQueryCache(page);
  expect(
    cacheEntries.filter(
      (entry) => entry.queryKey[0] === "system" && entry.queryKey[1] === "routes",
    ),
  ).toEqual([]);
});
