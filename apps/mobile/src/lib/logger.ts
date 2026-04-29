/**
 * Lightweight logger for React Native / Expo.
 *
 * Design rationale vs. the web's pino-based logger:
 *  - `pino` depends on Node.js streams and `process.stdout`, which are not
 *    available in the Hermes JS engine used by React Native. Using it would
 *    require polyfills that bloat the bundle and cause subtle runtime errors.
 *  - This logger wraps `console.*` directly — zero dependencies, zero bundle cost.
 *  - In production, `debug` and `info` calls are silenced. The `warn` and
 *    `error` levels are always emitted so Metro/Logcat/device logs still capture
 *    production anomalies. Sentry / Firebase Crashlytics integration points are
 *    marked with comments for when you're ready to wire them up.
 *
 * Usage:
 * ```ts
 * import logger from '@/lib/logger';
 *
 * logger.info('Workshops loaded', { count: 5 });
 * logger.error('Failed to fetch workshops', error);
 * ```
 */

const isProduction = process.env.NODE_ENV === "production";

const logger = {
  /**
   * Verbose diagnostic information — suppressed in production builds.
   * Use for low-level tracing (e.g. token cache hits, SQLite reads).
   */
  debug(msg: string, ...args: unknown[]): void {
    if (!isProduction) {
      console.debug(`[DEBUG] ${msg}`, ...args);
    }
  },

  /**
   * General informational messages — suppressed in production builds.
   * Use for lifecycle events (e.g. "user logged in", "screen mounted").
   */
  info(msg: string, ...args: unknown[]): void {
    if (!isProduction) {
      console.info(`[INFO] ${msg}`, ...args);
    }
  },

  /**
   * Non-fatal anomalies — always emitted (dev + production).
   * Use for recoverable API errors (4xx) and expected edge cases.
   *
   * Production: hook Sentry.captureMessage here.
   */
  warn(msg: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${msg}`, ...args);
    // if (isProduction) {
    //   Sentry.captureMessage(msg, { level: "warning", extra: { args } });
    // }
  },

  /**
   * Fatal / unexpected errors — always emitted (dev + production).
   * Use for 5xx responses, unhandled exceptions, and JS crashes.
   *
   * Production: hook Sentry.captureException / Crashlytics.recordError here.
   */
  error(msg: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${msg}`, ...args);
    // if (isProduction) {
    //   const err = args.find((a) => a instanceof Error);
    //   if (err instanceof Error) {
    //     Sentry.captureException(err, { extra: { msg } });
    //   } else {
    //     Sentry.captureMessage(msg, { level: "error", extra: { args } });
    //   }
    // }
  },
};

export default logger;
