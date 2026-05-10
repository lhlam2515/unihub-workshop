"use client";

import { useParams } from "next/navigation";

import { useAsyncQuery } from "@/hooks/use-async-query";
import { getImportDetail } from "@/lib/api/services/admin";
import { AdminImportDetailWidget } from "@/widgets/AdminImportDetailWidget";

export default function ImportDetailPage() {
  const { importId } = useParams<{ importId: string }>();
  const { data, error } = useAsyncQuery(["admin-import", importId], () =>
    getImportDetail(importId)
  );

  return (
    <AdminImportDetailWidget
      initialResult={data ?? null}
      initialError={error?.message}
    />
  );
}
