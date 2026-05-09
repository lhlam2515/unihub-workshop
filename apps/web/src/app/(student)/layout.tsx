"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";


import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import { StudentSidebarWidget } from "@/widgets/StudentSidebarWidget";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated || user?.role !== "student") {
    router.replace(ROUTES.LOGIN);
    return null;
  }

  return (
    <main className="relative bg-white">
      <nav className="flex items-center justify-between border-b p-4">
        <span className="font-semibold">Sinh viên</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {user?.fullName}
          </span>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="mr-1 h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </nav>
      <div className="flex">
        <StudentSidebarWidget />
        <section className="flex-1 bg-gray-50/50">{children}</section>
      </div>
    </main>
  );
}
