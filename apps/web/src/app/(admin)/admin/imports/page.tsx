export const dynamic = "force-dynamic";

import { listImports } from "@/lib/api/services/admin";
import { AdminImportsListWidget } from "@/widgets/AdminImportsListWidget";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportsPage({ searchParams }: PageProps) {
  const raw = await searchParams;

  const result = await listImports({
    status: (raw.status as string) || undefined,
    cursor: (raw.cursor as string) || undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  });

  if (result.isFailure) {
    return (
      <AdminImportsListWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return <AdminImportsListWidget initialResult={result.data} />;
}
