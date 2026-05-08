"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AvatarUrlInputProps {
  value: string;
  onChange: (url: string) => void;
  error?: string;
  disabled?: boolean;
}

export function AvatarUrlInput({
  value,
  onChange,
  error,
  disabled,
}: AvatarUrlInputProps) {
  const [imgError, setImgError] = useState(false);

  const showPreview = value && !imgError;

  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 space-y-1">
        <Input
          placeholder="https://example.com/avatar.jpg"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setImgError(false);
          }}
          disabled={disabled}
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <div
        className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100",
          showPreview ? "" : "ring-1 ring-slate-200"
        )}
      >
        {showPreview ? (
          <img
            src={value}
            alt="Avatar preview"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <svg
            className="h-6 w-6 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
