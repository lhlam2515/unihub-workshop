"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NotificationLog } from "@/types/admin-operations";

interface NotificationLogsTableProps {
  logs: NotificationLog[];
  isLoading?: boolean;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Người dùng</TableHead>
          <TableHead>Sự kiện</TableHead>
          <TableHead>Kênh</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Lỗi</TableHead>
          <TableHead>Thời gian</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 6 }, (_, j) => (
              <TableCell key={j}>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function NotificationLogsTable({
  logs,
  isLoading = false,
}: NotificationLogsTableProps) {
  if (isLoading) return <TableSkeleton />;

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <p className="text-sm">Chưa có log thông báo nào.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Người dùng</TableHead>
          <TableHead>Sự kiện</TableHead>
          <TableHead>Kênh</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Lỗi</TableHead>
          <TableHead>Thời gian</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="font-mono text-xs">{log.userId}</TableCell>
            <TableCell className="text-sm">{log.eventType}</TableCell>
            <TableCell className="text-sm">{log.channel}</TableCell>
            <TableCell>
              <StatusBadge status={log.status} variant="registration" />
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-xs text-red-500">
              {log.errorMsg || "--"}
            </TableCell>
            <TableCell className="text-xs text-slate-500">
              {formatDateTime(log.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
