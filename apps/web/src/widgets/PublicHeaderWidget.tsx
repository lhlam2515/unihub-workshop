/**
 * Public header widget — logo, navigation, and conditional auth buttons.
 *
 * Renders in the (public) route group layout. Data (user) is passed as props
 * from the page/layout layer — this widget never fetches.
 */

"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";

export function PublicHeaderWidget() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isActive = pathname.startsWith(ROUTES.WORKSHOPS);

  return (
    <header className="bg-background sticky top-0 z-50 w-full border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="text-lg font-bold tracking-tight">
          UniHub
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-6">
          <Link
            href={ROUTES.WORKSHOPS}
            className={`hover:text-primary text-sm font-medium transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Workshops
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
                  {user.fullName}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{user.fullName}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {user.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                {user?.role === "STUDENT" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link
                        href={ROUTES.ME_REGISTRATIONS}
                        className="cursor-pointer"
                      >
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Đăng ký của tôi
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => logout()}>
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm">
              <Link href={ROUTES.LOGIN}>Đăng nhập</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
