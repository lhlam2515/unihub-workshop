"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

import ROUTES from "@/constants/routes";
import {
  api,
  login as apiLogin,
  logout as apiLogout,
  tokenStore,
  onForcedLogout,
} from "@/lib/api/client";
import { acquireFreshToken } from "@/lib/api/client/auth-session";
import type { Role, User, LoginRequest, LoginResponse } from "@/types/auth";

// Backend returns uppercase roles (STUDENT, BTC, CHECKIN_STAFF).
// Normalize to lowercase (student, btc, checkin_staff) for frontend guards.
function normalizeRole(role: string): Role {
  return role.toLowerCase() as Role;
}

function normalizeUser(raw: User): User {
  return { ...raw, role: normalizeRole(raw.role) };
}

// ---------------------------------------------------------------------------
// State & Context shape
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (credentials: LoginRequest) => Promise<User>;
  logout: () => Promise<void>;
}

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---- Mount: try to restore session via refresh token ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const pathname = window.location.pathname;

      // Skip refresh on login pages — user is explicitly trying to log in
      if (pathname === ROUTES.LOGIN || pathname === ROUTES.ADMIN_LOGIN) {
        return;
      }

      const token = tokenStore.get();
      if (!token) {
        // No in-memory token (e.g. after F5) — try silent refresh via HttpOnly cookie
        try {
          await acquireFreshToken();
        } catch {
          // No valid refresh cookie — user is not authenticated
          return;
        }
      }

      if (cancelled) return;

      // Fetch user profile with the (existing or freshly refreshed) token
      try {
        const profile = await api.get<User>("/auth/me");
        if (!cancelled) setUser(normalizeUser(profile));
      } catch {
        // Profile fetch failed even with a token — user needs to log in
      }
    }

    init().finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Forced logout handler (refresh token invalid) ----
  const handleForcedLogout = useCallback(() => {
    setUser(null);
    const pathname = window.location.pathname;
    // Already on a login page — stay put
    if (pathname === ROUTES.LOGIN || pathname === ROUTES.ADMIN_LOGIN) {
      return;
    }
    router.push(
      pathname.startsWith("/admin") ? ROUTES.ADMIN_LOGIN : ROUTES.LOGIN
    );
  }, [router]);

  useEffect(() => {
    onForcedLogout(handleForcedLogout);
    return () => onForcedLogout(() => {});
  }, [handleForcedLogout]);

  // ---- Actions ----
  const login = useCallback(
    async (credentials: LoginRequest): Promise<User> => {
      const session = await apiLogin<LoginRequest, LoginResponse>(credentials);
      const normalized = normalizeUser(session.user);
      setUser(normalized);
      return normalized;
    },
    []
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.push(ROUTES.LOGIN);
  }, [router]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
