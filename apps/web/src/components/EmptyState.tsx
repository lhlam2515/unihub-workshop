import { Inbox } from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-muted mb-4 rounded-full p-4">
        <Icon className="text-muted-foreground h-8 w-8" />
      </div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mb-6 max-w-sm text-sm">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
