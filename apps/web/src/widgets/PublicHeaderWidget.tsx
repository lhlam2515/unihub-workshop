/**
 * Public header widget — logo, navigation, and conditional auth buttons.
 *
 * Renders in the (public) route group layout. Data (user) is passed as props
 * from the page/layout layer — this widget never fetches.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";

interface PublicHeaderWidgetProps {
  onLoginClick?: () => void;
}

export function PublicHeaderWidget({ onLoginClick }: PublicHeaderWidgetProps) {
  const pathname = usePathname();
  const { user } = useAuth();
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
            <span className="text-muted-foreground text-sm">
              {user.fullName}
            </span>
          ) : (
            <Button asChild size="sm" onClick={onLoginClick}>
              <Link href={ROUTES.LOGIN}>Đăng nhập</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
