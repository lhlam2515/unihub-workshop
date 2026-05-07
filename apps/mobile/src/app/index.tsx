import { Redirect } from "expo-router";

import ROUTES from "@/constants/routes";
import { offlineAuth } from "@/lib/api/client/offline-auth";

export default function Index() {
  // tokenStore.init() is called in _layout.tsx before this renders.
  // Check JWT validity locally (no network) to skip re-login for active sessions.
  const isAuthenticated = offlineAuth.isTokenValidLocally();

  return <Redirect href={isAuthenticated ? ROUTES.TABS : ROUTES.LOGIN} />;
}
