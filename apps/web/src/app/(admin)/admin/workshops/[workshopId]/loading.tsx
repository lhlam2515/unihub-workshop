export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <div className="bg-muted h-8 w-64 animate-pulse rounded-md" />
      <div className="bg-muted h-48 animate-pulse rounded-lg" />
      <div className="bg-muted h-10 w-32 animate-pulse rounded-md" />
    </div>
  );
}
