import { test as base, type APIRequestContext } from "@playwright/test";

import { createAuthenticatedContext } from "../lib/api-context";

type AuthFixtures = {
  studentApi: APIRequestContext;
  adminApi: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  studentApi: async ({}, use) => {
    const { context } = await createAuthenticatedContext("student");
    await use(context);
    await context.dispose();
  },

  adminApi: async ({}, use) => {
    const { context } = await createAuthenticatedContext("admin");
    await use(context);
    await context.dispose();
  },
});

export { expect } from "@playwright/test";
