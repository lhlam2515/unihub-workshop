export const dynamic = "force-dynamic";

import { getImportDetail } from "@/lib/api/services/admin";
import { AdminImportDetailWidget } from "@/widgets/AdminImportDetailWidget";

interface PageProps {
  params: Promise<{ importId: string }>;
}

export default async function ImportDetailPage({ params }: PageProps) {
  const { importId } = await params;
  const result = await getImportDetail(importId);

  if (result.isFailure) {
    return (
      <AdminImportDetailWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return <AdminImportDetailWidget initialResult={result.data} />;
}
