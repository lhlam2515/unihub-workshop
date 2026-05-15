import { ApiError } from "@/lib/api/errors";

/**
 * Fetch data from the NestJS backend within a Server Component or Server Action.
 *
 * Automatically injects the API base URL, sets `cache: 'no-store'` to prevent
 * Next.js caching, and includes Authorization headers if an access token is provided.
 *
 * @param path - The API endpoint path (e.g., `/workshops`).
 * @param accessToken - Optional Bearer token for authenticated routes.
 * @param opts - Optional fetch options (e.g., method, body, custom headers).
 * @returns A promise resolving to the typed response data `T`, or throws ApiError.
 */
export async function serverFetch<T>(
  path: string,
  accessToken?: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...opts?.headers,
    },
  });
  return parseServerResponse<T>(res);
}

/**
 * Parse the server response envelope and throw ApiError on failure.
 *
 * The backend returns `{ success: boolean, data?: T, error?: { code, message, fieldErrors? } }`.
 * On success, returns the unwrapped data. On failure, throws ApiError with structured error shape.
 *
 * @param res - The fetch Response object.
 * @returns The unwrapped data payload `T` on success.
 * @throws ApiError with the server's error code and message.
 */
async function parseServerResponse<T>(res: Response): Promise<T> {
  const envelope = await res.json();
  if (!envelope.success) {
    throw new ApiError(res.status, {
      code: envelope.error?.code ?? "UNKNOWN_ERROR",
      message: envelope.error?.message ?? "Request failed",
      fieldErrors: envelope.error?.fieldErrors,
    });
  }
  return envelope.data as T;
}
