import { test, expect } from "@playwright/test";

const STUDENT_STATE = "playwright/.auth/student.json";
test.use({ storageState: STUDENT_STATE });

test.describe("Flow 1: Workshop detail page", () => {
  test("hiển thị chi tiết workshop", async ({ page }) => {
    await page.goto("/workshops");
    await page.locator('[data-testid="workshop-card"]').first().click();
    await page.waitForURL(/\/workshops\/[\w-]+/);

    await expect(page.locator('[data-testid="workshop-title"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="workshop-description"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="workshop-speaker"]')
    ).toBeVisible();
    await expect(page.locator('[data-testid="workshop-room"]')).toBeVisible();
  });
});
