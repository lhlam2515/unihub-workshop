"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadRegistrationsCSV } from "@/lib/api/services/admin";

interface ExportCSVButtonProps {
  workshopId: string;
}

export function ExportCSVButton({ workshopId }: ExportCSVButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await downloadRegistrationsCSV(workshopId);
      if (result.isFailure) {
        setError(
          (result.error as { message?: string })?.message ??
            "Không thể tải xuống CSV."
        );
      }
    } catch {
      setError("Không thể tải xuống CSV.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
      >
        <Download className="mr-2 h-4 w-4" />
        {loading ? "Đang tải..." : "Xuất CSV"}
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
