export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted h-28 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="bg-muted h-64 animate-pulse rounded-lg" />
    </div>
  );
}
