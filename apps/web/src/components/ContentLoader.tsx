import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ContentLoaderProps {
  count?: number;
  layout?: "list" | "grid";
  className?: string;
}

export function ContentLoader({
  count = 3,
  layout = "list",
  className,
}: ContentLoaderProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (layout === "grid") {
    return (
      <div
        className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      >
        {items.map((i) => (
          <div key={i} className="rounded-xl border p-4">
            <Skeleton className="mb-3 h-40 w-full rounded-lg" />
            <Skeleton className="mb-2 h-4 w-3/4" />
            <Skeleton className="mb-1 h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
