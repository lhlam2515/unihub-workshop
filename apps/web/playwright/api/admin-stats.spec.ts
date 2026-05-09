import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { API_BASE } from "../../playwright.config";

test.describe("Flow 9: Admin statistics", () => {
  test("GET /admin/workshops/:id/stats returns drill-down", async ({
    adminApi,
  }) => {
    const listRes = await adminApi.get(`${API_BASE}/admin/workshops?limit=10`);
    const list = await listRes.json();
    if (list.data?.data?.length > 0) {
      const wsId = list.data.data[0].id;
      const detailRes = await adminApi.get(
        `${API_BASE}/admin/workshops/${wsId}/stats`
      );
      expect(detailRes.status()).toBe(200);
      const body = await detailRes.json();
      expect(body.success).toBe(true);
    }
  });
});
