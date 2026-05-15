import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getWorkshopDetailServer } from "@/lib/api/server-services/catalog";
import { getRegistrationServer } from "@/lib/api/server-services/registration";
import { getServerSession } from "@/lib/auth/server-session";
import { RegistrationDetailWidget } from "@/widgets/RegistrationDetailWidget";

interface PageProps {
  params: Promise<{ registrationId: string }>;
}

export default async function StudentRegistrationDetailPage({
  params,
}: PageProps) {
  const { registrationId } = await params;
  const session = await getServerSession();
  if (!session) redirect(ROUTES.LOGIN);

  const regResult = await getRegistrationServer(
    registrationId,
    session.accessToken
  );
  if (regResult.isFailure) notFound();

  const registration = regResult.data;
  const wsResult = await getWorkshopDetailServer(registration.workshopId);
  const workshop = wsResult.isFailure ? null : wsResult.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <RegistrationDetailWidget
        registration={registration}
        workshop={workshop}
        registrationId={registrationId}
      />
    </div>
  );
}
