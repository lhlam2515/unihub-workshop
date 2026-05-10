import { test as setup } from "@playwright/test";

import { STORAGE_STATE } from "../../playwright.config";
import { API_BASE } from "../../playwright.config";

setup("authenticate as student", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[name="studentId"]', "21127001");
  await page.fill('[name="password"]', "student123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/workshops");
  await page.context().storageState({ path: STORAGE_STATE.student });
});

setup("authenticate as admin", async ({ page }) => {
  // Login via API so browser gets the refreshToken cookie
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      accountType: "STAFF",
      password: "admin123",
      email: "hoang.lam@unihub.edu.vn",
    },
  });
  const body = await res.json();
  console.log(`[setup] Admin login: ${res.status()} success=${body.success}`);

  // Navigate to admin — AuthProvider reads refreshToken cookie, acquires access token
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.context().storageState({ path: STORAGE_STATE.admin });
});
