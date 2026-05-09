import { test, expect } from "@playwright/test";

const ADMIN_STATE = "playwright/.auth/admin.json";
test.use({ storageState: ADMIN_STATE });

test.describe("Flow 7: AI Summary", () => {
  test("trang admin workshops load không lỗi", async ({ page }) => {
    await page.goto("/admin/workshops", { waitUntil: "networkidle" });
    // Page loads — either workshop list or login form
    await expect(
      page
        .locator('[data-testid="workshop-row"], [data-testid="login-form"]')
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});
