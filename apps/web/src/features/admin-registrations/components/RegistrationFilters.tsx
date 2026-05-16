"use client";

import { useCallback, useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { RegistrationFilters } from "../lib/types";

interface RegistrationFiltersProps {
  filters: RegistrationFilters;
  onFilterChange: (filters: RegistrationFilters) => void;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "PENDING", label: "Chờ thanh toán" },
  { value: "CANCELLED", label: "Đã hủy" },
] as const;

export function RegistrationFilters({
  filters,
  onFilterChange,
}: RegistrationFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  // Debounce search → onFilterChange
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== (filters.search ?? "")) {
        onFilterChange({ ...filters, search: searchValue || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, filters, onFilterChange]);

  const handleStatusChange = useCallback(
    (value: string) => {
      // Radix Select items must not use an empty string as the value.
      // Use a sentinel value for "all" and map it back to undefined.
      onFilterChange({ ...filters, status: value === "ALL" ? undefined : value });
    },
    [filters, onFilterChange]
  );

  const handleCheckedChange = useCallback(
    (checked: boolean | "indeterminate") => {
      onFilterChange({
        ...filters,
        checkedIn: checked === true ? true : undefined,
      });
    },
    [filters, onFilterChange]
  );

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={filters.status ?? "ALL"} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Tất cả trạng thái" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Checkbox
          id="checked-in"
          checked={filters.checkedIn ?? false}
          onCheckedChange={handleCheckedChange}
        />
        <label htmlFor="checked-in" className="text-sm font-medium">
          Đã check-in
        </label>
      </div>

      <Input
        placeholder="Tìm kiếm..."
        className="h-9 w-48"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
      />
    </div>
  );
}
