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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RegistrationAdmin } from "@/types/registration";

interface RegistrationTableProps {
  registrations: RegistrationAdmin[];
  isLoading?: boolean;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function isPendingLongerThan30Min(registeredAt: string): boolean {
  return Date.now() - new Date(registeredAt).getTime() > 30 * 60 * 1000;
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã SV</TableHead>
          <TableHead>Họ tên</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Ngày ĐK</TableHead>
          <TableHead>Check-in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => i).map((i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-24 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-28" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-28" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RegistrationTable({
  registrations,
  isLoading = false,
}: RegistrationTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã SV</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày ĐK</TableHead>
            <TableHead>Check-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((reg) => {
            const isOverdue =
              reg.status === "PENDING" &&
              isPendingLongerThan30Min(reg.registeredAt);

            return (
              <TableRow
                key={reg.id}
                className={
                  isOverdue ? "border-l-4 border-l-amber-400" : undefined
                }
              >
                <TableCell className="font-mono text-xs">
                  {reg.student.studentId}
                </TableCell>
                <TableCell className="font-medium">
                  {reg.student.fullName}
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help text-xs text-slate-500 underline decoration-dotted">
                        {reg.student.email}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{reg.student.email}</p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <StatusBadge status={reg.status} variant="registration" />
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {formatDateTime(reg.registeredAt)}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {reg.checkedInAt ? formatDateTime(reg.checkedInAt) : "--"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
