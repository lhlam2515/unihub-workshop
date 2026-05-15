import { redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getImportServer } from "@/lib/api/server-services/admin";
import { getServerSession } from "@/lib/auth/server-session";
import { AdminImportDetailWidget } from "@/widgets/AdminImportDetailWidget";

interface PageProps {
  params: Promise<{ importId: string }>;
}

export default async function AdminImportDetailPage({ params }: PageProps) {
  const { importId } = await params;
  const session = await getServerSession();
  if (!session || session.user.role !== "BTC") redirect(ROUTES.ADMIN_LOGIN);

  const result = await getImportServer(importId, session.accessToken);
  const initialResult = result.isSuccess ? result.data : null;
  const initialError = result.isFailure ? String(result.error) : undefined;

  return (
    <AdminImportDetailWidget
      initialResult={initialResult}
      initialError={initialError}
    />
  );
}
