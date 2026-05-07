import { AlertCircle, XCircle } from "lucide-react";

import { isValidationError } from "@/lib/api/errors";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  error: ApiError | string | null;
  variant?: "inline" | "banner";
  className?: string;
}

const iconMap = {
  inline: AlertCircle,
  banner: XCircle,
} as const;

const styles = {
  inline: "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive",
  banner:
    "rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive",
} as const;

function getMessage(error: ApiError | string | null): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message;
}

function getFieldErrors(error: ApiError | string | null) {
  if (typeof error === "string" || !error) return null;
  return isValidationError(error) ? (error.fieldErrors ?? null) : null;
}

export function ErrorDisplay({
  error,
  variant = "inline",
  className,
}: ErrorDisplayProps) {
  if (!error) return null;

  const Icon = iconMap[variant];
  const message = getMessage(error);
  const fieldErrors = getFieldErrors(error);

  return (
    <div
      role="alert"
      className={cn(styles[variant], "flex items-start gap-2", className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{message}</p>
        {fieldErrors && fieldErrors.length > 0 && (
          <ul className="text-destructive/80 list-inside list-disc text-xs">
            {fieldErrors.map((fe) => (
              <li key={fe.field}>{fe.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
