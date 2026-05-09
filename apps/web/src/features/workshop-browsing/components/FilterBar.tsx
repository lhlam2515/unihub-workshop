"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkshopFilters } from "@/types/workshop";

import type { ChangeEvent } from "react";

interface FilterBarProps {
  filters: WorkshopFilters;
  onChange: (filters: WorkshopFilters) => void;
}

const SORT_OPTIONS = [
  { value: "starts_at", label: "Thời gian (sớm nhất)" },
  { value: "-starts_at", label: "Thời gian (muộn nhất)" },
  { value: "seats_available", label: "Còn chỗ" },
] as const;

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [searchValue, setSearchValue] = useState(filters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFilter = useCallback(
    (patch: Partial<WorkshopFilters>) => {
      onChange({ ...filters, ...patch, cursor: undefined });
    },
    [filters, onChange]
  );

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateFilter({ q: value || undefined });
      }, 300);
    },
    [updateFilter]
  );

  const clearFilters = useCallback(() => {
    setSearchValue("");
    onChange({});
  }, [onChange]);

  const hasActiveFilters =
    filters.day || filters.hasSeats || filters.sort || filters.q;

  return (
    <div className="flex flex-col gap-3">
      {/* Search + Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Tìm workshop..."
            value={searchValue}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        {/* Day filter */}
        <Input
          type="date"
          value={filters.day ?? ""}
          onChange={(e) => updateFilter({ day: e.target.value || undefined })}
          className="w-44"
        />

        {/* Has seats toggle */}
        <Button
          variant={filters.hasSeats ? "default" : "outline"}
          size="sm"
          onClick={() => updateFilter({ hasSeats: !filters.hasSeats })}
          className="gap-1.5"
        >
          <SlidersHorizontal className="size-4" />
          Còn chỗ
        </Button>

        {/* Sort */}
        <Select
          value={filters.sort ?? "starts_at"}
          onValueChange={(value) =>
            updateFilter({ sort: value === "starts_at" ? undefined : value })
          }
        >
          <SelectTrigger className="w-48" aria-label="Sắp xếp">
            <SelectValue placeholder="Sắp xếp" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active filters badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Bộ lọc:</span>
          {filters.day && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => updateFilter({ day: undefined })}
            >
              {filters.day} &times;
            </Badge>
          )}
          {filters.hasSeats && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => updateFilter({ hasSeats: undefined })}
            >
              Còn chỗ &times;
            </Badge>
          )}
          {filters.sort && filters.sort !== "starts_at" && (
            <Badge variant="secondary">
              {SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}
            </Badge>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-muted-foreground hover:text-foreground ml-1 text-xs underline underline-offset-2 transition-colors"
          >
            Xóa tất cả
          </button>
        </div>
      )}
    </div>
  );
}
