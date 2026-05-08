/**
 * Generates a strong ETag from a numeric version.
 *
 * @param version - The version integer from the entity.
 * @returns ETag string in the format "V".
 */
export const generateETag = (version: number): string => `"${version}"`;

/**
 * Parses an If-Match header value to extract the expected version number.
 *
 * Accepts both "N" and N formats for flexibility with different clients.
 *
 * @param header - The raw If-Match header value, or undefined.
 * @returns The parsed version number, or null if the header is missing or malformed.
 */
export const parseIfMatch = (header: string | undefined): number | null => {
  if (!header) return null;
  const match = header.match(/^"?(\d+)"?$/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Extracts the version from an entity and returns its ETag string.
 *
 * @param entity - An object with a version property, or null.
 * @returns ETag string, or null if entity is null.
 */
export const versionFromEntity = (entity: { version: number } | null): string | null =>
  entity ? generateETag(entity.version) : null;
