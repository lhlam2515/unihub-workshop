import Link from "next/link";

import ROUTES from "@/constants/routes";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminEditTab = "edit" | "registrations" | "stats" | "summary";

export interface WorkshopEditTabsProps {
  workshopId: string;
  activeTab: AdminEditTab;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface Tab {
  key: AdminEditTab;
  label: string;
  href: string;
}

function getTabs(workshopId: string): Tab[] {
  return [
    {
      key: "edit",
      label: "Chỉnh sửa",
      href: ROUTES.ADMIN_WORKSHOP(workshopId),
    },
    {
      key: "registrations",
      label: "Đăng ký",
      href: ROUTES.ADMIN_WORKSHOP_REGISTRATIONS(workshopId),
    },
    {
      key: "stats",
      label: "Thống kê",
      href: ROUTES.ADMIN_WORKSHOP_STATS(workshopId),
    },
    {
      key: "summary",
      label: "AI Tóm tắt",
      href: ROUTES.ADMIN_WORKSHOP_SUMMARY(workshopId),
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkshopEditTabs({
  workshopId,
  activeTab,
}: WorkshopEditTabsProps) {
  const tabs = getTabs(workshopId);

  return (
    <nav className="-mb-px flex border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === tab.key
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
