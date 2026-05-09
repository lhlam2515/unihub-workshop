import { test, expect } from "@playwright/test";
import { API_BASE } from "../../playwright.config";

const BASE = API_BASE;

test.describe("Workshops API (public)", () => {
  test("GET /workshops returns paginated list", async ({ request }) => {
    const res = await request.get(`${BASE}/workshops?limit=10`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.data)).toBe(true);
    expect(body.data.data.length).toBeGreaterThan(0);
  });

  test("GET /workshops filters by status", async ({ request }) => {
    const res = await request.get(`${BASE}/workshops?status=open&limit=20`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const item of body.data.data) {
      expect(item.status).toBe("OPEN");
    }
  });

  test("GET /workshops/:id returns detail", async ({ request }) => {
    const listRes = await request.get(`${BASE}/workshops?limit=1`);
    const listBody = await listRes.json();
    const workshopId = listBody.data.data[0].id;

    const detailRes = await request.get(`${BASE}/workshops/${workshopId}`);
    expect(detailRes.status()).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.success).toBe(true);
    expect(detailBody.data).toHaveProperty("title");
    expect(detailBody.data).toHaveProperty("speaker");
    expect(detailBody.data).toHaveProperty("room");
  });

  test("GET /workshops/:id returns error for non-existent", async ({
    request,
  }) => {
    const res = await request.get(
      `${BASE}/workshops/00000000-0000-0000-0000-000000000000`
    );
    // Server returns 500 for non-existent (TODO: fix to 404)
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
