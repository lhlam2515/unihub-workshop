"use client";

import { useRouter } from "next/navigation";

import { PageLoader } from "@/components/PageLoader";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import { PublicHeaderWidget } from "@/widgets/PublicHeaderWidget";

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

  if (!isAuthenticated || user?.role !== "student") {
    router.replace(ROUTES.LOGIN);
    return null;
  }

  return (
    <>
      <PublicHeaderWidget />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
