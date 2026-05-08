/**
 * Encode a Date or string cursor value into a base-64 opaque token.
 *
 * The token is safe for URL query parameters and opaque to clients —
 * they must not decode or rely on its internal format.
 */
export function encodeCursor(value: Date | string): string {
  return Buffer.from(
    value instanceof Date ? value.toISOString() : String(value),
    "utf-8"
  ).toString("base64");
}

/**
 * Decode a base-64 cursor token back to its raw string form.
 */
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf-8");
}

/**
 * Input contract for cursor-based pagination queries.
 *
 * Clients pass `cursor` (opaque token from a previous response) and
 * `limit` (page size). The first request omits `cursor`.
 */
export interface CursorPaginationInput {
  cursor?: string;
  limit: number;
}

/**
 * Output contract for cursor-based pagination responses.
 *
 * - `items`: the current page of results
 * - `nextCursor`: opaque token for the next page, or null when there are no more results
 * - `hasMore`: convenience boolean — true when at least one more page exists
 */
export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
