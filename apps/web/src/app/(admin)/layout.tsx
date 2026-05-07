"use client";

import { usePathname, useRouter } from "next/navigation";

import { PageLoader } from "@/components/PageLoader";
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
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  // Admin login page: skip sidebar & role guard
  if (pathname === ROUTES.ADMIN_LOGIN) {
    if (user?.role === "BTC") {
      router.replace(ROUTES.ADMIN);
      return null;
    }
    return <main className="flex min-h-screen flex-col">{children}</main>;
  }

  // Other /admin/* paths: must be BTC
  if (!user || user.role !== "BTC") {
    router.replace(ROUTES.ADMIN_LOGIN);
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebarWidget />
      <div className="flex flex-1 flex-col">
        <nav className="border-b bg-slate-900 p-4 text-white">Admin Topbar</nav>
        <main className="flex-1 bg-slate-100 p-6">{children}</main>
      </div>
    </div>
  );
}
