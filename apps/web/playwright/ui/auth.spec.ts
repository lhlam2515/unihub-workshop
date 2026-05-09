import { test, expect } from "@playwright/test";

test.describe("Auth UI (guest)", () => {
  test("hiển thị form đăng nhập", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("validation hiển thị khi bỏ trống", async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    const errors = page.locator('[data-slot="field-error"]');
    await expect(errors).not.toHaveCount(0);
  });
});
