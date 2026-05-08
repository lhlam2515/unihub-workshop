const STORAGE_PREFIX = "idempotency:";

/**
 * Generate an idempotency key for a registration's payment flow.
 *
 * Reuses any existing key stored in sessionStorage for this registration
 * (covers browser refresh while waiting for gateway).
 */
export function generateIdempotencyKey(registrationId: string): string {
  if (typeof window === "undefined") return crypto.randomUUID();

  const existing = sessionStorage.getItem(`${STORAGE_PREFIX}${registrationId}`);
  if (existing) return existing;

  const key = crypto.randomUUID();
  sessionStorage.setItem(`${STORAGE_PREFIX}${registrationId}`, key);
  return key;
}

/**
 * Retrieve the stored idempotency key for a registration, if any.
 */
export function getIdempotencyKey(registrationId: string): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(`${STORAGE_PREFIX}${registrationId}`);
}

/**
 * Clear the stored idempotency key (call after confirmed success).
 */
export function clearIdempotencyKey(registrationId: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${registrationId}`);
  }
}
