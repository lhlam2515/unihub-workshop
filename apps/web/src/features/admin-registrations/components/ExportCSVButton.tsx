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

  const handleDownload = async () => {
    setLoading(true);
    try {
      await downloadRegistrationsCSV(workshopId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
    >
      <Download className="mr-2 h-4 w-4" />
      {loading ? "Đang tải..." : "Xuất CSV"}
    </Button>
  );
}
