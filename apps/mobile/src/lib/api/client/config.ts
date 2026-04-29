/**
 * Shared configuration constants for the Mobile API client.
 *
 * Uses EXPO_PUBLIC_ prefix for environment variables (Expo convention).
 *
 * Networking notes:
 * - Android Emulator: `10.0.2.2` is the special alias for the host loopback.
 * - iOS Simulator: `localhost` works as expected.
 * - Physical device: set EXPO_PUBLIC_API_URL to the host machine's LAN IP.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3001/api/v1";
