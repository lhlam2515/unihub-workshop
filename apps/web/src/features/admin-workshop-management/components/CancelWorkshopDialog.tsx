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
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancelWorkshopDialogProps {
  open: boolean;
  onConfirm: (reason: string, notifyRegistered: boolean) => Promise<void>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CancelWorkshopDialog({
  open,
  onConfirm,
  onClose,
}: CancelWorkshopDialogProps) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charCount = reason.length;
  const isValid = charCount >= 10;

  const handleConfirm = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await onConfirm(reason, notify);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setReason("");
      setNotify(true);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận hủy workshop</DialogTitle>
          <DialogDescription>
            Hành động này sẽ hủy workshop và gửi thông báo đến các sinh viên đã
            đăng ký. Thao tác này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              Lý do hủy <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="cancel-reason"
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Nhập lý do hủy workshop (tối thiểu 10 ký tự)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              maxLength={500}
            />
            <p
              className={`text-xs ${
                charCount < 10 ? "text-red-500" : "text-slate-400"
              }`}
            >
              {charCount}/500 — {isValid ? "Đủ" : "Cần thêm "}
              {isValid ? "" : `${10 - charCount} ký tự`}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              disabled={isSubmitting}
              className="rounded border-slate-300"
            />
            Gửi thông báo đến sinh viên đã đăng ký
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Không, quay lại
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? "Đang xử lý..." : "Xác nhận hủy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
