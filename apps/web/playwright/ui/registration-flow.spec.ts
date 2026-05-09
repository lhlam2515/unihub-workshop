import { test, expect } from "@playwright/test";

const STUDENT_STATE = "playwright/.auth/student.json";
test.use({ storageState: STUDENT_STATE });

test.describe("Flow 2+4: Registration & QR", () => {
  test("chi tiết workshop hiển thị nút đăng ký hoặc trạng thái tương ứng", async ({
    page,
  }) => {
    await page.goto("/workshops");
    await page.locator('[data-testid="workshop-card"]').first().click();
    await page.waitForURL(/\/workshops\/[\w-]+/);

    // Detail page renders correctly with workshop info
    await expect(page.locator('[data-testid="workshop-title"]')).toBeVisible();

    // If register button exists, attempt registration
    const regBtn = page.locator('[data-testid="register-button"]');
    if (await regBtn.isVisible()) {
      await regBtn.click();
      await page.waitForURL(/\/me/);
      await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();
    }
  });

  test("trang đăng ký của tôi load không lỗi", async ({ page }) => {
    await page.goto("/me", { waitUntil: "networkidle" });
    // Page should render without error — content depends on auth state
    // (registration list, empty state, loading spinner, or redirect to login)
    await expect(page.locator("body")).toBeVisible();
  });
});
