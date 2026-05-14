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
import { Textarea } from "@/components/ui/textarea";
import { updateNotificationChannel } from "@/lib/api/services/admin";
import type { NotificationChannel } from "@/types/admin-operations";

interface JSONEditorDialogProps {
  channel: NotificationChannel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function JSONEditorDialog({
  channel,
  open,
  onOpenChange,
  onSaved,
  onError,
}: JSONEditorDialogProps) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpen(open: boolean) {
    if (open && channel) {
      setJsonText(JSON.stringify(channel.configJson, null, 2));
      setError(null);
    }
    onOpenChange(open);
  }

  function handleChange(value: string) {
    setJsonText(value);
    try {
      JSON.parse(value);
      setError(null);
    } catch {
      setError("JSON không hợp lệ");
    }
  }

  async function handleSave() {
    if (error || !channel) return;
    setSaving(true);
    const parsed = JSON.parse(jsonText);
    const result = await updateNotificationChannel(channel.id, {
      configJson: parsed,
    });
    setSaving(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ??
        "Không thể lưu cấu hình.";
      onError(msg);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cấu hình kênh</DialogTitle>
          <DialogDescription>
            Chỉnh sửa cấu hình JSON cho kênh thông báo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={jsonText}
            onChange={(e) => handleChange(e.target.value)}
            className="min-h-50 font-mono text-xs"
            placeholder='{ "key": "value" }'
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSave} disabled={!!error || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cấu hình
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
