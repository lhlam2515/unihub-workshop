import { NextResponse } from "next/server";

import ROUTES from "@/constants/routes";

import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  if (!refreshToken) {
    const loginUrl = pathname.startsWith("/admin")
      ? ROUTES.ADMIN_LOGIN
      : ROUTES.LOGIN;
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Negative lookahead excludes /admin/login from protection
  matcher: ["/admin/((?!login).*)", "/me/:path*"],
};
