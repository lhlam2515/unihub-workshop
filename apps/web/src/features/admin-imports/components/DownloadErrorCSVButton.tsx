"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadImportErrors } from "@/lib/api/services/admin";

interface DownloadErrorCSVButtonProps {
  importId: string;
  hasErrors: boolean;
}

export function DownloadErrorCSVButton({
  importId,
  hasErrors,
}: DownloadErrorCSVButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    const result = await downloadImportErrors(importId);
    setLoading(false);
    if (result.isFailure) {
      const msg =
        (result.error as { message?: string })?.message ??
        "Không thể tải file.";
      alert(msg);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={!hasErrors || loading}
      title={!hasErrors ? "Không có lỗi để tải" : undefined}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Tải file lỗi
    </Button>
  );
}
