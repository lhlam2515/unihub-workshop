import { cn } from "@/lib/utils";

type StatusVariant = "workshop" | "registration" | "payment";

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
}

const variantMap: Record<StatusVariant, Record<string, string>> = {
  workshop: {
    DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
    PUBLISHED: "bg-blue-50 text-blue-700 border-blue-200",
    OPEN: "bg-green-50 text-green-700 border-green-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    COMPLETED: "bg-purple-50 text-purple-700 border-purple-200",
  },
  registration: {
    PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
    CONFIRMED: "bg-green-50 text-green-700 border-green-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    CHECKED_IN: "bg-blue-50 text-blue-700 border-blue-200",
  },
  payment: {
    PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
    PAID: "bg-green-50 text-green-700 border-green-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
    REFUNDED: "bg-purple-50 text-purple-700 border-purple-200",
    EXPIRED: "bg-gray-100 text-gray-700 border-gray-300",
  },
};

const fallbackStyle = "bg-gray-100 text-gray-700 border-gray-300";

export function StatusBadge({
  status,
  variant = "registration",
  className,
}: StatusBadgeProps) {
  const colorClass = variantMap[variant]?.[status] ?? fallbackStyle;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {status}
    </span>
  );
}
