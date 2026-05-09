import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { API_BASE } from "../../playwright.config";

test.describe("Flow 5+6: Admin workshop management", () => {
  test("admin can list rooms", async ({ adminApi }) => {
    const roomsRes = await adminApi.get(`${API_BASE}/admin/rooms`);
    expect(roomsRes.status()).toBe(200);
    const body = await roomsRes.json();
    expect(body.success).toBe(true);
    // Rooms returns array directly in body.data (non-paginated)
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("admin can list speakers", async ({ adminApi }) => {
    const speakersRes = await adminApi.get(`${API_BASE}/admin/speakers`);
    expect(speakersRes.status()).toBe(200);
    const body = await speakersRes.json();
    expect(body.success).toBe(true);
    // Speakers returns array directly in body.data (non-paginated)
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("student cannot access admin endpoints", async ({ studentApi }) => {
    const res = await studentApi.get(`${API_BASE}/admin/workshops`);
    expect([401, 403]).toContain(res.status());
  });
});
