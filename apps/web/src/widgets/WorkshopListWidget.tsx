import React from "react";

import { cn } from "@/lib/utils";

interface WorkshopListWidgetProps {
  header?: React.ReactNode;
  filters?: React.ReactNode;
  empty?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Workshop list layout container using the slot pattern.
 *
 * Pure Server Component — receives all content as named slots and children.
 * Never fetches data directly; composes layout only.
 */
export function WorkshopListWidget({
  header,
  filters,
  empty,
  actions,
  children,
}: WorkshopListWidgetProps) {
  const childCount = React.Children.count(children);
  const isEmpty = childCount === 0;

  return (
    <div className="space-y-6">
      {(header || actions) && (
        <div className="flex items-center justify-between gap-4">
          <div>{header}</div>
          <div>{actions}</div>
        </div>
      )}
      {filters}
      {isEmpty ? (
        empty
      ) : (
        <div className={cn("grid gap-4", "sm:grid-cols-2 lg:grid-cols-3")}>
          {children}
        </div>
      )}
    </div>
  );
}
