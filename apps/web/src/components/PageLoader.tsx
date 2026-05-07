/**
 * Full-page loading spinner.
 *
 * Used by auth-guarded layouts while checking session validity.
 * Covers the entire viewport to prevent flash-of-unauthenticated-content.
 */

export function PageLoader() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
    >
      <div className="border-muted border-t-primary h-8 w-8 animate-spin rounded-full border-4" />
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
