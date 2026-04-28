/**
 * Shared configuration constants for the API client.
 *
 * All other internal modules import from here to avoid scattering
 * environment reads across multiple files.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
