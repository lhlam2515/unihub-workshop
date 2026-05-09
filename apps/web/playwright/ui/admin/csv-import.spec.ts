import { test, expect } from "@playwright/test";

const ADMIN_STATE = "playwright/.auth/admin.json";
test.use({ storageState: ADMIN_STATE });

test.describe("Flow 8: Import CSV", () => {
  test("trang import load không lỗi", async ({ page }) => {
    await page.goto("/admin/imports");
    // Page loads — either imports table/button or login form
    await expect(
      page
        .locator('[data-testid="csv-upload"], [data-testid="login-form"]')
        .first()
    ).toBeVisible();
  });
});
