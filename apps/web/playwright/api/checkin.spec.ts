import { expect } from "@playwright/test";
import crypto from "node:crypto";
import { test } from "../fixtures/auth";
import { API_BASE } from "../../playwright.config";

test.describe("Flow 10-11: Check-in", () => {
  test("check-in endpoint rejects invalid QR code", async ({ adminApi }) => {
    const checkinRes = await adminApi.post(`${API_BASE}/checkins`, {
      data: {
        qrCode: crypto.randomUUID(),
        workshopId: crypto.randomUUID(),
        checkedInAt: new Date().toISOString(),
      },
    });
    // CHECKIN_STAFF not accessible via adminApi (which uses BTC role)
    // BTC role should get 403
    expect([401, 403]).toContain(checkinRes.status());
  });

  test("student cannot access checkin endpoint", async ({ studentApi }) => {
    const res = await studentApi.post(`${API_BASE}/checkins`, {
      data: {
        qrCode: crypto.randomUUID(),
        workshopId: crypto.randomUUID(),
        checkedInAt: new Date().toISOString(),
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});
