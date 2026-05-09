"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getImportDetail } from "@/lib/api/services/admin";
import type { ImportLog } from "@/types/admin-operations";
import { AdminImportDetailWidget } from "@/widgets/AdminImportDetailWidget";

export default function ImportDetailPage() {
  const params = useParams<{ importId: string }>();
  const [data, setData] = useState<ImportLog | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    getImportDetail(params.importId).then((result) => {
      if (result.isFailure) {
        setError((result.error as { message?: string })?.message);
      } else {
        setData(result.data);
      }
    });
  }, [params.importId]);

  return <AdminImportDetailWidget initialResult={data} initialError={error} />;
}
