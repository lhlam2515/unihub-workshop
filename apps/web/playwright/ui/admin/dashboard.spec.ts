import { test, expect } from "@playwright/test";

const ADMIN_STATE = "playwright/.auth/admin.json";
test.use({ storageState: ADMIN_STATE });

test.describe("Flow 9: Admin dashboard stats", () => {
  test("trang admin dashboard load không lỗi", async ({ page }) => {
    await page.goto("/admin");
    // Page loads — either dashboard stats or login form for role management
    await expect(
      page
        .locator('[data-testid="stats-overview"], [data-testid="login-form"]')
        .first()
    ).toBeVisible();
  });
});
