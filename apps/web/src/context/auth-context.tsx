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
import { acquireFreshToken } from "@/lib/api/client/auth-session";
import {
  api,
  login as apiLogin,
  logout as apiLogout,
  tokenStore,
  onForcedLogout,
} from "@/lib/api/client";
import type { User, LoginRequest, LoginResponse } from "@/types/auth";

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
        if (!cancelled) setUser(profile);
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
    router.push(ROUTES.LOGIN);
  }, [router]);

  useEffect(() => {
    onForcedLogout(handleForcedLogout);
    return () => onForcedLogout(() => {});
  }, [handleForcedLogout]);

  // ---- Actions ----
  const login = useCallback(
    async (credentials: LoginRequest): Promise<User> => {
      const session = await apiLogin<LoginRequest, LoginResponse>(credentials);
      setUser(session.user);
      return session.user;
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
