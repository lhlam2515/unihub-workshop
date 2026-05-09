import { test, expect } from "@playwright/test";

const STUDENT_STATE = "playwright/.auth/student.json";
test.use({ storageState: STUDENT_STATE });

test.describe("Flow 1: Workshop listing page", () => {
  test("hiển thị danh sách workshop", async ({ page }) => {
    await page.goto("/workshops");
    await expect(
      page.locator('[data-testid="workshop-card"]').first()
    ).toBeVisible();
    const cards = page.locator('[data-testid="workshop-card"]');
    await expect(cards).not.toHaveCount(0);
  });

  test("mỗi card có thông tin cơ bản", async ({ page }) => {
    await page.goto("/workshops");
    const card = page.locator('[data-testid="workshop-card"]').first();
    await expect(card.locator('[data-testid="workshop-title"]')).toBeVisible();
    await expect(
      card.locator('[data-testid="workshop-speaker"]')
    ).toBeVisible();
    await expect(card.locator('[data-testid="workshop-room"]')).toBeVisible();
  });

  test("search không gây lỗi", async ({ page }) => {
    await page.goto("/workshops?search=xyznonexistent");
    // Page renders — either EmptyState (filtered to 0) or cards (results exist)
    await expect(
      page
        .locator('[data-testid="workshop-card"], [data-testid="empty-state"]')
        .first()
    ).toBeVisible();
  });
});
