/**
 * Student sidebar navigation widget.
 *
 * Provides navigation links for the student portal: registrations.
 * Renders in the (student) route group layout.
 *
 * Naming convention: [Domain][Context]Widget — StudentSidebarWidget
 */

"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import ROUTES from "@/constants/routes";

const NAV_ITEMS = [
  {
    label: "Đăng ký của tôi",
    href: ROUTES.ME_REGISTRATIONS,
    icon: ClipboardList,
  },
] as const;

export function StudentSidebarWidget() {
  const pathname = usePathname();

  return (
    <aside className="min-h-screen w-64 border-r bg-gray-50 p-4">
      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
