import { Badge } from "@/components/ui/badge";
import type { RegistrationStatus } from "@/types/registration";

interface RegistrationStatusBadgeProps {
  status: RegistrationStatus;
}

const config: Record<
  RegistrationStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING: { label: "Chờ thanh toán", variant: "secondary" },
  CONFIRMED: { label: "Đã xác nhận", variant: "default" },
  PAID: { label: "Đã thanh toán", variant: "default" },
  CANCELLED: { label: "Đã hủy", variant: "outline" },
};

export function RegistrationStatusBadge({
  status,
}: RegistrationStatusBadgeProps) {
  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
