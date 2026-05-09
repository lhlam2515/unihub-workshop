import { test, expect } from "@playwright/test";
import { API_BASE } from "../../playwright.config";

test.describe("Auth API", () => {
  const URL = {
    login: `${API_BASE}/auth/login`,
    me: `${API_BASE}/auth/me`,
    logout: `${API_BASE}/auth/logout`,
  };

  test("login as student returns access token", async ({ request }) => {
    const res = await request.post(URL.login, {
      data: {
        accountType: "STUDENT",
        password: "student123",
        studentId: "21127001",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.user).toBeTruthy();
  });

  test("login as admin returns access token", async ({ request }) => {
    const res = await request.post(URL.login, {
      data: {
        accountType: "STAFF",
        password: "admin123",
        email: "hoang.lam@unihub.edu.vn",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
  });

  test("login with wrong password returns 401", async ({ request }) => {
    const res = await request.post(URL.login, {
      data: {
        accountType: "STUDENT",
        password: "wrongpass",
        studentId: "21127001",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("GET /auth/me returns profile with valid token", async ({ request }) => {
    const loginRes = await request.post(URL.login, {
      data: {
        accountType: "STUDENT",
        password: "student123",
        studentId: "21127001",
      },
    });
    const { accessToken } = (await loginRes.json()).data;

    const meRes = await request.get(URL.me, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.data).toHaveProperty("id");
    expect(meBody.data).toHaveProperty("email");
    expect(meBody.data).toHaveProperty("role");
  });

  test("logout returns 204", async ({ request }) => {
    const loginRes = await request.post(URL.login, {
      data: {
        accountType: "STUDENT",
        password: "student123",
        studentId: "21127001",
      },
    });
    const { accessToken } = (await loginRes.json()).data;

    const logoutRes = await request.post(URL.logout, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(logoutRes.status()).toBe(204);
  });
});
