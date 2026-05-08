import { isApiError, isAuthError, isValidationError } from "@/lib/api/errors";
import type { ErrorCode, FieldError } from "@/lib/api/types";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// MobileAppError — UI-friendly error shape for React Native
// ---------------------------------------------------------------------------

/**
 * Normalized error shape consumed by UI layers on mobile.
 *
 * Differences from the web's `ActionResponse`:
 *  - No `success` flag — callers already know it's an error.
 *  - `title` + `message` map directly to Toast / Alert props.
 *  - `fieldErrors` is `Record<string, string>` (one message per field) to match
 *    react-hook-form's `setError` API, unlike the web's `Record<string, string[]>`.
 *  - `code` is kept for callers that need fine-grained branching (e.g. navigate
 *    to a specific recovery screen based on `SEAT_UNAVAILABLE`).
 */
export type MobileAppError = {
  /** Short title for a Toast header or Alert title. */
  title: string;
  /** Longer human-readable description shown in the Toast body or Alert message. */
  message: string;
  /** Original machine-readable error code for caller-side branching. */
  code?: ErrorCode;
  /**
   * Field-level validation errors keyed by field name.
   * Only the first message per field is kept to match react-hook-form's `setError`.
   *
   * @example
   * ```ts
   * if (appError.fieldErrors) {
   *   Object.entries(appError.fieldErrors).forEach(([field, msg]) => {
   *     form.setError(field as keyof FormValues, { message: msg });
   *   });
   * }
   * ```
   */
  fieldErrors?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const UNKNOWN_ERROR_MESSAGE =
  "Đã có lỗi không xác định xảy ra. Vui lòng thử lại.";

/**
 * Map from stable ErrorCode to a user-facing Vietnamese title.
 * Falls back to a generic category title when a code is not listed.
 */
const ERROR_TITLE_MAP: Partial<Record<ErrorCode, string>> = {
  // Auth
  TOKEN_EXPIRED: "Phiên đăng nhập hết hạn",
  TOKEN_INVALID: "Phiên đăng nhập không hợp lệ",
  TOKEN_REVOKED: "Phiên đăng nhập đã bị thu hồi",
  REFRESH_TOKEN_INVALID: "Phiên đăng nhập hết hạn",
  INVALID_CREDENTIALS: "Thông tin đăng nhập sai",
  USER_SUSPENDED: "Tài khoản bị tạm khóa",

  // Workshop
  WORKSHOP_NOT_FOUND: "Không tìm thấy workshop",
  WORKSHOP_NOT_OPEN: "Workshop chưa mở đăng ký",
  WORKSHOP_CANCELLED: "Workshop đã bị hủy",
  WORKSHOP_FULL: "Workshop đã hết chỗ",
  WORKSHOP_TIME_CONFLICT: "Trùng lịch workshop",

  // Seat / Registration
  SEAT_UNAVAILABLE: "Không còn chỗ trống",
  SEAT_LOCK_EXPIRED: "Thời gian giữ chỗ đã hết",
  REGISTRATION_DUPLICATE: "Đã đăng ký trước đó",
  REGISTRATION_NOT_FOUND: "Không tìm thấy đăng ký",
  REGISTRATION_CANCELLED: "Đăng ký đã bị hủy",

  // Payment
  PAYMENT_DUPLICATE: "Thanh toán trùng lặp",
  PAYMENT_GATEWAY_ERROR: "Lỗi cổng thanh toán",
  PAYMENT_TIMEOUT: "Thanh toán hết thời gian",
  PAYMENT_NOT_FOUND: "Không tìm thấy giao dịch",
  PAYMENT_ALREADY_SUCCESS: "Giao dịch đã thành công",

  // Check-in
  TICKET_VOID: "Vé không hợp lệ",
  TICKET_ALREADY_CHECKEDIN: "Đã check-in trước đó",
  CHECKIN_SCOPE_DENIED: "Không có quyền check-in",

  // System
  VALIDATION_FAILED: "Dữ liệu không hợp lệ",
  RATE_LIMIT_EXCEEDED: "Quá nhiều yêu cầu",
  INTERNAL_ERROR: "Lỗi hệ thống",

  // Workshop (thêm)
  WORKSHOP_NOT_ASSIGNED: "Không được phân công workshop này",
  ROOM_CONFLICT: "Phòng đã có workshop khác",
  SEATS_TOTAL_BELOW_REGISTERED: "Số chỗ không thể giảm dưới số đã đăng ký",

  // Registration (thêm)
  STUDENT_NOT_IN_CSV: "Sinh viên không trong danh sách",
  REQUEST_IN_PROGRESS: "Yêu cầu đang được xử lý",
  CONFLICT_EXHAUSTED: "Xung đột dữ liệu, vui lòng thử lại",

  // Auth (thêm)
  ACCOUNT_DISABLED: "Tài khoản đã bị vô hiệu hóa",

  // Check-in (thêm — codes mới)
  QR_INVALID: "Mã QR không hợp lệ",
  REGISTRATION_NOT_ACTIVE: "Vé chưa được kích hoạt",
  WRONG_WORKSHOP: "Vé không thuộc workshop này",

  // Reconcile / batch
  RECONCILIATION_ALREADY_RUNNING: "Đang chạy đối soát",
  NOT_IN_FAILED_STATE: "Không ở trạng thái lỗi",
  BATCH_TOO_LARGE: "Batch quá lớn",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert `FieldError[]` → `Record<string, string>` (first message per field).
 * Designed for react-hook-form's `setError` which accepts a single message.
 */
function mapFieldErrors(
  errors?: FieldError[]
): Record<string, string> | undefined {
  if (!errors?.length) return undefined;

  return errors.reduce<Record<string, string>>((acc, { field, message }) => {
    // Only keep the first error message per field
    if (!acc[field]) {
      acc[field] = message;
    }
    return acc;
  }, {});
}

/**
 * Resolve a user-facing title from an `ErrorCode`.
 * Falls back to a generic title based on HTTP status category.
 */
function resolveTitle(code?: ErrorCode, status?: number): string {
  if (code && ERROR_TITLE_MAP[code]) {
    return ERROR_TITLE_MAP[code]!;
  }
  if (status !== undefined) {
    if (status >= 500) return "Lỗi máy chủ";
    if (status === 403) return "Không có quyền truy cập";
    if (status === 404) return "Không tìm thấy";
    if (status === 429) return "Quá nhiều yêu cầu";
    if (status === 422) return "Lỗi nghiệp vụ";
    if (status >= 400) return "Lỗi yêu cầu";
  }
  return "Lỗi hệ thống";
}

// ---------------------------------------------------------------------------
// handleError — main export
// ---------------------------------------------------------------------------

/**
 * Normalize any thrown value into a `MobileAppError` safe for UI consumption.
 *
 * Call this in the `isFailure` branch of a `Result` or inside a `catch` block.
 * The function also handles all logging internally — callers do NOT need to log
 * separately.
 *
 * @example
 * ```ts
 * const result = await Result.fromPromise(api.get(`/workshops/${id}`));
 * if (result.isFailure) {
 *   const appError = handleError(result.error);
 *
 *   if (appError.fieldErrors) {
 *     Object.entries(appError.fieldErrors).forEach(([field, msg]) =>
 *       form.setError(field as keyof FormValues, { message: msg })
 *     );
 *   } else {
 *     toast.error(appError.title, { description: appError.message });
 *   }
 *   return;
 * }
 * setWorkshop(result.data);
 * ```
 */
export function handleError(error: unknown): MobileAppError {
  // ------------------------------------------------------------------
  // 1. Auth errors — interceptor in http.ts already redirects to /login.
  //    Suppress from UI to avoid double-notification. Only log a warning.
  // ------------------------------------------------------------------
  if (isAuthError(error)) {
    logger.warn(`Auth error suppressed from UI [${error.code}]`, error.message);
    return {
      title: resolveTitle(error.code),
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      code: error.code,
    };
  }

  // ------------------------------------------------------------------
  // 2. Typed ApiError — thrown by http.ts for all non-2xx responses.
  //    The web variant also handled `isFailedApiResponse` / `isApiErrorShape`,
  //    but http.ts on mobile always converts the envelope into ApiError before
  //    throwing, so those branches are unnecessary here.
  // ------------------------------------------------------------------
  if (isApiError(error)) {
    if (error.status >= 500 || error.status === 0) {
      logger.error(
        `Server Error [${error.status}] ${error.code}: ${error.message}`,
        error
      );
    } else {
      logger.warn(
        `API Error [${error.status}] ${error.code}: ${error.message}`,
        error
      );
    }

    // Validation errors carry field-level details → map for react-hook-form
    const fieldErrors = isValidationError(error)
      ? mapFieldErrors(error.fieldErrors)
      : undefined;

    return {
      title: resolveTitle(error.code, error.status),
      message: error.message,
      code: error.code,
      fieldErrors,
    };
  }

  // ------------------------------------------------------------------
  // 3. Native Error instances — network failures, JSON parse errors, etc.
  // ------------------------------------------------------------------
  if (error instanceof Error) {
    // React Native's fetch throws this string on network-level failures
    if (error.message.includes("Network request failed")) {
      logger.info("Network connectivity error detected");
      return {
        title: "Mất kết nối",
        message:
          "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.",
      };
    }

    logger.error(`Unhandled Error: ${error.message}`, error);
    return {
      title: "Lỗi ứng dụng",
      message: error.message || UNKNOWN_ERROR_MESSAGE,
    };
  }

  // ------------------------------------------------------------------
  // 4. Unknown / non-Error throws (strings, plain objects, etc.)
  // ------------------------------------------------------------------
  logger.error("Unknown non-Error exception thrown", error);
  return {
    title: "Lỗi không xác định",
    message: UNKNOWN_ERROR_MESSAGE,
  };
}

export default handleError;
