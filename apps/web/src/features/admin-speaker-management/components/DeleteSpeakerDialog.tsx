"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpeakerAdmin } from "@/types/workshop";

export interface DeleteSpeakerDialogProps {
  speaker: SpeakerAdmin | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
}

export function DeleteSpeakerDialog({
  speaker,
  isDeleting,
  onConfirm,
  onCancel,
  error,
}: DeleteSpeakerDialogProps) {
  const open = speaker !== null;
  const blocked = (speaker?.upcomingWorkshopCount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa diễn giả</DialogTitle>
          <DialogDescription>
            {blocked
              ? "Diễn giả này có workshop sắp tới. Không thể xóa."
              : `Bạn có chắc muốn xóa "${speaker?.fullName}"?`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="border-destructive/20 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
          >
            {error}
          </div>
        )}

        <DialogFooter showCloseButton>
          <button
            type="button"
            className="bg-destructive text-destructive-foreground inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50"
            disabled={isDeleting || blocked}
            onClick={onConfirm}
          >
            {isDeleting ? "Đang xóa..." : "Xóa"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
