"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { listMyRegistrations } from "@/features/registration-management/api/registration.service";
import type { ApiError } from "@/lib/api/errors";
import type { RegistrationListItem } from "@/types/registration";
import { RegistrationListWidget } from "@/widgets/RegistrationListWidget";

const StudentRegistrationHistoryPage = () => {
  const [registrations, setRegistrations] = useState<RegistrationListItem[]>(
    []
  );
  const [filter, setFilter] = useState<{ status?: string; upcoming?: boolean }>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await listMyRegistrations();
      if (result.isSuccess) {
        setRegistrations(result.data.items);
      } else {
        setError(
          (result.error as ApiError)?.message ?? "Không thể tải danh sách"
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleFilterChange = async (newFilter: {
    status?: string;
    upcoming?: boolean;
  }) => {
    setFilter(newFilter);
    setLoading(true);
    setError(null);

    const params: Record<string, string | boolean | number> = {};
    if (newFilter.status) params.status = newFilter.status;
    if (newFilter.upcoming) params.upcoming = true;

    const result = await listMyRegistrations(params);
    if (result.isSuccess) {
      setRegistrations(result.data.items);
    } else {
      setError(
        (result.error as ApiError)?.message ?? "Không thể tải danh sách"
      );
    }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <PageHeader title="Đăng ký của tôi" />
      <RegistrationListWidget
        registrations={registrations}
        filter={filter}
        onFilterChange={handleFilterChange}
        loading={loading}
        error={error}
      />
    </div>
  );
};

export default StudentRegistrationHistoryPage;
