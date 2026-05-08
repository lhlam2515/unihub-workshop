export const dynamic = "force-dynamic";

import { getCircuitBreakers } from "@/lib/api/services/admin";
import { AdminSystemWidget } from "@/widgets/AdminSystemWidget";

export default async function AdminSystemPage() {
  const result = await getCircuitBreakers();

  if (result.isFailure) {
    return (
      <AdminSystemWidget
        initialCB={null}
        initialReconcileInfo={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return (
    <AdminSystemWidget initialCB={result.data} initialReconcileInfo={null} />
  );
}
