"use client";

interface ErrorCategory {
  label: string;
  count: number;
  color: string;
}

interface ErrorBreakdownProps {
  breakdown: Record<string, number>;
  totalErrors: number;
}

export function ErrorBreakdown({
  breakdown,
  totalErrors,
}: ErrorBreakdownProps) {
  const categories: ErrorCategory[] = Object.entries(breakdown)
    .map(([label, count]) => ({
      label,
      count,
      color: "bg-red-400",
    }))
    .sort((a, b) => b.count - a.count);

  if (categories.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-slate-500">
        Không có lỗi nào được ghi nhận.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">Phân tích lỗi</p>
      {categories.map((cat) => (
        <div key={cat.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">{cat.label}</span>
            <span className="font-mono font-medium">
              {cat.count}/{totalErrors}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${cat.color} transition-all`}
              style={{ width: `${(cat.count / totalErrors) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
