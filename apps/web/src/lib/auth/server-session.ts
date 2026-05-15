import { cookies } from "next/headers";
import { cache } from "react";

import type { User } from "@/types/auth";

export type ServerSession = {
  user: User;
  accessToken: string;
};

const SESSION_COOKIE_NAME = "sessionToken";

/**
 * Get the current server session by reading the client-synced session cookie.
 *
 * The access token is set in a cookie by the client-side AuthProvider after
 * login or silent refresh. This function reads that cookie and validates it
 * via GET /auth/me.
 *
 * Uses React.cache() to deduplicate requests within a single server render pass.
 *
 * @returns The server session (user + accessToken) or null if no valid session cookie exists.
 */
export const getServerSession = cache(
  async (): Promise<ServerSession | null> => {
    const jar = await cookies();
    const accessToken = jar.get(SESSION_COOKIE_NAME)?.value;
    if (!accessToken) return null;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      if (!res.ok) return null;

      const envelope = await res.json();
      if (!envelope.success) return null;
      return { user: envelope.data as User, accessToken };
    } catch {
      return null;
    }
  }
);
