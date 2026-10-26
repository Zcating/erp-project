import type { Page } from "@playwright/test";
import { countSubmitRequests, expect, loginAsAdmin, test, waitForDebugHandles } from "./fixtures";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

const rowOf = (page: Page, code: string) => page.getByTestId("item-row").filter({ hasText: code });

async function fillItemForm(
  page: Page,
  values: {
    code: string;
    barcode: string;
    name: string;
    specification: string;
    brand: string;
    category: string;
    baseUnit: string;
  },
): Promise<void> {
  await page.getByTestId("item-code").fill(values.code);
  await page.getByTestId("item-barcode").fill(values.barcode);
  await page.getByTestId("item-name").fill(values.name);
  await page.getByTestId("item-specification").fill(values.specification);
  await page.getByTestId("item-brand").fill(values.brand);
  await page.getByTestId("item-category").fill(values.category);
  await page.getByTestId("item-base-unit").fill(values.baseUnit);
}

test("未登录访问商品档案页被送到登录页且看不到业务数据", async ({ page }) => {
  await page.goto("/items");

  await expect(page).toHaveURL(/\/login\?next=%2Fitems/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("item-table")).toHaveCount(0);
});

test("新建商品档案后列表页出现该条记录，字段值与录入一致", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW");

  await page.goto("/items");
  await waitForDebugHandles(page);
  await page.getByTestId("item-create-link").click();
  await expect(page.getByTestId("item-form")).toBeVisible();
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();

  await expect(page).toHaveURL(/\/items$/);
  const row = rowOf(page, code);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("item-name")).toHaveText("可口可乐");
  await expect(row.getByTestId("item-specification")).toHaveText("500ml/瓶");
  await expect(row.getByTestId("item-brand")).toHaveText("可口可乐");
  await expect(row.getByTestId("item-category")).toHaveText("饮料");
  await expect(row.getByTestId("item-base-unit")).toHaveText("瓶");
});

test("一条档案可保存两个辅助计量单位，列表页与编辑表单都看得到各自换算率", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-AUX");

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-aux-add").click();
  await page.getByTestId("item-aux-unit").nth(0).fill("箱");
  await page.getByTestId("item-aux-rate").nth(0).fill("12");
  await page.getByTestId("item-aux-add").click();
  await page.getByTestId("item-aux-unit").nth(1).fill("包");
  await page.getByTestId("item-aux-rate").nth(1).fill("6");
  await page.getByTestId("item-submit").click();

  await expect(page).toHaveURL(/\/items$/);
  const row = rowOf(page, code);
  await expect(row.getByTestId("item-auxiliary-units")).toContainText("箱 × 12");
  await expect(row.getByTestId("item-auxiliary-units")).toContainText("包 × 6");

  await row.getByTestId("item-edit").click();
  await expect(page.getByTestId("item-form")).toBeVisible();
  await expect(page.getByTestId("item-aux-unit").nth(0)).toHaveValue("箱");
  await expect(page.getByTestId("item-aux-rate").nth(0)).toHaveValue("12");
  await expect(page.getByTestId("item-aux-unit").nth(1)).toHaveValue("包");
  await expect(page.getByTestId("item-aux-rate").nth(1)).toHaveValue("6");
});

test("编辑名称与辅助单位换算率后保存成功，列表页与编辑表单回填修改后的值", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-EDIT");

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-aux-add").click();
  await page.getByTestId("item-aux-unit").nth(0).fill("箱");
  await page.getByTestId("item-aux-rate").nth(0).fill("12");
  await page.getByTestId("item-submit").click();

  await expect(page).toHaveURL(/\/items$/);
  await rowOf(page, code).getByTestId("item-edit").click();
  await expect(page.getByTestId("item-form")).toBeVisible();
  await page.getByTestId("item-name").fill("可口可乐零度");
  await page.getByTestId("item-aux-rate").nth(0).fill("24");
  await page.getByTestId("item-submit").click();

  await expect(page).toHaveURL(/\/items$/);
  const row = rowOf(page, code);
  await expect(row.getByTestId("item-name")).toHaveText("可口可乐零度");
  await expect(row.getByTestId("item-auxiliary-units")).toContainText("箱 × 24");

  await row.getByTestId("item-edit").click();
  await expect(page.getByTestId("item-name")).toHaveValue("可口可乐零度");
  await expect(page.getByTestId("item-aux-rate").nth(0)).toHaveValue("24");
});

test("缺少名称或基本计量单位时表单显示客户端给出的错误消息且不发出提交请求", async ({ page }) => {
  await loginAsAdmin(page);
  const submitCount = countSubmitRequests(page);

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code: uniqueCode("PW-INVALID"),
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-name").fill("");
  await page.getByTestId("item-submit").click();
  await expect(page.getByTestId("item-form-error")).toHaveText("缺少商品名称");
  expect(submitCount()).toBe(0);

  await page.getByTestId("item-name").fill("可口可乐");
  await page.getByTestId("item-base-unit").fill("");
  await page.getByTestId("item-submit").click();
  await expect(page.getByTestId("item-form-error")).toHaveText("缺少基本计量单位");
  expect(submitCount()).toBe(0);
});

test("换算率非法时表单显示后端给出的错误消息", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code: uniqueCode("PW-RATE"),
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-aux-add").click();
  await page.getByTestId("item-aux-unit").nth(0).fill("箱");
  await page.getByTestId("item-aux-rate").nth(0).fill("1.1234567");
  await page.getByTestId("item-submit").click();
  await expect(page.getByTestId("item-form-error")).toContainText("单位换算率");
});

test("商品编码或商品条码重复时表单显示后端给出的重复提示", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-DUP");
  const barcode = uniqueBarcode();

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode,
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(rowOf(page, code)).toBeVisible();

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "同编码的另一条",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();
  await expect(page.getByTestId("item-form-error")).toHaveText(`商品编码重复：${code}`);

  await page.getByTestId("item-code").fill(uniqueCode("PW-DUP"));
  await page.getByTestId("item-barcode").fill(barcode);
  await page.getByTestId("item-submit").click();
  await expect(page.getByTestId("item-form-error")).toHaveText(`商品条码重复：${barcode}`);
});

test("按商品条码查询能查到档案，未知条码给出查不到的提示且不新建档案", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-BARCODE");
  const barcode = uniqueBarcode();

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode,
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();
  await expect(page).toHaveURL(/\/items$/);

  await page.getByTestId("item-barcode-search").fill(barcode);
  await page.getByTestId("item-barcode-search-submit").click();
  await expect(page.getByTestId("item-barcode-result")).toContainText(code);

  await page.getByTestId("item-barcode-search").fill("0000000000000");
  await page.getByTestId("item-barcode-search-submit").click();
  await expect(page.getByTestId("item-barcode-error")).toContainText("查不到");

  await expect(rowOf(page, code)).toHaveCount(1);
});

test("删除一条商品档案后列表页不再显示该条记录", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-DELETE");

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(rowOf(page, code)).toBeVisible();

  await rowOf(page, code).getByTestId("item-delete").click();
  await expect(rowOf(page, code)).toHaveCount(0);
});

test("商品档案列表只由查询缓存持有，界面状态里没有服务端数据", async ({ page }) => {
  await loginAsAdmin(page);
  const code = uniqueCode("PW-STATE");

  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await fillItemForm(page, {
    code,
    barcode: uniqueBarcode(),
    name: "可口可乐",
    specification: "500ml/瓶",
    brand: "可口可乐",
    category: "饮料",
    baseUnit: "瓶",
  });
  await page.getByTestId("item-submit").click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(rowOf(page, code)).toBeVisible();

  const cacheEntries = await page.evaluate(() => window.__erpDebug!.readQueryCache());
  const listEntries = cacheEntries.filter(
    (entry) => entry.queryKey[0] === "items" && entry.queryKey[1] === "list",
  );
  expect(listEntries).toHaveLength(1);

  const uiState = await page.evaluate(() => window.__erpDebug!.readUiState());
  expect(JSON.stringify(uiState)).not.toContain("/api/");
  expect(JSON.stringify(uiState)).not.toContain(code);
});
