import { PageHeader } from "@/components/PageHeader";
import { listMyRegistrations } from "@/features/registration-management/api/registration.service";
import { RegistrationListWidget } from "@/widgets/RegistrationListWidget";

const StudentRegistrationHistoryPage = async () => {
  const result = await listMyRegistrations();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <PageHeader title="Đăng ký của tôi" />

      <RegistrationListWidget
        initialResult={result.isSuccess ? result.data : null}
        initialError={
          result.isFailure
            ? ((result.error as { message?: string })?.message ??
              "Không thể tải danh sách")
            : undefined
        }
      />
    </div>
  );
};

export default StudentRegistrationHistoryPage;
