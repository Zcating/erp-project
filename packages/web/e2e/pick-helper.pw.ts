import type { Page } from "@playwright/test";
import { expect, pickOption, test } from "./fixtures";

const nativeSelectMarkup = `
<select data-testid="target">
  <option value="A">甲</option>
  <option value="B">乙</option>
</select>
`;

const triggerMarkup = `
<button type="button" data-testid="target" aria-haspopup="listbox">选择</button>
<div role="listbox">
  <div role="option" data-value="A">甲</div>
  <div role="option" data-value="B">乙</div>
</div>
`;

const disabledTriggerMarkup = `
<button type="button" data-testid="target" disabled>选择</button>
`;

async function recordPickedValues(page: Page): Promise<void> {
  await page.evaluate(() => {
    const picked: string[] = [];
    (window as unknown as { pickedValues: string[] }).pickedValues = picked;
    document.addEventListener("click", (event) => {
      const element = event.target as HTMLElement | null;
      const value = element?.getAttribute("data-value");
      if (value !== null && value !== undefined) {
        picked.push(value);
      }
    });
  });
}

test("选值助手在原生下拉上按取值选中", async ({ page }) => {
  await page.setContent(nativeSelectMarkup);

  await pickOption(page.getByTestId("target"), "B");

  await expect(page.getByTestId("target")).toHaveValue("B");
});

test("选值助手在 shadcn 触发器上点中 data-value 相同的选项", async ({ page }) => {
  await page.setContent(triggerMarkup);
  await recordPickedValues(page);

  await pickOption(page.getByTestId("target"), "B");

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { pickedValues: string[] }).pickedValues))
    .toEqual(["B"]);
});

test("选值助手在选项不存在时报选项不存在", async ({ page }) => {
  await page.setContent(triggerMarkup);

  await expect(pickOption(page.getByTestId("target"), "MISSING")).rejects.toThrow("选项不存在");
});

test("选值助手在目标触发器禁用时报目标已禁用", async ({ page }) => {
  await page.setContent(disabledTriggerMarkup);

  await expect(pickOption(page.getByTestId("target"), "A")).rejects.toThrow("目标已禁用");
});
