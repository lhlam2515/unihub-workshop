export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="bg-muted h-40 animate-pulse rounded-lg" />
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
    </div>
  );
}
