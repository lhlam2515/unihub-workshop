import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { Result } from "@/lib/result";

/**
 * TanStack Query wrapper for Result<T>-returning service calls.
 *
 * Auto-unwraps Result, throws on failure (caught by useQuery error),
 * and preserves the original error object in `error.cause`.
 */
export function useAsyncQuery<TData>(
  queryKey: string[],
  queryFn: () => Promise<Result<TData>>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">
) {
  return useQuery<TData, Error>({
    queryKey,
    queryFn: async () => {
      const result = await queryFn();
      if (result.isFailure) {
        const err = result.error as { message?: string };
        throw new Error(err?.message ?? "Unknown error", {
          cause: result.error,
        });
      }
      return result.data;
    },
    retry: false,
    staleTime: 10_000,
    ...options,
  });
}
