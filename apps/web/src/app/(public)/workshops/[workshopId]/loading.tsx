export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="bg-muted h-8 w-3/4 animate-pulse rounded-md" />
      <div className="bg-muted h-48 animate-pulse rounded-lg" />
      <div className="bg-muted h-24 animate-pulse rounded-lg" />
    </div>
  );
}
