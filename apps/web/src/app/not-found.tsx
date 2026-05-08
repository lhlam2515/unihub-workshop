import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h2 className="text-xl font-semibold">Không tìm thấy trang</h2>
      <p className="text-muted-foreground text-sm">
        Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
      </p>
      <Button asChild>
        <Link href="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
