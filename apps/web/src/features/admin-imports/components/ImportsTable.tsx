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
import type { ImportLog } from "@/types/admin-operations";

interface ImportsTableProps {
  imports: ImportLog[];
  onRowClick: (importLog: ImportLog) => void;
  isLoading?: boolean;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thời gian</TableHead>
          <TableHead>Người kích hoạt</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Tổng dòng</TableHead>
          <TableHead>Thành công</TableHead>
          <TableHead>Lỗi</TableHead>
          <TableHead>Thời lượng</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 7 }, (_, j) => (
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

export function ImportsTable({
  imports,
  onRowClick,
  isLoading = false,
}: ImportsTableProps) {
  if (isLoading) return <TableSkeleton />;

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <p className="text-lg font-medium">Chưa có lịch sử import</p>
        <p className="text-sm">
          Nhấn &ldquo;Kích hoạt Import&rdquo; để bắt đầu đồng bộ dữ liệu sinh
          viên.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thời gian</TableHead>
          <TableHead>Người kích hoạt</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Tổng dòng</TableHead>
          <TableHead>Thành công</TableHead>
          <TableHead>Lỗi</TableHead>
          <TableHead>Thời lượng</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {imports.map((row) => (
          <TableRow
            key={row.id}
            className="cursor-pointer hover:bg-slate-50"
            onClick={() => onRowClick(row)}
          >
            <TableCell className="text-xs text-slate-500">
              {formatDateTime(row.runAt)}
            </TableCell>
            <TableCell className="text-sm capitalize">
              {row.triggeredBy === "cron" ? "Tự động" : "Thủ công"}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} variant="registration" />
            </TableCell>
            <TableCell className="font-mono text-sm">{row.totalRows}</TableCell>
            <TableCell className="font-mono text-sm text-green-600">
              {row.successCount}
            </TableCell>
            <TableCell className="font-mono text-sm text-red-600">
              {row.failedCount > 0 ? row.failedCount : "--"}
            </TableCell>
            <TableCell className="text-xs text-slate-500">
              {formatDuration(row.durationMs)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
