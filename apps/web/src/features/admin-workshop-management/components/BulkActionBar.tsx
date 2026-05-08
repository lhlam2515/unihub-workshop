import { Button } from "@/components/ui/button";
import type { WorkshopStatus } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkActionBarProps {
  selectedIds: Set<string>;
  selectedStatuses: WorkshopStatus[];
  onPublish: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionBar({
  selectedIds,
  selectedStatuses,
  onPublish,
  onCancel,
  isLoading,
}: BulkActionBarProps) {
  const count = selectedIds.size;
  if (count === 0) return null;

  const allDraft = selectedStatuses.every((s) => s === "DRAFT");
  const allOpenOrClosed = selectedStatuses.every(
    (s) => s === "OPEN" || s === "COMPLETED"
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-xs">
      <span className="text-sm font-medium text-slate-600">
        Đã chọn <span className="text-slate-900">{count}</span> workshop
      </span>

      <div className="ml-auto flex gap-2">
        {allDraft && (
          <Button
            size="sm"
            variant="default"
            onClick={onPublish}
            disabled={isLoading}
          >
            {isLoading ? "Đang xử lý..." : "Công bố"}
          </Button>
        )}

        {allOpenOrClosed && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onCancel}
            disabled={isLoading}
          >
            {isLoading ? "Đang xử lý..." : "Hủy"}
          </Button>
        )}

        {!allDraft && !allOpenOrClosed && (
          <p className="text-xs text-slate-400">
            Chỉ có thể công bố bản nháp hoặc hủy workshop đã mở
          </p>
        )}
      </div>
    </div>
  );
}
