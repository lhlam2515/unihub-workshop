import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 Proxy — replaces middleware.ts.
 *
 * Binary auth gate: checks for the presence of the `refreshToken` HttpOnly cookie.
 * Role-level access control is handled by React layout guards, not here.
 *
 * Proxy runs in `nodejs` runtime by default (edge NOT supported per Next.js 16 docs).
 */

const ALLOW_UNAUTH = new Set(["/", "/login", "/payment-result"]);

/** Path prefix patterns that deny unauthenticated access */
const REQUIRE_AUTH_PREFIXES = ["/me/", "/admin/"];

/** Refresh token cookie name (set by backend on /auth/login) */
const REFRESH_COOKIE = "refreshToken";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ---- 1. Always allow public paths ----
  if (ALLOW_UNAUTH.has(pathname)) {
    return NextResponse.next();
  }

  // Allow public workshop paths (without trailing /)
  if (pathname.startsWith("/workshops")) {
    return NextResponse.next();
  }

  // ---- 2. Check refresh token for protected prefixes ----
  const isProtected = REQUIRE_AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected) {
    const hasRefreshToken = request.cookies.has(REFRESH_COOKIE);

    if (!hasRefreshToken) {
      // Determine correct login URL based on the prefix
      const loginUrl = pathname.startsWith("/admin")
        ? "/admin/login"
        : "/login";
      return NextResponse.redirect(new URL(loginUrl, request.url));
    }
  }

  // ---- 3. Everything else passes ----
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all request paths except static assets and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
