"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { putSummary } from "@/features/admin-summary/api/admin-summary.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryTextEditorProps {
  workshopId: string;
  initialText?: string | null;
  onSaved: (text: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SummaryTextEditor({
  workshopId,
  initialText,
  onSaved,
  disabled = false,
}: SummaryTextEditorProps) {
  const [text, setText] = useState(initialText ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = text !== (initialText ?? "");

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    const result = await putSummary(workshopId, text);
    if (result.isSuccess) {
      onSaved(text);
    } else {
      setError(
        (result.error as { message?: string })?.message ??
          "Không thể lưu nội dung tóm tắt"
      );
    }

    setIsSaving(false);
  };

  const handleCancel = () => {
    setText(initialText ?? "");
    setError(null);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Nội dung ghi đè sẽ thay thế bản tóm tắt từ AI
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled || isSaving}
        rows={8}
        placeholder="Nhập nội dung tóm tắt..."
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{text.length} / 10000</span>

        <div className="flex gap-2">
          {hasChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Hủy
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={disabled || isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <Save className="mr-1 h-3 w-3" />
                Lưu
              </>
            )}
          </Button>
        </div>
      </div>

      {error && <ErrorDisplay error={error} variant="inline" />}
    </div>
  );
}
