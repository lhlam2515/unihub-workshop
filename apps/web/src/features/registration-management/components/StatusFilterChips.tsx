"use client";

import { Button } from "@/components/ui/button";

interface StatusFilterChipsProps {
  activeFilter: { status?: string; upcoming?: boolean };
  onChange: (filter: { status?: string; upcoming?: boolean }) => void;
}

const chips = [
  { key: "all", label: "Tất cả", filter: {} },
  { key: "upcoming", label: "Sắp tới", filter: { upcoming: true } },
  { key: "CANCELLED", label: "Đã hủy", filter: { status: "CANCELLED" } },
  { key: "PENDING", label: "Chờ thanh toán", filter: { status: "PENDING" } },
] as const;

export function StatusFilterChips({
  activeFilter,
  onChange,
}: StatusFilterChipsProps) {
  const isActive = (filter: Record<string, unknown>) => {
    if (filter.upcoming) return activeFilter.upcoming === true;
    if (filter.status) return activeFilter.status === filter.status;
    return !activeFilter.status && !activeFilter.upcoming;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          variant={isActive(chip.filter) ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(chip.filter)}
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
