"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

import type { ChangeEvent } from "react";

const SORT_OPTIONS = [
  { value: "starts_at", label: "Thời gian (sớm nhất)" },
  { value: "-starts_at", label: "Thời gian (muộn nhất)" },
  { value: "seats_available", label: "Còn chỗ" },
] as const;

/**
 * URL-driven filter bar for the public workshops listing page.
 *
 * Reads current filter values from `useSearchParams()` and writes updates
 * back to the URL via `useRouter().replace()`, triggering an RSC re-render
 * of the parent page with the new params — no callback prop needed.
 *
 * Side effects:
 * - Calls `router.replace()` on every filter change, updating the URL and
 *   causing the server page to re-fetch with the new query params.
 */
export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentQ = searchParams.get("q") ?? "";
  const currentDay = searchParams.get("day") ?? "";
  const currentHasSeats = searchParams.get("hasSeats") === "true";
  const currentSort = searchParams.get("sort") ?? "starts_at";

  const [searchValue, setSearchValue] = useState(currentQ);

  /**
   * Builds a new URLSearchParams from the current params merged with the given
   * patch, then navigates to the updated URL without pushing a history entry.
   *
   * @param patch - Partial record of param keys to set or delete (undefined removes the key).
   */
  const updateUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset cursor on any filter change
      params.delete("cursor");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`/workshops?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateUrl({ q: value || undefined });
      }, 300);
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    setSearchValue("");
    router.replace("/workshops");
  }, [router]);

  const hasActiveFilters =
    currentDay ||
    currentHasSeats ||
    (currentSort && currentSort !== "starts_at") ||
    currentQ;

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
          value={currentDay}
          onChange={(e) => updateUrl({ day: e.target.value || undefined })}
          className="w-44"
        />

        {/* Has seats toggle */}
        <Button
          variant={currentHasSeats ? "default" : "outline"}
          size="sm"
          onClick={() =>
            updateUrl({ hasSeats: currentHasSeats ? undefined : "true" })
          }
          className="gap-1.5"
        >
          <SlidersHorizontal className="size-4" />
          Còn chỗ
        </Button>

        {/* Sort */}
        <Select
          value={currentSort}
          onValueChange={(value) =>
            updateUrl({ sort: value === "starts_at" ? undefined : value })
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
          {currentDay && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => updateUrl({ day: undefined })}
            >
              {currentDay} &times;
            </Badge>
          )}
          {currentHasSeats && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => updateUrl({ hasSeats: undefined })}
            >
              Còn chỗ &times;
            </Badge>
          )}
          {currentSort && currentSort !== "starts_at" && (
            <Badge variant="secondary">
              {SORT_OPTIONS.find((o) => o.value === currentSort)?.label}
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
