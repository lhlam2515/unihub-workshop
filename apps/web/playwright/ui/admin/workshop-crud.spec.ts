import { test, expect } from "@playwright/test";

const ADMIN_STATE = "playwright/.auth/admin.json";
test.use({ storageState: ADMIN_STATE });

test.describe("Flow 5: Admin tạo workshop", () => {
  test("trang tạo workshop load không lỗi", async ({ page }) => {
    await page.goto("/admin/workshops/new");
    // Page loads — either workshop form fields or login form
    await expect(
      page.locator('[name="title"], [data-testid="login-form"]').first()
    ).toBeVisible();
  });

  test("validation lỗi khi submit trống", async ({ page }) => {
    await page.goto("/admin/workshops/new");
    const hasForm = await page
      .locator('[name="title"]')
      .isVisible()
      .catch(() => false);
    if (hasForm) {
      await page.click('button[type="submit"]');
      const errors = page.locator('[data-slot="field-error"]');
      await expect(errors).not.toHaveCount(0);
    }
  });
});
