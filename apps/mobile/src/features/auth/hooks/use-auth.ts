import { eq } from "drizzle-orm";
import { router } from "expo-router";
import { jwtDecode } from "jwt-decode";
import { useState } from "react";

import ROUTES from "@/constants/routes";
import { createDatabaseClient } from "@/database/client";
import { appSession } from "@/database/schema/app-session.schema";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import { authService } from "@/features/auth/api/auth.service";
import { logout } from "@/lib/api/client";
import { offlineAuth } from "@/lib/api/client/offline-auth";
import type { UniHubJwtPayload } from "@/lib/api/client/offline-auth";
import handleError from "@/lib/handlers/error";

import type { LoginStatus, UseAuthResult } from "../lib/types";

/**
 * Hook quản lý xác thực CHECKIN_STAFF.
 *
 * Xử lý toàn bộ lifecycle: đăng nhập → persist session → đăng xuất.
 */
export function useAuth(): UseAuthResult {
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const session = offlineAuth.getTokenPayload();

  async function login(email: string, password: string) {
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Vui lòng nhập email và mật khẩu.");
      return;
    }

    setLoginStatus("loading");
    setErrorMessage(null);

    const result = await authService.loginWithCredentials({
      accountType: "STAFF",
      email: email.trim(),
      password,
    });

    if (result.isFailure) {
      setLoginStatus("error");
      const appError = handleError(result.error);
      setErrorMessage(appError.message);
      return;
    }

    // Persist session locally for offline access
    const sessionData = result.data;
    try {
      const payload = jwtDecode<UniHubJwtPayload>(sessionData.accessToken);
      const db = createDatabaseClient();
      db.insert(appSession)
        .values({
          id: 1,
          userId: payload.sub,
          email: email.trim(),
          role: "CHECKIN_STAFF",
          allowedWorkshopIds: JSON.stringify(payload.allowedWorkshopIds ?? []),
          accessTokenExp: payload.exp,
          refreshTokenExp: Math.floor(Date.now() / 1000) + 7 * 86400,
          loggedInAt: Date.now(),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: appSession.id,
          set: {
            userId: payload.sub,
            email: email.trim(),
            allowedWorkshopIds: JSON.stringify(
              payload.allowedWorkshopIds ?? []
            ),
            accessTokenExp: payload.exp,
            updatedAt: Date.now(),
          },
        })
        .run();
    } catch {
      // Non-critical: session still works, just no local persistence
    }

    setLoginStatus("success");
    router.replace(ROUTES.TABS);
  }

  function getPendingQueueCount(): number {
    try {
      const db = createDatabaseClient();
      return db
        .select()
        .from(checkinQueue)
        .where(eq(checkinQueue.syncStatus, "PENDING"))
        .all().length;
    } catch {
      return 0;
    }
  }

  async function doLogout() {
    setIsLoggingOut(true);
    await logout();
    router.replace(ROUTES.LOGIN);
  }

  return {
    session,
    loginStatus,
    errorMessage,
    isLoggingOut,
    login,
    getPendingQueueCount,
    logout: doLogout,
  };
}
