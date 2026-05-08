import { getRegistration } from "@/features/registration-detail/api/registration-detail.service";
import { getWorkshopDetail } from "@/lib/api/services/catalog";
import type { WorkshopDetail } from "@/types/workshop";
import { RegistrationDetailWidget } from "@/widgets/RegistrationDetailWidget";

const StudentRegistrationDetailPage = async ({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) => {
  const registrationId = (await params).registrationId;

  const regResult = await getRegistration(registrationId);

  let workshop: WorkshopDetail | null = null;
  if (regResult.isSuccess) {
    const wsResult = await getWorkshopDetail(regResult.data.workshopId);
    if (wsResult.isSuccess) workshop = wsResult.data;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <RegistrationDetailWidget
        registration={regResult.isSuccess ? regResult.data : null}
        workshop={workshop}
        payment={null}
        loading={false}
        error={
          regResult.isFailure
            ? ((regResult.error as { message?: string })?.message ??
              "Không thể tải thông tin")
            : undefined
        }
        registrationId={registrationId}
      />
    </div>
  );
};

export default StudentRegistrationDetailPage;
