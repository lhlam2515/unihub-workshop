export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-9 w-28 animate-pulse rounded-md" />
      </div>
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
      <div className="bg-muted h-64 animate-pulse rounded-lg" />
    </div>
  );
}
