import path from "path";

import { defineConfig, devices } from "@playwright/test";

export const API_BASE = "http://localhost:8000/api/v1";
export const WEB_BASE = "http://localhost:3000";

export const STORAGE_STATE = {
  student: path.resolve(__dirname, "playwright/.auth/student.json"),
  admin: path.resolve(__dirname, "playwright/.auth/admin.json"),
};

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 15_000 },

  globalSetup: "./playwright/global-setup.ts",
  globalTeardown: "./playwright/global-teardown.ts",

  webServer: [
    {
      command: "pnpm dev:server",
      port: 8000,
      reuseExistingServer: !process.env.CI,
      cwd: path.resolve(__dirname, "../.."),
      timeout: 60_000,
    },
    {
      command: "pnpm dev:web",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      cwd: path.resolve(__dirname, "../.."),
      timeout: 60_000,
    },
  ],

  projects: [
    {
      name: "setup",
      testMatch: "**/*.setup.ts",
      use: { baseURL: WEB_BASE },
    },
    {
      name: "api",
      testMatch: "api/**/*.spec.ts",
      dependencies: ["setup"],
      use: {
        baseURL: API_BASE,
        extraHTTPHeaders: { "Content-Type": "application/json" },
      },
    },
    {
      name: "ui-chromium",
      testMatch: "ui/**/*.spec.ts",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: WEB_BASE,
        storageState: STORAGE_STATE.student,
      },
    },
  ],

  reporter: process.env.CI
    ? [["html", { outputFolder: "playwright-report" }], ["github"]]
    : [["html", { open: "never" }]],
});
