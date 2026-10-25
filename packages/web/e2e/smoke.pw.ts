import { expect, test } from "./fixtures";

test("浏览器打开前端根路径渲染出管理后台布局", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("admin-nav")).toBeVisible();
  await expect(page.getByTestId("admin-main")).toBeVisible();
  await expect(page.getByText("进销存管理后台")).toBeVisible();
});
