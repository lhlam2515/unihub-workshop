import { notFound, redirect } from "next/navigation";

import ROUTES from "@/constants/routes";
import { getWorkshopDetailServer } from "@/lib/api/server-services/catalog";
import { getRegistrationServer } from "@/lib/api/server-services/registration";
import { getServerSession } from "@/lib/auth/server-session";
import { PaymentWidget } from "@/widgets/PaymentWidget";

interface PageProps {
  params: Promise<{ registrationId: string }>;
}

export default async function StudentPaymentPage({ params }: PageProps) {
  const { registrationId } = await params;
  const session = await getServerSession();
  if (!session) redirect(ROUTES.LOGIN);

  const result = await getRegistrationServer(
    registrationId,
    session.accessToken
  );
  if (result.isFailure) notFound();

  const registration = result.data;
  if (registration.status !== "PENDING" || !registration.nextStep) {
    redirect(ROUTES.ME_REGISTRATION(registrationId));
  }

  const wsResult = await getWorkshopDetailServer(registration.workshopId);
  const workshop = wsResult.isFailure ? null : wsResult.data;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h1 className="text-2xl font-bold">Thanh toán</h1>
      <PaymentWidget registration={registration} workshop={workshop} />
    </div>
  );
}
