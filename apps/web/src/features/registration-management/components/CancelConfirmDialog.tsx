"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy đăng ký</DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn hủy đăng ký workshop{" "}
            <strong>{registration.workshop.title}</strong>?
          </DialogDescription>
        </DialogHeader>

        {needsRefund && (
          <p className="text-sm text-yellow-600">
            Hoàn tiền sẽ được xử lý sau khi hủy.
          </p>
        )}

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
