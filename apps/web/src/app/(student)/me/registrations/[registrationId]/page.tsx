import { getRegistration } from "@/features/registration-detail/api/registration-detail.service";
import { RegistrationDetailWidget } from "@/widgets/RegistrationDetailWidget";

const StudentRegistrationDetailPage = async ({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) => {
  const registrationId = (await params).registrationId;

  const regResult = await getRegistration(registrationId);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <RegistrationDetailWidget
        registration={regResult.isSuccess ? regResult.data : null}
        workshop={null}
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
