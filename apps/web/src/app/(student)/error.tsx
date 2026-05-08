"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function StudentGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h2 className="text-xl font-semibold">Có lỗi xảy ra</h2>
      <p className="text-muted-foreground text-sm">
        {error.message || "Không thể tải trang. Vui lòng thử lại sau."}
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
