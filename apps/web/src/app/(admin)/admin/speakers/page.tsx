import { listSpeakers } from "@/lib/api/services/admin";
import { AdminSpeakerListWidget } from "@/widgets/AdminSpeakerListWidget";

export default async function AdminSpeakerListPage() {
  const result = await listSpeakers();

  if (result.isFailure) {
    return (
      <AdminSpeakerListWidget
        initialResult={null}
        initialError={(result.error as { message?: string })?.message}
      />
    );
  }

  return <AdminSpeakerListWidget initialResult={result.data} />;
}
