"use client";

import { Button } from "@/components/ui/button";

interface PayButtonProps {
  disabled?: boolean;
  loading?: boolean;
  circuitBreakerOpen?: boolean;
  onClick: () => void;
}

export function PayButton({
  disabled,
  loading,
  circuitBreakerOpen,
  onClick,
}: PayButtonProps) {
  return (
    <div className="space-y-2">
      {circuitBreakerOpen && (
        <p className="text-destructive text-sm">
          Cổng thanh toán đang gặp sự cố. Vui lòng thử lại sau.
        </p>
      )}
      <Button
        onClick={onClick}
        disabled={disabled || circuitBreakerOpen}
        className="w-full"
      >
        {loading ? "Đang xử lý..." : "Thanh toán"}
      </Button>
    </div>
  );
}
