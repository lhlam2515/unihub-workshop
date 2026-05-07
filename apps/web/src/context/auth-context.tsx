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
  // Derive initial loading state from token presence to avoid synchronous setState in effect
  const [isLoading, setIsLoading] = useState(() => tokenStore.get() !== null);

  // ---- Mount: check existing token ----
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;

    // Validate existing token & fetch profile
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => {
        // Token invalid / expired — silent refresh will handle this
        // If refresh also fails, onForcedLogout will fire
      })
      .finally(() => setIsLoading(false));
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
