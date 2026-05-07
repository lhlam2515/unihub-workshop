/**
 * Admin sidebar navigation widget.
 *
 * Full menu structure for the BTC admin panel. Renders in the (admin) route
 * group layout, but is hidden on the login page.
 *
 * Naming convention: [Domain][Context]Widget — AdminSidebarWidget
 */

"use client";

import {
  LayoutDashboard,
  CalendarRange,
  Mic,
  DoorOpen,
  FileSpreadsheet,
  Bell,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import ROUTES from "@/constants/routes";

const MENU_GROUPS = [
  {
    label: "Tổng quan",
    items: [
      {
        label: "Dashboard",
        href: ROUTES.ADMIN,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Quản lý",
    items: [
      { label: "Workshops", href: ROUTES.ADMIN_WORKSHOPS, icon: CalendarRange },
      { label: "Diễn giả", href: ROUTES.ADMIN_SPEAKERS, icon: Mic },
      { label: "Phòng", href: ROUTES.ADMIN_ROOMS, icon: DoorOpen },
    ],
  },
  {
    label: "Vận hành",
    items: [
      {
        label: "Import sinh viên",
        href: ROUTES.ADMIN_IMPORTS,
        icon: FileSpreadsheet,
      },
      { label: "Thông báo", href: ROUTES.ADMIN_NOTIFICATIONS, icon: Bell },
      { label: "Hệ thống", href: ROUTES.ADMIN_SYSTEM, icon: Settings },
    ],
  },
] as const;

export function AdminSidebarWidget() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-64 flex-col border-r bg-slate-800 text-slate-300">
      {/* Logo */}
      <div className="flex h-14 items-center justify-center border-b border-slate-700">
        <Link href={ROUTES.ADMIN} className="text-lg font-bold text-white">
          UniHub Admin
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {MENU_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === ROUTES.ADMIN
                    ? pathname === ROUTES.ADMIN
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
