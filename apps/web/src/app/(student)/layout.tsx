"use client";

import { useRouter } from "next/navigation";

import { PageLoader } from "@/components/PageLoader";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import { StudentSidebarWidget } from "@/widgets/StudentSidebarWidget";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated || user?.role !== "STUDENT") {
    router.replace(ROUTES.LOGIN);
    return null;
  }

  return (
    <main className="relative bg-white">
      <nav className="border-b p-4">Student Navbar</nav>
      <div className="flex">
        <StudentSidebarWidget />
        <section className="flex-1 bg-gray-50/50">{children}</section>
      </div>
    </main>
  );
}
