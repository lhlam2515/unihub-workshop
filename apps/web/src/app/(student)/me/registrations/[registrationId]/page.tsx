"use client";

import { use, useEffect, useState } from "react";

import { getRegistration } from "@/features/registration-detail/api/registration-detail.service";
import { getWorkshopDetail } from "@/lib/api/services/catalog";
import type { ApiError } from "@/lib/api/errors";
import type { Registration } from "@/types/registration";
import type { WorkshopDetail } from "@/types/workshop";
import { RegistrationDetailWidget } from "@/widgets/RegistrationDetailWidget";

const StudentRegistrationDetailPage = ({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) => {
  const { registrationId } = use(params);

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    async function load() {
      const regResult = await getRegistration(registrationId);
      if (regResult.isFailure) {
        setError(
          (regResult.error as ApiError)?.message ?? "Không thể tải thông tin"
        );
        setLoading(false);
        return;
      }
      setRegistration(regResult.data);

      const wsResult = await getWorkshopDetail(regResult.data.workshopId);
      if (wsResult.isSuccess) {
        setWorkshop(wsResult.data);
      }
      setLoading(false);
    }
    load();
  }, [registrationId]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <RegistrationDetailWidget
        registration={registration}
        workshop={workshop}
        payment={null}
        loading={loading}
        error={error}
        registrationId={registrationId}
      />
    </div>
  );
};

export default StudentRegistrationDetailPage;
