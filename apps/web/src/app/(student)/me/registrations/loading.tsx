export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-muted h-24 animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}
