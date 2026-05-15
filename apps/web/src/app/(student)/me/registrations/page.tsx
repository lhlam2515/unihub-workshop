import { redirect } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import ROUTES from "@/constants/routes";
import { getServerSession } from "@/lib/auth/server-session";
import { listMyRegistrationsServer } from "@/lib/api/server-services/registration";
import { RegistrationListWidget } from "@/widgets/RegistrationListWidget";

interface PageProps {
  searchParams: Promise<{ status?: string; upcoming?: string }>;
}

export default async function StudentRegistrationHistoryPage({
  searchParams,
}: PageProps) {
  const session = await getServerSession();
  if (!session) redirect(ROUTES.LOGIN);

  const raw = await searchParams;
  const params: { status?: string; upcoming?: boolean } = {};
  if (raw.status) params.status = raw.status;
  if (raw.upcoming === "true") params.upcoming = true;

  const result = await listMyRegistrationsServer(params, session.accessToken);
  const registrations = result.isFailure ? [] : result.data.items;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <PageHeader title="Đăng ký của tôi" />
      <RegistrationListWidget registrations={registrations} />
    </div>
  );
}
