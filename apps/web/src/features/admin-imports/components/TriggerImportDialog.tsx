"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerImport } from "@/lib/api/services/admin";

interface TriggerImportDialogProps {
  hasRunningImport: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function TriggerImportDialog({
  hasRunningImport,
  onSuccess,
  onError,
}: TriggerImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    const result = await triggerImport(filePath || undefined);
    setLoading(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ??
        "Không thể kích hoạt import";
      onError(msg);
      return;
    }
    setOpen(false);
    setFilePath("");
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          data-testid="csv-upload"
          disabled={hasRunningImport}
          title={hasRunningImport ? "Đã có import đang chạy" : undefined}
        >
          {hasRunningImport ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Kích hoạt Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kích hoạt Import</DialogTitle>
          <DialogDescription>
            Nhập đường dẫn file CSV trong container để bắt đầu đồng bộ dữ liệu
            sinh viên. Để trống để dùng file mặc định.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="filePath">Đường dẫn file (tuỳ chọn)</Label>
          <Input
            id="filePath"
            placeholder="/input/sinh-vien.csv"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button onClick={handleTrigger} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Bắt đầu Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
