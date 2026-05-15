import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@/types/auth";

export type ServerSession = {
  user: User;
  accessToken: string;
};

/**
 * Get the current server session by refreshing the access token from the refresh token cookie.
 *
 * Uses React.cache() to deduplicate requests within a single server render pass.
 * If multiple Server Components call this function, only one request hits /auth/refresh.
 *
 * @returns The server session (user + accessToken) or null if the refresh token is missing or refresh fails.
 */
export const getServerSession = cache(
  async (): Promise<ServerSession | null> => {
    const jar = await cookies();
    const refreshToken = jar.get("refreshToken")?.value;
    if (!refreshToken) return null;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        {
          method: "POST",
          headers: { Cookie: `refreshToken=${refreshToken}` },
          cache: "no-store",
        }
      );
      if (!res.ok) return null;
      const { data } = await res.json();
      return { user: data.user, accessToken: data.accessToken };
    } catch {
      return null;
    }
  }
);
