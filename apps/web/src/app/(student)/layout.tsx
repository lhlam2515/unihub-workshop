"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "STUDENT") {
      router.replace(ROUTES.LOGIN);
    }
  }, [isAuthenticated, user?.role, router]);

  if (isLoading) {
    return <PageLoader />;
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
