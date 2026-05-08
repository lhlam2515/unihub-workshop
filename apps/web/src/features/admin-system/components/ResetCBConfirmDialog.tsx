"use client";

import { Loader2 } from "lucide-react";
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
import { resetCircuitBreaker } from "@/lib/api/services/admin";

interface ResetCBConfirmDialogProps {
  gateway: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  onError: (message: string) => void;
}

export function ResetCBConfirmDialog({
  gateway,
  open,
  onOpenChange,
  onReset,
  onError,
}: ResetCBConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!gateway) return;
    setLoading(true);
    const result = await resetCircuitBreaker(gateway);
    setLoading(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ?? "Không thể đặt lại.";
      onError(msg);
      return;
    }
    onOpenChange(false);
    onReset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận đặt lại</DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn đặt lại Circuit Breaker cho{" "}
            <span className="font-medium">{gateway}</span>? Chỉ thực hiện sau
            khi đã xác nhận cổng thanh toán hoạt động bình thường.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xác nhận đặt lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
