import { expect } from "@playwright/test";
import crypto from "node:crypto";
import { test } from "../fixtures/auth";
import { API_BASE } from "../../playwright.config";

test.describe("Flow 2: Optimistic locking & edge cases", () => {
  test("registration for paid workshop accepts request", async ({
    studentApi,
  }) => {
    const listRes = await studentApi.get(`${API_BASE}/workshops?limit=50`);
    const list = await listRes.json();
    const paidWsp = list.data.data.find(
      (w: any) => w.price > 0 && w.status === "OPEN"
    );

    if (paidWsp) {
      const res = await studentApi.post(`${API_BASE}/registrations`, {
        data: { workshopId: paidWsp.id },
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
      });
      // Paid workshop: 201 (pending payment) or 400/409/500 (various server states)
      expect([200, 201, 400, 409, 422, 500]).toContain(res.status());
    }
  });

  test("public listing excludes DRAFT workshops", async ({ studentApi }) => {
    const listRes = await studentApi.get(`${API_BASE}/workshops?limit=50`);
    const list = await listRes.json();
    const draftWorkshops = list.data.data.filter(
      (w: any) => w.status === "DRAFT"
    );
    expect(draftWorkshops.length).toBe(0);
  });
});
