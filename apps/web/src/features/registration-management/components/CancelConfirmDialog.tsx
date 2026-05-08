"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { RegistrationListItem } from "@/types/registration";

interface CancelConfirmDialogProps {
  open: boolean;
  registration: RegistrationListItem;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function CancelConfirmDialog({
  open,
  registration,
  onConfirm,
  onClose,
}: CancelConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const needsRefund =
    registration.status === "PAID" || registration.status === "CONFIRMED";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="bg-background mx-4 w-full max-w-md rounded-lg p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Hủy đăng ký</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Bạn có chắc muốn hủy đăng ký workshop{" "}
          <strong>{registration.workshop.title}</strong>?
        </p>

        {needsRefund && (
          <p className="mt-2 text-sm text-yellow-600">
            Hoàn tiền sẽ được xử lý sau khi hủy.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Giữ đăng ký
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Đang hủy..." : "Xác nhận hủy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
