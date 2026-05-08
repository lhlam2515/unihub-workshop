export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
      <div className="bg-muted h-48 animate-pulse rounded-lg" />
    </div>
  );
}
