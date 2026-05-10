import { request, type APIRequestContext } from "@playwright/test";

import { API_BASE } from "../../playwright.config";

export type TestUser = "student" | "admin";

const CREDENTIALS: Record<
  TestUser,
  { accountType: string; password: string; studentId?: string; email?: string }
> = {
  student: {
    accountType: "STUDENT",
    password: "student123",
    studentId: "21127001",
  },
  admin: {
    accountType: "STAFF",
    password: "admin123",
    email: "hoang.lam@unihub.edu.vn",
  },
};

/**
 * Login via native fetch (bypasses Playwright request context issues)
 * and return an authenticated APIRequestContext with Bearer token.
 */
export async function createAuthenticatedContext(
  user: TestUser
): Promise<{ context: APIRequestContext; accessToken: string }> {
  const creds = CREDENTIALS[user];
  const loginUrl = `${API_BASE}/auth/login`;

  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const body = await loginRes.json();

  const accessToken: string = body.data?.accessToken;
  if (!accessToken) {
    throw new Error(`Login failed for ${user}: ${JSON.stringify(body)}`);
  }

  const authCtx = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return { context: authCtx, accessToken };
}
