"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadSummaryPdf } from "@/features/admin-summary/api/admin-summary.service";
import { MAX_PDF_SIZE_BYTES } from "@/features/admin-summary/lib/constants";
import { cn } from "@/lib/utils";
import type { AiSummary, AiSummaryStatus } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfUploaderProps {
  workshopId: string;
  currentStatus?: AiSummaryStatus;
  onUploaded: (summary: AiSummary) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PdfUploader({
  workshopId,
  currentStatus,
  onUploaded,
  disabled = false,
}: PdfUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  const validateFile = useCallback((file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return "Chỉ chấp nhận file định dạng .pdf";
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      return `File quá lớn. Kích thước tối đa là 10MB.`;
    }
    return null;
  }, []);

  // -----------------------------------------------------------------------
  // Upload
  // -----------------------------------------------------------------------

  const doUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);

      const result = await uploadSummaryPdf(workshopId, file);
      if (result.isSuccess) {
        onUploaded(result.data);
      } else {
        const apiError = result.error as { message?: string };
        setError(apiError?.message ?? "Không thể tải lên file PDF");
      }

      setIsUploading(false);
    },
    [workshopId, onUploaded]
  );

  // -----------------------------------------------------------------------
  // File selection handler
  // -----------------------------------------------------------------------

  const handleFile = useCallback(
    (file: File) => {
      setError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      // If current summary is DONE or PROCESSING, ask for confirmation
      if (currentStatus === "DONE" || currentStatus === "PROCESSING") {
        setPendingFile(file);
        setShowConfirmDialog(true);
        return;
      }

      doUpload(file);
    },
    [validateFile, currentStatus, doUpload]
  );

  const handleConfirmUpload = useCallback(() => {
    if (pendingFile) {
      setShowConfirmDialog(false);
      doUpload(pendingFile);
      setPendingFile(null);
    }
  }, [pendingFile, doUpload]);

  const handleCancelDialog = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingFile(null);
  }, []);

  // -----------------------------------------------------------------------
  // Drag & drop handlers
  // -----------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // -----------------------------------------------------------------------
  // Click-to-upload
  // -----------------------------------------------------------------------

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [handleFile]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isDisabled = disabled || isUploading;

  return (
    <>
      {/* Drop zone */}
      <div
        onDragOver={isDisabled ? undefined : handleDragOver}
        onDragLeave={isDisabled ? undefined : handleDragLeave}
        onDrop={isDisabled ? undefined : handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragOver
            ? "border-blue-500 bg-blue-50"
            : error
              ? "border-red-400 bg-red-50"
              : "border-slate-300 hover:border-slate-400",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        ) : (
          <Upload className="h-8 w-8 text-slate-400" />
        )}
        <div className="text-center text-sm text-slate-500">
          {isUploading ? (
            <p>Đang tải lên...</p>
          ) : (
            <>
              <p className="font-medium">
                Kéo thả file PDF vào đây hoặc nhấp để chọn
              </p>
              <p className="mt-1 text-xs">Tối đa 10MB, định dạng .pdf</p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleInputChange}
          disabled={isDisabled}
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {/* Re-upload confirmation dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận tải lên lại</DialogTitle>
            <DialogDescription>
              Workshop này đã có bản tóm tắt. Tải lên file PDF mới sẽ thay thế
              nội dung hiện tại. Bạn có muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDialog}>
              Hủy
            </Button>
            <Button variant="default" onClick={handleConfirmUpload}>
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
