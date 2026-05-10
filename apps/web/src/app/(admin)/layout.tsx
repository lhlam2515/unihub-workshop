"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import { AdminSidebarWidget } from "@/widgets/AdminSidebarWidget";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  // Handle redirects after render
  useEffect(() => {
    // Admin login page: skip sidebar & role guard
    if (pathname === ROUTES.ADMIN_LOGIN) {
      if (user?.role === "btc") {
        router.replace(ROUTES.ADMIN);
      }
      return;
    }

    // Other /admin/* paths: must be BTC
    if (!user || user.role !== "btc") {
      router.replace(ROUTES.ADMIN_LOGIN);
    }
  }, [pathname, user, router]);

  if (isLoading) {
    return <PageLoader />;
  }

  // While redirecting unauthorized users, show loader
  if (pathname !== ROUTES.ADMIN_LOGIN && (!user || user.role !== "btc")) {
    return <PageLoader />;
  }

  // Admin login page
  if (pathname === ROUTES.ADMIN_LOGIN) {
    return <main className="flex min-h-screen flex-col">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebarWidget />
      <div className="flex flex-1 flex-col">
        <nav className="flex items-center justify-between border-b bg-slate-900 p-4 text-white">
          <span className="font-semibold">Admin</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-slate-300 hover:text-white"
            >
              <LogOut className="mr-1 h-4 w-4" />
              Đăng xuất
            </Button>
          </div>
        </nav>
        <main className="flex-1 bg-slate-100 p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
