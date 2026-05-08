"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FloorPlanUrlInputProps {
  value: string;
  onChange: (url: string) => void;
  error?: string;
  disabled?: boolean;
}

export function FloorPlanUrlInput({
  value,
  onChange,
  error,
  disabled,
}: FloorPlanUrlInputProps) {
  const [imgError, setImgError] = useState(false);

  const showPreview = value && !imgError;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          "flex cursor-default flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-sm text-slate-400 transition-colors",
          "hover:border-slate-300 hover:text-slate-500"
        )}
      >
        <svg
          className="mb-2 h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <p>Kéo thả hoặc nhập URL sơ đồ phòng</p>
      </div>

      {/* URL input */}
      <Input
        placeholder="https://example.com/floor-plan.png"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setImgError(false);
        }}
        disabled={disabled}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}

      {/* Image preview */}
      {showPreview && (
        <div className="overflow-hidden rounded-lg border">
          <img
            src={value}
            alt="Floor plan preview"
            className="w-full object-contain"
            onError={() => setImgError(true)}
          />
        </div>
      )}
    </div>
  );
}
