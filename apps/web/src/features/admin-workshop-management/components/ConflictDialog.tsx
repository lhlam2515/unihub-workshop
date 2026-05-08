import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictDialogProps {
  open: boolean;
  onReload: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictDialog({
  open,
  onReload,
  onClose,
}: ConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xung đột dữ liệu</DialogTitle>
          <DialogDescription>
            Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang để xem
            phiên bản mới nhất và thực hiện lại thay đổi.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="default" onClick={onReload}>
            Tải lại trang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
