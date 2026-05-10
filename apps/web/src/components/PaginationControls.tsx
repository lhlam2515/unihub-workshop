import { Loader2 } from "lucide-react";
import { memo } from "react";

import type { PaginationMeta } from "@/lib/api/types";

interface PaginationControlsProps {
  pagination: PaginationMeta;
  onLoadMore: () => void;
  isLoading?: boolean;
}

export const PaginationControls = memo(function PaginationControls({
  pagination,
  onLoadMore,
  isLoading = false,
}: PaginationControlsProps) {
  if (!pagination.hasMore) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      {pagination.total !== null && (
        <p className="text-muted-foreground text-xs">
          Đã hiển thị {pagination.limit} / {pagination.total}
        </p>
      )}
      <button
        type="button"
        disabled={isLoading}
        onClick={onLoadMore}
        className="bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isLoading ? "Đang tải..." : "Tải thêm"}
      </button>
    </div>
  );
});
