"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AdminGroupError({
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
      <h2 className="text-xl font-semibold">Lỗi trang quản trị</h2>
      <p className="text-muted-foreground text-sm">
        {error.message ||
          "Có lỗi xảy ra. Vui lòng thử lại hoặc liên hệ kỹ thuật nếu lỗi tiếp tục."}
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
